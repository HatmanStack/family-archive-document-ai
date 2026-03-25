/**
 * Tests for messages route handler
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, BatchGetCommand, BatchWriteCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import type { APIGatewayProxyEvent } from 'aws-lambda'

const ddbMock = mockClient(DynamoDBDocumentClient)

// Mock s3-utils to provide a mockable S3 client and signPhotoUrl
const { mockS3Send } = vi.hoisted(() => {
  const mockS3Send = vi.fn().mockResolvedValue({})
  return { mockS3Send }
})
vi.mock('../../backend/lambdas/api/src/lib/s3-utils', () => ({
  s3Client: { send: mockS3Send },
  signPhotoUrl: vi.fn().mockResolvedValue(null),
  ragstackS3Client: { send: vi.fn() },
  RAGSTACK_BUCKET: '',
}))

// Mock S3 presigning to avoid real calls
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com'),
}))

import { listConversations, getMessages, createConversation, sendMessage, generateUploadUrl, markAsRead, deleteConversation, deleteMessage } from '../../backend/lambdas/api/src/routes/messages'

function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    resource: '/messages/conversations',
    path: '/messages/conversations',
    pathParameters: null,
    queryStringParameters: null,
    headers: { Origin: 'https://example.com' },
    body: null,
    isBase64Encoded: false,
    requestContext: {} as never,
    stageVariables: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    ...overrides,
  }
}

function createMockContext(overrides = {}) {
  return {
    requesterId: 'user-123',
    requesterEmail: 'test@example.com',
    isAdmin: false,
    isApprovedUser: true,
    correlationId: 'test-correlation',
    requestOrigin: 'https://example.com',
    ...overrides,
  }
}

beforeEach(() => {
  ddbMock.reset()
  mockS3Send.mockReset()
  mockS3Send.mockResolvedValue({})
})

describe('messages handler', () => {
  describe('GET /messages/conversations', () => {
    it('returns conversation list with 200', async () => {
      const mockConversations = [
        {
          PK: 'USER#user-123',
          SK: 'CONV#conv-1',
          entityType: 'CONVERSATION_MEMBER',
          conversationId: 'conv-1',
          conversationType: 'direct',
          participantIds: new Set(['user-123', 'user-456']),
          participantNames: new Set(['Alice', 'Bob']),
          lastMessageAt: '2024-01-01T00:00:00.000Z',
          unreadCount: 0,
          conversationTitle: null,
          creatorId: 'user-123',
        },
      ]

      ddbMock.on(QueryCommand).resolves({ Items: mockConversations })

      const event = createMockEvent()
      const result = await listConversations(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.conversations).toBeDefined()
      expect(body.conversations).toHaveLength(1)
      expect(body.conversations[0].conversationId).toBe('conv-1')
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()
    })

    it('returns empty conversations array', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] })

      const event = createMockEvent()
      const result = await listConversations(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.conversations).toEqual([])
    })
  })

  describe('POST /messages/conversations', () => {
    it('creates conversation with 201', async () => {
      // Mock BatchGetCommand for fetching participant names
      ddbMock.on(BatchGetCommand).resolves({
        Responses: {
          [process.env.TABLE_NAME || 'FamilyArchiveTable']: [
            { PK: 'USER#user-123', displayName: 'Alice' },
            { PK: 'USER#user-456', displayName: 'Bob' },
          ],
        },
      })

      // Mock BatchWriteCommand for batchWriteWithRetry
      ddbMock.on(BatchWriteCommand).resolves({ UnprocessedItems: {} })

      // Mock GetCommand for sender profile in createMessageInternal
      ddbMock.on(GetCommand).resolves({
        Item: { displayName: 'Alice', profilePhotoUrl: null },
      })

      // Mock PutCommand for storing message records
      ddbMock.on(PutCommand).resolves({})

      // Mock UpdateCommand for updating conversation members
      ddbMock.on(UpdateCommand).resolves({})

      const event = createMockEvent({
        httpMethod: 'POST',
        resource: '/messages/conversations',
        body: JSON.stringify({
          participantIds: ['user-456'],
          messageText: 'Hello!',
        }),
      })

      const result = await createConversation(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(201)
      expect(body.conversationId).toBeDefined()
      expect(body.participantIds).toContain('user-123')
      expect(body.participantIds).toContain('user-456')
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()
    })

    it('returns 400 for empty participantIds', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        resource: '/messages/conversations',
        body: JSON.stringify({ participantIds: [] }),
      })

      const result = await createConversation(event, createMockContext())
      expect(result.statusCode).toBe(400)
    })
  })

  describe('malformed JSON body', () => {
    it('returns 400 for invalid JSON in POST conversations', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        resource: '/messages/conversations',
        body: '{invalid json',
      })

      const result = await createConversation(event, createMockContext())
      expect(result.statusCode).toBe(400)
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()
    })

    it('returns 400 for invalid JSON in POST message', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        resource: '/messages/{conversationId}',
        pathParameters: { conversationId: 'conv-1' },
        body: '{invalid json',
      })

      const result = await sendMessage(event, createMockContext())
      expect(result.statusCode).toBe(400)
    })
  })

  describe('pagination limit capping', () => {
    it('caps limit at MAX_PAGE_SIZE when user supplies a very large limit', async () => {
      // Mock the member check to pass
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'USER#user-123',
          SK: 'CONV#conv-1',
          entityType: 'CONVERSATION_MEMBER',
          conversationId: 'conv-1',
          participantIds: new Set(['user-123']),
          creatorId: 'user-123',
        },
      })

      ddbMock.on(QueryCommand).resolves({ Items: [] })

      const event = createMockEvent({
        httpMethod: 'GET',
        resource: '/messages/{conversationId}',
        pathParameters: { conversationId: 'conv-1' },
        queryStringParameters: { limit: '999' },
      })

      await getMessages(event, createMockContext())

      const queryCalls = ddbMock.commandCalls(QueryCommand)
      expect(queryCalls.length).toBeGreaterThanOrEqual(1)
      const queryInput = queryCalls[0].args[0].input
      expect(queryInput.Limit).toBe(100)
    })
  })

  describe('invalid pagination cursor', () => {
    it('returns 400 for malformed pagination key', async () => {
      // Mock the member check to pass
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'USER#user-123',
          SK: 'CONV#conv-1',
          entityType: 'CONVERSATION_MEMBER',
          conversationId: 'conv-1',
          participantIds: new Set(['user-123']),
          creatorId: 'user-123',
        },
      })

      const event = createMockEvent({
        httpMethod: 'GET',
        resource: '/messages/{conversationId}',
        pathParameters: { conversationId: 'conv-1' },
        queryStringParameters: { lastEvaluatedKey: 'not-valid-base64!@#$' },
      })

      const result = await getMessages(event, createMockContext())
      expect(result.statusCode).toBe(400)
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()
    })
  })

  describe('DELETE /messages/{conversationId}', () => {
    it('deletes conversation and batches S3 attachment deletes', async () => {
      // Create 30 attachments to force batching (batch size is 25)
      const messagesWithAttachments = Array.from({ length: 30 }, (_, i) => ({
        PK: `CONV#conv-1`,
        SK: `MSG#msg-${i}`,
        entityType: 'MESSAGE',
        messageId: `msg-${i}`,
        conversationId: 'conv-1',
        senderId: 'user-123',
        attachments: [{ s3Key: `messages/attachments/file-${i}.jpg` }],
      }))

      // Mock GetCommand for conversation meta lookup
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'CONV#conv-1',
          SK: 'META',
          entityType: 'CONVERSATION_META',
          creatorId: 'user-123',
          participantIds: new Set(['user-123', 'user-456']),
        },
      })

      // Mock QueryCommand to return messages with attachments (single page, no continuation)
      ddbMock.on(QueryCommand).resolves({
        Items: messagesWithAttachments,
      })

      // Mock BatchWriteCommand for DynamoDB deletes
      ddbMock.on(BatchWriteCommand).resolves({ UnprocessedItems: {} })

      const event = createMockEvent({
        httpMethod: 'DELETE',
        resource: '/messages/{conversationId}',
        pathParameters: { conversationId: 'conv-1' },
      })

      const result = await deleteConversation(event, createMockContext())

      expect(result.statusCode).toBe(200)
      const body = JSON.parse(result.body)
      expect(body.message).toBe('Conversation deleted')

      // Verify all S3 deletes were called (one per attachment)
      expect(mockS3Send.mock.calls.length).toBe(30)
    })
  })
})
