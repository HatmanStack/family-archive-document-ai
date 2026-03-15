/**
 * Media route handler
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { RequestContext } from '../types'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { ARCHIVE_BUCKET } from '../lib/database'
import { PRESIGNED_URL_EXPIRY_SECONDS } from '../lib/constants'
import { successResponse, errorResponse } from '../lib/responses'
import { log } from '../lib/logger'
import { toError } from '../lib/errors'

const s3Client = new S3Client({})
const RAGSTACK_BUCKET = process.env.RAGSTACK_BUCKET || ''
const RAGSTACK_REGION = process.env.RAGSTACK_REGION || 'us-east-1'
const ragstackS3Client = new S3Client({ region: RAGSTACK_REGION })

/**
 * Main media route handler
 */
export async function handle(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requesterId } = context

  if (!requesterId) {
    return errorResponse(401, 'Unauthorized: Missing user context')
  }

  const method = event.httpMethod
  const resource = event.resource
  const normalizedResource = resource.replace(/^\/v1/, '')

  if (method === 'GET' && normalizedResource === '/download/presigned-url') {
    return getDownloadUrl(event)
  }

  return errorResponse(404, 'Route not found')
}

async function getDownloadUrl(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const rawKey = event.queryStringParameters?.key
  const bucket = event.queryStringParameters?.bucket

  if (!rawKey) {
    return errorResponse(400, 'Missing key parameter')
  }

  // Decode the key to catch URL-encoded path traversal attempts (e.g., %2e%2e)
  let key: string
  try {
    key = decodeURIComponent(rawKey)
  } catch {
    return errorResponse(400, 'Invalid key encoding')
  }

  if (key.includes('..')) {
    return errorResponse(400, 'Invalid key')
  }

  // Determine which bucket to use
  let targetBucket: string
  if (bucket === 'ragstack') {
    if (!RAGSTACK_BUCKET) {
      return errorResponse(500, 'RAGStack storage is not configured')
    }
    // RAGStack bucket: allow input/ and content/ prefixes
    const allowedPrefixes = ['input/', 'content/']
    if (!allowedPrefixes.some(prefix => key.startsWith(prefix))) {
      return errorResponse(403, 'Access denied to this resource')
    }
    targetBucket = RAGSTACK_BUCKET
  } else {
    // Archive bucket: allow media/, letters/, temp/ prefixes
    const allowedPrefixes = ['media/', 'letters/', 'temp/']
    if (!allowedPrefixes.some(prefix => key.startsWith(prefix))) {
      return errorResponse(403, 'Access denied to this resource')
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
    })
  } catch (error) {
    log.error('download_url_error', { error: toError(error).message })
    return errorResponse(500, 'Failed to generate download URL')
  }
}
