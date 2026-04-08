/**
 * Tests for letters route handlers
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEvent } from 'aws-lambda'

const ddbMock = mockClient(DynamoDBDocumentClient)

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com'),
}))

vi.mock('../../backend/lambdas/api/src/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getRetryAfter: vi.fn().mockReturnValue(60),
}))

import { listLetters, getLetter, getPdfUrl } from '../../backend/lambdas/api/src/routes/letters'

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

describe('letters handlers', () => {
  describe('listLetters', () => {
    it('returns paginated list with 200', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          { GSI1SK: '2024-01-15', title: 'January Letter', description: 'desc', author: 'Mom', updatedAt: '2024-01-15T10:00:00Z' },
        ],
      })
      const result = await listLetters(createMockEvent(), createMockContext())
      const body = JSON.parse(result.body)
      expect(result.statusCode).toBe(200)
      expect(body.items).toHaveLength(1)
      expect(body.nextCursor).toBeNull()
    })

    it('respects limit parameter', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] })
      await listLetters(createMockEvent({ queryStringParameters: { limit: '10' } }), createMockContext())
      expect(ddbMock.commandCalls(QueryCommand)[0].args[0].input.Limit).toBe(10)
    })

    it('caps limit at MAX_PAGE_SIZE', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] })
      await listLetters(createMockEvent({ queryStringParameters: { limit: '999' } }), createMockContext())
      expect(ddbMock.commandCalls(QueryCommand)[0].args[0].input.Limit).toBe(100)
    })

    it('rejects invalid pagination cursor', async () => {
      const result = await listLetters(
        createMockEvent({ queryStringParameters: { cursor: 'not-valid-base64!!!' } }),
        createMockContext()
      )
      expect(result.statusCode).toBe(400)
    })

    it('returns 500 on DynamoDB failure', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('DynamoDB timeout'))
      const result = await listLetters(createMockEvent(), createMockContext())
      expect(result.statusCode).toBe(500)
    })
  })

  describe('getLetter', () => {
    it('returns letter by date with 200', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'LETTER#2024-01-15',
          SK: 'CURRENT',
          title: 'January Letter',
          content: 'Dear family...',
          versionCount: 3,
        },
      })
      const result = await getLetter(
        createMockEvent({ pathParameters: { date: '2024-01-15' } }),
        createMockContext()
      )
      const body = JSON.parse(result.body)
      expect(result.statusCode).toBe(200)
      expect(body.title).toBe('January Letter')
    })

    it('returns 404 when letter not found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined })
      const result = await getLetter(
        createMockEvent({ pathParameters: { date: '2024-01-15' } }),
        createMockContext()
      )
      expect(result.statusCode).toBe(404)
    })

    it('returns 400 for invalid date format', async () => {
      const result = await getLetter(
        createMockEvent({ pathParameters: { date: 'not-a-date' } }),
        createMockContext()
      )
      expect(result.statusCode).toBe(400)
    })
  })

  describe('getPdfUrl', () => {
    it('returns presigned URL for legacy pdfKey', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: { PK: 'LETTER#2024-01-15', SK: 'CURRENT', pdfKey: 'letters/2024-01-15.pdf' },
      })
      const result = await getPdfUrl(
        createMockEvent({ pathParameters: { date: '2024-01-15' } }),
        createMockContext()
      )
      const body = JSON.parse(result.body)
      expect(result.statusCode).toBe(200)
      expect(body.downloadUrl).toBe('https://signed-url.example.com')
    })

    it('returns 404 when letter has no PDF', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: { PK: 'LETTER#2024-01-15', SK: 'CURRENT' },
      })
      const result = await getPdfUrl(
        createMockEvent({ pathParameters: { date: '2024-01-15' } }),
        createMockContext()
      )
      expect(result.statusCode).toBe(404)
    })

    it('returns 400 for invalid date', async () => {
      const result = await getPdfUrl(
        createMockEvent({ pathParameters: { date: 'bad-date' } }),
        createMockContext()
      )
      expect(result.statusCode).toBe(400)
    })
  })
})
