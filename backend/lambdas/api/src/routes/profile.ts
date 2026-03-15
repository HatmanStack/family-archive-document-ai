/**
 * Profile route handler
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { RequestContext } from '../types'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { docClient, TABLE_NAME, ARCHIVE_BUCKET } from '../lib/database'
import { keys, PREFIX } from '../lib/keys'
import { successResponse, errorResponse, rateLimitResponse } from '../lib/responses'
import { validateUserId, sanitizeText, validateLimit, parseRequestBody } from '../lib/validation'
import { checkRateLimit, getRetryAfter } from '../lib/rate-limit'
import { log } from '../lib/logger'
import { signPhotoUrl } from '../lib/s3-utils'

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-west-2',
})

interface FamilyRelationship {
  id: string
  type: string
  name: string
  customType?: string
  createdAt?: string
}

/**
 * Main profile route handler
 */
export async function handle(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requesterId, requesterEmail, isAdmin, requestOrigin } = context

  if (!requesterId) {
    return errorResponse(401, 'Unauthorized: Missing user context', requestOrigin)
  }

  const method = event.httpMethod
  const resource = event.resource
  const normalizedResource = resource.replace(/^\/v1/, '')

  if (method === 'GET' && normalizedResource === '/profile/{userId}') {
    return getProfile(event, requesterId, isAdmin, requestOrigin)
  }

  if (method === 'PUT' && normalizedResource === '/profile') {
    return updateProfile(event, requesterId, requesterEmail, requestOrigin)
  }

  if (method === 'GET' && normalizedResource === '/profile/{userId}/comments') {
    return getUserComments(event, requesterId, isAdmin, requestOrigin)
  }

  if (method === 'POST' && normalizedResource === '/profile/photo/upload-url') {
    return getPhotoUploadUrl(event, requesterId, requestOrigin)
  }

  if (method === 'GET' && normalizedResource === '/users') {
    return listUsers(requesterId, requestOrigin)
  }

  return errorResponse(404, 'Route not found', requestOrigin)
}

async function getProfile(
  event: APIGatewayProxyEvent,
  requesterId: string,
  isAdmin: boolean,
  requestOrigin?: string
): Promise<APIGatewayProxyResult> {
  const userId = event.pathParameters?.userId

  if (!userId) {
    return errorResponse(400, 'Missing userId parameter', requestOrigin)
  }

  if (!validateUserId(userId)) {
    return errorResponse(400, 'Invalid userId format', requestOrigin)
  }

  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: keys.userProfile(userId),
    }))

    if (!result.Item || result.Item.entityType !== 'USER_PROFILE') {
      return errorResponse(404, 'Profile not found', requestOrigin)
    }

    const profile = result.Item

    if (profile.isProfilePrivate && userId !== requesterId && !isAdmin) {
      return errorResponse(403, 'This profile is private', requestOrigin)
    }

    const signedPhotoUrl = await signPhotoUrl(profile.profilePhotoUrl as string)

    return successResponse({
      userId: profile.userId,
      email: profile.email,
      displayName: profile.displayName,
      profilePhotoUrl: signedPhotoUrl,
      bio: profile.bio,
      familyRelationship: profile.familyRelationship,
      generation: profile.generation,
      familyBranch: profile.familyBranch,
      isProfilePrivate: profile.isProfilePrivate,
      joinedDate: profile.joinedDate,
      lastActive: profile.lastActive,
      commentCount: profile.commentCount || 0,
      mediaUploadCount: profile.mediaUploadCount || 0,
      contactEmail: profile.contactEmail,
      notifyOnMessage: profile.notifyOnMessage !== false,
      notifyOnComment: profile.notifyOnComment !== false,
      theme: profile.theme || null,
      familyRelationships: profile.familyRelationships || [],
    }, 200, requestOrigin)
  } catch (error) {
    log.error('get_profile_error', { userId, error: (error as Error).message })
    return errorResponse(500, 'Failed to get profile', requestOrigin)
  }
}

async function updateProfile(
  event: APIGatewayProxyEvent,
  requesterId: string,
  requesterEmail?: string,
  requestOrigin?: string
): Promise<APIGatewayProxyResult> {
  const rateLimit = await checkRateLimit(requesterId, 'default')
  if (!rateLimit.allowed) {
    return rateLimitResponse(getRetryAfter(rateLimit.resetAt), 'Rate limit exceeded', requestOrigin)
  }

  const body = parseRequestBody(event.body)
  if (!body) {
    return errorResponse(400, 'Invalid JSON in request body', requestOrigin)
  }

  // Sanitize inputs
  if (body.bio) body.bio = sanitizeText(body.bio)
  if (body.displayName) body.displayName = sanitizeText(body.displayName)
  if (body.familyRelationship) body.familyRelationship = sanitizeText(body.familyRelationship)

  // Validate theme
  if (body.theme !== undefined) {
    if (typeof body.theme !== 'string' || body.theme.length > 50 || !/^[a-z0-9-]*$/.test(body.theme)) {
      return errorResponse(400, 'Invalid theme value', requestOrigin)
    }
  }

  // Validate familyRelationships
  if (body.familyRelationships !== undefined) {
    if (!Array.isArray(body.familyRelationships)) {
      return errorResponse(400, 'familyRelationships must be an array', requestOrigin)
    }

    const now = new Date().toISOString()
    for (let i = 0; i < body.familyRelationships.length; i++) {
      const rel = body.familyRelationships[i] as FamilyRelationship

      if (!rel.id || typeof rel.id !== 'string') {
        return errorResponse(400, `Relationship at index ${i} is missing required field: id`, requestOrigin)
      }
      if (!rel.type || typeof rel.type !== 'string') {
        return errorResponse(400, `Relationship at index ${i} is missing required field: type`, requestOrigin)
      }
      if (!rel.name || typeof rel.name !== 'string') {
        return errorResponse(400, `Relationship at index ${i} is missing required field: name`, requestOrigin)
      }

      rel.name = sanitizeText(rel.name)
      if (rel.customType) {
        rel.customType = sanitizeText(rel.customType)
      }
      if (!rel.createdAt) {
        rel.createdAt = now
      }
    }
  }

  const errors: string[] = []
  if (body.displayName && body.displayName.length > 100) {
    errors.push('Display name must be 100 characters or less')
  }

  if (errors.length > 0) {
    return errorResponse(400, errors.join(', '), requestOrigin)
  }

  try {
    const existingResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: keys.userProfile(requesterId),
    }))

    const now = new Date().toISOString()
    const allowedFields = [
      'displayName', 'bio', 'familyRelationship', 'generation', 'familyBranch',
      'isProfilePrivate', 'profilePhotoUrl', 'contactEmail', 'notifyOnMessage',
      'notifyOnComment', 'theme', 'familyRelationships'
    ]

    if (existingResult.Item) {
      // Update existing profile
      const updateParts: string[] = ['lastActive = :now']
      const expressionValues: Record<string, unknown> = { ':now': now }

      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          updateParts.push(`${field} = :${field}`)
          expressionValues[`:${field}`] = body[field]
        }
      }

      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: keys.userProfile(requesterId),
        UpdateExpression: `SET ${updateParts.join(', ')}`,
        ExpressionAttributeValues: expressionValues,
      }))
    } else {
      // Create new profile with GSI1 keys for listing all users
      const profile: Record<string, unknown> = {
        ...keys.userProfile(requesterId),
        ...keys.userProfileGSI1(requesterId),
        entityType: 'USER_PROFILE',
        userId: requesterId,
        email: requesterEmail,
        displayName: body.displayName || requesterEmail?.split('@')[0] || 'User',
        joinedDate: now,
        lastActive: now,
        commentCount: 0,
        mediaUploadCount: 0,
      }

      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          profile[field] = body[field]
        }
      }

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: profile,
      }))
    }

    return successResponse({ message: 'Profile updated successfully' }, 200, requestOrigin)
  } catch (error) {
    log.error('update_profile_error', { requesterId, error: (error as Error).message })
    return errorResponse(500, 'Failed to update profile', requestOrigin)
  }
}

async function getUserComments(
  event: APIGatewayProxyEvent,
  requesterId: string,
  isAdmin: boolean,
  requestOrigin?: string
): Promise<APIGatewayProxyResult> {
  const userId = event.pathParameters?.userId
  const limit = validateLimit(event.queryStringParameters?.limit)

  if (!userId) {
    return errorResponse(400, 'Missing userId parameter', requestOrigin)
  }

  if (!validateUserId(userId)) {
    return errorResponse(400, 'Invalid userId format', requestOrigin)
  }

  // Only allow viewing own comments or if admin
  if (userId !== requesterId && !isAdmin) {
    return errorResponse(403, 'You can only view your own comments', requestOrigin)
  }

  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :gsi1pk AND begins_with(GSI1SK, :prefix)',
      ExpressionAttributeValues: {
        ':gsi1pk': `${PREFIX.USER}${userId}`,
        ':prefix': `${PREFIX.COMMENT}`,
      },
      Limit: limit,
      ScanIndexForward: false,
    }))

    const comments = (result.Items || []).map(item => ({
      commentId: item.commentId,
      itemId: item.itemId,
      content: item.content,
      createdAt: item.createdAt,
      isEdited: item.isEdited,
    }))

    return successResponse({ comments }, 200, requestOrigin)
  } catch (error) {
    log.error('get_user_comments_error', { userId, error: (error as Error).message })
    return errorResponse(500, 'Failed to get user comments', requestOrigin)
  }
}

async function getPhotoUploadUrl(
  event: APIGatewayProxyEvent,
  requesterId: string,
  requestOrigin?: string
): Promise<APIGatewayProxyResult> {
  const body = parseRequestBody(event.body)
  if (!body) {
    return errorResponse(400, 'Invalid JSON in request body', requestOrigin)
  }
  const { filename, contentType } = body as { filename?: string; contentType?: string }

  if (!filename) {
    return errorResponse(400, 'Missing filename', requestOrigin)
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!allowedTypes.includes(contentType)) {
    return errorResponse(400, 'Invalid content type', requestOrigin)
  }

  try {
    const ext = filename.split('.').pop() || 'jpg'
    const key = `profile-photos/${requesterId}/${Date.now()}.${ext}`

    const command = new PutObjectCommand({
      Bucket: ARCHIVE_BUCKET,
      Key: key,
      ContentType: contentType,
    })

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 })
    const photoUrl = `https://${ARCHIVE_BUCKET}.s3.${process.env.AWS_REGION || 'us-west-2'}.amazonaws.com/${key}`

    return successResponse({ uploadUrl, photoUrl }, 200, requestOrigin)
  } catch (error) {
    log.error('get_photo_upload_url_error', { requesterId, error: (error as Error).message })
    return errorResponse(500, 'Failed to get photo upload URL', requestOrigin)
  }
}

async function listUsers(_requesterId: string, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  try {
    // Use GSI1 Query instead of Scan for better scalability
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :gsi1pk',
      ExpressionAttributeValues: { ':gsi1pk': 'USERS' },
      ProjectionExpression: 'userId, displayName, profilePhotoUrl, bio',
    }))

    const users = await Promise.all(
      (result.Items || []).map(async item => ({
        userId: item.userId,
        displayName: item.displayName,
        profilePhotoUrl: await signPhotoUrl(item.profilePhotoUrl as string),
        bio: item.bio,
      }))
    )

    return successResponse({ users }, 200, requestOrigin)
  } catch (error) {
    log.error('list_users_error', { error: (error as Error).message })
    return errorResponse(500, 'Failed to list users', requestOrigin)
  }
}
