/**
 * Database configuration and clients
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import { log } from './logger'

// Shared DynamoDB clients
const client = new DynamoDBClient({})
export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
})

// Single table name from environment
export const TABLE_NAME = process.env.TABLE_NAME || process.env.DYNAMODB_TABLE || ''

// S3 archive bucket (single bucket for all storage)
export const ARCHIVE_BUCKET = process.env.ARCHIVE_BUCKET || ''

// S3 prefixes within archive bucket
export const S3_PREFIXES = {
  letters: 'letters/',
  media: 'media/',
  profilePhotos: 'profile-photos/',
  temp: 'temp/',
} as const

export type S3PrefixKey = keyof typeof S3_PREFIXES

/**
 * Batch write items to DynamoDB with retry logic for UnprocessedItems.
 * Items are automatically chunked into groups of 25 (DynamoDB limit).
 * Uses exponential backoff on retry: 100ms, 200ms, 400ms, etc.
 *
 * @param items - Array of write request items (PutRequest or DeleteRequest)
 * @param tableName - DynamoDB table name
 * @param maxRetries - Maximum number of retries per batch (default: 3)
 */
export async function batchWriteWithRetry(
  items: Record<string, unknown>[],
  tableName: string,
  maxRetries = 3
): Promise<void> {
  for (let i = 0; i < items.length; i += 25) {
    let unprocessed: Record<string, unknown>[] | undefined = items.slice(i, i + 25)
    let retries = 0

    while (unprocessed && unprocessed.length > 0 && retries <= maxRetries) {
      const result = await docClient.send(new BatchWriteCommand({
        RequestItems: { [tableName]: unprocessed },
      }))

      unprocessed = result.UnprocessedItems?.[tableName] as Record<string, unknown>[] | undefined
      if (unprocessed && unprocessed.length > 0) {
        if (retries < maxRetries) {
          // Exponential backoff: 100ms, 200ms, 400ms
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retries)))
        }
        retries++
      }
    }

    if (unprocessed && unprocessed.length > 0) {
      log.warn('batch_write_unprocessed_items', {
        count: unprocessed.length,
        retries: maxRetries,
      })
      throw new Error(
        `batchWriteWithRetry failed: ${unprocessed.length} unprocessed items after ${maxRetries} retries`
      )
    }
  }
}
