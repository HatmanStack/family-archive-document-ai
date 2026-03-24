/**
 * Tests for activity-aggregator Lambda handler
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBStreamEvent } from 'aws-lambda'

// Set environment before importing handler
process.env.TABLE_NAME = 'test-table'
process.env.USER_PROFILES_TABLE = 'test-table'

const ddbMock = mockClient(DynamoDBDocumentClient)

import { handler } from '../../backend/lambdas/activity-aggregator/index'

function createStreamEvent(records: DynamoDBStreamEvent['Records']): DynamoDBStreamEvent {
  return { Records: records }
}

function createInsertRecord(newImage: Record<string, unknown>) {
  return {
    eventName: 'INSERT' as const,
    dynamodb: {
      NewImage: newImage,
    },
  }
}

beforeEach(() => {
  ddbMock.reset()
  ddbMock.on(UpdateCommand).resolves({})
})

describe('activity-aggregator handler', () => {
  describe('COMMENT entity', () => {
    it('should increment comment count and update lastActive', async () => {
      const event = createStreamEvent([
        createInsertRecord({
          entityType: { S: 'COMMENT' },
          userId: { S: 'user-123' },
        }),
      ])

      await handler(event)

      const calls = ddbMock.commandCalls(UpdateCommand)
      expect(calls).toHaveLength(2)

      // First call: incrementCommentCount
      const incrementCall = calls[0].args[0].input
      expect(incrementCall.Key).toEqual({ PK: 'USER#user-123', SK: 'PROFILE' })
      expect(incrementCall.UpdateExpression).toBe('ADD commentCount :inc')
      expect(incrementCall.ExpressionAttributeValues).toEqual({ ':inc': 1 })

      // Second call: updateLastActive
      const lastActiveCall = calls[1].args[0].input
      expect(lastActiveCall.Key).toEqual({ PK: 'USER#user-123', SK: 'PROFILE' })
      expect(lastActiveCall.UpdateExpression).toBe('SET lastActive = :now')
    })

    it('should skip if userId is missing', async () => {
      const event = createStreamEvent([
        createInsertRecord({
          entityType: { S: 'COMMENT' },
        }),
      ])

      await handler(event)

      const calls = ddbMock.commandCalls(UpdateCommand)
      expect(calls).toHaveLength(0)
    })
  })

  describe('MESSAGE entity', () => {
    it('should update lastActive for the senderId', async () => {
      const event = createStreamEvent([
        createInsertRecord({
          entityType: { S: 'MESSAGE' },
          senderId: { S: 'sender-456' },
        }),
      ])

      await handler(event)

      const calls = ddbMock.commandCalls(UpdateCommand)
      expect(calls).toHaveLength(1)

      const call = calls[0].args[0].input
      expect(call.Key).toEqual({ PK: 'USER#sender-456', SK: 'PROFILE' })
      expect(call.UpdateExpression).toBe('SET lastActive = :now')
    })

    it('should skip if senderId is missing', async () => {
      const event = createStreamEvent([
        createInsertRecord({
          entityType: { S: 'MESSAGE' },
        }),
      ])

      await handler(event)

      const calls = ddbMock.commandCalls(UpdateCommand)
      expect(calls).toHaveLength(0)
    })
  })

  describe('REACTION entity', () => {
    it('should update lastActive for the userId', async () => {
      const event = createStreamEvent([
        createInsertRecord({
          entityType: { S: 'REACTION' },
          userId: { S: 'user-789' },
        }),
      ])

      await handler(event)

      const calls = ddbMock.commandCalls(UpdateCommand)
      expect(calls).toHaveLength(1)

      const call = calls[0].args[0].input
      expect(call.Key).toEqual({ PK: 'USER#user-789', SK: 'PROFILE' })
      expect(call.UpdateExpression).toBe('SET lastActive = :now')
    })
  })

  describe('unknown entity types', () => {
    it('should silently ignore unknown entity types', async () => {
      const event = createStreamEvent([
        createInsertRecord({
          entityType: { S: 'UNKNOWN_TYPE' },
        }),
      ])

      await handler(event)

      const calls = ddbMock.commandCalls(UpdateCommand)
      expect(calls).toHaveLength(0)
    })
  })

  describe('non-INSERT events', () => {
    it('should skip records without INSERT eventName', async () => {
      const event = createStreamEvent([
        {
          eventName: 'MODIFY' as const,
          dynamodb: {
            NewImage: {
              entityType: { S: 'COMMENT' },
              userId: { S: 'user-123' },
            },
          },
        },
      ])

      await handler(event)

      const calls = ddbMock.commandCalls(UpdateCommand)
      expect(calls).toHaveLength(0)
    })
  })

  describe('error handling', () => {
    it('should continue processing after an error in one record', async () => {
      ddbMock.on(UpdateCommand)
        .rejectsOnce(new Error('DynamoDB error'))
        .resolves({})

      const event = createStreamEvent([
        createInsertRecord({
          entityType: { S: 'COMMENT' },
          userId: { S: 'user-fail' },
        }),
        createInsertRecord({
          entityType: { S: 'MESSAGE' },
          senderId: { S: 'user-success' },
        }),
      ])

      const result = await handler(event)
      expect(result.statusCode).toBe(200)

      // Second record should still be processed
      const calls = ddbMock.commandCalls(UpdateCommand)
      expect(calls.length).toBeGreaterThanOrEqual(2)
    })
  })
})
