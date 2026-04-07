/**
 * Tests for profile route handlers
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEvent } from 'aws-lambda'

const ddbMock = mockClient(DynamoDBDocumentClient)

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com'),
}))

vi.mock('../../backend/lambdas/api/src/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getRetryAfter: vi.fn().mockReturnValue(60),
}))

import { getProfile, updateProfile, listUsers } from '../../backend/lambdas/api/src/routes/profile'
import { checkRateLimit } from '../../backend/lambdas/api/src/lib/rate-limit'

function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    resource: '/profile/{userId}',
    path: '/profile/550e8400-e29b-41d4-a716-446655440000',
    pathParameters: { userId: '550e8400-e29b-41d4-a716-446655440000' },
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
    requesterId: '550e8400-e29b-41d4-a716-446655440001',
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

describe('profile handlers', () => {
  describe('getProfile', () => {
    it('returns profile data with 200', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'USER#550e8400-e29b-41d4-a716-446655440000',
          SK: 'PROFILE',
          entityType: 'USER_PROFILE',
          userId: '550e8400-e29b-41d4-a716-446655440000',
          email: 'other@example.com',
          displayName: 'Other User',
          profilePhotoUrl: null,
          bio: 'Hello world',
          isProfilePrivate: false,
        },
      })

      const result = await getProfile(createMockEvent(), createMockContext())
      expect(result.statusCode).toBe(200)
      const body = JSON.parse(result.body)
      expect(body.displayName).toBe('Other User')
    })

    it('returns 404 when profile not found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined })
      const result = await getProfile(createMockEvent(), createMockContext())
      expect(result.statusCode).toBe(404)
    })

    it('returns 403 for private profile viewed by non-admin', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'USER#550e8400-e29b-41d4-a716-446655440000',
          SK: 'PROFILE',
          entityType: 'USER_PROFILE',
          userId: '550e8400-e29b-41d4-a716-446655440000',
          isProfilePrivate: true,
        },
      })
      const result = await getProfile(createMockEvent(), createMockContext())
      expect(result.statusCode).toBe(403)
    })

    it('returns 400 for missing userId', async () => {
      const result = await getProfile(createMockEvent({ pathParameters: {} }), createMockContext())
      expect(result.statusCode).toBe(400)
    })
  })

  describe('updateProfile', () => {
    it('updates profile and returns 200', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'USER#550e8400-e29b-41d4-a716-446655440001',
          SK: 'PROFILE',
          entityType: 'USER_PROFILE',
          userId: '550e8400-e29b-41d4-a716-446655440001',
          displayName: 'Old Name',
        },
      })
      ddbMock.on(UpdateCommand).resolves({})
      const result = await updateProfile(
        createMockEvent({
          httpMethod: 'PUT',
          resource: '/profile',
          path: '/profile',
          pathParameters: null,
          body: JSON.stringify({ displayName: 'New Name', bio: 'Updated bio' }),
        }),
        createMockContext()
      )
      expect(result.statusCode).toBe(200)
    })

    it('returns 400 for malformed JSON body', async () => {
      const result = await updateProfile(
        createMockEvent({ httpMethod: 'PUT', body: '{invalid json' }),
        createMockContext()
      )
      expect(result.statusCode).toBe(400)
    })

    it('returns 400 for invalid theme value', async () => {
      const result = await updateProfile(
        createMockEvent({ httpMethod: 'PUT', body: JSON.stringify({ theme: 'INVALID_THEME!!!' }) }),
        createMockContext()
      )
      expect(result.statusCode).toBe(400)
    })
  })

  describe('listUsers', () => {
    it('returns user list with limit guard', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          { userId: 'user-1', displayName: 'Alice', profilePhotoUrl: null, bio: 'Hello' },
          { userId: 'user-2', displayName: 'Bob', profilePhotoUrl: null, bio: 'World' },
        ],
      })
      const result = await listUsers(createMockEvent({ resource: '/users', path: '/users', pathParameters: null }), createMockContext())
      const body = JSON.parse(result.body)
      expect(result.statusCode).toBe(200)
      expect(body.users).toHaveLength(2)
      const queryCalls = ddbMock.commandCalls(QueryCommand)
      expect(queryCalls[0].args[0].input.Limit).toBeLessThanOrEqual(100)
    })
  })
})
