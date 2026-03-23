/**
 * Shared JWT payload decoder for frontend auth modules.
 * Handles base64url decoding and URI-safe character mapping.
 */
export function decodeJWTPayload(token: string): Record<string, unknown> | null {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`)
        .join(''),
    )
    return JSON.parse(jsonPayload)
  }
  catch {
    return null
  }
}
