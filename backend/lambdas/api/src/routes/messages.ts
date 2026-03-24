/**
 * Messages route handler
 *
 * Delegates DynamoDB operations to MessagingRepository.
 * Handles request parsing, validation, response formatting, and S3 operations.
 */
import path from 'node:path'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { RequestContext } from '../types'
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuidv4 } from 'uuid'
import { ARCHIVE_BUCKET } from '../lib/database'
import { successResponse, errorResponse, rateLimitResponse } from '../lib/responses'
import { log } from '../lib/logger'
import { s3Client, signPhotoUrl } from '../lib/s3-utils'
import { toError } from '../lib/errors'
import { parseRequestBody, parsePageLimit } from '../lib/validation'
import { MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from '../lib/constants'
import { checkRateLimit, getRetryAfter } from '../lib/rate-limit'
import { messagingRepository } from '../repositories'

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
    return listConversations(event, requesterId, requestOrigin)
  }

  if (method === 'GET' && normalizedResource === '/messages/{conversationId}') {
    return getMessages(event, requesterId, requestOrigin)
  }

  if (method === 'POST' && normalizedResource === '/messages/conversations') {
    const rateLimit = await checkRateLimit(requesterId, 'message')
    if (!rateLimit.allowed) {
      return rateLimitResponse(
        getRetryAfter(rateLimit.resetAt),
        'Rate limit exceeded. Please try again later.',
        requestOrigin
      )
    }
    return createConversation(event, requesterId, requestOrigin)
  }

  if (method === 'POST' && normalizedResource === '/messages/{conversationId}') {
    const rateLimit = await checkRateLimit(requesterId, 'message')
    if (!rateLimit.allowed) {
      return rateLimitResponse(
        getRetryAfter(rateLimit.resetAt),
        'Rate limit exceeded. Please try again later.',
        requestOrigin
      )
    }
    return sendMessage(event, requesterId, requestOrigin)
  }

  if (method === 'POST' && (normalizedResource === '/messages/{conversationId}/upload-url' ||
      normalizedResource === '/messages/attachments/upload-url')) {
    const rateLimit = await checkRateLimit(requesterId, 'upload')
    if (!rateLimit.allowed) {
      return rateLimitResponse(
        getRetryAfter(rateLimit.resetAt),
        'Rate limit exceeded. Please try again later.',
        requestOrigin
      )
    }
    return generateUploadUrl(event, requesterId, requestOrigin)
  }

  if (method === 'PUT' && normalizedResource === '/messages/{conversationId}/read') {
    const rateLimit = await checkRateLimit(requesterId, 'message')
    if (!rateLimit.allowed) {
      return rateLimitResponse(
        getRetryAfter(rateLimit.resetAt),
        'Rate limit exceeded. Please try again later.',
        requestOrigin
      )
    }
    return markAsRead(event, requesterId, requestOrigin)
  }

  if (method === 'DELETE' && normalizedResource === '/messages/{conversationId}') {
    const rateLimit = await checkRateLimit(requesterId, 'message')
    if (!rateLimit.allowed) {
      return rateLimitResponse(
        getRetryAfter(rateLimit.resetAt),
        'Rate limit exceeded. Please try again later.',
        requestOrigin
      )
    }
    return deleteConversation(event, requesterId, requestOrigin)
  }

  if (method === 'DELETE' && normalizedResource === '/messages/{conversationId}/{messageId}') {
    const rateLimit = await checkRateLimit(requesterId, 'message')
    if (!rateLimit.allowed) {
      return rateLimitResponse(
        getRetryAfter(rateLimit.resetAt),
        'Rate limit exceeded. Please try again later.',
        requestOrigin
      )
    }
    return deleteMessage(event, requesterId, requestOrigin)
  }

  return errorResponse(404, 'Route not found', requestOrigin)
}

async function listConversations(event: APIGatewayProxyEvent, userId: string, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  const lastEvaluatedKey = event.queryStringParameters?.lastEvaluatedKey

  try {
    const result = await messagingRepository.listConversationsForUser(userId, lastEvaluatedKey)

    const conversations = result.conversations.map(item => ({
      conversationId: item.conversationId,
      conversationType: item.conversationType,
      participantIds: Array.from(item.participantIds),
      participantNames: Array.from(item.participantNames),
      lastMessageAt: item.lastMessageAt,
      unreadCount: item.unreadCount,
      conversationTitle: item.conversationTitle,
      creatorId: item.creatorId,
    }))

    return successResponse({
      conversations,
      lastEvaluatedKey: result.lastEvaluatedKey,
    }, 200, requestOrigin)
  } catch (err) {
    const error = toError(err)
    if (error.message.includes('Invalid pagination key') || error.message.includes('pagination')) {
      return errorResponse(400, error.message, requestOrigin)
    }
    log.error('list_conversations_error', { userId, error: error.message })
    return errorResponse(500, 'Failed to list conversations', requestOrigin)
  }
}

async function getMessages(event: APIGatewayProxyEvent, userId: string, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  const conversationId = event.pathParameters?.conversationId
  const limit = parsePageLimit(event.queryStringParameters?.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const lastEvaluatedKey = event.queryStringParameters?.lastEvaluatedKey

  if (!conversationId) {
    return errorResponse(400, 'Missing conversationId parameter', requestOrigin)
  }

  try {
    const memberCheck = await messagingRepository.getConversationMembership(userId, conversationId)

    if (!memberCheck) {
      return errorResponse(403, 'You are not a participant in this conversation', requestOrigin)
    }

    const result = await messagingRepository.getMessages(conversationId, limit, lastEvaluatedKey)

    // Process messages in batches to limit concurrent signing operations
    const SIGN_BATCH_SIZE = 10
    const messages = []

    for (let i = 0; i < result.messages.length; i += SIGN_BATCH_SIZE) {
      const batch = result.messages.slice(i, i + SIGN_BATCH_SIZE)
      const batchResults = await Promise.all(
        batch.map(async item => {
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
      messages.push(...batchResults)
    }

    return successResponse({
      messages,
      creatorId: memberCheck.creatorId,
      conversationTitle: memberCheck.conversationTitle,
      lastEvaluatedKey: result.lastEvaluatedKey,
    }, 200, requestOrigin)
  } catch (err) {
    const error = toError(err)
    if (error.message.includes('Invalid pagination key') || error.message.includes('pagination')) {
      return errorResponse(400, error.message, requestOrigin)
    }
    log.error('get_messages_error', { conversationId, userId, error: error.message })
    return errorResponse(500, 'Failed to get messages', requestOrigin)
  }
}

async function createConversation(event: APIGatewayProxyEvent, userId: string, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  const body = parseRequestBody(event.body)
  if (!body) {
    return errorResponse(400, 'Invalid JSON in request body', requestOrigin)
  }
  const rawParticipantIds = body.participantIds
  const { messageText, conversationTitle } = body

  if (!Array.isArray(rawParticipantIds) || rawParticipantIds.length === 0) {
    return errorResponse(400, 'participantIds must be a non-empty array', requestOrigin)
  }

  // Validate, normalize, and deduplicate participant IDs
  const seen = new Set<string>()
  const participantIds: string[] = []
  for (const id of rawParticipantIds) {
    if (typeof id !== 'string' || id.trim().length === 0) {
      return errorResponse(400, 'Each participantId must be a non-empty string', requestOrigin)
    }
    const trimmed = id.trim()
    if (!seen.has(trimmed)) {
      seen.add(trimmed)
      participantIds.push(trimmed)
    }
  }

  if (!participantIds.includes(userId)) {
    participantIds.push(userId)
  }

  try {
    const conversationId = participantIds.length === 2
      ? participantIds.sort().join('_')
      : uuidv4()

    const conversationType = participantIds.length === 2 ? 'direct' : 'group'
    const participantNames = await messagingRepository.fetchUserNames(participantIds)

    await messagingRepository.createConversationWithMembers(
      conversationId,
      conversationType,
      participantIds,
      participantNames,
      userId,
      conversationTitle as string | undefined
    )

    let message = null
    if (messageText) {
      const senderProfile = await messagingRepository.getSenderProfile(userId)
      const messageRecord = await messagingRepository.createMessage(
        conversationId,
        userId,
        senderProfile,
        messageText as string,
        participantIds,
        conversationType
      )

      // Sign photo URL for response
      message = {
        messageId: messageRecord.messageId,
        conversationId: messageRecord.conversationId,
        senderId: messageRecord.senderId,
        senderName: messageRecord.senderName,
        senderPhotoUrl: await signPhotoUrl(messageRecord.senderPhotoUrl),
        messageText: messageRecord.messageText,
        attachments: messageRecord.attachments,
        createdAt: messageRecord.createdAt,
        participants: participantIds,
      }
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

  const hasText = messageText && typeof messageText === 'string' && (messageText as string).trim().length > 0
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0

  if (!hasText && !hasAttachments) {
    return errorResponse(400, 'Message must have text or attachments', requestOrigin)
  }

  if (messageText && (messageText as string).length > 5000) {
    return errorResponse(400, 'Message text must be 5000 characters or less', requestOrigin)
  }

  try {
    const membership = await messagingRepository.getConversationMembership(userId, conversationId)

    if (!membership) {
      return errorResponse(403, 'You are not a participant in this conversation', requestOrigin)
    }

    const participantIds = Array.from(membership.participantIds)
    const conversationType = membership.conversationType

    // Pass sender profile from membership context to avoid N+1 re-fetch
    const senderProfile = await messagingRepository.getSenderProfile(userId)

    const messageRecord = await messagingRepository.createMessage(
      conversationId,
      userId,
      senderProfile,
      messageText as string,
      participantIds,
      conversationType,
      attachments as Attachment[]
    )
    await messagingRepository.updateConversationMembers(conversationId, userId, participantIds)

    // Sign attachment URLs for response
    const attachmentsWithUrls = await Promise.all(
      (messageRecord.attachments || []).map(async attachment => {
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

    const message = {
      messageId: messageRecord.messageId,
      conversationId: messageRecord.conversationId,
      senderId: messageRecord.senderId,
      senderName: messageRecord.senderName,
      senderPhotoUrl: await signPhotoUrl(messageRecord.senderPhotoUrl),
      messageText: messageRecord.messageText,
      attachments: attachmentsWithUrls,
      createdAt: messageRecord.createdAt,
      participants: participantIds,
    }

    return successResponse(message, 201, requestOrigin)
  } catch (err) {
    const error = toError(err)
    log.error('send_message_error', { conversationId, userId, error: error.message })
    return errorResponse(500, 'Failed to send message', requestOrigin)
  }
}

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'application/octet-stream',
  'video/mp4', 'video/quicktime',
  'audio/mpeg', 'audio/mp4',
])

async function generateUploadUrl(event: APIGatewayProxyEvent, userId: string, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  const body = parseRequestBody(event.body)
  if (!body) {
    return errorResponse(400, 'Invalid JSON in request body', requestOrigin)
  }
  const fileName = body.fileName || body.filename
  const requestedType = (body.contentType as string) || 'application/octet-stream'
  const contentType = ALLOWED_ATTACHMENT_TYPES.has(requestedType) ? requestedType : 'application/octet-stream'

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
    await messagingRepository.markConversationRead(userId, conversationId)

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
  let conversationId: string
  try {
    conversationId = decodeURIComponent(event.pathParameters?.conversationId || '')
  } catch {
    return errorResponse(400, 'Malformed conversationId parameter', requestOrigin)
  }

  if (!conversationId) {
    return errorResponse(400, 'Missing conversationId parameter', requestOrigin)
  }

  try {
    // Check ownership via meta or membership fallback
    const meta = await messagingRepository.getConversationMeta(conversationId)

    let participantIds: string[] = []

    if (meta) {
      if (meta.creatorId !== userId) {
        return errorResponse(403, 'Only the conversation creator can delete it', requestOrigin)
      }
      participantIds = Array.from(meta.participantIds || [])
    } else {
      const membership = await messagingRepository.getConversationMembership(userId, conversationId)

      if (!membership) {
        return errorResponse(404, 'Conversation not found', requestOrigin)
      }

      if (membership.creatorId !== userId) {
        return errorResponse(403, 'Cannot delete legacy conversation or not the creator', requestOrigin)
      }
      participantIds = Array.from(membership.participantIds || [])
    }

    const { s3Keys } = await messagingRepository.deleteConversationData(conversationId, participantIds)

    // Delete S3 attachments in batches
    const S3_DELETE_BATCH_SIZE = 25
    for (let i = 0; i < s3Keys.length; i += S3_DELETE_BATCH_SIZE) {
      const batch = s3Keys.slice(i, i + S3_DELETE_BATCH_SIZE)
      await Promise.all(
        batch.map(async (s3Key) => {
          try {
            await s3Client.send(new DeleteObjectCommand({
              Bucket: ARCHIVE_BUCKET,
              Key: s3Key,
            }))
          } catch (e) {
            log.warn('attachment_delete_failed', { s3Key, error: toError(e).message })
          }
        })
      )
    }

    return successResponse({ message: 'Conversation deleted' }, 200, requestOrigin)
  } catch (err) {
    const error = toError(err)
    log.error('delete_conversation_error', { conversationId, userId, error: error.message })
    return errorResponse(500, 'Failed to delete conversation', requestOrigin)
  }
}

async function deleteMessage(event: APIGatewayProxyEvent, userId: string, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  let conversationId: string
  let messageId: string
  try {
    conversationId = decodeURIComponent(event.pathParameters?.conversationId || '')
    messageId = decodeURIComponent(event.pathParameters?.messageId || '')
  } catch {
    return errorResponse(400, 'Malformed conversationId or messageId parameter', requestOrigin)
  }

  if (!conversationId || !messageId) {
    return errorResponse(400, 'Missing conversationId or messageId parameter', requestOrigin)
  }

  try {
    // Check message exists and verify ownership before deletion
    const message = await messagingRepository.getMessage(conversationId, messageId)

    if (!message) {
      return errorResponse(404, 'Message not found', requestOrigin)
    }

    if (message.senderId !== userId) {
      return errorResponse(403, 'You can only delete your own messages', requestOrigin)
    }

    const result = await messagingRepository.deleteMessageRecord(conversationId, messageId)

    // Delete S3 attachments
    await Promise.all(
      result.s3Keys.map(async (s3Key) => {
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: ARCHIVE_BUCKET,
            Key: s3Key,
          }))
        } catch (e) {
          log.warn('attachment_delete_failed', { s3Key, error: toError(e).message })
        }
      })
    )

    return successResponse({ message: 'Message deleted' }, 200, requestOrigin)
  } catch (err) {
    const error = toError(err)
    if (error.message === 'Message not found') {
      return errorResponse(404, 'Message not found', requestOrigin)
    }
    log.error('delete_message_error', { conversationId, messageId, userId, error: error.message })
    return errorResponse(500, 'Failed to delete message', requestOrigin)
  }
}
