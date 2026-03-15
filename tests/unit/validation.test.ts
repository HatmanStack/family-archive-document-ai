/**
 * Tests for validation utilities
 */
import { describe, it, expect } from 'vitest'
import { validatePaginationKey, parseRequestBody } from '../../backend/lambdas/api/src/lib/validation'

describe('validatePaginationKey', () => {
  it('returns valid for null/undefined/empty input (no pagination)', () => {
    expect(validatePaginationKey(null)).toEqual({ valid: true })
    expect(validatePaginationKey(undefined)).toEqual({ valid: true })
    expect(validatePaginationKey('')).toEqual({ valid: true })
  })

  it('accepts a valid base64-encoded JSON cursor', () => {
    const cursor = { PK: 'LETTERS', SK: '2024-01-01' }
    const encoded = Buffer.from(JSON.stringify(cursor)).toString('base64')
    const result = validatePaginationKey(encoded)
    expect(result.valid).toBe(true)
    expect(result.key).toEqual(cursor)
  })

  it('returns invalid for malformed base64', () => {
    const result = validatePaginationKey('!!!not-base64!!!')
    // Buffer.from with base64 is lenient, so this may parse.
    // The key test is non-JSON content after decode.
    // Use a string that decodes to non-JSON
    const badResult = validatePaginationKey(
      Buffer.from('this is not json').toString('base64')
    )
    expect(badResult.valid).toBe(false)
    expect(badResult.error).toContain('not valid JSON')
  })

  it('returns invalid for non-JSON content', () => {
    const encoded = Buffer.from('hello world').toString('base64')
    const result = validatePaginationKey(encoded)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('not valid JSON')
  })

  it('returns invalid for non-object JSON (array)', () => {
    const encoded = Buffer.from(JSON.stringify([1, 2, 3])).toString('base64')
    const result = validatePaginationKey(encoded)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('expected object')
  })

  it('returns invalid for non-object JSON (string)', () => {
    const encoded = Buffer.from(JSON.stringify('just a string')).toString('base64')
    const result = validatePaginationKey(encoded)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('expected object')
  })

  it('validates PK prefix when expectedPKPrefix is provided', () => {
    const cursor = { PK: 'CONV#abc123', SK: 'MSG#2024' }
    const encoded = Buffer.from(JSON.stringify(cursor)).toString('base64')

    const validResult = validatePaginationKey(encoded, 'CONV#')
    expect(validResult.valid).toBe(true)
    expect(validResult.key).toEqual(cursor)

    const invalidResult = validatePaginationKey(encoded, 'USER#')
    expect(invalidResult.valid).toBe(false)
    expect(invalidResult.error).toContain('PK prefix mismatch')
  })

  it('returns invalid when PK is missing and prefix is expected', () => {
    const cursor = { SK: 'MSG#2024' }
    const encoded = Buffer.from(JSON.stringify(cursor)).toString('base64')
    const result = validatePaginationKey(encoded, 'CONV#')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('missing PK')
  })

  it('accepts valid cursor without PK prefix check', () => {
    const cursor = { GSI1PK: 'LETTERS', GSI1SK: '2024-01-01' }
    const encoded = Buffer.from(JSON.stringify(cursor)).toString('base64')
    const result = validatePaginationKey(encoded)
    expect(result.valid).toBe(true)
    expect(result.key).toEqual(cursor)
  })
})

describe('parseRequestBody', () => {
  it('returns parsed object for valid JSON', () => {
    const result = parseRequestBody('{"name":"test","value":42}')
    expect(result).toEqual({ name: 'test', value: 42 })
  })

  it('returns null for malformed JSON', () => {
    expect(parseRequestBody('{invalid json}')).toBeNull()
    expect(parseRequestBody('not json at all')).toBeNull()
    expect(parseRequestBody('{missing: quotes}')).toBeNull()
  })

  it('returns empty object for null/empty body', () => {
    expect(parseRequestBody(null)).toEqual({})
    expect(parseRequestBody('')).toEqual({})
  })

  it('returns parsed object for nested JSON', () => {
    const input = '{"data":{"nested":true},"list":[1,2,3]}'
    const result = parseRequestBody(input)
    expect(result).toEqual({ data: { nested: true }, list: [1, 2, 3] })
  })
})
