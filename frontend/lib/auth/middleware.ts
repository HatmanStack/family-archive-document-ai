import type { RequestEvent } from '@sveltejs/kit'
import type { CognitoJWTPayload } from './jwt'
import { error } from '@sveltejs/kit'
import { extractTokenFromHeader, isUserApproved, verifyJWT } from './jwt'

export interface AuthenticatedUser {
  id: string
  email: string
  groups: string[]
  username: string
  given_name?: string
  family_name?: string
  picture?: string
}

export async function requireApprovedUser(event: RequestEvent): Promise<AuthenticatedUser> {
  const authHeader = event.request.headers.get('Authorization')
  const token = extractTokenFromHeader(authHeader)

  if (!token) {
    throw error(401, 'Authentication required')
  }

  let payload: CognitoJWTPayload
  try {
    payload = await verifyJWT(token)
  }
  catch {
    throw error(401, 'Invalid or expired token')
  }

  if (!isUserApproved(payload)) {
    throw error(403, 'Access denied. User is not in the ApprovedUsers group. (INSUFFICIENT_PERMISSIONS)')
  }

  return {
    id: payload.sub,
    email: payload.email,
    groups: payload['cognito:groups'] || [],
    username: payload['cognito:username'],
    given_name: payload.given_name,
    family_name: payload.family_name,
    picture: payload.picture,
  }
}

export async function getAuthenticatedUser(event: RequestEvent): Promise<AuthenticatedUser | null> {
  const authHeader = event.request.headers.get('Authorization')
  const token = extractTokenFromHeader(authHeader)

  if (!token)
    return null

  try {
    const payload = await verifyJWT(token)
    return {
      id: payload.sub,
      email: payload.email,
      groups: payload['cognito:groups'] || [],
      username: payload['cognito:username'],
      given_name: payload.given_name,
      family_name: payload.family_name,
      picture: payload.picture,
    }
  }
  catch (error) {
    console.warn('Failed to verify JWT:', error)
    return null
  }
}

export async function getOptionalUser(event: RequestEvent): Promise<AuthenticatedUser | null> {
  try {
    return await requireApprovedUser(event)
  }
  catch (err) {
    // Log configuration errors in development for debugging
    if (err instanceof Error && err.message.includes('not configured')) {
      console.warn('⚠️  Cognito authentication not configured:', err.message)
    }
    return null
  }
}

export async function isAuthenticated(event: RequestEvent): Promise<boolean> {
  const authHeader = event.request.headers.get('Authorization')
  const token = extractTokenFromHeader(authHeader)

  if (!token)
    return false

  try {
    await verifyJWT(token)
    return true
  }
  catch (error) {
    console.warn('Token verification failed in isAuthenticated:', error)
    return false
  }
}
