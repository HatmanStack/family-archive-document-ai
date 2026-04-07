/**
 * Family Archive - Document AI API - Main Entry Point
 *
 * This is a consolidated API Lambda that routes requests to appropriate handlers.
 * Uses a declarative Router for type-safe routing with middleware support.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { RequestContext, AuthClaims } from './types'
import { Router } from './lib/router'
import { requireAuth, requireAdmin, requireApproved, rateLimit } from './lib/middleware'
import { comments, messages, profile, reactions, media, letters, drafts, contact } from './routes'
import { ensureProfile } from './lib/user'
import { log, setCorrelationId, extractCorrelationId } from './lib/logger'
import { errorResponse } from './lib/responses'
import { toError, getStatusCode, getUserMessage, AppError } from './lib/errors'
import { stripVersionPrefix } from './lib/path-utils'

/**
 * Current API version
 */
export const API_VERSION = 'v1'

// ---------------------------------------------------------------------------
// Declarative route registration
// ---------------------------------------------------------------------------

const router = new Router()

// Comments
router.get('/comments/{itemId}', comments.listComments)
router.post('/comments/{itemId}', requireAuth(), rateLimit('comment'), comments.createComment)
router.put('/comments/{itemId}/{commentId}', requireAuth(), comments.editComment)
router.delete('/comments/{itemId}/{commentId}', requireAuth(), comments.deleteComment)

// Messages
router.get('/messages/conversations', requireAuth(), messages.listConversations)
router.get('/messages/{conversationId}', requireAuth(), messages.getMessages)
router.post('/messages/conversations', requireAuth(), rateLimit('message'), messages.createConversation)
router.post('/messages/{conversationId}', requireAuth(), rateLimit('message'), messages.sendMessage)
router.post('/messages/{conversationId}/upload-url', requireAuth(), rateLimit('upload'), messages.generateUploadUrl)
router.post('/messages/attachments/upload-url', requireAuth(), rateLimit('upload'), messages.generateUploadUrl)
router.put('/messages/{conversationId}/read', requireAuth(), rateLimit('message'), messages.markAsRead)
router.delete('/messages/{conversationId}', requireAuth(), rateLimit('message'), messages.deleteConversation)
router.delete('/messages/{conversationId}/{messageId}', requireAuth(), rateLimit('message'), messages.deleteMessage)

// Profile & Users
router.get('/profile/{userId}', requireAuth(), profile.getProfile)
router.put('/profile', requireAuth(), profile.updateProfile)
router.get('/profile/{userId}/comments', requireAuth(), profile.getUserComments)
router.post('/profile/photo/upload-url', requireAuth(), profile.getPhotoUploadUrl)
router.get('/users', requireAuth(), profile.listUsers)

// Reactions
router.get('/reactions/{commentId}', reactions.handle)
router.post('/reactions/{commentId}', reactions.handle)
router.delete('/reactions/{commentId}', reactions.handle)

// Media / Downloads
router.get('/download/presigned-url', media.handle)

// Drafts / Upload (before generic /letters routes)
router.post('/letters/upload-request', drafts.handle)
router.post('/letters/process/{uploadId}', drafts.handle)

// Letters
router.get('/letters', letters.listLetters)
router.get('/letters/{date}', letters.getLetter)
router.put('/letters/{date}', requireAuth(), letters.updateLetter)
router.get('/letters/{date}/versions', letters.getVersions)
router.post('/letters/{date}/revert', requireAuth(), letters.revertToVersion)
router.get('/letters/{date}/pdf', letters.getPdfUrl)

// Contact
router.post('/contact', contact.handle)

// Admin - Drafts (approved users or admins)
router.get('/admin/drafts', requireApproved(), drafts.handle)
router.get('/admin/drafts/{draftId}', requireApproved(), drafts.handle)
router.delete('/admin/drafts/{draftId}', requireApproved(), drafts.handle)
router.post('/admin/drafts/{draftId}/publish', requireApproved(), drafts.handle)

// Admin - Comment moderation (admins only)
router.delete('/admin/comments/{commentId}', requireAdmin(), comments.adminDeleteComment)

// ---------------------------------------------------------------------------
// Lambda handler
// ---------------------------------------------------------------------------

/**
 * Main API handler - consolidates all API endpoints into a single Lambda
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  // Extract and set correlation ID for request tracing
  const traceHeader = event.headers?.['X-Amzn-Trace-Id'] || event.headers?.['x-amzn-trace-id']
  const correlationId = extractCorrelationId(traceHeader)
  setCorrelationId(correlationId)

  // Extract request origin for CORS
  const requestOrigin = event.headers?.['Origin'] || event.headers?.['origin']

  const method = event.httpMethod
  const rawPath = event.path || event.resource

  // Strip version prefix if present (supports /v1/... format)
  const path = stripVersionPrefix(rawPath)

  // Extract auth context
  const claims = (event.requestContext?.authorizer?.claims || {}) as AuthClaims
  const requesterId = claims.sub
  const requesterEmail = claims.email
  const requesterGroups = claims['cognito:groups'] || ''
  const isAdmin = requesterGroups.includes('Admins')
  const isApprovedUser = requesterGroups.includes('ApprovedUsers')

  log.info('request', {
    method,
    path,
    rawPath,
    requesterId,
    requesterEmail,
    isAdmin,
    isApprovedUser,
  })

  // Auto-create profile for approved users on first request
  if (requesterId) {
    try {
      await ensureProfile(requesterId, requesterEmail, requesterGroups)
    } catch (err) {
      const error = toError(err)
      log.error('ensure_profile_failed', {
        requesterId,
        error: error.message,
      })
      return errorResponse(500, 'Failed to initialize user profile', requestOrigin)
    }
  }

  const context: RequestContext = {
    requesterId,
    requesterEmail,
    isAdmin,
    isApprovedUser,
    correlationId,
    requestOrigin,
  }

  try {
    const result = await router.handle(event, context)
    if (result) return result

    return errorResponse(404, `Route not found: ${method} ${path}`, requestOrigin)
  } catch (err) {
    const error = toError(err)
    log.error('unhandled_error', {
      error: error.message,
      stack: error.stack,
    })

    // Use appropriate status code and message for typed errors
    const statusCode = getStatusCode(err)
    const message =
      err instanceof AppError ? getUserMessage(err) : 'Internal server error'

    return errorResponse(statusCode, message, requestOrigin)
  }
}
