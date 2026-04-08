/**
 * Rate limiting utilities
 */
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, TABLE_NAME } from './database'
import { keys } from './keys'
import { hasErrorName, toError } from './errors'
import { log } from './logger'

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

// Default rate limits by action
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  comment: { maxRequests: 20, windowMs: 60000 }, // 20 per minute
  message: { maxRequests: 30, windowMs: 60000 }, // 30 per minute
  reaction: { maxRequests: 60, windowMs: 60000 }, // 60 per minute
  upload: { maxRequests: 10, windowMs: 300000 }, // 10 per 5 minutes
  default: { maxRequests: 100, windowMs: 60000 }, // 100 per minute
}

/**
 * Check if a user action is rate limited
 *
 * Uses atomic DynamoDB UpdateCommand with ADD to prevent race conditions.
 * Concurrent requests will correctly increment the counter.
 */
export async function checkRateLimit(
  userId: string,
  action: string
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[action] || RATE_LIMITS.default
  const key = keys.rateLimit(userId, action)
  const now = Date.now()
  const windowStart = now - config.windowMs
  const ttl = Math.floor((now + config.windowMs) / 1000)

  try {
    // Atomic increment with conditional check for window expiry
    const result = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: key,
        UpdateExpression:
          'SET windowStart = if_not_exists(windowStart, :now), ' +
          'entityType = :entityType, userId = :userId, #action = :action, ' +
          'updatedAt = :now, #ttl = :ttl ' +
          'ADD #count :inc',
        ConditionExpression:
          'attribute_not_exists(windowStart) OR windowStart >= :windowStart',
        ExpressionAttributeNames: {
          '#count': 'count',
          '#action': 'action',
          '#ttl': 'ttl',
        },
        ExpressionAttributeValues: {
          ':inc': 1,
          ':now': now,
          ':windowStart': windowStart,
          ':ttl': ttl,
          ':entityType': 'RATE_LIMIT',
          ':userId': userId,
          ':action': action,
        },
        ReturnValues: 'ALL_NEW',
      })
    )

    const newCount = (result.Attributes?.count as number) || 1
    const recordWindowStart = (result.Attributes?.windowStart as number) || now

    if (newCount > config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: recordWindowStart + config.windowMs,
      }
    }

    return {
      allowed: true,
      remaining: config.maxRequests - newCount,
      resetAt: recordWindowStart + config.windowMs,
    }
  } catch (error) {
    // The condition fails when the stored window is older than our cutoff,
    // meaning a new window started mid-flight. Retry the same Update once with
    // no condition so we land in the new window's counter; if that also fails
    // we fail open and log a warning rather than spin up a multi-stage ladder.
    if (hasErrorName(error, 'ConditionalCheckFailedException')) {
      try {
        const retryResult = await docClient.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: key,
            // Unconditionally reset windowStart on retry: the original update
            // failed because the stored window was expired, so the retry must
            // start a fresh window rather than preserve the stale value.
            UpdateExpression:
              'SET windowStart = :now, ' +
              'entityType = :entityType, userId = :userId, #action = :action, ' +
              'updatedAt = :now, #ttl = :ttl ' +
              'ADD #count :inc',
            ExpressionAttributeNames: {
              '#count': 'count',
              '#action': 'action',
              '#ttl': 'ttl',
            },
            ExpressionAttributeValues: {
              ':inc': 1,
              ':now': now,
              ':ttl': ttl,
              ':entityType': 'RATE_LIMIT',
              ':userId': userId,
              ':action': action,
            },
            ReturnValues: 'ALL_NEW',
          })
        )

        const retryCount = (retryResult.Attributes?.count as number) || 1
        const retryWindowStart =
          (retryResult.Attributes?.windowStart as number) || now

        if (retryCount > config.maxRequests) {
          return {
            allowed: false,
            remaining: 0,
            resetAt: retryWindowStart + config.windowMs,
          }
        }

        return {
          allowed: true,
          remaining: config.maxRequests - retryCount,
          resetAt: retryWindowStart + config.windowMs,
        }
      } catch (retryError) {
        log.warn('rate_limit_contention_fail_open', {
          userId,
          action,
          error: toError(retryError).message,
        })
      }
    }

    // Fail open for availability
    log.error('rate_limit_check_failed', { error: toError(error).message })
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: now + config.windowMs,
    }
  }
}

/**
 * Calculate seconds until rate limit resets
 */
export function getRetryAfter(resetAt: number): number {
  const seconds = Math.ceil((resetAt - Date.now()) / 1000)
  return Math.max(1, seconds)
}
