/**
 * Tests for drafts route handler
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'

const ddbMock = mockClient(DynamoDBDocumentClient)

import { handle } from '../../backend/lambdas/api/src/routes/drafts'
import type { APIGatewayProxyEvent } from 'aws-lambda'

function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    resource: '/admin/drafts',
    path: '/admin/drafts',
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
    isAdmin: true,
    isApprovedUser: true,
    correlationId: 'test-correlation',
    requestOrigin: 'https://example.com',
    ...overrides,
  }
}

beforeEach(() => {
  ddbMock.reset()
})

describe('drafts handler', () => {
  describe('handleListDrafts', () => {
    it('returns drafts from GSI query', async () => {
      const mockDrafts = [
        { PK: 'DRAFT#abc', SK: 'METADATA', GSI1PK: 'DRAFTS', GSI1SK: 'DRAFT#abc', status: 'REVIEW' },
        { PK: 'DRAFT#def', SK: 'METADATA', GSI1PK: 'DRAFTS', GSI1SK: 'DRAFT#def', status: 'REVIEW' },
      ]

      ddbMock.on(QueryCommand).resolves({ Items: mockDrafts })

      const event = createMockEvent({
        httpMethod: 'GET',
        path: '/admin/drafts',
      })

      const result = await handle(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.drafts).toHaveLength(2)
      expect(body.drafts[0].status).toBe('REVIEW')
    })

    it('returns empty array when no drafts exist', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] })

      const event = createMockEvent({
        httpMethod: 'GET',
        path: '/admin/drafts',
      })

      const result = await handle(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.drafts).toEqual([])
    })

    it('uses GSI1 index with DRAFTS partition key and includes Limit', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] })

      const event = createMockEvent({
        httpMethod: 'GET',
        path: '/admin/drafts',
      })

      await handle(event, createMockContext())

      const calls = ddbMock.commandCalls(QueryCommand)
      expect(calls.length).toBe(1)
      const queryInput = calls[0].args[0].input
      expect(queryInput.IndexName).toBe('GSI1')
      expect(queryInput.ExpressionAttributeValues).toEqual({ ':pk': 'DRAFTS' })
      expect(queryInput.Limit).toBeDefined()
      expect(queryInput.Limit).toBeLessThanOrEqual(100)
    })

    it('returns nextCursor when more results exist', async () => {
      const mockDrafts = [
        { PK: 'DRAFT#abc', SK: 'METADATA', GSI1PK: 'DRAFTS', GSI1SK: 'DRAFT#abc', status: 'REVIEW' },
      ]

      ddbMock.on(QueryCommand).resolves({
        Items: mockDrafts,
        LastEvaluatedKey: { PK: 'DRAFT#abc', SK: 'METADATA', GSI1PK: 'DRAFTS', GSI1SK: 'DRAFT#abc' },
      })

      const event = createMockEvent({
        httpMethod: 'GET',
        path: '/admin/drafts',
      })

      const result = await handle(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      const expectedCursor = Buffer.from(JSON.stringify(
        { PK: 'DRAFT#abc', SK: 'METADATA', GSI1PK: 'DRAFTS', GSI1SK: 'DRAFT#abc' }
      )).toString('base64')
      expect(body.nextCursor).toBe(expectedCursor)
    })

    it('makes only one DynamoDB query (no unbounded loop)', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] })

      const event = createMockEvent({
        httpMethod: 'GET',
        path: '/admin/drafts',
      })

      await handle(event, createMockContext())

      const calls = ddbMock.commandCalls(QueryCommand)
      expect(calls.length).toBe(1)
    })

    it('includes CORS header in response', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] })

      const event = createMockEvent({
        httpMethod: 'GET',
        path: '/admin/drafts',
      })

      const result = await handle(event, createMockContext())
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()
    })

    it('returns 403 for non-approved users', async () => {
      const event = createMockEvent({
        httpMethod: 'GET',
        path: '/admin/drafts',
      })

      const result = await handle(event, createMockContext({ isAdmin: false, isApprovedUser: false }))
      expect(result.statusCode).toBe(403)
    })
  })
})
