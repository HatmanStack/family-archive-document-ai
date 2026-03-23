/**
 * Tests for contact route handler
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import type { APIGatewayProxyEvent } from 'aws-lambda'

const sesMock = mockClient(SESClient)

// Set env vars using vi.hoisted so they are available BEFORE the handler module loads.
// The contact handler captures SES_FROM_EMAIL and ADMIN_EMAIL at module level.
vi.hoisted(() => {
  process.env.SES_FROM_EMAIL = 'noreply@example.com'
  process.env.ADMIN_EMAIL = 'admin@example.com'
})

// Mock rate-limit module to prevent import side effects
vi.mock('../../backend/lambdas/api/src/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getRetryAfter: vi.fn().mockReturnValue(60),
}))

import { handle } from '../../backend/lambdas/api/src/routes/contact'

function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    resource: '/contact',
    path: '/contact',
    pathParameters: null,
    queryStringParameters: null,
    headers: { Origin: 'https://example.com' },
    body: JSON.stringify({ email: 'sender@example.com', message: 'Hello there!' }),
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
  sesMock.reset()
})

describe('contact handler', () => {
  describe('POST /contact - happy path', () => {
    it('successfully sends contact email', async () => {
      sesMock.on(SendEmailCommand).resolves({ MessageId: 'msg-123' })

      const event = createMockEvent()
      const result = await handle(event, createMockContext())
      const body = JSON.parse(result.body)

      expect(result.statusCode).toBe(200)
      expect(body.message).toBe('Message sent successfully')
      expect(result.headers?.['Access-Control-Allow-Origin']).toBeDefined()

      // Verify SES was called with correct parameters
      const sesCalls = sesMock.commandCalls(SendEmailCommand)
      expect(sesCalls).toHaveLength(1)
      const sesInput = sesCalls[0].args[0].input
      expect(sesInput.Source).toBe('noreply@example.com')
      expect(sesInput.Destination?.ToAddresses).toEqual(['admin@example.com'])
      expect(sesInput.ReplyToAddresses).toEqual(['sender@example.com'])
    })
  })

  describe('POST /contact - validation errors', () => {
    it('returns 400 for missing email', async () => {
      const event = createMockEvent({
        body: JSON.stringify({ message: 'Hello there!' }),
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toContain('required')
    })

    it('returns 400 for missing message', async () => {
      const event = createMockEvent({
        body: JSON.stringify({ email: 'sender@example.com' }),
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toContain('required')
    })

    it('returns 400 for invalid email format', async () => {
      const event = createMockEvent({
        body: JSON.stringify({ email: 'not-an-email', message: 'Hello' }),
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toContain('email')
    })

    it('returns 400 for message exceeding 5000 chars', async () => {
      const event = createMockEvent({
        body: JSON.stringify({ email: 'sender@example.com', message: 'x'.repeat(5001) }),
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toContain('5000')
    })

    it('returns 400 for malformed JSON body', async () => {
      const event = createMockEvent({
        body: '{invalid json',
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toContain('Invalid JSON')
    })
  })

  describe('POST /contact - method check', () => {
    it('returns 405 for non-POST methods', async () => {
      const event = createMockEvent({
        httpMethod: 'GET',
      })
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(405)
      const body = JSON.parse(result.body)
      expect(body.error).toContain('Method not allowed')
    })
  })

  describe('POST /contact - error handling', () => {
    it('returns 500 when SES send fails', async () => {
      sesMock.on(SendEmailCommand).rejects(new Error('SES service unavailable'))

      const event = createMockEvent()
      const result = await handle(event, createMockContext())

      expect(result.statusCode).toBe(500)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Failed to send message')
    })
  })
})
