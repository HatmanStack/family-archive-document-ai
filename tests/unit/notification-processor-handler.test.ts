/**
 * Tests for notification-processor Lambda handler
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import type { DynamoDBStreamEvent } from 'aws-lambda'

// Set environment before importing handler
process.env.TABLE_NAME = 'test-table'
process.env.SES_FROM_EMAIL = 'noreply@example.com'
process.env.BASE_URL = 'https://family.example.com'

const ddbMock = mockClient(DynamoDBDocumentClient)
const sesMock = mockClient(SESClient)

import { handler, sendEmail, maskEmail } from '../../backend/lambdas/notification-processor/index'

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

function createUserProfile(overrides: Record<string, unknown> = {}) {
  return {
    PK: 'USER#user-1',
    SK: 'PROFILE',
    email: 'user@example.com',
    notifyOnMessage: true,
    notifyOnComment: true,
    ...overrides,
  }
}

beforeEach(() => {
  ddbMock.reset()
  sesMock.reset()
  sesMock.on(SendEmailCommand).resolves({})
})

describe('notification-processor handler', () => {
  describe('processMessageNotification', () => {
    it('should send email to each participant except sender', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: createUserProfile(),
      })

      const event = createStreamEvent([
        createInsertRecord({
          entityType: { S: 'MESSAGE' },
          conversationId: { S: 'conv-1' },
          senderId: { S: 'sender-1' },
          senderName: { S: 'Alice' },
          messageText: { S: 'Hello everyone!' },
          participants: { SS: ['sender-1', 'user-1', 'user-2'] },
        }),
      ])

      await handler(event)

      const emailCalls = sesMock.commandCalls(SendEmailCommand)
      expect(emailCalls).toHaveLength(2)
    })

    it('should suppress email when notifyOnMessage is false', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: createUserProfile({ notifyOnMessage: false }),
      })

      const event = createStreamEvent([
        createInsertRecord({
          entityType: { S: 'MESSAGE' },
          conversationId: { S: 'conv-1' },
          senderId: { S: 'sender-1' },
          senderName: { S: 'Alice' },
          messageText: { S: 'Hello!' },
          participants: { SS: ['sender-1', 'user-1'] },
        }),
      ])

      await handler(event)

      const emailCalls = sesMock.commandCalls(SendEmailCommand)
      expect(emailCalls).toHaveLength(0)
    })

    it('should skip notification when profile is missing', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined })

      const event = createStreamEvent([
        createInsertRecord({
          entityType: { S: 'MESSAGE' },
          conversationId: { S: 'conv-1' },
          senderId: { S: 'sender-1' },
          senderName: { S: 'Alice' },
          messageText: { S: 'Hello!' },
          participants: { SS: ['sender-1', 'user-1'] },
        }),
      ])

      await handler(event)

      const emailCalls = sesMock.commandCalls(SendEmailCommand)
      expect(emailCalls).toHaveLength(0)
    })

    it('should skip when no participants', async () => {
      const event = createStreamEvent([
        createInsertRecord({
          entityType: { S: 'MESSAGE' },
          conversationId: { S: 'conv-1' },
          senderId: { S: 'sender-1' },
          participants: { SS: [] },
        }),
      ])

      await handler(event)

      const emailCalls = sesMock.commandCalls(SendEmailCommand)
      expect(emailCalls).toHaveLength(0)
    })
  })

  describe('processCommentNotification', () => {
    it('should send email to previous commenters excluding commenter', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: createUserProfile(),
      })

      const event = createStreamEvent([
        createInsertRecord({
          entityType: { S: 'COMMENT' },
          itemId: { S: 'letter-1' },
          itemType: { S: 'letter' },
          userId: { S: 'commenter-1' },
          userName: { S: 'Bob' },
          commentText: { S: 'Great letter!' },
          itemTitle: { S: 'Summer Letter' },
          previousCommenters: {
            L: [{ S: 'user-1' }, { S: 'commenter-1' }],
          },
        }),
      ])

      await handler(event)

      // Only user-1 notified (commenter-1 is excluded)
      const emailCalls = sesMock.commandCalls(SendEmailCommand)
      expect(emailCalls).toHaveLength(1)
    })

    it('should suppress email when notifyOnComment is false', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: createUserProfile({ notifyOnComment: false }),
      })

      const event = createStreamEvent([
        createInsertRecord({
          entityType: { S: 'COMMENT' },
          itemId: { S: 'letter-1' },
          userId: { S: 'commenter-1' },
          userName: { S: 'Bob' },
          commentText: { S: 'Nice!' },
          itemTitle: { S: 'A Letter' },
          previousCommenters: { L: [{ S: 'user-1' }] },
        }),
      ])

      await handler(event)

      const emailCalls = sesMock.commandCalls(SendEmailCommand)
      expect(emailCalls).toHaveLength(0)
    })

    it('should deduplicate notifications for same user', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: createUserProfile(),
      })

      const event = createStreamEvent([
        createInsertRecord({
          entityType: { S: 'COMMENT' },
          itemId: { S: 'letter-1' },
          userId: { S: 'commenter-1' },
          userName: { S: 'Bob' },
          commentText: { S: 'Nice!' },
          itemTitle: { S: 'A Letter' },
          previousCommenters: {
            L: [{ S: 'user-1' }, { S: 'user-1' }, { S: 'user-1' }],
          },
        }),
      ])

      await handler(event)

      // Should only send one email despite user-1 appearing 3 times
      const emailCalls = sesMock.commandCalls(SendEmailCommand)
      expect(emailCalls).toHaveLength(1)
    })

    it('should skip when no previous commenters', async () => {
      const event = createStreamEvent([
        createInsertRecord({
          entityType: { S: 'COMMENT' },
          itemId: { S: 'letter-1' },
          userId: { S: 'commenter-1' },
          previousCommenters: { L: [] },
        }),
      ])

      await handler(event)

      const emailCalls = sesMock.commandCalls(SendEmailCommand)
      expect(emailCalls).toHaveLength(0)
    })
  })

  describe('sendEmail', () => {
    it('should call SES with correct parameters', async () => {
      const result = await sendEmail(
        'recipient@example.com',
        'Test Subject',
        '<h1>Hello</h1>'
      )

      expect(result).toBe(true)

      const calls = sesMock.commandCalls(SendEmailCommand)
      expect(calls).toHaveLength(1)

      const input = calls[0].args[0].input
      expect(input.Destination?.ToAddresses).toEqual(['recipient@example.com'])
      expect(input.Message?.Subject?.Data).toBe('Test Subject')
      expect(input.Message?.Body?.Html?.Data).toBe('<h1>Hello</h1>')
    })

    it('should return false on SES error', async () => {
      sesMock.on(SendEmailCommand).rejects(new Error('SES error'))

      const result = await sendEmail(
        'recipient@example.com',
        'Test Subject',
        '<h1>Hello</h1>'
      )

      expect(result).toBe(false)
    })
  })

  describe('maskEmail', () => {
    it('should mask email addresses', () => {
      expect(maskEmail('alice@example.com')).toBe('al***@example.com')
    })

    it('should handle short names', () => {
      expect(maskEmail('ab@example.com')).toBe('***@example.com')
    })

    it('should handle invalid input', () => {
      expect(maskEmail('')).toBe('[invalid]')
      expect(maskEmail('not-an-email')).toBe('[invalid]')
    })
  })
})
