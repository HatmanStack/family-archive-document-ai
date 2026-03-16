/**
 * Messages route handler
 */
import path from 'node:path'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { RequestContext } from '../types'
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand, BatchGetCommand, type QueryCommandInput } from '@aws-sdk/lib-dynamodb'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuidv4 } from 'uuid'
import { docClient, TABLE_NAME, ARCHIVE_BUCKET, batchWriteWithRetry } from '../lib/database'
import { keys, PREFIX } from '../lib/keys'
import { successResponse, errorResponse } from '../lib/responses'
import { log } from '../lib/logger'
import { s3Client, signPhotoUrl } from '../lib/s3-utils'
import { toError } from '../lib/errors'
import { validatePaginationKey, parseRequestBody } from '../lib/validation'
import { checkRateLimit, getRetryAfter } from '../lib/rate-limit'

interface Attachment {
  s3Key?: string
  fileName?: string
  contentType?: string
  url?: string
}

/**
 * Main messages route handler
 */
export async function handle(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requesterId, requestOrigin } = context

  if (!requesterId) {
    return errorResponse(401, 'Unauthorized: Missing user context', requestOrigin)
  }

  const method = event.httpMethod
  const resource = event.resource
  const normalizedResource = resource.replace(/^\/v1/, '')

  log.info('messages_request', { method, resource: normalizedResource, requesterId })

  if (method === 'GET' && normalizedResource === '/messages/conversations') {
    return listConversations(requesterId, requestOrigin)
  }

  if (method === 'GET' && normalizedResource === '/messages/{conversationId}') {
    return getMessages(event, requesterId, requestOrigin)
  }

  if (method === 'POST' && normalizedResource === '/messages/conversations') {
    const rateLimit = await checkRateLimit(requesterId, 'message')
    if (!rateLimit.allowed) {
      return errorResponse(429, `Rate limit exceeded. Retry after ${getRetryAfter(rateLimit.resetAt)}s`, requestOrigin)
    }
    return createConversation(event, requesterId, requestOrigin)
  }

  if (method === 'POST' && normalizedResource === '/messages/{conversationId}') {
    const rateLimit = await checkRateLimit(requesterId, 'message')
    if (!rateLimit.allowed) {
      return errorResponse(429, `Rate limit exceeded. Retry after ${getRetryAfter(rateLimit.resetAt)}s`, requestOrigin)
    }
    return sendMessage(event, requesterId, requestOrigin)
  }

  if (method === 'POST' && (normalizedResource === '/messages/{conversationId}/upload-url' ||
      normalizedResource === '/messages/attachments/upload-url')) {
    const rateLimit = await checkRateLimit(requesterId, 'upload')
    if (!rateLimit.allowed) {
      return errorResponse(429, `Rate limit exceeded. Retry after ${getRetryAfter(rateLimit.resetAt)}s`, requestOrigin)
    }
    return generateUploadUrl(event, requesterId, requestOrigin)
  }

  if (method === 'PUT' && normalizedResource === '/messages/{conversationId}/read') {
    const rateLimit = await checkRateLimit(requesterId, 'message')
    if (!rateLimit.allowed) {
      return errorResponse(429, `Rate limit exceeded. Retry after ${getRetryAfter(rateLimit.resetAt)}s`, requestOrigin)
    }
    return markAsRead(event, requesterId, requestOrigin)
  }

  if (method === 'DELETE' && normalizedResource === '/messages/{conversationId}') {
    const rateLimit = await checkRateLimit(requesterId, 'message')
    if (!rateLimit.allowed) {
      return errorResponse(429, `Rate limit exceeded. Retry after ${getRetryAfter(rateLimit.resetAt)}s`, requestOrigin)
    }
    return deleteConversation(event, requesterId, requestOrigin)
  }

  if (method === 'DELETE' && normalizedResource === '/messages/{conversationId}/{messageId}') {
    const rateLimit = await checkRateLimit(requesterId, 'message')
    if (!rateLimit.allowed) {
      return errorResponse(429, `Rate limit exceeded. Retry after ${getRetryAfter(rateLimit.resetAt)}s`, requestOrigin)
    }
    return deleteMessage(event, requesterId, requestOrigin)
  }

  return errorResponse(404, 'Route not found', requestOrigin)
}

async function listConversations(userId: string, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `${PREFIX.USER}${userId}`,
        ':skPrefix': PREFIX.CONV,
      },
      ScanIndexForward: false,
      Limit: 50,
    }))

    const conversations = (result.Items || [])
      .filter(item => item.entityType === 'CONVERSATION_MEMBER')
      .map(item => ({
        conversationId: item.conversationId,
        conversationType: item.conversationType,
        participantIds: item.participantIds ? Array.from(item.participantIds as Set<string>) : [],
        participantNames: item.participantNames ? Array.from(item.participantNames as Set<string>) : [],
        lastMessageAt: item.lastMessageAt,
        unreadCount: item.unreadCount || 0,
        conversationTitle: item.conversationTitle,
        creatorId: item.creatorId,
      }))

    return successResponse({ conversations }, 200, requestOrigin)
  } catch (err) {
    const error = toError(err)
    log.error('list_conversations_error', { userId, error: error.message })
    return errorResponse(500, 'Failed to list conversations', requestOrigin)
  }
}

async function getMessages(event: APIGatewayProxyEvent, userId: string, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  const conversationId = event.pathParameters?.conversationId
  const limit = parseInt(event.queryStringParameters?.limit || '50', 10)
  const lastEvaluatedKey = event.queryStringParameters?.lastEvaluatedKey

  if (!conversationId) {
    return errorResponse(400, 'Missing conversationId parameter', requestOrigin)
  }

  try {
    const memberCheck = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: keys.userConversation(userId, conversationId),
    }))

    if (!memberCheck.Item) {
      return errorResponse(403, 'You are not a participant in this conversation', requestOrigin)
    }

    const queryParams: QueryCommandInput = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `${PREFIX.CONV}${conversationId}`,
        ':skPrefix': PREFIX.MSG,
      },
      Limit: limit,
      ScanIndexForward: false,
    }

    if (lastEvaluatedKey) {
      const paginationResult = validatePaginationKey(lastEvaluatedKey, PREFIX.CONV)
      if (!paginationResult.valid) {
        return errorResponse(400, paginationResult.error || 'Invalid pagination key', requestOrigin)
      }
      if (paginationResult.key) {
        queryParams.ExclusiveStartKey = paginationResult.key
      }
    }

    const result = await docClient.send(new QueryCommand(queryParams))

    const messages = await Promise.all(
      (result.Items || [])
        .filter(item => item.entityType === 'MESSAGE')
        .map(async item => {
          const attachmentsWithUrls = await Promise.all(
            ((item.attachments as Attachment[]) || []).map(async attachment => {
              if (attachment.s3Key) {
                const command = new GetObjectCommand({
                  Bucket: ARCHIVE_BUCKET,
                  Key: attachment.s3Key,
                })
                const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
                return { ...attachment, url }
              }
              return attachment
            })
          )

          return {
            messageId: item.messageId,
            conversationId: item.conversationId,
            senderId: item.senderId,
            senderName: item.senderName,
            senderPhotoUrl: await signPhotoUrl(item.senderPhotoUrl as string),
            messageText: item.messageText,
            attachments: attachmentsWithUrls,
            createdAt: item.createdAt,
          }
        })
    )

    return successResponse({
      messages,
      creatorId: memberCheck.Item.creatorId,
      conversationTitle: memberCheck.Item.conversationTitle,
      lastEvaluatedKey: result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : null,
    }, 200, requestOrigin)
  } catch (err) {
    const error = toError(err)
    log.error('get_messages_error', { conversationId, userId, error: error.message })
    return errorResponse(500, 'Failed to get messages', requestOrigin)
  }
}

async function createConversation(event: APIGatewayProxyEvent, userId: string, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  const body = parseRequestBody(event.body)
  if (!body) {
    return errorResponse(400, 'Invalid JSON in request body', requestOrigin)
  }
  const participantIds: string[] = (body.participantIds as string[]) || []
  const { messageText, conversationTitle } = body

  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    return errorResponse(400, 'participantIds must be a non-empty array', requestOrigin)
  }

  if (!participantIds.includes(userId)) {
    participantIds.push(userId)
  }

  try {
    const conversationId = participantIds.length === 2
      ? participantIds.sort().join('_')
      : uuidv4()

    const conversationType = participantIds.length === 2 ? 'direct' : 'group'
    const participantNames = await fetchUserNames(participantIds)
    const now = new Date().toISOString()

    const memberRecords: Array<{ PutRequest: { Item: Record<string, unknown> } }> = participantIds.map(pid => ({
      PutRequest: {
        Item: {
          ...keys.userConversation(pid, conversationId),
          entityType: 'CONVERSATION_MEMBER',
          conversationId,
          conversationType,
          creatorId: userId,
          participantIds: new Set(participantIds),
          participantNames: new Set(participantNames),
          lastMessageAt: now,
          unreadCount: pid === userId ? 0 : 1,
          conversationTitle: conversationTitle || null,
        },
      },
    }))

    memberRecords.push({
      PutRequest: {
        Item: {
          ...keys.conversationMeta(conversationId),
          entityType: 'CONVERSATION_META',
          creatorId: userId,
          createdAt: now,
          conversationType,
          participantIds: new Set(participantIds),
          conversationTitle: conversationTitle || null,
        },
      },
    })

    await batchWriteWithRetry(memberRecords, TABLE_NAME)

    let message = null
    if (messageText) {
      message = await createMessageInternal(conversationId, userId, messageText, participantIds, conversationType)
    }

    return successResponse({ conversationId, conversationType, participantIds, message }, 201, requestOrigin)
  } catch (err) {
    const error = toError(err)
    log.error('create_conversation_error', { userId, participantIds, error: error.message })
    return errorResponse(500, 'Failed to create conversation', requestOrigin)
  }
}

async function sendMessage(event: APIGatewayProxyEvent, userId: string, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  const conversationId = event.pathParameters?.conversationId
  const body = parseRequestBody(event.body)
  if (!body) {
    return errorResponse(400, 'Invalid JSON in request body', requestOrigin)
  }
  const { messageText = '', attachments = [] } = body

  if (!conversationId) {
    return errorResponse(400, 'Missing conversationId parameter', requestOrigin)
  }

  const hasText = messageText && typeof messageText === 'string' && messageText.trim().length > 0
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0

  if (!hasText && !hasAttachments) {
    return errorResponse(400, 'Message must have text or attachments', requestOrigin)
  }

  if (messageText && messageText.length > 5000) {
    return errorResponse(400, 'Message text must be 5000 characters or less', requestOrigin)
  }

  try {
    const memberCheck = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: keys.userConversation(userId, conversationId),
    }))

    if (!memberCheck.Item) {
      return errorResponse(403, 'You are not a participant in this conversation', requestOrigin)
    }

    const conversation = memberCheck.Item
    const participantIds = Array.from(conversation.participantIds as Set<string>)
    const conversationType = conversation.conversationType as string

    const message = await createMessageInternal(conversationId, userId, messageText, participantIds, conversationType, attachments)
    await updateConversationMembers(conversationId, userId, participantIds)

    return successResponse(message, 201, requestOrigin)
  } catch (err) {
    const error = toError(err)
    log.error('send_message_error', { conversationId, userId, error: error.message })
    return errorResponse(500, 'Failed to send message', requestOrigin)
  }
}

async function generateUploadUrl(event: APIGatewayProxyEvent, userId: string, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  const body = parseRequestBody(event.body)
  if (!body) {
    return errorResponse(400, 'Invalid JSON in request body', requestOrigin)
  }
  const fileName = body.fileName || body.filename
  const contentType = body.contentType || 'application/octet-stream'

  if (!fileName) {
    return errorResponse(400, 'Missing fileName', requestOrigin)
  }

  try {
    const safeName = path.basename(String(fileName)).replace(/[^a-zA-Z0-9._-]/g, '_')
    const key = `messages/attachments/${userId}/${uuidv4()}_${safeName}`

    const command = new PutObjectCommand({
      Bucket: ARCHIVE_BUCKET,
      Key: key,
      ContentType: contentType,
    })

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 })

    return successResponse({ uploadUrl: presignedUrl, s3Key: key, fileName, contentType }, 200, requestOrigin)
  } catch (err) {
    const error = toError(err)
    log.error('generate_upload_url_error', { userId, fileName, error: error.message })
    return errorResponse(500, 'Failed to generate upload URL', requestOrigin)
  }
}

async function markAsRead(event: APIGatewayProxyEvent, userId: string, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  const conversationId = event.pathParameters?.conversationId

  if (!conversationId) {
    return errorResponse(400, 'Missing conversationId parameter', requestOrigin)
  }

  try {
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: keys.userConversation(userId, conversationId),
      UpdateExpression: 'SET unreadCount = :zero',
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeValues: { ':zero': 0 },
    }))

    return successResponse({ message: 'Conversation marked as read' }, 200, requestOrigin)
  } catch (err) {
    const error = toError(err)
    if (error.name === 'ConditionalCheckFailedException') {
      return errorResponse(403, 'You are not a member of this conversation', requestOrigin)
    }
    log.error('mark_as_read_error', { conversationId, userId, error: error.message })
    return errorResponse(500, 'Failed to mark as read', requestOrigin)
  }
}

async function deleteConversation(event: APIGatewayProxyEvent, userId: string, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  const conversationId = decodeURIComponent(event.pathParameters?.conversationId || '')

  if (!conversationId) {
    return errorResponse(400, 'Missing conversationId parameter', requestOrigin)
  }

  try {
    const metaKey = keys.conversationMeta(conversationId)
    const metaResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: metaKey,
    }))

    let participantIds: string[] = []

    if (metaResult.Item) {
      if (metaResult.Item.creatorId !== userId) {
        return errorResponse(403, 'Only the conversation creator can delete it', requestOrigin)
      }
      participantIds = Array.from((metaResult.Item.participantIds as Set<string>) || [])
    } else {
      const memberResult = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: keys.userConversation(userId, conversationId),
      }))

      if (!memberResult.Item) {
        return errorResponse(404, 'Conversation not found', requestOrigin)
      }

      if (memberResult.Item.creatorId !== userId) {
        return errorResponse(403, 'Cannot delete legacy conversation or not the creator', requestOrigin)
      }
      participantIds = Array.from((memberResult.Item.participantIds as Set<string>) || [])
    }

    const deleteOps: Array<{ DeleteRequest: { Key: Record<string, unknown> } }> = []
    const s3KeysToDelete: string[] = []

    participantIds.forEach(pid => {
      const userConvKey = keys.userConversation(pid, conversationId)
      deleteOps.push({
        DeleteRequest: { Key: { PK: userConvKey.PK, SK: userConvKey.SK } },
      })
    })

    deleteOps.push({
      DeleteRequest: { Key: { PK: metaKey.PK, SK: metaKey.SK } },
    })

    // Query all messages
    let lastKey: Record<string, unknown> | undefined
    do {
      const msgs = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `${PREFIX.CONV}${conversationId}`,
          ':skPrefix': PREFIX.MSG,
        },
        ExclusiveStartKey: lastKey,
      }))

      if (msgs.Items) {
        msgs.Items.forEach(msg => {
          deleteOps.push({
            DeleteRequest: { Key: { PK: msg.PK as string, SK: msg.SK as string } },
          })

          // Collect S3 keys for later deletion
          const attachments = msg.attachments as Attachment[] | undefined
          if (attachments && attachments.length > 0) {
            attachments.forEach(att => {
              if (att.s3Key) {
                s3KeysToDelete.push(att.s3Key)
              }
            })
          }
        })
      }
      lastKey = msgs.LastEvaluatedKey
    } while (lastKey)

    // Delete S3 attachments (soft cleanup - log failures but don't fail the operation)
    // We await these to ensure cleanup is attempted before returning success
    await Promise.all(
      s3KeysToDelete.map(async (s3Key) => {
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: ARCHIVE_BUCKET,
            Key: s3Key,
          }))
        } catch (e) {
          // Log but don't fail - orphaned S3 objects are cleaned up by lifecycle policies
          log.warn('attachment_delete_failed', { s3Key, error: toError(e).message })
        }
      })
    )

    // Batch delete DynamoDB records
    await batchWriteWithRetry(deleteOps, TABLE_NAME)

    return successResponse({ message: 'Conversation deleted' }, 200, requestOrigin)
  } catch (err) {
    const error = toError(err)
    log.error('delete_conversation_error', { conversationId, userId, error: error.message })
    return errorResponse(500, 'Failed to delete conversation', requestOrigin)
  }
}

async function deleteMessage(event: APIGatewayProxyEvent, userId: string, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  const conversationId = decodeURIComponent(event.pathParameters?.conversationId || '')
  const messageId = decodeURIComponent(event.pathParameters?.messageId || '')

  if (!conversationId || !messageId) {
    return errorResponse(400, 'Missing conversationId or messageId parameter', requestOrigin)
  }

  try {
    const messageKey = keys.message(conversationId, messageId)
    const messageResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: messageKey,
    }))

    if (!messageResult.Item) {
      return errorResponse(404, 'Message not found', requestOrigin)
    }

    const message = messageResult.Item

    if (message.senderId !== userId) {
      return errorResponse(403, 'You can only delete your own messages', requestOrigin)
    }

    // Delete attachments
    const attachments = message.attachments as Attachment[] | undefined
    if (attachments && attachments.length > 0) {
      await Promise.all(
        attachments.map(async attachment => {
          if (attachment.s3Key) {
            try {
              await s3Client.send(new DeleteObjectCommand({
                Bucket: ARCHIVE_BUCKET,
                Key: attachment.s3Key,
              }))
            } catch (e) {
              log.warn('attachment_delete_failed', { s3Key: attachment.s3Key, error: toError(e).message })
            }
          }
        })
      )
    }

    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: messageKey,
    }))

    return successResponse({ message: 'Message deleted' }, 200, requestOrigin)
  } catch (err) {
    const error = toError(err)
    log.error('delete_message_error', { conversationId, messageId, userId, error: error.message })
    return errorResponse(500, 'Failed to delete message', requestOrigin)
  }
}

async function createMessageInternal(
  conversationId: string,
  senderId: string,
  messageText: string,
  participantIds: string[],
  conversationType: string,
  attachments: Attachment[] = []
) {
  const profileResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: keys.userProfile(senderId),
  }))

  const senderName = (profileResult.Item?.displayName as string) || 'Anonymous'
  const senderPhotoUrl = (profileResult.Item?.profilePhotoUrl as string) || null
  const timestamp = new Date().toISOString()
  const messageId = `${timestamp}#${uuidv4()}`

  const message = {
    ...keys.message(conversationId, messageId),
    entityType: 'MESSAGE',
    messageId,
    conversationId,
    senderId,
    senderName,
    senderPhotoUrl,
    messageText,
    attachments,
    createdAt: timestamp,
    conversationType,
    participants: new Set(participantIds),
  }

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: message,
  }))

  const attachmentsWithUrls = await Promise.all(
    attachments.map(async attachment => {
      if (attachment.s3Key) {
        const command = new GetObjectCommand({
          Bucket: ARCHIVE_BUCKET,
          Key: attachment.s3Key,
        })
        const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
        return { ...attachment, url }
      }
      return attachment
    })
  )

  return {
    messageId,
    conversationId,
    senderId,
    senderName,
    senderPhotoUrl: await signPhotoUrl(senderPhotoUrl),
    messageText,
    attachments: attachmentsWithUrls,
    createdAt: timestamp,
    participants: participantIds,
  }
}

async function updateConversationMembers(conversationId: string, senderId: string, participantIds: string[]) {
  const now = new Date().toISOString()

  await Promise.all(participantIds.map(participantId => {
    const updateExpression = participantId === senderId
      ? 'SET lastMessageAt = :now'
      : 'SET lastMessageAt = :now ADD unreadCount :one'

    const expressionValues = participantId === senderId
      ? { ':now': now }
      : { ':now': now, ':one': 1 }

    return docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: keys.userConversation(participantId, conversationId),
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionValues,
    }))
  }))
}

async function fetchUserNames(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return []

  const result = await docClient.send(new BatchGetCommand({
    RequestItems: {
      [TABLE_NAME]: {
        Keys: userIds.map(userId => keys.userProfile(userId)),
      },
    },
  }))

  const userMap: Record<string, string> = {}
  ;(result.Responses?.[TABLE_NAME] || []).forEach(item => {
    const userId = (item.PK as string).replace(PREFIX.USER, '')
    userMap[userId] = (item.displayName as string) || 'Anonymous'
  })

  return userIds.map(userId => userMap[userId] || 'Anonymous')
}
