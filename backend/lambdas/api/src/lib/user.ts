/**
 * User profile management utilities
 */
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, TABLE_NAME } from './database'
import { keys } from './keys'
import type { UserProfile } from '../types'
import { toError } from './errors'
import { log } from './logger'

/** Users whose GSI1 attributes have been verified this Lambda instance */
const gsi1VerifiedUsers = new Set<string>()

/**
 * Backfill GSI1 attributes for a profile if missing (read-repair).
 * This handles profiles created before GSI1 was added.
 */
async function backfillGSI1IfMissing(profile: UserProfile): Promise<UserProfile> {
  const gsi1Keys = keys.userProfileGSI1(profile.userId)

  // Check if GSI1 attributes are missing
  if (!profile.GSI1PK || !profile.GSI1SK) {
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: keys.userProfile(profile.userId),
          UpdateExpression: 'SET GSI1PK = :gsi1pk, GSI1SK = :gsi1sk',
          ExpressionAttributeValues: {
            ':gsi1pk': gsi1Keys.GSI1PK,
            ':gsi1sk': gsi1Keys.GSI1SK,
          },
          // Update if either GSI1 attribute is missing (handles partial backfills)
          ConditionExpression: 'attribute_not_exists(GSI1PK) OR attribute_not_exists(GSI1SK)',
        })
      )
      // Return profile with GSI1 attributes
      return { ...profile, ...gsi1Keys }
    } catch (err) {
      // Condition failed means another request already added GSI1 - that's fine
      if (toError(err).name === 'ConditionalCheckFailedException') {
        return { ...profile, ...gsi1Keys }
      }
      // Log but don't fail - GSI1 is for listing, not critical path
      log.warn('gsi1_backfill_failed', { error: toError(err).message })
    }
  }

  return profile
}

/**
 * Ensure a user profile exists (create if not present)
 */
export async function ensureProfile(
  userId: string,
  email?: string,
  groups?: string
): Promise<UserProfile> {
  const key = keys.userProfile(userId)

  // Try to get existing profile
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: key,
    })
  )

  if (result.Item) {
    const profile = result.Item as UserProfile
    if (gsi1VerifiedUsers.has(userId)) {
      return profile
    }
    const updated = await backfillGSI1IfMissing(profile)
    gsi1VerifiedUsers.add(userId)
    return updated
  }

  // Create new profile with GSI1 keys for listing all users
  const timestamp = new Date().toISOString()
  const profile: UserProfile = {
    ...key,
    ...keys.userProfileGSI1(userId),
    userId,
    email,
    displayName: email?.split('@')[0] || 'User',
    groups,
    createdAt: timestamp,
    updatedAt: timestamp,
    entityType: 'USER_PROFILE',
  }

  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: profile,
        ConditionExpression: 'attribute_not_exists(PK)',
      })
    )
  } catch (err) {
    // Profile created by concurrent request, fetch it
    if (toError(err).name === 'ConditionalCheckFailedException') {
      const existing = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: key,
        })
      )
      return existing.Item as UserProfile
    }
    throw err
  }

  gsi1VerifiedUsers.add(userId)
  return profile
}

/**
 * Get a user profile by ID
 */
export async function getProfile(
  userId: string
): Promise<UserProfile | null> {
  const key = keys.userProfile(userId)

  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: key,
    })
  )

  return (result.Item as UserProfile) || null
}
