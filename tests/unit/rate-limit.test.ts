/**
 * Tests for the rate-limit helper.
 *
 * Asserts the simplified single-retry / fail-open-on-contention behavior.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb'

const ddbMock = mockClient(DynamoDBDocumentClient)

import { checkRateLimit } from '../../backend/lambdas/api/src/lib/rate-limit'

beforeEach(() => {
  ddbMock.reset()
})

describe('checkRateLimit', () => {
  it('allows the first request and reports remaining', async () => {
    ddbMock.on(UpdateCommand).resolves({
      Attributes: { count: 1, windowStart: Date.now() },
    })

    const result = await checkRateLimit('user-1', 'comment')

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(19)
  })

  it('denies once the count exceeds the configured maximum', async () => {
    ddbMock.on(UpdateCommand).resolves({
      Attributes: { count: 21, windowStart: Date.now() },
    })

    const result = await checkRateLimit('user-1', 'comment')

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('retries once on ConditionalCheckFailedException then succeeds', async () => {
    const condErr = new Error('cond')
    condErr.name = 'ConditionalCheckFailedException'
    ddbMock
      .on(UpdateCommand)
      .rejectsOnce(condErr)
      .resolves({ Attributes: { count: 1, windowStart: Date.now() } })

    const result = await checkRateLimit('user-1', 'message')

    expect(result.allowed).toBe(true)
    // Two attempts: original + one retry, no third stage.
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(2)
  })

  it('fails open with allowed=true if the retry also fails', async () => {
    const condErr = new Error('cond')
    condErr.name = 'ConditionalCheckFailedException'
    ddbMock.on(UpdateCommand).rejects(condErr)

    const result = await checkRateLimit('user-1', 'reaction')

    expect(result.allowed).toBe(true)
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(2)
  })

  it('fails open on a non-conditional DynamoDB error without retrying', async () => {
    ddbMock.on(UpdateCommand).rejects(new Error('throughput exceeded'))

    const result = await checkRateLimit('user-1', 'upload')

    expect(result.allowed).toBe(true)
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(1)
  })
})
