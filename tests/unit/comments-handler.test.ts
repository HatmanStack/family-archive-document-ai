/**
 * Tests for comments route handler
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEvent } from 'aws-lambda'

const ddbMock = mockClient(DynamoDBDocumentClient)

// Mock rate-limit module to control rate limiting in tests
vi.mock('../../backend/lambdas/api/src/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getRetryAfter: vi.fn().mockReturnValue(60),
}))

import { handle } from '../../backend/lambdas/api/src/routes/comments'
import { checkRateLimit } from '../../backend/lambdas/api/src/lib/rate-limit'

function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    resource: '/comments/{itemId}',
    path: '/comments/dGVzdC1pdGVt',
    pathParameters: { itemId: 'dGVzdC1pdGVt' }, // base64url encoded 'test-item'
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
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, resetAt: 0 })
})

describe('comments handler', () => {
  describe('GET /comments/{itemId}', () => {
    it('returns comments array with 200', async () => {
      const mockComments = [
        { PK: 'COMMENT#test-item', SK: '2024-01-01T00:00:00.000Z#c1', entityType: 'COMMENT', content: 'Hello', commentId: 'c1', authorId: 'user-1', isDeleted: false },
      ]

      ddbMock.on(QueryCommand).resolves({ Items: mockComments })

      const event = createMockEvent()
      const result = await handle(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.comments).toBeDefined()
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()
    })

    it('returns 401 when requesterId is missing', async () => {
      const event = createMockEvent()
      const result = await handle(event, createMockContext({ requesterId: '' }))

      expect(result.statusCode).toBe(401)
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()
    })

    it('returns 400 when itemId is missing', async () => {
      const event = createMockEvent({
        pathParameters: {},
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
    })
  })

  describe('POST /comments/{itemId}', () => {
    it('creates comment and returns 201', async () => {
      const mockComment = {
        commentId: 'c-new',
        itemId: 'test-item',
        content: 'New comment',
        authorId: 'user-123',
        createdAt: '2024-01-01T00:00:00.000Z',
      }

      // Mock the PutCommand for creating the comment
      ddbMock.on(PutCommand).resolves({})
      // Mock the UpdateCommand for incrementing comment count
      ddbMock.on(UpdateCommand).resolves({})

      const event = createMockEvent({
        httpMethod: 'POST',
        resource: '/comments/{itemId}',
        body: JSON.stringify({ content: 'New comment' }),
      })
      const result = await handle(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(201)
      expect(body.content).toBe('New comment')
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()
    })

    it('returns 429 when rate limited', async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, resetAt: Date.now() + 60000 })

      const event = createMockEvent({
        httpMethod: 'POST',
        resource: '/comments/{itemId}',
        body: JSON.stringify({ content: 'New comment' }),
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(429)
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()
    })

    it('returns 400 for invalid content length', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        resource: '/comments/{itemId}',
        body: JSON.stringify({ content: '' }),
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
    })

    it('returns 400 for invalid JSON body', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        resource: '/comments/{itemId}',
        body: '{invalid json',
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
    })
  })
})
