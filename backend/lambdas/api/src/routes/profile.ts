/**
 * Profile route handlers
 *
 * Each function is registered individually on the router in index.ts.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { RequestContext } from '../types'
import path from 'node:path'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { docClient, TABLE_NAME, ARCHIVE_BUCKET } from '../lib/database'
import { keys, PREFIX } from '../lib/keys'
import { successResponse, errorResponse, rateLimitResponse } from '../lib/responses'
import { validateUserId, sanitizeText, validateLimit, parseRequestBody, validatePaginationKey, parsePageLimit } from '../lib/validation'
import { MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from '../lib/constants'
import { checkRateLimit, getRetryAfter } from '../lib/rate-limit'
import { log } from '../lib/logger'
import { toError } from '../lib/errors'
import { s3Client, signPhotoUrl } from '../lib/s3-utils'

interface FamilyRelationship {
  id: string
  type: string
  name: string
  customType?: string
  createdAt?: string
}

/**
 * GET /profile/{userId}
 */
export async function getProfile(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requesterId, isAdmin, requestOrigin } = context
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
    log.error('get_profile_error', { userId, error: toError(error).message })
    return errorResponse(500, 'Failed to get profile', requestOrigin)
  }
}

/**
 * PUT /profile
 */
export async function updateProfile(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requesterId, requesterEmail, requestOrigin } = context
  const rateLimit = await checkRateLimit(requesterId!, 'default')
  if (!rateLimit.allowed) {
    return rateLimitResponse(getRetryAfter(rateLimit.resetAt), 'Rate limit exceeded', requestOrigin)
  }

  const body = parseRequestBody(event.body)
  if (!body) {
    return errorResponse(400, 'Invalid JSON in request body', requestOrigin)
  }

  if (body.bio) body.bio = sanitizeText(body.bio)
  if (body.displayName) body.displayName = sanitizeText(body.displayName)
  if (body.familyRelationship) body.familyRelationship = sanitizeText(body.familyRelationship)

  if (body.theme !== undefined) {
    if (typeof body.theme !== 'string' || body.theme.length > 50 || !/^[a-z0-9-]*$/.test(body.theme)) {
      return errorResponse(400, 'Invalid theme value', requestOrigin)
    }
  }

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
      Key: keys.userProfile(requesterId!),
    }))

    const now = new Date().toISOString()
    const allowedFields = [
      'displayName', 'bio', 'familyRelationship', 'generation', 'familyBranch',
      'isProfilePrivate', 'profilePhotoUrl', 'contactEmail', 'notifyOnMessage',
      'notifyOnComment', 'theme', 'familyRelationships'
    ]

    if (existingResult.Item) {
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
        Key: keys.userProfile(requesterId!),
        UpdateExpression: `SET ${updateParts.join(', ')}`,
        ExpressionAttributeValues: expressionValues,
      }))
    } else {
      const profile: Record<string, unknown> = {
        ...keys.userProfile(requesterId!),
        ...keys.userProfileGSI1(requesterId!),
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
    log.error('update_profile_error', { requesterId, error: toError(error).message })
    return errorResponse(500, 'Failed to update profile', requestOrigin)
  }
}

/**
 * GET /profile/{userId}/comments
 */
export async function getUserComments(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requesterId, isAdmin, requestOrigin } = context
  const userId = event.pathParameters?.userId
  const limit = validateLimit(event.queryStringParameters?.limit)

  if (!userId) {
    return errorResponse(400, 'Missing userId parameter', requestOrigin)
  }

  if (!validateUserId(userId)) {
    return errorResponse(400, 'Invalid userId format', requestOrigin)
  }

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
    log.error('get_user_comments_error', { userId, error: toError(error).message })
    return errorResponse(500, 'Failed to get user comments', requestOrigin)
  }
}

/**
 * POST /profile/photo/upload-url
 */
export async function getPhotoUploadUrl(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requesterId, requestOrigin } = context
  const body = parseRequestBody(event.body)
  if (!body) {
    return errorResponse(400, 'Invalid JSON in request body', requestOrigin)
  }
  const { filename, contentType } = body as { filename?: string; contentType?: string }

  if (!filename) {
    return errorResponse(400, 'Missing filename', requestOrigin)
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!contentType || !allowedTypes.includes(contentType)) {
    return errorResponse(400, 'Invalid content type', requestOrigin)
  }

  try {
    const safeName = path.basename(filename)
    const ext = (safeName.match(/\.([a-zA-Z0-9]+)$/)?.[1] || 'jpg').toLowerCase()
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
    log.error('get_photo_upload_url_error', { requesterId, error: toError(error).message })
    return errorResponse(500, 'Failed to get photo upload URL', requestOrigin)
  }
}

/**
 * GET /users
 */
export async function listUsers(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requestOrigin } = context
  try {
    const limit = parsePageLimit(event.queryStringParameters?.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const cursor = event.queryStringParameters?.cursor

    const queryParams: Record<string, unknown> = {
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :gsi1pk',
      ExpressionAttributeValues: { ':gsi1pk': 'USERS' },
      ProjectionExpression: 'userId, displayName, profilePhotoUrl, bio',
      Limit: limit,
    }

    if (cursor) {
      const paginationResult = validatePaginationKey(cursor)
      if (!paginationResult.valid) {
        return errorResponse(400, paginationResult.error || 'Invalid pagination key', requestOrigin)
      }
      if (paginationResult.key) {
        queryParams.ExclusiveStartKey = paginationResult.key
      }
    }

    const result = await docClient.send(new QueryCommand(queryParams))

    const users = await Promise.all(
      (result.Items || []).map(async item => ({
        userId: item.userId,
        displayName: item.displayName,
        profilePhotoUrl: await signPhotoUrl(item.profilePhotoUrl as string),
        bio: item.bio,
      }))
    )

    const nextCursor = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : null

    return successResponse({ users, nextCursor }, 200, requestOrigin)
  } catch (error) {
    log.error('list_users_error', { error: toError(error).message })
    return errorResponse(500, 'Failed to list users', requestOrigin)
  }
}
