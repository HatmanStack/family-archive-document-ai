/**
 * Tests for media route handler
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { APIGatewayProxyEvent } from 'aws-lambda'

// Mock S3 presigning to avoid real calls
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com'),
}))

// Mock s3-utils module
vi.mock('../../backend/lambdas/api/src/lib/s3-utils', () => ({
  s3Client: { send: vi.fn() },
  ragstackS3Client: { send: vi.fn() },
  RAGSTACK_BUCKET: 'test-ragstack-bucket',
}))

// Mock rate-limit module to prevent import side effects
vi.mock('../../backend/lambdas/api/src/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getRetryAfter: vi.fn().mockReturnValue(60),
}))

import { getDownloadUrl as handle } from '../../backend/lambdas/api/src/routes/media'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    resource: '/download/presigned-url',
    path: '/download/presigned-url',
    pathParameters: null,
    queryStringParameters: { key: 'media/photo.jpg' },
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
  vi.mocked(getSignedUrl).mockResolvedValue('https://signed-url.example.com')
})

describe('media handler', () => {
  describe('GET /download/presigned-url - archive bucket', () => {
    it('returns presigned download URL for valid media key', async () => {
      const event = createMockEvent({
        queryStringParameters: { key: 'media/photo.jpg' },
      })
      const result = await handle(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.downloadUrl).toBe('https://signed-url.example.com')
      expect(body.filename).toBe('photo.jpg')
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()
    })

    it('returns presigned URL for letters prefix', async () => {
      const event = createMockEvent({
        queryStringParameters: { key: 'letters/2024-01-15.pdf' },
      })
      const result = await handle(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.downloadUrl).toBe('https://signed-url.example.com')
      expect(body.filename).toBe('2024-01-15.pdf')
    })

    it('returns presigned URL for temp prefix', async () => {
      const event = createMockEvent({
        queryStringParameters: { key: 'temp/upload.jpg' },
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(200)
    })

    it('returns 403 for disallowed key prefix in archive bucket', async () => {
      const event = createMockEvent({
        queryStringParameters: { key: 'secret/private.pdf' },
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(403)
      const body = JSON.parse(result.body)
      expect(body.error).toContain('Access denied')
    })
  })

  describe('GET /download/presigned-url - ragstack bucket', () => {
    it('returns presigned URL for ragstack input prefix', async () => {
      const event = createMockEvent({
        queryStringParameters: { key: 'input/doc-123/file.pdf', bucket: 'ragstack' },
      })
      const result = await handle(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.downloadUrl).toBe('https://signed-url.example.com')
    })

    it('returns presigned URL for ragstack content prefix', async () => {
      const event = createMockEvent({
        queryStringParameters: { key: 'content/doc-123/data.json', bucket: 'ragstack' },
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(200)
    })

    it('returns 403 for disallowed key prefix in ragstack bucket', async () => {
      const event = createMockEvent({
        queryStringParameters: { key: 'private/secret.pdf', bucket: 'ragstack' },
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(403)
      const body = JSON.parse(result.body)
      expect(body.error).toContain('Access denied')
    })
  })

  describe('GET /download/presigned-url - validation', () => {
    it('returns 400 for missing key parameter', async () => {
      const event = createMockEvent({
        queryStringParameters: null,
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toContain('key')
    })

    it('returns 400 for path traversal attempt with ..', async () => {
      const event = createMockEvent({
        queryStringParameters: { key: 'media/../secret/file.txt' },
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toContain('Invalid key')
    })

    it('returns 400 for URL-encoded path traversal attempt', async () => {
      const event = createMockEvent({
        queryStringParameters: { key: 'media/%2e%2e/secret/file.txt' },
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toContain('Invalid key')
    })
  })

  describe('GET /download/presigned-url - error handling', () => {
    it('returns 500 when S3 presigning fails', async () => {
      vi.mocked(getSignedUrl).mockRejectedValueOnce(new Error('S3 error'))

      const event = createMockEvent({
        queryStringParameters: { key: 'media/photo.jpg' },
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(500)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Failed to generate download URL')
    })
  })

})
