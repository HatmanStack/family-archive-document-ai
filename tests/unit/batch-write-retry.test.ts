/**
 * Tests for batchWriteWithRetry helper
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'

// Must mock before importing the module that uses docClient
const ddbMock = mockClient(DynamoDBDocumentClient)

// We need to test the helper directly. Since it's in messages.ts (a route handler),
// we'll extract it to a shared location and test it there.
// For now, test via the exported helper from lib/database.ts
import { batchWriteWithRetry } from '../../backend/lambdas/api/src/lib/database'

beforeEach(() => {
  ddbMock.reset()
  vi.useFakeTimers()
})

describe('batchWriteWithRetry', () => {
  const TABLE_NAME = 'test-table'

  it('completes in single call when no UnprocessedItems', async () => {
    ddbMock.on(BatchWriteCommand).resolves({
      UnprocessedItems: {},
    })

    const items = [
      { PutRequest: { Item: { PK: 'test1', SK: 'sk1' } } },
      { PutRequest: { Item: { PK: 'test2', SK: 'sk2' } } },
    ]

    await batchWriteWithRetry(items, TABLE_NAME)

    const calls = ddbMock.commandCalls(BatchWriteCommand)
    expect(calls.length).toBe(1)
  })

  it('retries when UnprocessedItems are returned', async () => {
    const items = [
      { PutRequest: { Item: { PK: 'test1', SK: 'sk1' } } },
      { PutRequest: { Item: { PK: 'test2', SK: 'sk2' } } },
    ]

    // First call: return one unprocessed item
    ddbMock.on(BatchWriteCommand)
      .resolvesOnce({
        UnprocessedItems: {
          [TABLE_NAME]: [{ PutRequest: { Item: { PK: 'test2', SK: 'sk2' } } }],
        },
      })
      // Second call: all processed
      .resolves({
        UnprocessedItems: {},
      })

    const promise = batchWriteWithRetry(items, TABLE_NAME)
    // Advance past the backoff timer
    await vi.advanceTimersByTimeAsync(200)
    await promise

    const calls = ddbMock.commandCalls(BatchWriteCommand)
    expect(calls.length).toBe(2)
  })

  it('throws after maxRetries with unprocessed items', async () => {
    const items = [
      { PutRequest: { Item: { PK: 'test1', SK: 'sk1' } } },
    ]

    // Always return unprocessed items
    ddbMock.on(BatchWriteCommand).resolves({
      UnprocessedItems: {
        [TABLE_NAME]: [{ PutRequest: { Item: { PK: 'test1', SK: 'sk1' } } }],
      },
    })

    const promise = batchWriteWithRetry(items, TABLE_NAME, 2).catch((e: unknown) => e)
    // Advance past all backoff timers
    await vi.advanceTimersByTimeAsync(1000)
    const result = await promise
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toBe('batchWriteWithRetry failed: 1 unprocessed items after 2 retries')

    const calls = ddbMock.commandCalls(BatchWriteCommand)
    // Initial call + 2 retries = 3 total
    expect(calls.length).toBe(3)
  })

  it('batches items in groups of 25', async () => {
    ddbMock.on(BatchWriteCommand).resolves({
      UnprocessedItems: {},
    })

    // Create 30 items
    const items = Array.from({ length: 30 }, (_, i) => ({
      PutRequest: { Item: { PK: `test${i}`, SK: `sk${i}` } },
    }))

    await batchWriteWithRetry(items, TABLE_NAME)

    const calls = ddbMock.commandCalls(BatchWriteCommand)
    // Should be 2 calls: 25 items + 5 items
    expect(calls.length).toBe(2)
  })
})
