/**
 * Middleware functions for the Router.
 *
 * Each factory returns a Middleware that either short-circuits with a response
 * or returns null to continue to the next middleware / handler.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { RequestContext } from '../types'
import { checkRateLimit, getRetryAfter } from './rate-limit'
import { rateLimitResponse, errorResponse } from './responses'

/**
 * Middleware that enforces rate limiting for a given action.
 */
export function rateLimit(action: string) {
  return async (
    _event: APIGatewayProxyEvent,
    context: RequestContext
  ): Promise<APIGatewayProxyResult | null> => {
    if (!context.requesterId) return null // auth middleware handles this
    const result = await checkRateLimit(context.requesterId, action)
    if (!result.allowed) {
      return rateLimitResponse(
        getRetryAfter(result.resetAt),
        'Rate limit exceeded. Please try again later.',
        context.requestOrigin
      )
    }
    return null // continue to handler
  }
}

/**
 * Middleware that requires authentication.
 */
export function requireAuth() {
  return async (
    _event: APIGatewayProxyEvent,
    context: RequestContext
  ): Promise<APIGatewayProxyResult | null> => {
    if (!context.requesterId) {
      return errorResponse(401, 'Unauthorized: Missing user context', context.requestOrigin)
    }
    return null
  }
}

/**
 * Middleware that requires admin access.
 */
export function requireAdmin() {
  return async (
    _event: APIGatewayProxyEvent,
    context: RequestContext
  ): Promise<APIGatewayProxyResult | null> => {
    if (!context.isAdmin) {
      return errorResponse(403, 'Admin access required', context.requestOrigin)
    }
    return null
  }
}

/**
 * Middleware that requires approved user or admin access.
 */
export function requireApproved() {
  return async (
    _event: APIGatewayProxyEvent,
    context: RequestContext
  ): Promise<APIGatewayProxyResult | null> => {
    if (!context.isApprovedUser && !context.isAdmin) {
      return errorResponse(403, 'Approved user access required', context.requestOrigin)
    }
    return null
  }
}
