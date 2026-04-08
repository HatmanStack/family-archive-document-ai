/**
 * Path utility helpers shared across the API Lambda.
 */

/**
 * Strip the leading `/v1` version prefix from a request path or resource string.
 * Returns `/` for empty results to keep downstream matching simple.
 */
export function stripVersionPrefix(input: string | undefined | null): string {
  if (!input) return '/'
  return input.replace(/^\/v1(?=\/|$)/, '') || '/'
}
