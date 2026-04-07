/**
 * Tests for drafts route handlers
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'

const ddbMock = mockClient(DynamoDBDocumentClient)

import { listDrafts } from '../../backend/lambdas/api/src/routes/drafts'
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

describe('drafts handlers', () => {
  describe('listDrafts', () => {
    it('returns drafts from GSI query', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          { PK: 'DRAFT#abc', SK: 'METADATA', GSI1PK: 'DRAFTS', GSI1SK: 'DRAFT#abc', status: 'REVIEW' },
          { PK: 'DRAFT#def', SK: 'METADATA', GSI1PK: 'DRAFTS', GSI1SK: 'DRAFT#def', status: 'REVIEW' },
        ],
      })
      const result = await listDrafts(createMockEvent(), createMockContext())
      const body = JSON.parse(result.body)
      expect(result.statusCode).toBe(200)
      expect(body.drafts).toHaveLength(2)
    })

    it('returns empty array when no drafts exist', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] })
      const result = await listDrafts(createMockEvent(), createMockContext())
      const body = JSON.parse(result.body)
      expect(result.statusCode).toBe(200)
      expect(body.drafts).toEqual([])
    })

    it('uses GSI1 with DRAFTS pk and includes Limit', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] })
      await listDrafts(createMockEvent(), createMockContext())
      const calls = ddbMock.commandCalls(QueryCommand)
      expect(calls.length).toBe(1)
      const queryInput = calls[0].args[0].input
      expect(queryInput.IndexName).toBe('GSI1')
      expect(queryInput.ExpressionAttributeValues).toEqual({ ':pk': 'DRAFTS' })
      expect(queryInput.Limit).toBeLessThanOrEqual(100)
    })

    it('returns nextCursor when more results exist', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [{ PK: 'DRAFT#abc', SK: 'METADATA', GSI1PK: 'DRAFTS', GSI1SK: 'DRAFT#abc', status: 'REVIEW' }],
        LastEvaluatedKey: { PK: 'DRAFT#abc', SK: 'METADATA', GSI1PK: 'DRAFTS', GSI1SK: 'DRAFT#abc' },
      })
      const result = await listDrafts(createMockEvent(), createMockContext())
      const body = JSON.parse(result.body)
      expect(body.nextCursor).toBeTruthy()
    })

    it('returns 500 when DynamoDB fails', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('boom'))
      const result = await listDrafts(createMockEvent(), createMockContext())
      expect(result.statusCode).toBe(500)
    })
  })
})
