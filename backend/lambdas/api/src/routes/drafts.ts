/**
 * Drafts route handler
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { RequestContext } from '../types'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { GetCommand, DeleteCommand, QueryCommand, PutCommand, TransactWriteCommand, type QueryCommandInput } from '@aws-sdk/lib-dynamodb'
import { v4 as uuidv4 } from 'uuid'
import { docClient, TABLE_NAME, ARCHIVE_BUCKET, S3_PREFIXES } from '../lib/database'
import { keys } from '../lib/keys'
import { successResponse, errorResponse, rateLimitResponse } from '../lib/responses'
import { log } from '../lib/logger'
import { parseRequestBody, validatePaginationKey } from '../lib/validation'
import { s3Client } from '../lib/s3-utils'
import { toError, hasErrorName } from '../lib/errors'
import { MAX_PAGE_SIZE } from '../lib/constants'
import { checkRateLimit, getRetryAfter } from '../lib/rate-limit'
const lambdaClient = new LambdaClient({})

/**
 * Main drafts route handler
 */
export async function handle(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requesterId, isAdmin, isApprovedUser, requestOrigin } = context
  const method = event.httpMethod
  const path = event.path
  const normalizedPath = path.replace(/^\/v1/, '')

  log.info('drafts_request', { method, normalizedPath })

  // Upload request
  if (normalizedPath.endsWith('/upload-request') && method === 'POST') {
    if (!requesterId) {
      return errorResponse(401, 'Authentication required', requestOrigin)
    }
    const rateLimit = await checkRateLimit(requesterId, 'upload')
    if (!rateLimit.allowed) {
      return rateLimitResponse(
        getRetryAfter(rateLimit.resetAt),
        'Rate limit exceeded. Please try again later.',
        requestOrigin
      )
    }
    return handleUploadRequest(event, requesterId, requestOrigin)
  }

  // Process uploaded files
  if (normalizedPath.includes('/letters/process/') && method === 'POST') {
    if (!requesterId) {
      return errorResponse(401, 'Authentication required', requestOrigin)
    }
    const match = normalizedPath.match(/\/letters\/process\/([^/]+)$/)
    const uploadId = match?.[1]
    if (!uploadId) {
      return errorResponse(400, 'Missing or invalid uploadId', requestOrigin)
    }
    const rateLimit = await checkRateLimit(requesterId, 'upload')
    if (!rateLimit.allowed) {
      return rateLimitResponse(
        getRetryAfter(rateLimit.resetAt),
        'Rate limit exceeded. Please try again later.',
        requestOrigin
      )
    }
    return handleProcess(uploadId, requesterId, requestOrigin)
  }

  // Draft management - require ApprovedUsers or Admins
  if (normalizedPath.includes('/admin/drafts')) {
    if (!isApprovedUser && !isAdmin) {
      return errorResponse(403, 'Unauthorized', requestOrigin)
    }

    if (normalizedPath.endsWith('/publish') && method === 'POST') {
      if (!requesterId) {
        return errorResponse(401, 'Authentication required', requestOrigin)
      }
      const match = normalizedPath.match(/\/admin\/drafts\/([^/]+)\/publish$/)
      const draftId = match?.[1]
      if (!draftId) {
        return errorResponse(400, 'Missing or invalid draftId', requestOrigin)
      }
      const rateLimit = await checkRateLimit(requesterId, 'default')
      if (!rateLimit.allowed) {
        return rateLimitResponse(
          getRetryAfter(rateLimit.resetAt),
          'Rate limit exceeded. Please try again later.',
          requestOrigin
        )
      }
      return handlePublish(event, draftId, requesterId, requestOrigin)
    }

    if (normalizedPath.endsWith('/drafts') && method === 'GET') {
      return handleListDrafts(event, requestOrigin)
    }

    if (method === 'GET') {
      const match = normalizedPath.match(/\/admin\/drafts\/([^/]+)$/)
      const draftId = match?.[1]
      if (!draftId) {
        return errorResponse(400, 'Missing or invalid draftId', requestOrigin)
      }
      return handleGetDraft(draftId, requestOrigin)
    }

    if (method === 'DELETE') {
      const match = normalizedPath.match(/\/admin\/drafts\/([^/]+)$/)
      const draftId = match?.[1]
      if (!draftId) {
        return errorResponse(400, 'Missing or invalid draftId', requestOrigin)
      }
      return handleDeleteDraft(draftId, requestOrigin)
    }
  }

  return errorResponse(404, `Draft route not found: ${method} ${normalizedPath}`, requestOrigin)
}

const MAX_FILE_COUNT = 20

const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

async function handleUploadRequest(
  event: APIGatewayProxyEvent,
  _requesterId: string,
  requestOrigin?: string
): Promise<APIGatewayProxyResult> {
  const body = parseRequestBody(event.body)
  if (!body) {
    return errorResponse(400, 'Invalid JSON in request body', requestOrigin)
  }
  const { fileCount: rawFileCount = 1, fileTypes = [] } = body

  // Validate and bound fileCount to prevent resource exhaustion
  const fileCount = Math.min(Math.max(0, Math.floor(Number(rawFileCount) || 0)), MAX_FILE_COUNT)
  if (fileCount <= 0) {
    return errorResponse(400, 'fileCount must be a positive integer', requestOrigin)
  }
  if (Number(rawFileCount) > MAX_FILE_COUNT) {
    return errorResponse(400, `fileCount cannot exceed ${MAX_FILE_COUNT}`, requestOrigin)
  }

  const uploadId = uuidv4()
  const urls: Array<{ url: string; key: string; index: number }> = []

  for (let i = 0; i < fileCount; i++) {
    const type = (fileTypes as string[])[i] || 'application/pdf'
    const ext = ALLOWED_UPLOAD_TYPES[type]
    if (!ext) {
      return errorResponse(400, `Unsupported file type: ${type}. Allowed: ${Object.keys(ALLOWED_UPLOAD_TYPES).join(', ')}`, requestOrigin)
    }

    const key = `${S3_PREFIXES.temp}${uploadId}/${i}.${ext}`

    const command = new PutObjectCommand({
      Bucket: ARCHIVE_BUCKET,
      Key: key,
      ContentType: type,
    })

    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
    urls.push({ url, key, index: i })
  }

  return successResponse({ uploadId, urls }, 200, requestOrigin)
}

async function handleProcess(
  uploadId: string,
  requesterId: string,
  requestOrigin?: string
): Promise<APIGatewayProxyResult> {
  const functionName = process.env.LETTER_PROCESSOR_FUNCTION_NAME

  if (!functionName) {
    log.error('config_error', { reason: 'LETTER_PROCESSOR_FUNCTION_NAME not set' })
    return errorResponse(500, 'Configuration error', requestOrigin)
  }

  try {
    const payload = JSON.stringify({ uploadId, requesterId })
    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event',
      Payload: new TextEncoder().encode(payload),
    })

    await lambdaClient.send(command)
    return successResponse({ message: 'Processing started' }, 202, requestOrigin)
  } catch (err) {
    log.error('process_error', { uploadId, error: toError(err).message })
    return errorResponse(500, 'Failed to start processing', requestOrigin)
  }
}

async function handleListDrafts(
  event: APIGatewayProxyEvent,
  requestOrigin?: string
): Promise<APIGatewayProxyResult> {
  try {
    const limit = Math.min(
      parseInt(event.queryStringParameters?.limit || '50', 10),
      MAX_PAGE_SIZE
    )
    const cursor = event.queryStringParameters?.cursor

    const params: QueryCommandInput = {
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': 'DRAFTS' },
      Limit: limit,
    }

    if (cursor) {
      const paginationResult = validatePaginationKey(cursor)
      if (!paginationResult.valid) {
        return errorResponse(400, paginationResult.error || 'Invalid pagination key', requestOrigin)
      }
      if (paginationResult.key) {
        params.ExclusiveStartKey = paginationResult.key
      }
    }

    const result = await docClient.send(new QueryCommand(params))

    return successResponse({
      drafts: result.Items || [],
      nextCursor: result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : null,
    }, 200, requestOrigin)
  } catch (err) {
    log.error('list_drafts_error', { error: toError(err).message })
    return errorResponse(500, 'Failed to list drafts', requestOrigin)
  }
}

async function handleGetDraft(draftId: string, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: keys.draft(draftId),
    }))

    if (!result.Item) {
      return errorResponse(404, 'Draft not found', requestOrigin)
    }

    return successResponse(result.Item, 200, requestOrigin)
  } catch (err) {
    log.error('get_draft_error', { draftId, error: toError(err).message })
    return errorResponse(500, 'Failed to get draft', requestOrigin)
  }
}

async function handleDeleteDraft(draftId: string, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  try {
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: keys.draft(draftId),
    }))

    return successResponse({ message: 'Draft deleted' }, 200, requestOrigin)
  } catch (err) {
    log.error('delete_draft_error', { draftId, error: toError(err).message })
    return errorResponse(500, 'Failed to delete draft', requestOrigin)
  }
}

interface PublishData {
  finalData?: {
    date: string
    title: string
    content: string
    author?: string
    description?: string
    ragstackDocumentId?: string
  }
}

async function handlePublish(
  event: APIGatewayProxyEvent,
  draftId: string,
  requesterId: string,
  requestOrigin?: string
): Promise<APIGatewayProxyResult> {
  const parsed = parseRequestBody(event.body)
  if (!parsed) {
    return errorResponse(400, 'Invalid JSON body', requestOrigin)
  }
  const body = parsed as unknown as PublishData

  const { finalData } = body
  if (!finalData || !finalData.date || !finalData.title || !finalData.content) {
    return errorResponse(400, 'Missing required fields: date, title, content', requestOrigin)
  }

  try {
    // Get draft
    const draftRes = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: keys.draft(draftId),
    }))

    const draft = draftRes.Item
    if (!draft) {
      return errorResponse(404, 'Draft not found', requestOrigin)
    }

    // Atomically create letter and delete draft to prevent duplicate publishes
    const now = new Date().toISOString()
    const pdfFilename = `${finalData.date}.pdf`
    await docClient.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE_NAME,
            Item: {
              ...keys.letter(finalData.date),
              entityType: 'LETTER',
              title: finalData.title,
              content: finalData.content,
              author: finalData.author || null,
              description: finalData.description || null,
              ragstackDocumentId: finalData.ragstackDocumentId || null,
              pdfFilename,
              createdAt: now,
              updatedAt: now,
              lastEditedBy: requesterId,
              versionCount: 0,
              GSI1PK: 'LETTERS',
              GSI1SK: finalData.date,
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        {
          Delete: {
            TableName: TABLE_NAME,
            Key: keys.draft(draftId),
          },
        },
      ],
    }))

    return successResponse({ message: 'Letter published', path: `/letters/${finalData.date}` }, 200, requestOrigin)
  } catch (err) {
    if (hasErrorName(err, 'TransactionCanceledException')) {
      log.warn('publish_conflict', { draftId, date: finalData.date })
      return errorResponse(409, 'A letter with this date already exists', requestOrigin)
    }
    log.error('publish_error', { draftId, error: toError(err).message })
    return errorResponse(500, 'Failed to publish letter', requestOrigin)
  }
}
