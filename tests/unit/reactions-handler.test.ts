/**
 * Tests for reactions route handler
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEvent } from 'aws-lambda'

const ddbMock = mockClient(DynamoDBDocumentClient)

// Mock rate-limit module to prevent import side effects
vi.mock('../../backend/lambdas/api/src/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getRetryAfter: vi.fn().mockReturnValue(60),
}))

import { handle } from '../../backend/lambdas/api/src/routes/reactions'

function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    resource: '/reactions/{commentId}',
    path: '/reactions/comment-1',
    pathParameters: { commentId: 'comment-1' },
    queryStringParameters: null,
    headers: { Origin: 'https://example.com' },
    body: JSON.stringify({ itemId: 'item-1', reactionType: 'like' }),
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
})

describe('reactions handler', () => {
  describe('POST /reactions/{commentId} - toggle reaction', () => {
    it('successfully adds a reaction', async () => {
      // First GetCommand: find the comment (try plain itemId)
      ddbMock.on(GetCommand)
        .resolvesOnce({
          Item: {
            PK: 'COMMENT#item-1',
            SK: 'comment-1',
            entityType: 'COMMENT',
            itemId: 'item-1',
            commentId: 'comment-1',
          },
        })
        // Second GetCommand: check if reaction already exists (no)
        .resolvesOnce({ Item: undefined })

      // TransactWriteCommand: create reaction + increment count
      ddbMock.on(TransactWriteCommand).resolves({})

      const event = createMockEvent()
      const result = await handle(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.liked).toBe(true)
      expect(body.message).toBe('Reaction added')
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()
    })

    it('successfully removes an existing reaction (toggle off)', async () => {
      // First GetCommand: find the comment
      ddbMock.on(GetCommand)
        .resolvesOnce({
          Item: {
            PK: 'COMMENT#item-1',
            SK: 'comment-1',
            entityType: 'COMMENT',
            itemId: 'item-1',
            commentId: 'comment-1',
          },
        })
        // Second GetCommand: reaction already exists
        .resolvesOnce({
          Item: {
            PK: 'COMMENT#item-1',
            SK: 'REACTION#comment-1#user-123',
            entityType: 'REACTION',
            userId: 'user-123',
          },
        })

      // TransactWriteCommand: delete reaction + decrement count
      ddbMock.on(TransactWriteCommand).resolves({})

      const event = createMockEvent()
      const result = await handle(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.liked).toBe(false)
      expect(body.message).toBe('Reaction removed')
    })

    it('returns 401 for unauthenticated requests', async () => {
      const event = createMockEvent()
      const result = await handle(event, createMockContext({ requesterId: '' }))

      expect(result.statusCode).toBe(401)
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()
    })

    it('returns 400 for missing commentId', async () => {
      const event = createMockEvent({
        pathParameters: {},
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toContain('commentId')
    })

    it('returns 400 for missing itemId in request body', async () => {
      const event = createMockEvent({
        body: JSON.stringify({ reactionType: 'like' }),
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toContain('itemId')
    })

    it('returns 400 for invalid JSON body', async () => {
      const event = createMockEvent({
        body: '{invalid json',
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toContain('Invalid JSON')
    })

    it('returns 404 when comment not found', async () => {
      // Both itemId variants return no comment
      ddbMock.on(GetCommand).resolves({ Item: undefined })

      const event = createMockEvent()
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(404)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Comment not found')
    })

    it('returns 500 when DynamoDB operation fails', async () => {
      ddbMock.on(GetCommand).rejects(new Error('DynamoDB timeout'))

      const event = createMockEvent()
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(500)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Failed to toggle reaction')
    })

    it('handles TransactionCanceledException when adding reaction (comment deleted)', async () => {
      // Find the comment
      ddbMock.on(GetCommand)
        .resolvesOnce({
          Item: {
            PK: 'COMMENT#item-1',
            SK: 'comment-1',
            entityType: 'COMMENT',
            itemId: 'item-1',
          },
        })
        // Reaction doesn't exist
        .resolvesOnce({ Item: undefined })

      // TransactWriteCommand fails with TransactionCanceledException
      const transactionError = new Error('Transaction cancelled')
      transactionError.name = 'TransactionCanceledException'
      ddbMock.on(TransactWriteCommand).rejects(transactionError)

      const event = createMockEvent()
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(404)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Comment not found')
    })

    it('handles TransactionCanceledException when removing reaction (falls back to delete)', async () => {
      // Find the comment
      ddbMock.on(GetCommand)
        .resolvesOnce({
          Item: {
            PK: 'COMMENT#item-1',
            SK: 'comment-1',
            entityType: 'COMMENT',
            itemId: 'item-1',
          },
        })
        // Reaction exists
        .resolvesOnce({
          Item: {
            PK: 'COMMENT#item-1',
            SK: 'REACTION#comment-1#user-123',
            entityType: 'REACTION',
          },
        })

      // TransactWriteCommand fails with TransactionCanceledException
      const transactionError = new Error('Transaction cancelled')
      transactionError.name = 'TransactionCanceledException'
      ddbMock.on(TransactWriteCommand).rejects(transactionError)

      // Falls back to simple DeleteCommand
      ddbMock.on(DeleteCommand).resolves({})

      const event = createMockEvent()
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(200)
      const body = JSON.parse(result.body)
      expect(body.liked).toBe(false)
    })
  })

  describe('GET /reactions/{commentId}', () => {
    it('returns reactions for an item', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          { entityType: 'REACTION', userId: 'user-1', reactionType: 'like', createdAt: '2024-01-01T00:00:00Z' },
          { entityType: 'REACTION', userId: 'user-2', reactionType: 'like', createdAt: '2024-01-02T00:00:00Z' },
        ],
      })

      const event = createMockEvent({
        httpMethod: 'GET',
        queryStringParameters: { itemId: 'item-1' },
      })
      const result = await handle(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.reactions).toHaveLength(2)
      expect(body.count).toBe(2)
      expect(body.commentId).toBe('comment-1')
      expect(body.itemId).toBe('item-1')
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()
    })

    it('returns empty array when no reactions exist', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] })

      const event = createMockEvent({
        httpMethod: 'GET',
        queryStringParameters: { itemId: 'item-1' },
      })
      const result = await handle(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.reactions).toEqual([])
      expect(body.count).toBe(0)
    })

    it('returns 400 for missing commentId', async () => {
      const event = createMockEvent({
        httpMethod: 'GET',
        pathParameters: {},
        queryStringParameters: { itemId: 'item-1' },
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
    })

    it('returns 400 for missing itemId query parameter', async () => {
      const event = createMockEvent({
        httpMethod: 'GET',
        queryStringParameters: null,
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toContain('itemId')
    })

    it('returns 500 when DynamoDB query fails', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('DynamoDB error'))

      const event = createMockEvent({
        httpMethod: 'GET',
        queryStringParameters: { itemId: 'item-1' },
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(500)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Failed to get reactions')
    })
  })

  describe('route not found', () => {
    it('returns 404 for unknown route', async () => {
      const event = createMockEvent({
        httpMethod: 'PUT',
        resource: '/reactions/{commentId}',
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(404)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Route not found')
    })
  })
})
