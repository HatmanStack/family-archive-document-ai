/**
 * Shared constants for the API
 */

// =============================================================================
// S3 Presigned URL Configuration
// =============================================================================

/**
 * Default expiration time for presigned URLs (seconds)
 * Used for read operations (viewing photos, downloading PDFs, etc.)
 */
export const PRESIGNED_URL_EXPIRY_SECONDS = 3600 // 1 hour

// =============================================================================
// Pagination Configuration
// =============================================================================

/**
 * Default number of items per page
 */
export const DEFAULT_PAGE_SIZE = 50

/**
 * Maximum number of items per page
 */
export const MAX_PAGE_SIZE = 100

// =============================================================================
// Content Limits
// =============================================================================

/**
 * Maximum length for comment text
 */
export const MAX_COMMENT_LENGTH = 10000
