/**
 * S3 utility functions
 */
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { log } from './logger'
import { toError } from './errors'

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-west-2',
})

/**
 * Sign a photo URL for private bucket access
 *
 * Parses S3 URLs and generates pre-signed URLs for authenticated access.
 * Falls back to original URL on error for graceful degradation.
 *
 * @param photoUrl - The S3 URL to sign, or null/undefined
 * @param expiresIn - Expiration time in seconds (default: 3600)
 * @returns Signed URL, original URL if not S3, or null
 */
export async function signPhotoUrl(
  photoUrl: string | null | undefined,
  expiresIn = 3600
): Promise<string | null> {
  if (!photoUrl) return null

  const match = photoUrl.match(/https:\/\/([^.]+)\.s3\.[^/]+\.amazonaws\.com\/(.+)/)
  if (!match) return photoUrl

  const [, bucket, key] = match

  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key })
    return getSignedUrl(s3Client, command, { expiresIn })
  } catch (error) {
    log.error('sign_photo_url_failed', { bucket, key, error: toError(error).message })
    return photoUrl
  }
}
