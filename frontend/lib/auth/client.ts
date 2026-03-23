import { browser } from '$app/environment'
import {
  PUBLIC_AWS_REGION,
  PUBLIC_COGNITO_USER_POOL_CLIENT_ID,
  PUBLIC_COGNITO_USER_POOL_ID,
} from '$env/static/public'
import { authStore } from './auth-store'
import { decodeJWTPayload } from './jwt-decode'

export interface CognitoTokens {
  idToken: string
  accessToken: string
  refreshToken: string
}

export interface UserInfo {
  id: string
  email: string
  username: string
  groups: string[]
  given_name?: string
  family_name?: string
  picture?: string
}

export function getStoredTokens(): CognitoTokens | null {
  if (!browser)
    return null

  try {
    const idToken = localStorage.getItem('cognito_id_token')
    const accessToken = localStorage.getItem('cognito_access_token')
    const refreshToken = localStorage.getItem('cognito_refresh_token')

    if (!idToken || !accessToken || !refreshToken)
      return null

    return { idToken, accessToken, refreshToken }
  }
  catch (error) {
    console.warn('Failed to get stored tokens:', error)
    return null
  }
}

export function storeTokens(tokens: CognitoTokens): void {
  if (!browser)
    return

  localStorage.setItem('cognito_id_token', tokens.idToken)
  localStorage.setItem('cognito_access_token', tokens.accessToken)
  localStorage.setItem('cognito_refresh_token', tokens.refreshToken)
}

export function clearTokens(): void {
  if (!browser)
    return

  localStorage.removeItem('cognito_id_token')
  localStorage.removeItem('cognito_access_token')
  localStorage.removeItem('cognito_refresh_token')
}

export { decodeJWTPayload } from './jwt-decode'

export function getUserInfo(): UserInfo | null {
  const tokens = getStoredTokens()
  if (!tokens)
    return null

  const payload = decodeJWTPayload(tokens.idToken)
  if (!payload)
    return null

  return {
    id: payload.sub as string,
    email: payload.email as string,
    username: payload['cognito:username'] as string,
    groups: (payload['cognito:groups'] as string[]) || [],
    given_name: payload.given_name as string | undefined,
    family_name: payload.family_name as string | undefined,
    picture: payload.picture as string | undefined,
  }
}

export function isUserApproved(): boolean {
  const userInfo = getUserInfo()
  return userInfo?.groups.includes('ApprovedUsers') ?? false
}

export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const tokens = getStoredTokens()
  if (!tokens) {
    throw new Error('No authentication tokens available')
  }

  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${tokens.idToken}`)

  return fetch(url, {
    ...options,
    headers,
  })
}

export async function refreshSession(): Promise<void> {
  const tokens = getStoredTokens()
  if (!tokens?.refreshToken) {
    throw new Error('No refresh token available')
  }

  const domain = `${PUBLIC_COGNITO_USER_POOL_ID.split('_')[0]}-${PUBLIC_COGNITO_USER_POOL_ID.split('_')[1]}`
  const tokenEndpoint = `https://${domain}.auth.${PUBLIC_AWS_REGION}.amazoncognito.com/oauth2/token`

  try {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: PUBLIC_COGNITO_USER_POOL_CLIENT_ID,
        refresh_token: tokens.refreshToken,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to refresh token')
    }

    const data = await response.json()

    // Update tokens in localStorage and auth store
    const newTokens: CognitoTokens = {
      idToken: data.id_token,
      accessToken: data.access_token,
      refreshToken: tokens.refreshToken, // Keep existing refresh token
    }

    storeTokens(newTokens)

    // Update auth store with new tokens and user info
    const userInfo = getUserInfo()
    if (userInfo) {
      // Convert UserInfo to User type
      const user = {
        ...userInfo,
        sub: userInfo.id,
        email_verified: true, // Assume verified for authenticated users
      }
      // Convert CognitoTokens to AuthTokens
      const authTokens = {
        accessToken: newTokens.accessToken,
        idToken: newTokens.idToken,
        refreshToken: newTokens.refreshToken,
        expiresAt: Date.now() + 3600 * 1000, // Default 1 hour expiry
      }
      authStore.setAuthenticated(user, authTokens)
    }
  }
  catch (error) {
    console.error('Token refresh failed:', error)
    // Clear tokens and auth store on refresh failure
    clearTokens()
    authStore.clearAuth()
    throw error
  }
}
