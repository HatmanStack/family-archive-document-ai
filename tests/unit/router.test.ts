/**
 * Tests for Router class
 */
import { describe, it, expect, vi } from 'vitest'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { Router } from '../../backend/lambdas/api/src/lib/router'
import type { RequestContext } from '../../backend/lambdas/api/src/types'

function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    resource: '/test',
    path: '/test',
    pathParameters: null,
    queryStringParameters: null,
    headers: {},
    body: null,
    isBase64Encoded: false,
    requestContext: {} as never,
    stageVariables: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    ...overrides,
  }
}

const mockContext: RequestContext = {
  requesterId: 'user-123',
  requesterEmail: 'test@example.com',
  isAdmin: false,
  isApprovedUser: true,
  correlationId: 'test-correlation',
  requestOrigin: 'https://example.com',
}

const okResponse: APIGatewayProxyResult = {
  statusCode: 200,
  headers: {},
  body: JSON.stringify({ ok: true }),
}

describe('Router', () => {
  it('matches a basic GET route correctly', async () => {
    const router = new Router()
    const handler = vi.fn().mockResolvedValue(okResponse)

    router.get('/letters', handler)

    const event = createMockEvent({ httpMethod: 'GET', path: '/letters' })
    const result = await router.handle(event, mockContext)

    expect(handler).toHaveBeenCalledWith(event, mockContext)
    expect(result).toEqual(okResponse)
  })

  it('POST route does not match GET request', async () => {
    const router = new Router()
    const handler = vi.fn().mockResolvedValue(okResponse)

    router.post('/letters', handler)

    const event = createMockEvent({ httpMethod: 'GET', path: '/letters' })
    const result = await router.handle(event, mockContext)

    expect(handler).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('parameterized route /messages/{conversationId} matches /messages/abc123', async () => {
    const router = new Router()
    const handler = vi.fn().mockResolvedValue(okResponse)

    router.get('/messages/{conversationId}', handler)

    const event = createMockEvent({
      httpMethod: 'GET',
      path: '/messages/abc123',
    })
    const result = await router.handle(event, mockContext)

    expect(handler).toHaveBeenCalled()
    expect(result).toEqual(okResponse)
    expect(event.pathParameters).toEqual({ conversationId: 'abc123' })
  })

  it('middleware that returns a response short-circuits the handler', async () => {
    const router = new Router()
    const blockedResponse: APIGatewayProxyResult = {
      statusCode: 429,
      headers: {},
      body: JSON.stringify({ error: 'Rate limited' }),
    }
    const middleware = vi.fn().mockResolvedValue(blockedResponse)
    const handler = vi.fn().mockResolvedValue(okResponse)

    router.get('/letters', middleware, handler)

    const event = createMockEvent({ httpMethod: 'GET', path: '/letters' })
    const result = await router.handle(event, mockContext)

    expect(middleware).toHaveBeenCalled()
    expect(handler).not.toHaveBeenCalled()
    expect(result).toEqual(blockedResponse)
  })

  it('middleware that returns null passes through to handler', async () => {
    const router = new Router()
    const middleware = vi.fn().mockResolvedValue(null)
    const handler = vi.fn().mockResolvedValue(okResponse)

    router.get('/letters', middleware, handler)

    const event = createMockEvent({ httpMethod: 'GET', path: '/letters' })
    const result = await router.handle(event, mockContext)

    expect(middleware).toHaveBeenCalled()
    expect(handler).toHaveBeenCalled()
    expect(result).toEqual(okResponse)
  })

  it('multiple middleware execute in order', async () => {
    const router = new Router()
    const callOrder: string[] = []
    const middleware1 = vi.fn().mockImplementation(async () => {
      callOrder.push('m1')
      return null
    })
    const middleware2 = vi.fn().mockImplementation(async () => {
      callOrder.push('m2')
      return null
    })
    const handler = vi.fn().mockImplementation(async () => {
      callOrder.push('handler')
      return okResponse
    })

    router.get('/letters', middleware1, middleware2, handler)

    const event = createMockEvent({ httpMethod: 'GET', path: '/letters' })
    await router.handle(event, mockContext)

    expect(callOrder).toEqual(['m1', 'm2', 'handler'])
  })

  it('unmatched route returns null', async () => {
    const router = new Router()
    const handler = vi.fn().mockResolvedValue(okResponse)

    router.get('/letters', handler)

    const event = createMockEvent({ httpMethod: 'GET', path: '/unknown' })
    const result = await router.handle(event, mockContext)

    expect(handler).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('route with version prefix stripped matches correctly', async () => {
    const router = new Router()
    const handler = vi.fn().mockResolvedValue(okResponse)

    router.get('/letters', handler)

    const event = createMockEvent({
      httpMethod: 'GET',
      path: '/v1/letters',
    })
    const result = await router.handle(event, mockContext)

    expect(handler).toHaveBeenCalled()
    expect(result).toEqual(okResponse)
  })
})
