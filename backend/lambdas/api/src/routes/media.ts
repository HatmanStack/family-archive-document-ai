/**
 * Media route handlers
 *
 * Each function is registered individually on the router in index.ts.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { RequestContext } from '../types'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { ARCHIVE_BUCKET } from '../lib/database'
import { s3Client, ragstackS3Client, RAGSTACK_BUCKET } from '../lib/s3-utils'
import { PRESIGNED_URL_EXPIRY_SECONDS } from '../lib/constants'
import { successResponse, errorResponse } from '../lib/responses'
import { log } from '../lib/logger'
import { toError } from '../lib/errors'

/**
 * GET /download/presigned-url
 */
export async function getDownloadUrl(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requestOrigin } = context
  const rawKey = event.queryStringParameters?.key
  const bucket = event.queryStringParameters?.bucket

  if (!rawKey) {
    return errorResponse(400, 'Missing key parameter', requestOrigin)
  }

  let key: string
  try {
    key = decodeURIComponent(rawKey)
  } catch {
    return errorResponse(400, 'Invalid key encoding', requestOrigin)
  }

  if (key.includes('..')) {
    return errorResponse(400, 'Invalid key', requestOrigin)
  }

  let targetBucket: string
  if (bucket === 'ragstack') {
    if (!RAGSTACK_BUCKET) {
      return errorResponse(500, 'RAGStack storage is not configured', requestOrigin)
    }
    const allowedPrefixes = ['input/', 'content/']
    if (!allowedPrefixes.some(prefix => key.startsWith(prefix))) {
      return errorResponse(403, 'Access denied to this resource', requestOrigin)
    }
    targetBucket = RAGSTACK_BUCKET
  } else {
    const allowedPrefixes = ['media/', 'letters/', 'temp/']
    if (!allowedPrefixes.some(prefix => key.startsWith(prefix))) {
      return errorResponse(403, 'Access denied to this resource', requestOrigin)
    }
    targetBucket = ARCHIVE_BUCKET
  }

  try {
    const client = (bucket === 'ragstack') ? ragstackS3Client : s3Client
    const downloadUrl = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: targetBucket, Key: key }),
      { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS }
    )

    return successResponse({
      downloadUrl,
      filename: key.split('/').pop(),
    }, 200, requestOrigin)
  } catch (error) {
    log.error('download_url_error', { error: toError(error).message })
    return errorResponse(500, 'Failed to generate download URL', requestOrigin)
  }
}
