/**
 * Tests for profile route handler
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEvent } from 'aws-lambda'

const ddbMock = mockClient(DynamoDBDocumentClient)

// Mock S3 presigning to avoid real calls
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com'),
}))

// Mock rate-limit module
vi.mock('../../backend/lambdas/api/src/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getRetryAfter: vi.fn().mockReturnValue(60),
}))

import { handle } from '../../backend/lambdas/api/src/routes/profile'
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

describe('profile handler', () => {
  describe('GET /profile/{userId}', () => {
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
          joinedDate: '2024-01-01',
          lastActive: '2024-06-01',
          commentCount: 5,
          mediaUploadCount: 3,
        },
      })

      const event = createMockEvent()
      const result = await handle(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.userId).toBe('550e8400-e29b-41d4-a716-446655440000')
      expect(body.displayName).toBe('Other User')
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()
    })

    it('returns 404 when profile not found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined })

      const event = createMockEvent()
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(404)
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()
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

      const event = createMockEvent()
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(403)
    })

    it('returns 400 for missing userId', async () => {
      const event = createMockEvent({ pathParameters: {} })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
    })
  })

  describe('PUT /profile', () => {
    it('updates profile and returns 200', async () => {
      // Mock existing profile
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

      const event = createMockEvent({
        httpMethod: 'PUT',
        resource: '/profile',
        path: '/profile',
        pathParameters: null,
        body: JSON.stringify({ displayName: 'New Name', bio: 'Updated bio' }),
      })

      const result = await handle(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.message).toBe('Profile updated successfully')
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()
    })

    it('returns 400 for malformed JSON body', async () => {
      const event = createMockEvent({
        httpMethod: 'PUT',
        resource: '/profile',
        path: '/profile',
        pathParameters: null,
        body: '{invalid json',
      })

      const result = await handle(event, createMockContext())
      expect(result.statusCode).toBe(400)
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()
    })

    it('returns 400 for invalid theme value', async () => {
      const event = createMockEvent({
        httpMethod: 'PUT',
        resource: '/profile',
        path: '/profile',
        pathParameters: null,
        body: JSON.stringify({ theme: 'INVALID_THEME!!!' }),
      })

      const result = await handle(event, createMockContext())
      expect(result.statusCode).toBe(400)
    })
  })

  describe('auth checks', () => {
    it('returns 401 when requesterId is missing', async () => {
      const event = createMockEvent()
      const result = await handle(event, createMockContext({ requesterId: '' }))

      expect(result.statusCode).toBe(401)
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()
    })
  })
})
