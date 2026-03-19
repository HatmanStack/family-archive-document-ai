import type { JWTPayload } from 'jose'
import {
  PUBLIC_AWS_REGION,
  PUBLIC_COGNITO_USER_POOL_ID,
} from '$env/static/public'
import { createRemoteJWKSet, jwtVerify } from 'jose'

// Check if Cognito is configured
const isCognitoConfigured = PUBLIC_COGNITO_USER_POOL_ID && PUBLIC_AWS_REGION

// Cognito JWT issuer URL
const COGNITO_ISSUER = isCognitoConfigured
  ? `https://cognito-idp.${PUBLIC_AWS_REGION}.amazonaws.com/${PUBLIC_COGNITO_USER_POOL_ID}`
  : null

// Create JWKS (JSON Web Key Set) for token verification
const JWKS = isCognitoConfigured && COGNITO_ISSUER
  ? createRemoteJWKSet(new URL(`${COGNITO_ISSUER}/.well-known/jwks.json`))
  : null

export interface CognitoJWTPayload extends JWTPayload {
  'sub': string
  'email': string
  'email_verified': boolean
  'cognito:groups'?: string[]
  'cognito:username': string
  'given_name'?: string
  'family_name'?: string
  'picture'?: string
  'token_use': 'id' | 'access'
}

export async function verifyJWT(token: string): Promise<CognitoJWTPayload> {
  if (!isCognitoConfigured || !JWKS || !COGNITO_ISSUER) {
    throw new Error('Cognito authentication is not configured. Please set PUBLIC_COGNITO_USER_POOL_ID and PUBLIC_AWS_REGION environment variables.')
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: COGNITO_ISSUER,
      audience: undefined, // Cognito doesn't use audience claim for ID tokens
    })

    return payload as CognitoJWTPayload
  }
  catch (error) {
    throw new Error(`JWT verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export function isUserApproved(payload: CognitoJWTPayload): boolean {
  const groups = payload['cognito:groups'] || []
  return groups.includes('ApprovedUsers')
}

export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader)
    return null

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer')
    return null

  return parts[1]
}
