/**
 * Centralized S3 presigning helpers.
 *
 * All S3 GET/PUT URL signing for the API lambda flows through this module so
 * TTLs and bucket plumbing live in exactly one place.
 */
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3Client } from './s3-utils'
import { ARCHIVE_BUCKET } from './database'
import {
  PRESIGNED_ATTACHMENT_URL_EXPIRY_SECONDS,
  PRESIGNED_PROFILE_PHOTO_URL_EXPIRY_SECONDS,
  PRESIGNED_UPLOAD_URL_EXPIRY_SECONDS,
} from './constants'
import { log } from './logger'
import { toError } from './errors'

/**
 * Presign a GET URL for a message attachment in the archive bucket.
 */
export async function presignAttachment(s3Key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: ARCHIVE_BUCKET, Key: s3Key })
  return getSignedUrl(s3Client, command, {
    expiresIn: PRESIGNED_ATTACHMENT_URL_EXPIRY_SECONDS,
  })
}

/**
 * Presign a GET URL for a profile photo. Accepts either a raw S3 key in the
 * archive bucket or a full S3 HTTPS URL (which is parsed for bucket+key).
 * Falls back to the original URL on parse/sign failure.
 */
export async function presignProfilePhoto(
  photoUrl: string | null | undefined
): Promise<string | null> {
  if (!photoUrl) return null

  const match = photoUrl.match(
    /https:\/\/([^.]+)\.s3\.[^/]+\.amazonaws\.com\/(.+)/
  )

  try {
    if (match) {
      const [, bucket, key] = match
      const command = new GetObjectCommand({ Bucket: bucket, Key: key })
      return await getSignedUrl(s3Client, command, {
        expiresIn: PRESIGNED_PROFILE_PHOTO_URL_EXPIRY_SECONDS,
      })
    }
    // Treat as a key in the archive bucket
    const command = new GetObjectCommand({ Bucket: ARCHIVE_BUCKET, Key: photoUrl })
    return await getSignedUrl(s3Client, command, {
      expiresIn: PRESIGNED_PROFILE_PHOTO_URL_EXPIRY_SECONDS,
    })
  } catch (error) {
    log.error('presign_profile_photo_failed', {
      photoUrl,
      error: toError(error).message,
    })
    return photoUrl
  }
}

/**
 * Presign a PUT URL for a client upload to the archive bucket.
 */
export async function presignUpload(
  key: string,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: ARCHIVE_BUCKET,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(s3Client, command, {
    expiresIn: PRESIGNED_UPLOAD_URL_EXPIRY_SECONDS,
  })
}

/**
 * Presign a deduplicated set of attachment keys in parallel.
 * Returns a map keyed by s3Key.
 */
export async function presignAttachmentBatch(
  s3Keys: readonly string[]
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(s3Keys))
  const urls = await Promise.all(unique.map(k => presignAttachment(k)))
  const map = new Map<string, string>()
  unique.forEach((key, i) => map.set(key, urls[i]))
  return map
}
