/**
 * MessagingRepository - encapsulates all DynamoDB operations for messaging
 *
 * Extracted from the messages route handler per ADR-3.
 */
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  BatchGetCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb'
import { BaseRepository } from './base-repository'
import { docClient, TABLE_NAME, batchWriteWithRetry } from '../lib/database'
import { keys, PREFIX } from '../lib/keys'
import { validatePaginationKey } from '../lib/validation'
import { ValidationError, NotFoundError } from '../lib/errors'
import { mapWithConcurrency } from '../lib/concurrency'
import { v4 as uuidv4 } from 'uuid'

interface Attachment {
  s3Key?: string
  fileName?: string
  contentType?: string
  url?: string
}

interface ConversationMember {
  conversationId: string
  conversationType: string
  participantIds: Set<string>
  participantNames: Set<string>
  lastMessageAt: string
  unreadCount: number
  conversationTitle?: string
  creatorId: string
  entityType: string
  PK: string
  SK: string
}

interface ConversationMeta {
  creatorId: string
  participantIds: Set<string>
  conversationType: string
  conversationTitle?: string
  entityType: string
  PK: string
  SK: string
}

export interface MessageRecord {
  messageId: string
  conversationId: string
  senderId: string
  senderName: string
  senderPhotoUrl: string | null
  messageText: string
  attachments: Attachment[]
  createdAt: string
  conversationType: string
  entityType: string
  PK: string
  SK: string
}

export type { Attachment }

interface SenderProfile {
  displayName: string
  photoUrl: string | null
}

export class MessagingRepository extends BaseRepository {
  /**
   * List conversations for a user, sorted by most recent.
   */
  async listConversationsForUser(
    userId: string,
    lastEvaluatedKey?: string,
    limit = 50
  ): Promise<{
    conversations: ConversationMember[]
    lastEvaluatedKey: string | null
  }> {
    const clamped = Math.min(Math.max(1, Math.floor(limit)), 100)
    const queryParams: QueryCommandInput = {
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `${PREFIX.USER}${userId}`,
        ':skPrefix': PREFIX.CONV,
      },
      ScanIndexForward: false,
      Limit: clamped,
    }

    if (lastEvaluatedKey) {
      const paginationResult = validatePaginationKey(lastEvaluatedKey, `${PREFIX.USER}${userId}`)
      if (!paginationResult.valid) {
        throw new ValidationError(paginationResult.error || 'Invalid pagination key')
      }
      if (paginationResult.key) {
        queryParams.ExclusiveStartKey = paginationResult.key
      }
    }

    const result = await this.docClient.send(new QueryCommand(queryParams))

    const conversations = (result.Items || [])
      .filter(item => item.entityType === 'CONVERSATION_MEMBER')
      .map(item => ({
        conversationId: item.conversationId as string,
        conversationType: item.conversationType as string,
        participantIds: item.participantIds as Set<string>,
        participantNames: item.participantNames as Set<string>,
        lastMessageAt: item.lastMessageAt as string,
        unreadCount: (item.unreadCount as number) || 0,
        conversationTitle: item.conversationTitle as string | undefined,
        creatorId: item.creatorId as string,
        entityType: item.entityType as string,
        PK: item.PK as string,
        SK: item.SK as string,
      })) as ConversationMember[]

    return {
      conversations,
      lastEvaluatedKey: result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : null,
    }
  }

  /**
   * Get a user's membership record for a conversation.
   */
  async getConversationMembership(
    userId: string,
    conversationId: string
  ): Promise<ConversationMember | null> {
    return this.getItem<ConversationMember>(keys.userConversation(userId, conversationId))
  }

  /**
   * Get messages for a conversation with pagination.
   */
  async getMessages(
    conversationId: string,
    limit: number,
    lastEvaluatedKey?: string
  ): Promise<{
    messages: MessageRecord[]
    lastEvaluatedKey: string | null
  }> {
    const queryParams: QueryCommandInput = {
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `${PREFIX.CONV}${conversationId}`,
        ':skPrefix': PREFIX.MSG,
      },
      Limit: limit,
      ScanIndexForward: false,
    }

    if (lastEvaluatedKey) {
      const paginationResult = validatePaginationKey(lastEvaluatedKey, `${PREFIX.CONV}${conversationId}`)
      if (!paginationResult.valid) {
        throw new ValidationError(paginationResult.error || 'Invalid pagination key')
      }
      if (paginationResult.key) {
        queryParams.ExclusiveStartKey = paginationResult.key
      }
    }

    const result = await this.docClient.send(new QueryCommand(queryParams))

    const messages = (result.Items || [])
      .filter(item => item.entityType === 'MESSAGE')
      .map(item => ({
        PK: item.PK as string,
        SK: item.SK as string,
        entityType: item.entityType as string,
        messageId: item.messageId as string,
        conversationId: item.conversationId as string,
        senderId: item.senderId as string,
        senderName: item.senderName as string,
        senderPhotoUrl: (item.senderPhotoUrl as string | null) ?? null,
        messageText: (item.messageText as string) ?? '',
        attachments: (item.attachments as Attachment[]) || [],
        createdAt: item.createdAt as string,
        conversationType: item.conversationType as string,
      })) as MessageRecord[]

    return {
      messages,
      lastEvaluatedKey: result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : null,
    }
  }

  /**
   * Create a conversation with member records and metadata.
   */
  async createConversationWithMembers(
    conversationId: string,
    conversationType: string,
    participantIds: string[],
    participantNames: string[],
    creatorId: string,
    conversationTitle?: string
  ): Promise<void> {
    const now = new Date().toISOString()

    const memberRecords: Array<{ PutRequest: { Item: Record<string, unknown> } }> = participantIds.map(pid => ({
      PutRequest: {
        Item: {
          ...keys.userConversation(pid, conversationId),
          entityType: 'CONVERSATION_MEMBER',
          conversationId,
          conversationType,
          creatorId,
          participantIds: new Set(participantIds),
          participantNames: new Set(participantNames),
          lastMessageAt: now,
          unreadCount: pid === creatorId ? 0 : 1,
          conversationTitle: conversationTitle || null,
        },
      },
    }))

    memberRecords.push({
      PutRequest: {
        Item: {
          ...keys.conversationMeta(conversationId),
          entityType: 'CONVERSATION_META',
          creatorId,
          createdAt: now,
          conversationType,
          participantIds: new Set(participantIds),
          conversationTitle: conversationTitle || null,
        },
      },
    })

    await batchWriteWithRetry(memberRecords, this.tableName)
  }

  /**
   * Create a message in a conversation.
   * Accepts sender profile to avoid re-fetching.
   */
  async createMessage(
    conversationId: string,
    senderId: string,
    senderProfile: SenderProfile,
    messageText: string,
    participantIds: string[],
    conversationType: string,
    attachments: Attachment[] = []
  ): Promise<MessageRecord> {
    const timestamp = new Date().toISOString()
    const messageId = `${timestamp}#${uuidv4()}`

    const messageKeys = keys.message(conversationId, messageId)
    const messageRecord: MessageRecord = {
      ...messageKeys,
      entityType: 'MESSAGE',
      messageId,
      conversationId,
      senderId,
      senderName: senderProfile.displayName,
      senderPhotoUrl: senderProfile.photoUrl,
      messageText,
      attachments,
      createdAt: timestamp,
      conversationType,
    }

    await this.docClient.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        ...messageRecord,
        participants: new Set(participantIds),
      },
    }))

    return messageRecord
  }

  /**
   * Mark a conversation as read for a user.
   */
  async markConversationRead(userId: string, conversationId: string): Promise<void> {
    await this.docClient.send(new UpdateCommand({
      TableName: this.tableName,
      Key: keys.userConversation(userId, conversationId),
      UpdateExpression: 'SET unreadCount = :zero',
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeValues: { ':zero': 0 },
    }))
  }

  /**
   * Delete all data for a conversation. Returns S3 keys for attachment cleanup.
   */
  async deleteConversationData(
    conversationId: string,
    participantIds: string[]
  ): Promise<{ s3Keys: string[] }> {
    const s3Keys: string[] = []
    const metaKey = keys.conversationMeta(conversationId)

    // Delete participant membership + meta first as a single bounded batch.
    // These records are O(participants), not O(messages), so memory is fine.
    const membershipOps: Array<{ DeleteRequest: { Key: Record<string, unknown> } }> = []
    participantIds.forEach(pid => {
      const userConvKey = keys.userConversation(pid, conversationId)
      membershipOps.push({
        DeleteRequest: { Key: { PK: userConvKey.PK, SK: userConvKey.SK } },
      })
    })
    membershipOps.push({
      DeleteRequest: { Key: { PK: metaKey.PK, SK: metaKey.SK } },
    })
    await batchWriteWithRetry(membershipOps, this.tableName)

    // Page through messages and flush each page as its own BatchWrite, so we
    // never hold more than one page (max 25 records) of message keys in memory.
    let lastKey: Record<string, unknown> | undefined
    do {
      const msgs = await this.docClient.send(new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `${PREFIX.CONV}${conversationId}`,
          ':skPrefix': PREFIX.MSG,
        },
        ExclusiveStartKey: lastKey,
        Limit: 25,
      }))

      const pageOps: Array<{ DeleteRequest: { Key: Record<string, unknown> } }> = []
      if (msgs.Items) {
        msgs.Items.forEach(msg => {
          pageOps.push({
            DeleteRequest: { Key: { PK: msg.PK as string, SK: msg.SK as string } },
          })

          const attachments = msg.attachments as Attachment[] | undefined
          if (attachments && attachments.length > 0) {
            attachments.forEach(att => {
              if (att.s3Key) s3Keys.push(att.s3Key)
            })
          }
        })
      }

      if (pageOps.length > 0) {
        await batchWriteWithRetry(pageOps, this.tableName)
      }

      lastKey = msgs.LastEvaluatedKey
    } while (lastKey)

    return { s3Keys }
  }

  /**
   * Get a single message by conversation and message ID.
   */
  async getMessage(
    conversationId: string,
    messageId: string
  ): Promise<Record<string, unknown> | null> {
    const result = await this.docClient.send(new GetCommand({
      TableName: this.tableName,
      Key: keys.message(conversationId, messageId),
    }))

    return result.Item ?? null
  }

  /**
   * Delete a single message. Returns S3 keys for attachment cleanup.
   * Caller must verify ownership before calling this method.
   */
  async deleteMessageRecord(
    conversationId: string,
    messageId: string
  ): Promise<{ s3Keys: string[] }> {
    const messageKey = keys.message(conversationId, messageId)
    const messageResult = await this.docClient.send(new GetCommand({
      TableName: this.tableName,
      Key: messageKey,
    }))

    if (!messageResult.Item) {
      throw new NotFoundError('Message not found')
    }

    const message = messageResult.Item
    const s3Keys: string[] = []

    const attachments = message.attachments as Attachment[] | undefined
    if (attachments && attachments.length > 0) {
      attachments.forEach(att => {
        if (att.s3Key) {
          s3Keys.push(att.s3Key)
        }
      })
    }

    await this.docClient.send(new DeleteCommand({
      TableName: this.tableName,
      Key: messageKey,
    }))

    return { s3Keys }
  }

  /**
   * Update conversation member records after a message is sent.
   */
  async updateConversationMembers(
    conversationId: string,
    senderId: string,
    participantIds: string[]
  ): Promise<void> {
    const now = new Date().toISOString()

    // Cap fanout at 10 in-flight UpdateCommand calls so a 1000-member group
    // chat does not blow the DDB write throughput on a single message send.
    const FANOUT_LIMIT = 10
    await mapWithConcurrency(participantIds, FANOUT_LIMIT, async participantId => {
      const updateExpression = participantId === senderId
        ? 'SET lastMessageAt = :now'
        : 'SET lastMessageAt = :now ADD unreadCount :one'

      const expressionValues = participantId === senderId
        ? { ':now': now }
        : { ':now': now, ':one': 1 }

      await this.docClient.send(new UpdateCommand({
        TableName: this.tableName,
        Key: keys.userConversation(participantId, conversationId),
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionValues,
      }))
    })
  }

  /**
   * Fetch display names for a list of user IDs.
   */
  async fetchUserNames(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return []

    const result = await this.docClient.send(new BatchGetCommand({
      RequestItems: {
        [this.tableName]: {
          Keys: userIds.map(userId => keys.userProfile(userId)),
        },
      },
    }))

    const userMap: Record<string, string> = {}
    ;(result.Responses?.[this.tableName] || []).forEach(item => {
      const userId = (item.PK as string).replace(PREFIX.USER, '')
      userMap[userId] = (item.displayName as string) || 'Anonymous'
    })

    return userIds.map(userId => userMap[userId] || 'Anonymous')
  }

  /**
   * Get the sender's display name and photo URL.
   */
  async getSenderProfile(senderId: string): Promise<SenderProfile> {
    const result = await this.docClient.send(new GetCommand({
      TableName: this.tableName,
      Key: keys.userProfile(senderId),
    }))

    return {
      displayName: (result.Item?.displayName as string) || 'Anonymous',
      photoUrl: (result.Item?.profilePhotoUrl as string) || null,
    }
  }

  /**
   * Get conversation metadata.
   */
  async getConversationMeta(conversationId: string): Promise<ConversationMeta | null> {
    return this.getItem<ConversationMeta>(keys.conversationMeta(conversationId))
  }
}

export const messagingRepository = new MessagingRepository()
