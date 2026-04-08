/**
 * Tests for MessagingRepository
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  PutCommand,
  BatchGetCommand,
  BatchWriteCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb'

const ddbMock = mockClient(DynamoDBDocumentClient)

// Use explicit table name for repo construction — must match mock Responses keys
const TEST_TABLE = 'test-table'

import { MessagingRepository } from '../../backend/lambdas/api/src/repositories/messaging-repository'

const repo = new MessagingRepository(TEST_TABLE)

beforeEach(() => {
  ddbMock.reset()
})

describe('MessagingRepository', () => {
  describe('listConversationsForUser', () => {
    it('returns filtered conversation members', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            PK: 'USER#user-1',
            SK: 'CONV#conv-1',
            entityType: 'CONVERSATION_MEMBER',
            conversationId: 'conv-1',
            conversationType: 'direct',
            participantIds: new Set(['user-1', 'user-2']),
            participantNames: new Set(['Alice', 'Bob']),
            lastMessageAt: '2024-01-01T00:00:00Z',
            unreadCount: 2,
            creatorId: 'user-1',
          },
          {
            PK: 'USER#user-1',
            SK: 'CONV#conv-2',
            entityType: 'OTHER_TYPE',
            conversationId: 'conv-2',
          },
        ],
        LastEvaluatedKey: undefined,
      })

      const result = await repo.listConversationsForUser('user-1')

      expect(result.conversations).toHaveLength(1)
      expect(result.conversations[0].conversationId).toBe('conv-1')
      expect(result.conversations[0].unreadCount).toBe(2)
      expect(result.lastEvaluatedKey).toBeNull()
    })
  })

  describe('getConversationMembership', () => {
    it('returns member record when exists', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'USER#user-1',
          SK: 'CONV#conv-1',
          entityType: 'CONVERSATION_MEMBER',
          conversationId: 'conv-1',
          conversationType: 'direct',
          participantIds: new Set(['user-1', 'user-2']),
          creatorId: 'user-1',
        },
      })

      const result = await repo.getConversationMembership('user-1', 'conv-1')

      expect(result).not.toBeNull()
      expect(result!.conversationId).toBe('conv-1')
    })

    it('returns null when not a member', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined })

      const result = await repo.getConversationMembership('user-1', 'conv-999')

      expect(result).toBeNull()
    })
  })

  describe('createMessage', () => {
    it('stores message with correct keys', async () => {
      ddbMock.on(PutCommand).resolves({})

      const senderProfile = { displayName: 'Alice', photoUrl: null }
      const message = await repo.createMessage(
        'conv-1',
        'user-1',
        senderProfile,
        'Hello world',
        ['user-1', 'user-2'],
        'direct'
      )

      expect(message.conversationId).toBe('conv-1')
      expect(message.senderId).toBe('user-1')
      expect(message.senderName).toBe('Alice')
      expect(message.messageText).toBe('Hello world')
      expect(message.entityType).toBe('MESSAGE')

      // Verify PutCommand was called
      const calls = ddbMock.commandCalls(PutCommand)
      expect(calls).toHaveLength(1)
      const item = calls[0].args[0].input.Item!
      expect(item.PK).toMatch(/^CONV#conv-1$/)
      expect(item.SK).toMatch(/^MSG#/)
    })
  })

  describe('markConversationRead', () => {
    it('sets unreadCount to 0', async () => {
      ddbMock.on(UpdateCommand).resolves({})

      await repo.markConversationRead('user-1', 'conv-1')

      const calls = ddbMock.commandCalls(UpdateCommand)
      expect(calls).toHaveLength(1)
      const input = calls[0].args[0].input
      expect(input.ExpressionAttributeValues).toEqual({ ':zero': 0 })
      expect(input.UpdateExpression).toBe('SET unreadCount = :zero')
    })
  })

  describe('deleteConversationData', () => {
    it('returns S3 keys for cleanup', async () => {
      // First call: query messages
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            PK: 'CONV#conv-1',
            SK: 'MSG#2024-01-01T00:00:00Z#msg-1',
            entityType: 'MESSAGE',
            attachments: [{ s3Key: 'messages/att1.jpg' }],
          },
          {
            PK: 'CONV#conv-1',
            SK: 'MSG#2024-01-01T00:00:00Z#msg-2',
            entityType: 'MESSAGE',
            attachments: [],
          },
        ],
        LastEvaluatedKey: undefined,
      })
      ddbMock.on(BatchWriteCommand).resolves({ UnprocessedItems: {} })

      const result = await repo.deleteConversationData('conv-1', ['user-1', 'user-2'])

      expect(result.s3Keys).toEqual(['messages/att1.jpg'])

      // Verify batch write was called
      const batchCalls = ddbMock.commandCalls(BatchWriteCommand)
      expect(batchCalls.length).toBeGreaterThan(0)
    })
  })

  describe('deleteConversationData chunked pagination', () => {
    it('flushes each query page as its own batch write', async () => {
      // Two pages of 2 messages each, then end.
      const page1 = [
        { PK: 'CONV#c', SK: 'MSG#1', entityType: 'MESSAGE', attachments: [{ s3Key: 'a' }] },
        { PK: 'CONV#c', SK: 'MSG#2', entityType: 'MESSAGE', attachments: [] },
      ]
      const page2 = [
        { PK: 'CONV#c', SK: 'MSG#3', entityType: 'MESSAGE', attachments: [{ s3Key: 'b' }] },
        { PK: 'CONV#c', SK: 'MSG#4', entityType: 'MESSAGE', attachments: [] },
      ]
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({ Items: page1, LastEvaluatedKey: { PK: 'CONV#c', SK: 'MSG#2' } })
        .resolvesOnce({ Items: page2, LastEvaluatedKey: undefined })

      ddbMock.on(BatchWriteCommand).resolves({ UnprocessedItems: {} })

      const result = await repo.deleteConversationData('c', ['user-1'])

      expect(result.s3Keys).toEqual(['a', 'b'])
      // 1 batch for membership/meta + 1 per message page = 3 batch writes total.
      const writes = ddbMock.commandCalls(BatchWriteCommand)
      expect(writes.length).toBe(3)
    })
  })

  describe('updateConversationMembers fanout', () => {
    it('caps in-flight UpdateCommand calls at the fanout limit', async () => {
      let inFlight = 0
      let maxInFlight = 0
      ddbMock.on(UpdateCommand).callsFake(async () => {
        inFlight++
        if (inFlight > maxInFlight) maxInFlight = inFlight
        await new Promise(r => setTimeout(r, 5))
        inFlight--
        return {}
      })

      const participants = Array.from({ length: 30 }, (_, i) => `user-${i}`)
      await repo.updateConversationMembers('c', 'user-0', participants)

      expect(maxInFlight).toBeLessThanOrEqual(10)
      expect(ddbMock.commandCalls(UpdateCommand).length).toBe(30)
    })
  })

  describe('fetchUserNames', () => {
    it('returns names from batch get', async () => {
      ddbMock.on(BatchGetCommand).resolves({
        Responses: {
          [TEST_TABLE]: [
            { PK: 'USER#user-1', displayName: 'Alice' },
            { PK: 'USER#user-2', displayName: 'Bob' },
          ],
        },
      })

      const names = await repo.fetchUserNames(['user-1', 'user-2'])

      expect(names).toEqual(['Alice', 'Bob'])
    })

    it('returns empty array for empty input', async () => {
      const names = await repo.fetchUserNames([])
      expect(names).toEqual([])
    })

    it('returns Anonymous for missing users', async () => {
      ddbMock.on(BatchGetCommand).resolves({
        Responses: {
          [TEST_TABLE]: [
            { PK: 'USER#user-1', displayName: 'Alice' },
          ],
        },
      })

      const names = await repo.fetchUserNames(['user-1', 'user-unknown'])

      expect(names).toEqual(['Alice', 'Anonymous'])
    })
  })

  describe('getMessages', () => {
    it('returns paginated messages filtered by entity type', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          { entityType: 'MESSAGE', messageId: 'msg-1', senderId: 'user-1' },
          { entityType: 'OTHER', messageId: 'other' },
        ],
        LastEvaluatedKey: { PK: 'CONV#conv-1', SK: 'MSG#last' },
      })

      const result = await repo.getMessages('conv-1', 50)

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].messageId).toBe('msg-1')
      expect(result.lastEvaluatedKey).not.toBeNull()
    })
  })

  describe('getSenderProfile', () => {
    it('returns profile data', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'USER#user-1',
          SK: 'PROFILE',
          displayName: 'Alice',
          profilePhotoUrl: 'photos/alice.jpg',
        },
      })

      const profile = await repo.getSenderProfile('user-1')

      expect(profile.displayName).toBe('Alice')
      expect(profile.photoUrl).toBe('photos/alice.jpg')
    })

    it('returns defaults when profile not found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined })

      const profile = await repo.getSenderProfile('user-unknown')

      expect(profile.displayName).toBe('Anonymous')
      expect(profile.photoUrl).toBeNull()
    })
  })
})
