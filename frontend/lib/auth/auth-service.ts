import type { AuthTokens, User } from './auth-store'
import { get } from 'svelte/store'
import { authStore } from './auth-store'
import { cognitoAuth } from './cognito-client'
import { cognitoConfig } from './cognito-config'
import { decodeJWTPayload } from './jwt-decode'

/**
 * Maps a decoded JWT payload to a User object.
 * Centralizes the mapping to avoid duplication across auth flows.
 */
function mapJwtPayloadToUser(payload: Record<string, unknown>): User {
  return {
    'email': payload.email as string,
    'sub': payload.sub as string,
    'email_verified': payload.email_verified as boolean,
    'name': payload.name as string | undefined,
    'given_name': payload.given_name as string | undefined,
    'family_name': payload.family_name as string | undefined,
    'picture': payload.picture as string | undefined,
    'locale': payload.locale as string | undefined,
    'cognito:username': payload['cognito:username'] as string | undefined,
    'cognito:groups': payload['cognito:groups'] as string[] | string | undefined,
    'identities': payload.identities as string | undefined,
    'aud': payload.aud as string | undefined,
    'iss': payload.iss as string | undefined,
    'token_use': payload.token_use as string | undefined,
    'auth_time': payload.auth_time as number | undefined,
    'exp': payload.exp as number | undefined,
    'iat': payload.iat as number | undefined,
  }
}

export class AuthService {
  private refreshTimer: NodeJS.Timeout | null = null

  async signIn(email: string, password: string): Promise<{
    success: true
    user: User
    tokens: AuthTokens
  } | {
    success: false
    challengeName: 'NEW_PASSWORD_REQUIRED'
    session: string
    email: string
  }> {
    authStore.setLoading(true)

    try {
      const result = await cognitoAuth.signIn(email, password)

      if (!result.success) {
        throw result.error
      }

      // Check for NEW_PASSWORD_REQUIRED challenge (first login with temp password)
      if (result.data?.ChallengeName === 'NEW_PASSWORD_REQUIRED' && result.data?.Session) {
        authStore.setLoading(false)
        return {
          success: false,
          challengeName: 'NEW_PASSWORD_REQUIRED',
          session: result.data.Session,
          email,
        }
      }

      const authResult = result.data?.AuthenticationResult
      if (!authResult?.AccessToken || !authResult?.IdToken || !authResult?.RefreshToken) {
        throw new Error('Invalid authentication response')
      }

      // Decode the ID token to get user info
      const idTokenPayload = decodeJWTPayload(authResult.IdToken)
      if (!idTokenPayload) {
        throw new Error('Invalid ID token')
      }

      const user = mapJwtPayloadToUser(idTokenPayload)

      const tokens: AuthTokens = {
        accessToken: authResult.AccessToken,
        idToken: authResult.IdToken,
        refreshToken: authResult.RefreshToken,
        expiresAt: Date.now() + (authResult.ExpiresIn || 3600) * 1000,
      }

      authStore.setAuthenticated(user, tokens)
      this.scheduleTokenRefresh(tokens.expiresAt)

      return { success: true, user, tokens }
    }
    catch (error) {
      console.error('Sign in error:', error)
      authStore.clearAuth()
      throw error
    }
    finally {
      authStore.setLoading(false)
    }
  }

  async refreshTokens() {
    const currentState = get(authStore)

    if (!currentState.tokens?.refreshToken) {
      throw new Error('No refresh token available')
    }

    try {
      const result = await cognitoAuth.refreshToken(currentState.tokens.refreshToken)

      if (!result.success) {
        throw result.error
      }

      const authResult = result.data?.AuthenticationResult
      if (!authResult?.AccessToken || !authResult?.IdToken) {
        throw new Error('Invalid refresh response')
      }

      const newTokens: AuthTokens = {
        accessToken: authResult.AccessToken,
        idToken: authResult.IdToken,
        refreshToken: currentState.tokens.refreshToken, // Refresh token stays the same
        expiresAt: Date.now() + (authResult.ExpiresIn || 3600) * 1000,
      }

      authStore.updateTokens(newTokens)
      this.scheduleTokenRefresh(newTokens.expiresAt)

      return newTokens
    }
    catch (error) {
      console.error('Token refresh error:', error)
      this.signOut()
      throw error
    }
  }

  async signOut() {
    const currentState = get(authStore)

    if (currentState.tokens?.accessToken) {
      try {
        await cognitoAuth.signOut(currentState.tokens.accessToken)
      }
      catch (error) {
        console.error('Sign out error:', error)
      }
    }

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }

    authStore.clearAuth()
  }

  private scheduleTokenRefresh(expiresAt: number) {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
    }

    // Refresh 5 minutes before expiration
    const refreshTime = expiresAt - Date.now() - 5 * 60 * 1000

    if (refreshTime > 0) {
      this.refreshTimer = setTimeout(() => {
        this.refreshTokens().catch(console.error)
      }, refreshTime)
    }
  }

  async getValidAccessToken(): Promise<string | null> {
    const currentState = get(authStore)

    if (!currentState.tokens) {
      return null
    }

    if (currentState.tokens.expiresAt - Date.now() < 5 * 60 * 1000) {
      try {
        const newTokens = await this.refreshTokens()
        return newTokens.accessToken
      }
      catch {
        return null
      }
    }

    return currentState.tokens.accessToken
  }

  async signInAsGuest() {
    const { guestEmail, guestPassword } = cognitoConfig
    if (!guestEmail || !guestPassword) {
      throw new Error('Guest login not configured')
    }
    return this.signIn(guestEmail, guestPassword)
  }

  async completeNewPasswordChallenge(email: string, newPassword: string, session: string) {
    authStore.setLoading(true)

    try {
      const result = await cognitoAuth.respondToNewPasswordChallenge(email, newPassword, session)

      if (!result.success) {
        throw result.error
      }

      const authResult = result.data?.AuthenticationResult
      if (!authResult?.AccessToken || !authResult?.IdToken || !authResult?.RefreshToken) {
        throw new Error('Invalid authentication response')
      }

      const idTokenPayload = decodeJWTPayload(authResult.IdToken)
      if (!idTokenPayload) {
        throw new Error('Invalid ID token')
      }

      const user = mapJwtPayloadToUser(idTokenPayload)

      const tokens: AuthTokens = {
        accessToken: authResult.AccessToken,
        idToken: authResult.IdToken,
        refreshToken: authResult.RefreshToken,
        expiresAt: Date.now() + (authResult.ExpiresIn || 3600) * 1000,
      }

      authStore.setAuthenticated(user, tokens)
      this.scheduleTokenRefresh(tokens.expiresAt)

      return { success: true, user, tokens }
    }
    catch (error) {
      console.error('Complete new password challenge error:', error)
      throw error
    }
    finally {
      authStore.setLoading(false)
    }
  }

  async forgotPassword(email: string) {
    try {
      const result = await cognitoAuth.forgotPassword(email)
      if (!result.success) {
        throw result.error
      }
      return { success: true, deliveryMedium: result.data?.CodeDeliveryDetails?.DeliveryMedium }
    }
    catch (error) {
      console.error('Forgot password error:', error)
      throw error
    }
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    try {
      const result = await cognitoAuth.confirmForgotPassword(email, code, newPassword)
      if (!result.success) {
        throw result.error
      }
      return { success: true }
    }
    catch (error) {
      console.error('Reset password error:', error)
      throw error
    }
  }
}

export const authService = new AuthService()
