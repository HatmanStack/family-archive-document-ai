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

/**
 * Presigned URL TTL for message attachment GETs (15 minutes).
 * Short to limit credential leakage; long enough for a client page render.
 */
export const PRESIGNED_ATTACHMENT_URL_EXPIRY_SECONDS = 900

/**
 * Presigned URL TTL for profile photo GETs (5 minutes).
 * Photos are small and re-rendered often, so a tight TTL is safe.
 */
export const PRESIGNED_PROFILE_PHOTO_URL_EXPIRY_SECONDS = 300

/**
 * Presigned URL TTL for client-side uploads (15 minutes).
 * Matches the time a user is plausibly mid-upload.
 */
export const PRESIGNED_UPLOAD_URL_EXPIRY_SECONDS = 900

/**
 * Maximum size in bytes for an uploaded profile photo (5 MB).
 */
export const MAX_PROFILE_PHOTO_SIZE_BYTES = 5 * 1024 * 1024

/**
 * Allowed MIME types for profile photo uploads.
 */
export const ALLOWED_PROFILE_PHOTO_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const

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
