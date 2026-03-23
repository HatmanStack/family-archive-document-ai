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
 * Expiration time for presigned upload URLs (seconds)
 * Shorter to reduce window for abuse
 */
export const PRESIGNED_UPLOAD_URL_EXPIRY_SECONDS = 900 // 15 minutes

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

/**
 * Maximum length for message text
 */
export const MAX_MESSAGE_LENGTH = 5000

/**
 * Maximum length for user bio
 */
export const MAX_BIO_LENGTH = 500

/**
 * Maximum length for display name
 */
export const MAX_DISPLAY_NAME_LENGTH = 100

// =============================================================================
// File Upload Limits
// =============================================================================

/**
 * Maximum file size for profile photos (bytes)
 */
export const MAX_PROFILE_PHOTO_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

/**
 * Maximum file size for message attachments (bytes)
 */
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

/**
 * Allowed MIME types for profile photos
 */
export const ALLOWED_PHOTO_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]

/**
 * Allowed file extensions for profile photos
 */
export const ALLOWED_PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp']
