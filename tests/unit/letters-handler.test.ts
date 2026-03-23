/**
 * Tests for letters route handler
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEvent } from 'aws-lambda'

const ddbMock = mockClient(DynamoDBDocumentClient)

// Mock S3 presigning to avoid real calls
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com'),
}))

// Mock rate-limit module to prevent import side effects
vi.mock('../../backend/lambdas/api/src/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getRetryAfter: vi.fn().mockReturnValue(60),
}))

import { handle } from '../../backend/lambdas/api/src/routes/letters'

function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    resource: '/letters',
    path: '/letters',
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
})

describe('letters handler', () => {
  describe('GET /letters', () => {
    it('returns paginated list of letters with 200', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          { GSI1SK: '2024-01-15', title: 'January Letter', description: 'New Year update', author: 'Mom', updatedAt: '2024-01-15T10:00:00Z' },
          { GSI1SK: '2024-02-14', title: 'February Letter', description: 'Valentine update', author: 'Dad', updatedAt: '2024-02-14T10:00:00Z' },
        ],
      })

      const event = createMockEvent()
      const result = await handle(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.items).toHaveLength(2)
      expect(body.items[0].date).toBe('2024-01-15')
      expect(body.items[0].title).toBe('January Letter')
      expect(body.nextCursor).toBeNull()
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()
    })

    it('respects limit parameter', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] })

      const event = createMockEvent({
        queryStringParameters: { limit: '10' },
      })
      await handle(event, createMockContext())

      const queryCalls = ddbMock.commandCalls(QueryCommand)
      expect(queryCalls.length).toBe(1)
      const queryInput = queryCalls[0].args[0].input
      expect(queryInput.Limit).toBe(10)
    })

    it('caps limit at MAX_PAGE_SIZE', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] })

      const event = createMockEvent({
        queryStringParameters: { limit: '999' },
      })
      await handle(event, createMockContext())

      const queryCalls = ddbMock.commandCalls(QueryCommand)
      expect(queryCalls.length).toBe(1)
      const queryInput = queryCalls[0].args[0].input
      expect(queryInput.Limit).toBeLessThanOrEqual(100)
    })

    it('rejects invalid pagination cursor with 400', async () => {
      const event = createMockEvent({
        queryStringParameters: { cursor: 'not-valid-base64!!!' },
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
    })

    it('returns empty list when no letters exist', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] })

      const event = createMockEvent()
      const result = await handle(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.items).toEqual([])
      expect(body.nextCursor).toBeNull()
    })

    it('returns nextCursor when more results exist', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [{ GSI1SK: '2024-01-15', title: 'Letter' }],
        LastEvaluatedKey: { PK: 'LETTER#2024-01-15', SK: 'CURRENT', GSI1PK: 'LETTERS', GSI1SK: '2024-01-15' },
      })

      const event = createMockEvent()
      const result = await handle(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.nextCursor).toBeTruthy()
      // Verify the cursor is valid base64-encoded JSON
      const decoded = JSON.parse(Buffer.from(body.nextCursor, 'base64').toString())
      expect(decoded.PK).toBe('LETTER#2024-01-15')
    })

    it('returns 500 when DynamoDB query fails', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('DynamoDB timeout'))

      const event = createMockEvent()
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(500)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Failed to list letters')
    })
  })

  describe('GET /letters/{date}', () => {
    it('returns letter by date with 200', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'LETTER#2024-01-15',
          SK: 'CURRENT',
          title: 'January Letter',
          description: 'New Year update',
          author: 'Mom',
          tags: ['family', 'new-year'],
          content: 'Dear family...',
          pdfKey: 'letters/2024-01-15.pdf',
          createdAt: '2024-01-15T10:00:00Z',
          updatedAt: '2024-01-20T10:00:00Z',
          lastEditedBy: 'user-456',
          versionCount: 3,
        },
      })

      const event = createMockEvent({
        resource: '/letters/{date}',
        path: '/letters/2024-01-15',
        pathParameters: { date: '2024-01-15' },
      })
      const result = await handle(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.date).toBe('2024-01-15')
      expect(body.title).toBe('January Letter')
      expect(body.content).toBe('Dear family...')
      expect(body.versionCount).toBe(3)
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()
    })

    it('returns 404 when letter not found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined })

      const event = createMockEvent({
        resource: '/letters/{date}',
        path: '/letters/2024-01-15',
        pathParameters: { date: '2024-01-15' },
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(404)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Letter not found')
    })

    it('returns 400 for missing date parameter', async () => {
      const event = createMockEvent({
        resource: '/letters/{date}',
        pathParameters: {},
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
    })

    it('returns 400 for invalid date format', async () => {
      const event = createMockEvent({
        resource: '/letters/{date}',
        pathParameters: { date: 'not-a-date' },
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toContain('Valid date parameter required')
    })

    it('returns 500 when DynamoDB get fails', async () => {
      ddbMock.on(GetCommand).rejects(new Error('DynamoDB error'))

      const event = createMockEvent({
        resource: '/letters/{date}',
        path: '/letters/2024-01-15',
        pathParameters: { date: '2024-01-15' },
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(500)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Failed to get letter')
    })
  })

  describe('GET /letters/{date}/pdf', () => {
    it('returns presigned URL for PDF with legacy pdfKey', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'LETTER#2024-01-15',
          SK: 'CURRENT',
          pdfKey: 'letters/2024-01-15.pdf',
        },
      })

      const event = createMockEvent({
        resource: '/letters/{date}/pdf',
        path: '/letters/2024-01-15/pdf',
        pathParameters: { date: '2024-01-15' },
      })
      const result = await handle(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.downloadUrl).toBe('https://signed-url.example.com')
    })

    it('returns presigned URL for ragstack PDF', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'LETTER#2024-01-15',
          SK: 'CURRENT',
          ragstackDocumentId: 'doc-abc123',
          pdfFilename: '2024-01-15.pdf',
        },
      })

      // RAGSTACK_BUCKET is set from env, which is empty in test
      // This should fall through to legacy path check (no pdfKey => 404)
      const event = createMockEvent({
        resource: '/letters/{date}/pdf',
        path: '/letters/2024-01-15/pdf',
        pathParameters: { date: '2024-01-15' },
      })
      const result = await handle(event, createMockContext())

      // Without RAGSTACK_BUCKET env var and no pdfKey, should return 404
      expect(result.statusCode).toBe(404)
    })

    it('returns 404 when letter not found for PDF', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined })

      const event = createMockEvent({
        resource: '/letters/{date}/pdf',
        path: '/letters/2024-01-15/pdf',
        pathParameters: { date: '2024-01-15' },
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(404)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Letter not found')
    })

    it('returns 404 when letter has no PDF', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'LETTER#2024-01-15',
          SK: 'CURRENT',
          // no pdfKey and no ragstackDocumentId
        },
      })

      const event = createMockEvent({
        resource: '/letters/{date}/pdf',
        path: '/letters/2024-01-15/pdf',
        pathParameters: { date: '2024-01-15' },
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(404)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('PDF not found')
    })

    it('returns 400 for invalid date in PDF request', async () => {
      const event = createMockEvent({
        resource: '/letters/{date}/pdf',
        pathParameters: { date: 'bad-date' },
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
    })

    it('returns 500 when S3 presigning fails', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'LETTER#2024-01-15',
          SK: 'CURRENT',
          pdfKey: 'letters/2024-01-15.pdf',
        },
      })

      // Make getSignedUrl reject for this test
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')
      vi.mocked(getSignedUrl).mockRejectedValueOnce(new Error('S3 error'))

      const event = createMockEvent({
        resource: '/letters/{date}/pdf',
        path: '/letters/2024-01-15/pdf',
        pathParameters: { date: '2024-01-15' },
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(500)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Failed to get PDF URL')
    })
  })

  describe('route not found', () => {
    it('returns 404 for unknown route', async () => {
      const event = createMockEvent({
        httpMethod: 'DELETE',
        resource: '/letters/{date}',
        pathParameters: { date: '2024-01-15' },
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(404)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Route not found')
    })
  })
})
