/**
 * Tests for HTTP response helpers (CORS headers)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// We need to control env vars before importing, so import dynamically
let getCorsHeaders: typeof import('../../backend/lambdas/api/src/lib/responses').getCorsHeaders

describe('getCorsHeaders', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Reset module cache to pick up env changes
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('includes Vary: Origin when echoing request origin in wildcard mode', async () => {
    process.env.NODE_ENV = 'test'
    delete process.env.ALLOWED_ORIGINS
    const mod = await import('../../backend/lambdas/api/src/lib/responses')
    getCorsHeaders = mod.getCorsHeaders

    const headers = getCorsHeaders('https://example.com')
    expect(headers['Access-Control-Allow-Origin']).toBe('https://example.com')
    expect(headers['Vary']).toBe('Origin')
  })

  it('includes Vary: Origin for wildcard without request origin', async () => {
    process.env.NODE_ENV = 'test'
    delete process.env.ALLOWED_ORIGINS
    const mod = await import('../../backend/lambdas/api/src/lib/responses')
    getCorsHeaders = mod.getCorsHeaders

    const headers = getCorsHeaders()
    expect(headers['Access-Control-Allow-Origin']).toBe('*')
    expect(headers['Vary']).toBe('Origin')
  })

  it('includes Vary: Origin when origin matches allowed list', async () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com,https://other.example.com'
    const mod = await import('../../backend/lambdas/api/src/lib/responses')
    getCorsHeaders = mod.getCorsHeaders

    const headers = getCorsHeaders('https://app.example.com')
    expect(headers['Access-Control-Allow-Origin']).toBe('https://app.example.com')
    expect(headers['Vary']).toBe('Origin')
  })

  it('includes Vary: Origin when falling back to first allowed origin', async () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com'
    const mod = await import('../../backend/lambdas/api/src/lib/responses')
    getCorsHeaders = mod.getCorsHeaders

    const headers = getCorsHeaders()
    expect(headers['Access-Control-Allow-Origin']).toBe('https://app.example.com')
    expect(headers['Vary']).toBe('Origin')
  })

  it('does NOT include Vary: Origin when no CORS headers (fail-closed, no origins)', async () => {
    delete process.env.ALLOWED_ORIGINS
    delete process.env.AWS_SAM_LOCAL
    process.env.NODE_ENV = 'production'
    const mod = await import('../../backend/lambdas/api/src/lib/responses')
    getCorsHeaders = mod.getCorsHeaders

    const headers = getCorsHeaders()
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined()
    expect(headers['Vary']).toBeUndefined()
  })

  it('does NOT include Vary: Origin when origin not in allowed list (fail-closed)', async () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com'
    const mod = await import('../../backend/lambdas/api/src/lib/responses')
    getCorsHeaders = mod.getCorsHeaders

    const headers = getCorsHeaders('https://evil.example.com')
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined()
    expect(headers['Vary']).toBeUndefined()
  })
})
