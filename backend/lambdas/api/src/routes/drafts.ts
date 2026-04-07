/**
 * Drafts route handlers
 *
 * Each function is registered individually on the router in index.ts.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { RequestContext } from '../types'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { GetCommand, DeleteCommand, QueryCommand, TransactWriteCommand, type QueryCommandInput } from '@aws-sdk/lib-dynamodb'
import { v4 as uuidv4 } from 'uuid'
import { docClient, TABLE_NAME, ARCHIVE_BUCKET, S3_PREFIXES } from '../lib/database'
import { keys } from '../lib/keys'
import { successResponse, errorResponse } from '../lib/responses'
import { log } from '../lib/logger'
import { parseRequestBody, validatePaginationKey, parsePageLimit } from '../lib/validation'
import { s3Client } from '../lib/s3-utils'
import { toError, hasErrorName } from '../lib/errors'
import { getRequesterId } from '../lib/user'
import { MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from '../lib/constants'

const lambdaClient = new LambdaClient({})

const MAX_FILE_COUNT = 20

const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

/**
 * POST /letters/upload-request
 */
export async function uploadRequest(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requestOrigin } = context
  const body = parseRequestBody(event.body)
  if (!body) {
    return errorResponse(400, 'Invalid JSON in request body', requestOrigin)
  }
  const { fileCount: rawFileCount = 1, fileTypes = [] } = body

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

/**
 * POST /letters/process/{uploadId}
 */
export async function processUpload(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requestOrigin } = context
  const requesterId = getRequesterId(context)
  const uploadId = event.pathParameters?.uploadId
  if (!uploadId) {
    return errorResponse(400, 'Missing or invalid uploadId', requestOrigin)
  }

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

/**
 * GET /admin/drafts
 */
export async function listDrafts(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requestOrigin } = context
  try {
    const limit = parsePageLimit(event.queryStringParameters?.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
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

/**
 * GET /admin/drafts/{draftId}
 */
export async function getDraft(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requestOrigin } = context
  const draftId = event.pathParameters?.draftId
  if (!draftId) {
    return errorResponse(400, 'Missing or invalid draftId', requestOrigin)
  }
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

/**
 * DELETE /admin/drafts/{draftId}
 */
export async function deleteDraft(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requestOrigin } = context
  const draftId = event.pathParameters?.draftId
  if (!draftId) {
    return errorResponse(400, 'Missing or invalid draftId', requestOrigin)
  }
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

/**
 * POST /admin/drafts/{draftId}/publish
 */
export async function publishDraft(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requestOrigin } = context
  const requesterId = getRequesterId(context)
  const draftId = event.pathParameters?.draftId
  if (!draftId) {
    return errorResponse(400, 'Missing or invalid draftId', requestOrigin)
  }

  const parsed = parseRequestBody(event.body)
  if (!parsed) {
    return errorResponse(400, 'Invalid JSON body', requestOrigin)
  }
  const body = parsed as PublishData

  const { finalData } = body
  if (!finalData || !finalData.date || !finalData.title || !finalData.content) {
    return errorResponse(400, 'Missing required fields: date, title, content', requestOrigin)
  }

  try {
    const draftRes = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: keys.draft(draftId),
    }))

    const draft = draftRes.Item
    if (!draft) {
      return errorResponse(404, 'Draft not found', requestOrigin)
    }

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
