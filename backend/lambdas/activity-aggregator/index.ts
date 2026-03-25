import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda'
import { SHARED_PREFIX } from '../shared/types'

const client = new DynamoDBClient({})
const docClient = DynamoDBDocumentClient.from(client)
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE

/** Key builder for user profile (single-table design) */
function userProfileKey(userId: string): { PK: string; SK: string } {
  return {
    PK: `${SHARED_PREFIX.USER}${userId}`,
    SK: 'PROFILE',
  }
}

export async function handler(event: DynamoDBStreamEvent): Promise<{ statusCode: number; body: string }> {
  for (const record of event.Records) {
    try {
      if (record.eventName === 'INSERT') {
        await processInsertEvent(record)
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      console.error(`Error processing record: ${error.message}`)
    }
  }

  return { statusCode: 200, body: 'Activity stats updated' }
}

async function processInsertEvent(record: DynamoDBRecord): Promise<void> {
  const newImage = record.dynamodb?.NewImage
  if (!newImage) return

  const entityType = (newImage as Record<string, { S?: string }>).entityType?.S

  if (entityType === 'COMMENT') {
    const userId = (newImage as Record<string, { S?: string }>).userId?.S
    if (userId) {
      await incrementCommentCount(userId)
      await updateLastActive(userId)
    }
  } else if (entityType === 'MESSAGE') {
    const senderId = (newImage as Record<string, { S?: string }>).senderId?.S
    if (senderId) {
      await updateLastActive(senderId)
    }
  } else if (entityType === 'REACTION') {
    const userId = (newImage as Record<string, { S?: string }>).userId?.S
    if (userId) {
      await updateLastActive(userId)
    }
  }
}

async function incrementCommentCount(userId: string): Promise<void> {
  try {
    await docClient.send(new UpdateCommand({
      TableName: USER_PROFILES_TABLE,
      Key: userProfileKey(userId),
      UpdateExpression: 'ADD commentCount :inc',
      ExpressionAttributeValues: { ':inc': 1 },
      ConditionExpression: 'attribute_exists(PK)',
    }))
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    if (error.name === 'ConditionalCheckFailedException') return // profile doesn't exist, skip
    throw err
  }
}

async function updateLastActive(userId: string): Promise<void> {
  try {
    await docClient.send(new UpdateCommand({
      TableName: USER_PROFILES_TABLE,
      Key: userProfileKey(userId),
      UpdateExpression: 'SET lastActive = :now',
      ExpressionAttributeValues: { ':now': new Date().toISOString() },
      ConditionExpression: 'attribute_exists(PK)',
    }))
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    if (error.name === 'ConditionalCheckFailedException') return // profile doesn't exist, skip
    throw err
  }
}
