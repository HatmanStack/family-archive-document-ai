import type { AuthTokens, User } from './auth-store'
import { authStore } from './auth-store'
import { cognitoConfig } from './cognito-config'
import { decodeJWTPayload } from './jwt-decode'

export class GoogleOAuthService {
  private getHostedUIUrl(): string {
    const baseUrl = cognitoConfig.hostedUIUrl
      || `https://${cognitoConfig.hostedUIDomain}.auth.${cognitoConfig.region}.amazoncognito.com`

    return baseUrl
  }

  // Generate Google OAuth login URL
  getGoogleLoginUrl(redirectUri?: string): string {
    const baseUrl = this.getHostedUIUrl()
    const redirect = redirectUri || `${window.location.origin}/auth/callback`

    const params = new URLSearchParams({
      identity_provider: 'Google',
      redirect_uri: redirect,
      response_type: 'code',
      client_id: cognitoConfig.userPoolWebClientId,
      scope: 'email openid profile',
    })

    return `${baseUrl}/oauth2/authorize?${params.toString()}`
  }

  // Generate logout URL
  getLogoutUrl(redirectUri?: string): string {
    const baseUrl = this.getHostedUIUrl()
    const redirect = redirectUri || `${window.location.origin}/auth/logout`

    const params = new URLSearchParams({
      client_id: cognitoConfig.userPoolWebClientId,
      logout_uri: redirect,
    })

    return `${baseUrl}/logout?${params.toString()}`
  }

  // Exchange authorization code for tokens
  async exchangeCodeForTokens(code: string, redirectUri?: string): Promise<{ success: boolean, tokens?: AuthTokens, error?: Error }> {
    const baseUrl = this.getHostedUIUrl()
    const redirect = redirectUri || `${window.location.origin}/auth/callback`

    try {
      const response = await fetch(`${baseUrl}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: cognitoConfig.userPoolWebClientId,
          code,
          redirect_uri: redirect,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Token exchange failed: ${errorText}`)
      }

      const tokenData = await response.json()

      const tokens: AuthTokens = {
        accessToken: tokenData.access_token,
        idToken: tokenData.id_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
      }

      return { success: true, tokens }
    }
    catch (error) {
      return { success: false, error: error as Error }
    }
  }

  async handleOAuthCallback(code: string, redirectUri?: string): Promise<{ success: boolean, user?: User, error?: Error }> {
    authStore.setLoading(true)

    try {
      const tokenResult = await this.exchangeCodeForTokens(code, redirectUri)

      if (!tokenResult.success || !tokenResult.tokens) {
        throw tokenResult.error || new Error('Failed to exchange code for tokens')
      }

      // Decode the ID token to get user info
      const idTokenPayload = decodeJWTPayload(tokenResult.tokens.idToken)
      if (!idTokenPayload) {
        throw new Error('Invalid ID token')
      }

      const user: User = {
        'email': idTokenPayload.email as string,
        'sub': idTokenPayload.sub as string,
        'email_verified': idTokenPayload.email_verified as boolean,
        'given_name': idTokenPayload.given_name as string | undefined,
        'family_name': idTokenPayload.family_name as string | undefined,
        'picture': idTokenPayload.picture as string | undefined,
        'cognito:username': idTokenPayload['cognito:username'] as string | undefined,
        'cognito:groups': idTokenPayload['cognito:groups'] as string[] | string | undefined,
        'identities': idTokenPayload.identities as string | undefined,
        'name': idTokenPayload.name as string | undefined,
        'locale': idTokenPayload.locale as string | undefined,
        'aud': idTokenPayload.aud as string | undefined,
        'iss': idTokenPayload.iss as string | undefined,
        'token_use': idTokenPayload.token_use as string | undefined,
        'auth_time': idTokenPayload.auth_time as number | undefined,
        'exp': idTokenPayload.exp as number | undefined,
        'iat': idTokenPayload.iat as number | undefined,
      }

      authStore.setAuthenticated(user, tokenResult.tokens)

      return { success: true, user }
    }
    catch (error) {
      authStore.clearAuth()
      return { success: false, error: error as Error }
    }
    finally {
      authStore.setLoading(false)
    }
  }

  // Initiate Google OAuth login
  loginWithGoogle(redirectUri?: string): void {
    const loginUrl = this.getGoogleLoginUrl(redirectUri)
    window.location.href = loginUrl
  }

  // Logout via hosted UI
  logoutViaHostedUI(redirectUri?: string): void {
    const logoutUrl = this.getLogoutUrl(redirectUri)
    window.location.href = logoutUrl
  }
}

export const googleOAuth = new GoogleOAuthService()
