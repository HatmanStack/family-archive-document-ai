/**
 * Comments route handlers
 *
 * Each function is registered individually on the router in index.ts.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { RequestContext } from '../types'
import { commentRepository } from '../repositories'
import { successResponse, errorResponse } from '../lib/responses'
import { sanitizeText, validateContentLength, parseRequestBody, parsePageLimit } from '../lib/validation'
import { MAX_COMMENT_LENGTH, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from '../lib/constants'
import { log } from '../lib/logger'
import { toError, AppError, getStatusCode, getUserMessage } from '../lib/errors'
import { getRequesterId } from '../lib/user'

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
 * GET /comments/{itemId}
 */
export async function listComments(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requestOrigin } = context
  const rawItemId = event.pathParameters?.itemId
  const limit = parsePageLimit(event.queryStringParameters?.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const lastEvaluatedKey = event.queryStringParameters?.lastEvaluatedKey

  if (!rawItemId) {
    return errorResponse(400, 'Missing itemId parameter', requestOrigin)
  }

  const itemId = decodeItemId(rawItemId)

  try {
    const result = await commentRepository.listByItemId(itemId, {
      limit,
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
 * POST /comments/{itemId}
 */
export async function createComment(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requesterEmail, requestOrigin } = context
  const requesterId = getRequesterId(context)

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
 * PUT /comments/{itemId}/{commentId}
 */
export async function editComment(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requesterId, isAdmin, requestOrigin } = context
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
    const existing = await commentRepository.getById(itemId, commentId)
    if (!existing) {
      return errorResponse(404, 'Comment not found', requestOrigin)
    }

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
 * DELETE /comments/{itemId}/{commentId}
 */
export async function deleteComment(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requesterId, isAdmin, requestOrigin } = context
  const rawItemId = event.pathParameters?.itemId
  const commentId = event.pathParameters?.commentId

  if (!rawItemId || !commentId) {
    return errorResponse(400, 'Missing itemId or commentId parameter', requestOrigin)
  }

  const itemId = decodeItemId(rawItemId)

  try {
    const existing = await commentRepository.getById(itemId, commentId)
    if (!existing) {
      return errorResponse(404, 'Comment not found', requestOrigin)
    }

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
 * DELETE /admin/comments/{commentId}
 */
export async function adminDeleteComment(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requestOrigin } = context
  const commentId = event.pathParameters?.commentId
  if (!commentId) {
    return errorResponse(400, 'Missing commentId parameter', requestOrigin)
  }

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
