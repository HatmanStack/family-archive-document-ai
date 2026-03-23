/**
 * Comments route handler
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { RequestContext } from '../types'
import { commentRepository } from '../repositories'
import { successResponse, errorResponse, rateLimitResponse } from '../lib/responses'
import { sanitizeText, validateContentLength, parseRequestBody } from '../lib/validation'
import { MAX_COMMENT_LENGTH, MAX_PAGE_SIZE } from '../lib/constants'
import { checkRateLimit, getRetryAfter } from '../lib/rate-limit'
import { log } from '../lib/logger'
import { toError, AppError, getStatusCode, getUserMessage } from '../lib/errors'

/**
 * Decode base64url itemId from URL path
 */
function decodeItemId(encoded: string): string {
  let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) {
    base64 += '='
  }
  return Buffer.from(base64, 'base64').toString('utf8')
}

/**
 * Main comments route handler
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

  // Strip /v1 prefix if present
  const normalizedResource = resource.replace(/^\/v1/, '')

  if (method === 'GET' && normalizedResource === '/comments/{itemId}') {
    return listComments(event, requesterId, requestOrigin)
  }

  if (method === 'POST' && normalizedResource === '/comments/{itemId}') {
    return createComment(event, requesterId, requesterEmail, requestOrigin)
  }

  if (method === 'PUT' && normalizedResource === '/comments/{itemId}/{commentId}') {
    return editComment(event, requesterId, isAdmin, requestOrigin)
  }

  if (method === 'DELETE' && normalizedResource === '/comments/{itemId}/{commentId}') {
    return deleteComment(event, requesterId, isAdmin, requestOrigin)
  }

  if (method === 'DELETE' && normalizedResource === '/admin/comments/{commentId}') {
    return adminDeleteComment(event, isAdmin, requestOrigin)
  }

  return errorResponse(404, 'Route not found', requestOrigin)
}

/**
 * List comments for an item
 */
async function listComments(
  event: APIGatewayProxyEvent,
  _requesterId: string,
  requestOrigin?: string
): Promise<APIGatewayProxyResult> {
  const rawItemId = event.pathParameters?.itemId
  const limit = parseInt(event.queryStringParameters?.limit || '50', 10)
  const lastEvaluatedKey = event.queryStringParameters?.lastEvaluatedKey

  if (!rawItemId) {
    return errorResponse(400, 'Missing itemId parameter', requestOrigin)
  }

  const itemId = decodeItemId(rawItemId)

  try {
    const result = await commentRepository.listByItemId(itemId, {
      limit: Math.min(limit, MAX_PAGE_SIZE),
      lastEvaluatedKey,
    })

    log.info('list_comments', { itemId, count: result.count })

    return successResponse({
      comments: result.items,
      lastEvaluatedKey: result.lastEvaluatedKey,
      count: result.count,
    }, 200, requestOrigin)
  } catch (error) {
    log.error('list_comments_error', { itemId, error: toError(error).message })
    if (error instanceof AppError) {
      return errorResponse(getStatusCode(error), getUserMessage(error), requestOrigin)
    }
    return errorResponse(500, 'Failed to fetch comments', requestOrigin)
  }
}

/**
 * Create a new comment
 */
async function createComment(
  event: APIGatewayProxyEvent,
  requesterId: string,
  requesterEmail?: string,
  requestOrigin?: string
): Promise<APIGatewayProxyResult> {
  // Rate limit check
  const rateLimit = await checkRateLimit(requesterId, 'comment')
  if (!rateLimit.allowed) {
    return rateLimitResponse(
      getRetryAfter(rateLimit.resetAt),
      'Rate limit exceeded. Please try again later.',
      requestOrigin
    )
  }

  const rawItemId = event.pathParameters?.itemId
  if (!rawItemId) {
    return errorResponse(400, 'Missing itemId parameter', requestOrigin)
  }

  const itemId = decodeItemId(rawItemId)

  const body = parseRequestBody(event.body)
  if (!body) {
    return errorResponse(400, 'Invalid JSON body', requestOrigin)
  }

  const content = sanitizeText(body.content as string)
  if (!validateContentLength(content, 1, MAX_COMMENT_LENGTH)) {
    return errorResponse(400, `Comment content must be between 1 and ${MAX_COMMENT_LENGTH} characters`, requestOrigin)
  }

  try {
    const comment = await commentRepository.create({
      itemId,
      content,
      authorId: requesterId,
      authorEmail: requesterEmail,
    })

    log.info('create_comment', { itemId, commentId: comment.commentId })

    return successResponse(comment, 201, requestOrigin)
  } catch (error) {
    log.error('create_comment_error', { itemId, error: toError(error).message })
    return errorResponse(500, 'Failed to create comment', requestOrigin)
  }
}

/**
 * Edit an existing comment
 */
async function editComment(
  event: APIGatewayProxyEvent,
  requesterId: string,
  isAdmin: boolean,
  requestOrigin?: string
): Promise<APIGatewayProxyResult> {
  const rawItemId = event.pathParameters?.itemId
  const commentId = event.pathParameters?.commentId

  if (!rawItemId || !commentId) {
    return errorResponse(400, 'Missing itemId or commentId parameter', requestOrigin)
  }

  const itemId = decodeItemId(rawItemId)

  const body = parseRequestBody(event.body)
  if (!body) {
    return errorResponse(400, 'Invalid JSON body', requestOrigin)
  }

  const content = sanitizeText(body.content as string)
  if (!validateContentLength(content, 1, MAX_COMMENT_LENGTH)) {
    return errorResponse(400, `Comment content must be between 1 and ${MAX_COMMENT_LENGTH} characters`, requestOrigin)
  }

  try {
    // Get existing comment to verify ownership
    const existing = await commentRepository.getById(itemId, commentId)
    if (!existing) {
      return errorResponse(404, 'Comment not found', requestOrigin)
    }

    // Check ownership (unless admin)
    if (!isAdmin && existing.authorId !== requesterId) {
      return errorResponse(403, 'You can only edit your own comments', requestOrigin)
    }

    const updated = await commentRepository.updateContent(
      itemId,
      commentId,
      content,
      existing.content
    )

    log.info('edit_comment', { itemId, commentId })

    return successResponse(updated, 200, requestOrigin)
  } catch (error) {
    log.error('edit_comment_error', { itemId, commentId, error: toError(error).message })
    return errorResponse(500, 'Failed to edit comment', requestOrigin)
  }
}

/**
 * Delete a comment (soft delete)
 */
async function deleteComment(
  event: APIGatewayProxyEvent,
  requesterId: string,
  isAdmin: boolean,
  requestOrigin?: string
): Promise<APIGatewayProxyResult> {
  const rawItemId = event.pathParameters?.itemId
  const commentId = event.pathParameters?.commentId

  if (!rawItemId || !commentId) {
    return errorResponse(400, 'Missing itemId or commentId parameter', requestOrigin)
  }

  const itemId = decodeItemId(rawItemId)

  try {
    // Get existing comment to verify ownership
    const existing = await commentRepository.getById(itemId, commentId)
    if (!existing) {
      return errorResponse(404, 'Comment not found', requestOrigin)
    }

    // Check ownership (unless admin)
    if (!isAdmin && existing.authorId !== requesterId) {
      return errorResponse(403, 'You can only delete your own comments', requestOrigin)
    }

    await commentRepository.softDelete(itemId, commentId)

    log.info('delete_comment', { itemId, commentId })

    return successResponse({ success: true }, 200, requestOrigin)
  } catch (error) {
    log.error('delete_comment_error', { itemId, commentId, error: toError(error).message })
    return errorResponse(500, 'Failed to delete comment', requestOrigin)
  }
}

/**
 * Admin hard delete a comment
 */
async function adminDeleteComment(
  event: APIGatewayProxyEvent,
  isAdmin: boolean,
  requestOrigin?: string
): Promise<APIGatewayProxyResult> {
  if (!isAdmin) {
    return errorResponse(403, 'Admin access required', requestOrigin)
  }

  const commentId = event.pathParameters?.commentId
  if (!commentId) {
    return errorResponse(400, 'Missing commentId parameter', requestOrigin)
  }

  // For admin delete, we need to find the comment first
  // This requires knowing the itemId, which should be passed in the request
  const body = parseRequestBody(event.body)
  if (!body) {
    return errorResponse(400, 'Invalid JSON body', requestOrigin)
  }

  if (!body.itemId) {
    return errorResponse(400, 'Missing itemId in request body', requestOrigin)
  }

  const itemId = body.itemId as string

  try {
    await commentRepository.hardDelete(itemId, commentId)

    log.info('admin_delete_comment', { itemId, commentId })

    return successResponse({ success: true }, 200, requestOrigin)
  } catch (error) {
    log.error('admin_delete_comment_error', { commentId, error: toError(error).message })
    return errorResponse(500, 'Failed to delete comment', requestOrigin)
  }
}
