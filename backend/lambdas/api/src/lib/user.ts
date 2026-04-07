/**
 * User profile management utilities
 */
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, TABLE_NAME } from './database'
import { keys } from './keys'
import type { RequestContext, UserProfile } from '../types'
import { AuthenticationError, toError } from './errors'
import { log } from './logger'

/**
 * Returns the authenticated requester id from a RequestContext.
 * Throws AuthenticationError if missing. Routes registered behind the default
 * `requireAuth` middleware should never see a missing id, but this helper
 * provides a typed guarantee in place of `userId!` non-null assertions.
 */
export function getRequesterId(context: RequestContext): string {
  if (!context.requesterId) {
    throw new AuthenticationError('Missing user context')
  }
  return context.requesterId
}

// ---------------------------------------------------------------------------
// ensureProfile cache (bounded LRU with TTL)
// ---------------------------------------------------------------------------

const ENSURE_PROFILE_CACHE_MAX = 1000
const ENSURE_PROFILE_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

interface CacheEntry {
  expiresAt: number
}

/**
 * Tiny in-process LRU with TTL. Uses Map insertion order for recency tracking.
 * Bounded to prevent unbounded memory growth on long-lived warm Lambdas.
 */
class EnsureProfileCache {
  private store = new Map<string, CacheEntry>()

  constructor(private readonly maxEntries: number, private readonly ttlMs: number) {}

  has(userId: string, now: number = Date.now()): boolean {
    const entry = this.store.get(userId)
    if (!entry) return false
    if (entry.expiresAt <= now) {
      this.store.delete(userId)
      return false
    }
    // Refresh recency
    this.store.delete(userId)
    this.store.set(userId, entry)
    return true
  }

  set(userId: string, now: number = Date.now()): void {
    if (this.store.has(userId)) {
      this.store.delete(userId)
    }
    this.store.set(userId, { expiresAt: now + this.ttlMs })
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value
      if (oldest === undefined) break
      this.store.delete(oldest)
    }
  }

  clear(): void {
    this.store.clear()
  }

  get size(): number {
    return this.store.size
  }
}

export const ensureProfileCache = new EnsureProfileCache(
  ENSURE_PROFILE_CACHE_MAX,
  ENSURE_PROFILE_CACHE_TTL_MS
)

/**
 * Backfill GSI1 attributes for a profile if missing (read-repair).
 * This handles profiles created before GSI1 was added.
 */
async function backfillGSI1IfMissing(profile: UserProfile): Promise<UserProfile> {
  const gsi1Keys = keys.userProfileGSI1(profile.userId)

  // Check if GSI1 attributes are missing
  if (!profile.GSI1PK || !profile.GSI1SK) {
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: keys.userProfile(profile.userId),
          UpdateExpression: 'SET GSI1PK = :gsi1pk, GSI1SK = :gsi1sk',
          ExpressionAttributeValues: {
            ':gsi1pk': gsi1Keys.GSI1PK,
            ':gsi1sk': gsi1Keys.GSI1SK,
          },
          ConditionExpression: 'attribute_not_exists(GSI1PK) OR attribute_not_exists(GSI1SK)',
        })
      )
      return { ...profile, ...gsi1Keys }
    } catch (err) {
      if (toError(err).name === 'ConditionalCheckFailedException') {
        return { ...profile, ...gsi1Keys }
      }
      log.warn('gsi1_backfill_failed', { error: toError(err).message })
    }
  }

  return profile
}

/**
 * Ensure a user profile exists (create if not present).
 *
 * Caches verified user ids in a bounded LRU with TTL to short-circuit the
 * per-request DDB Get on warm Lambda invocations. On transient DDB failure
 * the cache fails open: we log and return a synthesised profile rather than
 * 500ing the request, since profile initialisation is best-effort.
 */
export async function ensureProfile(
  userId: string,
  email?: string,
  groups?: string
): Promise<UserProfile> {
  const key = keys.userProfile(userId)

  // Cache hit short-circuits the DDB call entirely.
  if (ensureProfileCache.has(userId)) {
    return {
      ...key,
      ...keys.userProfileGSI1(userId),
      userId,
      email,
      displayName: email?.split('@')[0] || 'User',
      groups,
      createdAt: '',
      updatedAt: '',
      entityType: 'USER_PROFILE',
    }
  }

  let result
  try {
    result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: key,
      })
    )
  } catch (err) {
    // Fail open: log and return a synthesised profile so requests are not
    // blocked by transient DynamoDB issues during profile bootstrap.
    log.warn('ensure_profile_get_failed', {
      userId,
      error: toError(err).message,
    })
    return {
      ...key,
      ...keys.userProfileGSI1(userId),
      userId,
      email,
      displayName: email?.split('@')[0] || 'User',
      groups,
      createdAt: '',
      updatedAt: '',
      entityType: 'USER_PROFILE',
    }
  }

  if (result.Item) {
    const profile = result.Item as UserProfile
    const updated = await backfillGSI1IfMissing(profile)
    if (updated.GSI1PK && updated.GSI1SK) {
      ensureProfileCache.set(userId)
    }
    return updated
  }

  // Create new profile with GSI1 keys for listing all users
  const timestamp = new Date().toISOString()
  const profile: UserProfile = {
    ...key,
    ...keys.userProfileGSI1(userId),
    userId,
    email,
    displayName: email?.split('@')[0] || 'User',
    groups,
    createdAt: timestamp,
    updatedAt: timestamp,
    entityType: 'USER_PROFILE',
  }

  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: profile,
        ConditionExpression: 'attribute_not_exists(PK)',
      })
    )
  } catch (err) {
    if (toError(err).name === 'ConditionalCheckFailedException') {
      const existing = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: key,
        })
      )
      ensureProfileCache.set(userId)
      return existing.Item as UserProfile
    }
    throw err
  }

  ensureProfileCache.set(userId)
  return profile
}
