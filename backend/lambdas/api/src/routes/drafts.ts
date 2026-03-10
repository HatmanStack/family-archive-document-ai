/**
 * Drafts route handler
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { RequestContext } from '../types'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { GetCommand, DeleteCommand, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { v4 as uuidv4 } from 'uuid'
import { docClient, TABLE_NAME, ARCHIVE_BUCKET, S3_PREFIXES } from '../lib/database'
import { keys } from '../lib/keys'
import { successResponse, errorResponse } from '../lib/responses'
import { log } from '../lib/logger'

const s3Client = new S3Client({})
const lambdaClient = new LambdaClient({})

/**
 * Main drafts route handler
 */
export async function handle(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requesterId, isAdmin, isApprovedUser } = context
  const method = event.httpMethod
  const path = event.path
  const normalizedPath = path.replace(/^\/v1/, '')

  log.info('drafts_request', { method, normalizedPath })

  // Upload request
  if (normalizedPath.endsWith('/upload-request') && method === 'POST') {
    if (!requesterId) {
      return errorResponse(401, 'Authentication required')
    }
    return handleUploadRequest(event, requesterId)
  }

  // Process uploaded files
  if (normalizedPath.includes('/letters/process/') && method === 'POST') {
    if (!requesterId) {
      return errorResponse(401, 'Authentication required')
    }
    // Extract uploadId from /letters/process/{uploadId}
    const match = normalizedPath.match(/\/letters\/process\/([^/]+)/)
    const uploadId = match ? match[1] : ''
    return handleProcess(uploadId, requesterId)
  }

  // Draft management - require ApprovedUsers or Admins
  if (normalizedPath.includes('/admin/drafts')) {
    if (!isApprovedUser && !isAdmin) {
      return errorResponse(403, 'Unauthorized')
    }

    if (normalizedPath.endsWith('/publish') && method === 'POST') {
      // Extract draftId from /admin/drafts/{draftId}/publish
      const match = normalizedPath.match(/\/admin\/drafts\/([^/]+)\/publish/)
      const draftId = match ? match[1] : ''
      return handlePublish(event, draftId, requesterId || '')
    }

    if (normalizedPath.endsWith('/drafts') && method === 'GET') {
      return handleListDrafts()
    }

    if (method === 'GET') {
      // Extract draftId from /admin/drafts/{draftId}
      const match = normalizedPath.match(/\/admin\/drafts\/([^/]+)/)
      const draftId = match ? match[1] : ''
      return handleGetDraft(draftId)
    }

    if (method === 'DELETE') {
      // Extract draftId from /admin/drafts/{draftId}
      const match = normalizedPath.match(/\/admin\/drafts\/([^/]+)/)
      const draftId = match ? match[1] : ''
      return handleDeleteDraft(draftId)
    }
  }

  return errorResponse(404, `Draft route not found: ${method} ${normalizedPath}`)
}

const MAX_FILE_COUNT = 20

async function handleUploadRequest(
  event: APIGatewayProxyEvent,
  _requesterId: string
): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body || '{}')
  const { fileCount: rawFileCount = 1, fileTypes = [] } = body

  // Validate and bound fileCount to prevent resource exhaustion
  const fileCount = Math.min(Math.max(0, Math.floor(Number(rawFileCount) || 0)), MAX_FILE_COUNT)
  if (fileCount <= 0) {
    return errorResponse(400, 'fileCount must be a positive integer')
  }
  if (rawFileCount > MAX_FILE_COUNT) {
    return errorResponse(400, `fileCount cannot exceed ${MAX_FILE_COUNT}`)
  }

  const uploadId = uuidv4()
  const urls: Array<{ url: string; key: string; index: number }> = []

  for (let i = 0; i < fileCount; i++) {
    const type = fileTypes[i] || 'application/pdf'
    let ext = 'pdf'
    if (type === 'image/jpeg') ext = 'jpg'
    if (type === 'image/png') ext = 'png'

    const key = `${S3_PREFIXES.temp}${uploadId}/${i}.${ext}`

    const command = new PutObjectCommand({
      Bucket: ARCHIVE_BUCKET,
      Key: key,
      ContentType: type,
    })

    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
    urls.push({ url, key, index: i })
  }

  return successResponse({ uploadId, urls })
}

async function handleProcess(
  uploadId: string,
  requesterId: string
): Promise<APIGatewayProxyResult> {
  const functionName = process.env.LETTER_PROCESSOR_FUNCTION_NAME

  if (!functionName) {
    log.error('config_error', { reason: 'LETTER_PROCESSOR_FUNCTION_NAME not set' })
    return errorResponse(500, 'Configuration error')
  }

  try {
    const payload = JSON.stringify({ uploadId, requesterId })
    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event',
      Payload: new TextEncoder().encode(payload),
    })

    await lambdaClient.send(command)
    return successResponse({ message: 'Processing started' }, 202)
  } catch (err) {
    log.error('process_error', { uploadId, error: (err as Error).message })
    return errorResponse(500, 'Failed to start processing')
  }
}

async function handleListDrafts(): Promise<APIGatewayProxyResult> {
  try {
    const command = new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(PK, :pk)',
      ExpressionAttributeValues: { ':pk': 'DRAFT#' },
    })

    const result = await docClient.send(command)
    return successResponse({ drafts: result.Items || [] })
  } catch (err) {
    log.error('list_drafts_error', { error: (err as Error).message })
    return errorResponse(500, 'Failed to list drafts')
  }
}

async function handleGetDraft(draftId: string): Promise<APIGatewayProxyResult> {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: keys.draft(draftId),
    }))

    if (!result.Item) {
      return errorResponse(404, 'Draft not found')
    }

    return successResponse(result.Item)
  } catch (err) {
    log.error('get_draft_error', { draftId, error: (err as Error).message })
    return errorResponse(500, 'Failed to get draft')
  }
}

async function handleDeleteDraft(draftId: string): Promise<APIGatewayProxyResult> {
  try {
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: keys.draft(draftId),
    }))

    return successResponse({ message: 'Draft deleted' })
  } catch (err) {
    log.error('delete_draft_error', { draftId, error: (err as Error).message })
    return errorResponse(500, 'Failed to delete draft')
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
  requesterId: string
): Promise<APIGatewayProxyResult> {
  let body: PublishData
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return errorResponse(400, 'Invalid JSON body')
  }

  const { finalData } = body
  if (!finalData || !finalData.date || !finalData.title || !finalData.content) {
    return errorResponse(400, 'Missing required fields: date, title, content')
  }

  try {
    // Get draft
    const draftRes = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: keys.draft(draftId),
    }))

    const draft = draftRes.Item
    if (!draft) {
      return errorResponse(404, 'Draft not found')
    }

    // Create Letter in DynamoDB
    const now = new Date().toISOString()
    const pdfFilename = `${finalData.date}.pdf`
    await docClient.send(new PutCommand({
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
    }))

    // Delete draft
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: keys.draft(draftId),
    }))

    return successResponse({ message: 'Letter published', path: `/letters/${finalData.date}` })
  } catch (err) {
    log.error('publish_error', { draftId, error: (err as Error).message })
    return errorResponse(500, 'Failed to publish letter')
  }
}
