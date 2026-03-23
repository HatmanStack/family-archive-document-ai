/**
 * Input validation utilities
 */
import sanitizeHtml from 'sanitize-html'

// UUID regex pattern (any version)
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Validate a user ID (Cognito sub)
 */
export function validateUserId(userId: string | undefined | null): boolean {
  if (!userId || typeof userId !== 'string') return false
  // Check for path traversal attempts
  if (userId.includes('..') || userId.includes('/') || userId.includes('\\'))
    return false
  // Must be a valid UUID
  return UUID_PATTERN.test(userId)
}

/**
 * Validate pagination limit
 */
export function validateLimit(
  limit: string | undefined | null,
  defaultLimit = 50,
  maxLimit = 100
): number {
  if (!limit) return defaultLimit
  const parsed = parseInt(limit, 10)
  if (isNaN(parsed) || parsed < 1) return defaultLimit
  return Math.min(parsed, maxLimit)
}

/**
 * Validate a comment ID format (timestamp#uuid)
 */
export function validateCommentId(
  commentId: string | undefined | null
): boolean {
  if (!commentId || typeof commentId !== 'string') return false
  // Format: ISO timestamp # UUID
  const parts = commentId.split('#')
  if (parts.length !== 2) return false
  // Check timestamp is valid ISO date
  const timestamp = Date.parse(parts[0])
  if (isNaN(timestamp)) return false
  // Check UUID
  return UUID_PATTERN.test(parts[1])
}

/**
 * Sanitize text content (remove HTML/scripts)
 */
export function sanitizeText(text: string | undefined | null): string {
  if (!text) return ''
  return sanitizeHtml(text, {
    allowedTags: [], // Strip all HTML
    allowedAttributes: {},
  }).trim()
}

/**
 * Sanitize content with basic formatting (bold, italic, links)
 */
export function sanitizeContent(text: string | undefined | null): string {
  if (!text) return ''
  return sanitizeHtml(text, {
    allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
    },
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
    },
  }).trim()
}

/**
 * Validate email format
 */
export function validateEmail(email: string | undefined | null): boolean {
  if (!email || typeof email !== 'string') return false
  // Basic email regex
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailPattern.test(email)
}

/**
 * Validate content length
 */
export function validateContentLength(
  content: string | undefined | null,
  minLength = 1,
  maxLength = 10000
): boolean {
  if (!content) return minLength === 0
  return content.length >= minLength && content.length <= maxLength
}

/**
 * Escape HTML special characters to prevent XSS.
 */
export function escapeHtml(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Safely parse JSON request body.
 * Returns parsed object or null if body is malformed.
 */
export function parseRequestBody(body: string | null): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(body || '{}')
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null
    }
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Parse and clamp a page limit from query string input.
 * Returns defaultSize for NaN, zero, negative, or non-integer values.
 */
export function parsePageLimit(
  raw: string | undefined | null,
  defaultSize: number,
  maxSize: number
): number {
  const parsed = Number(raw ?? defaultSize)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return defaultSize
  }
  return Math.min(parsed, maxSize)
}

/**
 * Result of pagination key validation
 */
export interface PaginationKeyValidation {
  valid: boolean
  key?: Record<string, unknown>
  error?: string
}

/**
 * Validate and decode a pagination key (lastEvaluatedKey).
 *
 * Pagination keys are base64-encoded JSON objects containing DynamoDB keys.
 * This function validates:
 * 1. The key can be decoded from base64
 * 2. The key is valid JSON
 * 3. The key contains a PK that matches the expected prefix
 *
 * @param encodedKey - The base64-encoded pagination key from the client
 * @param expectedPKPrefix - The expected prefix for the PK value (e.g., "USER#", "COMMENT#")
 * @returns Validation result with decoded key or error message
 *
 * @example
 * ```typescript
 * const result = validatePaginationKey(lastEvaluatedKey, 'COMMENT#')
 * if (!result.valid) {
 *   return errorResponse(400, result.error || 'Invalid pagination key')
 * }
 * // Use result.key as ExclusiveStartKey
 * ```
 */
export function validatePaginationKey(
  encodedKey: string | undefined | null,
  expectedPKPrefix?: string
): PaginationKeyValidation {
  // No key is valid - just means no pagination
  if (!encodedKey) {
    return { valid: true }
  }

  // Decode from base64
  let decoded: string
  try {
    decoded = Buffer.from(encodedKey, 'base64').toString('utf-8')
  } catch {
    return { valid: false, error: 'Invalid pagination key: not valid base64' }
  }

  // Parse JSON
  let key: Record<string, unknown>
  try {
    key = JSON.parse(decoded)
  } catch {
    return { valid: false, error: 'Invalid pagination key: not valid JSON' }
  }

  // Validate structure - must be an object
  if (typeof key !== 'object' || key === null || Array.isArray(key)) {
    return { valid: false, error: 'Invalid pagination key: expected object' }
  }

  // Validate PK prefix if specified
  if (expectedPKPrefix) {
    const pk = key.PK
    if (typeof pk !== 'string') {
      return { valid: false, error: 'Invalid pagination key: missing PK' }
    }
    if (!pk.startsWith(expectedPKPrefix)) {
      return {
        valid: false,
        error: `Invalid pagination key: PK prefix mismatch`,
      }
    }
  }

  return { valid: true, key }
}
