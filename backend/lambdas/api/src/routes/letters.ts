/**
 * Letters route handler
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { RequestContext } from '../types'
import { GetCommand, PutCommand, QueryCommand, UpdateCommand, type QueryCommandInput } from '@aws-sdk/lib-dynamodb'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { docClient, TABLE_NAME, ARCHIVE_BUCKET } from '../lib/database'
import { s3Client, ragstackS3Client, RAGSTACK_BUCKET } from '../lib/s3-utils'
import { PRESIGNED_URL_EXPIRY_SECONDS } from '../lib/constants'
import { keys } from '../lib/keys'
import { successResponse, errorResponse } from '../lib/responses'
import { log } from '../lib/logger'
import { validatePaginationKey } from '../lib/validation'
import { toError } from '../lib/errors'

function isValidDate(date: string | undefined): boolean {
  if (!date || typeof date !== 'string') return false
  const dateRegex = /^\d{4}-\d{2}-\d{2}(-[a-z0-9-]+)?$/
  return dateRegex.test(date)
}

/**
 * Main letters route handler
 */
export async function handle(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requesterId, requestOrigin } = context
  const method = event.httpMethod
  const resource = event.resource
  const normalizedResource = resource.replace(/^\/v1/, '')

  if (method === 'GET' && normalizedResource === '/letters') {
    return listLetters(event, requestOrigin)
  }

  if (method === 'GET' && normalizedResource === '/letters/{date}') {
    return getLetter(event, requestOrigin)
  }

  if (method === 'PUT' && normalizedResource === '/letters/{date}') {
    if (!requesterId) {
      return errorResponse(401, 'Authentication required', requestOrigin)
    }
    return updateLetter(event, requesterId, requestOrigin)
  }

  if (method === 'GET' && normalizedResource === '/letters/{date}/versions') {
    return getVersions(event, requestOrigin)
  }

  if (method === 'POST' && normalizedResource === '/letters/{date}/revert') {
    if (!requesterId) {
      return errorResponse(401, 'Authentication required', requestOrigin)
    }
    return revertToVersion(event, requesterId, requestOrigin)
  }

  if (method === 'GET' && normalizedResource === '/letters/{date}/pdf') {
    return getPdfUrl(event, requestOrigin)
  }

  return errorResponse(404, 'Route not found', requestOrigin)
}

async function listLetters(event: APIGatewayProxyEvent, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  const limit = parseInt(event.queryStringParameters?.limit || '50', 10)
  const cursor = event.queryStringParameters?.cursor

  try {
    const params: QueryCommandInput = {
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': 'LETTERS' },
      Limit: limit,
      ScanIndexForward: false,
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
      items: (result.Items || []).map(item => ({
        date: item.GSI1SK,
        title: item.title,
        description: item.description,
        author: item.author,
        updatedAt: item.updatedAt,
      })),
      nextCursor: result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : null,
    }, 200, requestOrigin)
  } catch (error) {
    log.error('list_letters_error', { error: toError(error).message })
    throw error
  }
}

async function getLetter(event: APIGatewayProxyEvent, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  const date = event.pathParameters?.date

  if (!date || !isValidDate(date)) {
    return errorResponse(400, 'Valid date parameter required (YYYY-MM-DD)', requestOrigin)
  }

  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: keys.letter(date),
    }))

    if (!result.Item) {
      return errorResponse(404, 'Letter not found', requestOrigin)
    }

    return successResponse({
      date,
      title: result.Item.title,
      description: result.Item.description,
      author: result.Item.author,
      tags: result.Item.tags,
      content: result.Item.content,
      pdfKey: result.Item.pdfKey,
      ragstackDocumentId: result.Item.ragstackDocumentId,
      createdAt: result.Item.createdAt,
      updatedAt: result.Item.updatedAt,
      lastEditedBy: result.Item.lastEditedBy,
      versionCount: result.Item.versionCount || 0,
    }, 200, requestOrigin)
  } catch (error) {
    log.error('get_letter_error', { date, error: toError(error).message })
    throw error
  }
}

async function updateLetter(
  event: APIGatewayProxyEvent,
  requesterId: string,
  requestOrigin?: string
): Promise<APIGatewayProxyResult> {
  const date = event.pathParameters?.date

  let body: { content?: string; title?: string; author?: string; description?: string }
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return errorResponse(400, 'Invalid JSON body', requestOrigin)
  }

  const { content, title, author, description } = body

  if (!date || !isValidDate(date)) {
    return errorResponse(400, 'Valid date parameter required (YYYY-MM-DD)', requestOrigin)
  }

  if (!content) {
    return errorResponse(400, 'Content is required', requestOrigin)
  }

  try {
    const current = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: keys.letter(date),
    }))

    if (!current.Item) {
      return errorResponse(404, 'Letter not found', requestOrigin)
    }

    const now = new Date().toISOString()
    const versionNumber = ((current.Item.versionCount as number) || 0) + 1

    // Create version of current content
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...keys.letterVersion(date, now),
        content: current.Item.content,
        title: current.Item.title,
        author: current.Item.author,
        description: current.Item.description,
        editedBy: current.Item.lastEditedBy,
        editedAt: current.Item.updatedAt,
        versionNumber: current.Item.versionCount || 0,
        entityType: 'LETTER_VERSION',
      },
    }))

    const updatedTitle = title || current.Item.title
    const updatedAuthor = author !== undefined ? author : current.Item.author
    const updatedDescription = description !== undefined ? description : current.Item.description

    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: keys.letter(date),
      UpdateExpression: 'SET content = :content, title = :title, author = :author, description = :description, updatedAt = :now, lastEditedBy = :editor, versionCount = :vc',
      ExpressionAttributeValues: {
        ':content': content,
        ':title': updatedTitle,
        ':author': updatedAuthor,
        ':description': updatedDescription,
        ':now': now,
        ':editor': requesterId,
        ':vc': versionNumber,
      },
    }))

    return successResponse({
      message: 'Letter updated',
      versionCount: versionNumber,
    }, 200, requestOrigin)
  } catch (error) {
    log.error('update_letter_error', { date, error: toError(error).message })
    throw error
  }
}

async function getVersions(event: APIGatewayProxyEvent, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  const date = event.pathParameters?.date

  if (!date || !isValidDate(date)) {
    return errorResponse(400, 'Valid date parameter required (YYYY-MM-DD)', requestOrigin)
  }

  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': keys.letter(date).PK,
        ':skPrefix': 'VERSION#',
      },
      ScanIndexForward: false,
    }))

    const versions = (result.Items || []).map(item => ({
      versionNumber: item.versionNumber,
      editedAt: item.editedAt,
      editedBy: item.editedBy,
      timestamp: item.SK?.replace('VERSION#', ''),
    }))

    return successResponse({ versions }, 200, requestOrigin)
  } catch (error) {
    log.error('get_versions_error', { date, error: toError(error).message })
    throw error
  }
}

async function revertToVersion(
  event: APIGatewayProxyEvent,
  requesterId: string,
  requestOrigin?: string
): Promise<APIGatewayProxyResult> {
  const date = event.pathParameters?.date

  let body: { timestamp?: string }
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return errorResponse(400, 'Invalid JSON body', requestOrigin)
  }

  const { timestamp } = body

  if (!date || !isValidDate(date)) {
    return errorResponse(400, 'Valid date parameter required (YYYY-MM-DD)', requestOrigin)
  }

  if (!timestamp) {
    return errorResponse(400, 'Version timestamp is required', requestOrigin)
  }

  try {
    const versionResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: keys.letterVersion(date, timestamp),
    }))

    if (!versionResult.Item) {
      return errorResponse(404, 'Version not found', requestOrigin)
    }

    const version = versionResult.Item
    const now = new Date().toISOString()

    // Get current to create new version
    const current = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: keys.letter(date),
    }))

    if (current.Item) {
      const newVersionNumber = ((current.Item.versionCount as number) || 0) + 1

      // Save current as version before reverting
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...keys.letterVersion(date, now),
          content: current.Item.content,
          title: current.Item.title,
          author: current.Item.author,
          description: current.Item.description,
          editedBy: current.Item.lastEditedBy,
          editedAt: current.Item.updatedAt,
          versionNumber: current.Item.versionCount || 0,
          entityType: 'LETTER_VERSION',
        },
      }))

      // Update current with reverted content
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: keys.letter(date),
        UpdateExpression: 'SET content = :content, title = :title, author = :author, description = :description, updatedAt = :now, lastEditedBy = :editor, versionCount = :vc',
        ExpressionAttributeValues: {
          ':content': version.content,
          ':title': version.title,
          ':author': version.author,
          ':description': version.description,
          ':now': now,
          ':editor': requesterId,
          ':vc': newVersionNumber,
        },
      }))
    }

    return successResponse({ message: 'Reverted to version', timestamp }, 200, requestOrigin)
  } catch (error) {
    log.error('revert_version_error', { date, timestamp, error: toError(error).message })
    throw error
  }
}

async function getPdfUrl(event: APIGatewayProxyEvent, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  const date = event.pathParameters?.date

  if (!date || !isValidDate(date)) {
    return errorResponse(400, 'Valid date parameter required (YYYY-MM-DD)', requestOrigin)
  }

  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: keys.letter(date),
    }))

    if (!result.Item) {
      return errorResponse(404, 'Letter not found', requestOrigin)
    }

    let downloadUrl: string

    if (result.Item.ragstackDocumentId && RAGSTACK_BUCKET) {
      // New path: serve from RAGStack bucket
      const ragstackKey = `input/${result.Item.ragstackDocumentId}/${result.Item.pdfFilename || `${date}.pdf`}`
      downloadUrl = await getSignedUrl(
        ragstackS3Client,
        new GetObjectCommand({ Bucket: RAGSTACK_BUCKET, Key: ragstackKey }),
        { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS }
      )
    } else if (result.Item.pdfKey) {
      // Legacy fallback: serve from archive bucket
      downloadUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: ARCHIVE_BUCKET, Key: result.Item.pdfKey as string }),
        { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS }
      )
    } else {
      return errorResponse(404, 'PDF not found', requestOrigin)
    }

    return successResponse({ downloadUrl }, 200, requestOrigin)
  } catch (error) {
    log.error('get_pdf_url_error', { date, error: toError(error).message })
    throw error
  }
}
