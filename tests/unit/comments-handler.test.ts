/**
 * Tests for comments route handlers
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEvent } from 'aws-lambda'

const ddbMock = mockClient(DynamoDBDocumentClient)

vi.mock('../../backend/lambdas/api/src/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getRetryAfter: vi.fn().mockReturnValue(60),
}))

import { listComments, createComment, editComment, deleteComment, adminDeleteComment } from '../../backend/lambdas/api/src/routes/comments'
import { MAX_COMMENT_LENGTH } from '../../backend/lambdas/api/src/lib/constants'

function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    resource: '/comments/{itemId}',
    path: '/comments/dGVzdC1pdGVt',
    pathParameters: { itemId: 'dGVzdC1pdGVt' },
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
})

describe('comments handlers', () => {
  describe('listComments', () => {
    it('returns comments array with 200', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          { PK: 'COMMENT#test-item', SK: '2024-01-01T00:00:00.000Z#c1', entityType: 'COMMENT', content: 'Hello', commentId: 'c1', authorId: 'user-1', isDeleted: false },
        ],
      })
      const result = await listComments(createMockEvent(), createMockContext())
      expect(result.statusCode).toBe(200)
      const body = JSON.parse(result.body)
      expect(body.comments).toBeDefined()
    })

    it('returns 400 when itemId missing', async () => {
      const result = await listComments(createMockEvent({ pathParameters: {} }), createMockContext())
      expect(result.statusCode).toBe(400)
    })

    it('rejects malformed pagination keys', async () => {
      const result = await listComments(
        createMockEvent({ queryStringParameters: { lastEvaluatedKey: 'not-valid-base64!!!' } }),
        createMockContext()
      )
      expect(result.statusCode).toBe(400)
    })
  })

  describe('createComment', () => {
    it('creates comment and returns 201', async () => {
      ddbMock.on(PutCommand).resolves({})
      ddbMock.on(UpdateCommand).resolves({})
      const result = await createComment(
        createMockEvent({ httpMethod: 'POST', body: JSON.stringify({ content: 'New comment' }) }),
        createMockContext()
      )
      expect(result.statusCode).toBe(201)
      const body = JSON.parse(result.body)
      expect(body.content).toBe('New comment')
    })

    it('returns 400 for empty content', async () => {
      const result = await createComment(
        createMockEvent({ httpMethod: 'POST', body: JSON.stringify({ content: '' }) }),
        createMockContext()
      )
      expect(result.statusCode).toBe(400)
    })

    it('returns 400 when content exceeds MAX_COMMENT_LENGTH', async () => {
      const result = await createComment(
        createMockEvent({ httpMethod: 'POST', body: JSON.stringify({ content: 'x'.repeat(MAX_COMMENT_LENGTH + 1) }) }),
        createMockContext()
      )
      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toContain(String(MAX_COMMENT_LENGTH))
    })

    it('returns 400 for invalid JSON body', async () => {
      const result = await createComment(
        createMockEvent({ httpMethod: 'POST', body: '{invalid json' }),
        createMockContext()
      )
      expect(result.statusCode).toBe(400)
    })
  })

  describe('editComment', () => {
    it('returns 400 when params missing', async () => {
      const result = await editComment(
        createMockEvent({ httpMethod: 'PUT', pathParameters: {}, body: JSON.stringify({ content: 'edited' }) }),
        createMockContext()
      )
      expect(result.statusCode).toBe(400)
    })
  })

  describe('deleteComment', () => {
    it('returns 404 when comment not found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined })
      const result = await deleteComment(
        createMockEvent({ httpMethod: 'DELETE', pathParameters: { itemId: 'dGVzdC1pdGVt', commentId: 'c1' } }),
        createMockContext()
      )
      expect(result.statusCode).toBe(404)
    })
  })

  describe('adminDeleteComment', () => {
    it('returns 400 when itemId missing in body', async () => {
      const result = await adminDeleteComment(
        createMockEvent({ httpMethod: 'DELETE', pathParameters: { commentId: 'c1' }, body: JSON.stringify({}) }),
        createMockContext({ isAdmin: true })
      )
      expect(result.statusCode).toBe(400)
    })
  })
})
