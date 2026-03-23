/**
 * HTTP response helpers
 */
import type { APIGatewayProxyResult } from 'aws-lambda'

/**
 * Get configured allowed origins.
 * Fails closed: requires explicit configuration, no permissive default.
 */
function getAllowedOrigins(): string {
  const origins = process.env.ALLOWED_ORIGINS

  if (!origins) {
    // In local development, allow wildcard if explicitly not set
    if (process.env.AWS_SAM_LOCAL === 'true' || process.env.NODE_ENV === 'test') {
      return '*'
    }
    console.error('CORS_CONFIG_ERROR: ALLOWED_ORIGINS environment variable is not set')
    // Fail closed: return empty string which will reject all cross-origin requests
    return ''
  }

  return origins
}

/**
 * Get CORS headers with the configured origin
 */
export function getCorsHeaders(requestOrigin?: string): Record<string, string> {
  const allowedOrigins = getAllowedOrigins()

  // If no origins configured, return restrictive headers (fail closed)
  if (!allowedOrigins) {
    return {
      'Content-Type': 'application/json',
      // No Access-Control-Allow-Origin header = browser will block cross-origin requests
    }
  }

  // If wildcard is explicitly configured (development only)
  if (allowedOrigins === '*') {
    // CORS spec: credentials not allowed with wildcard origin
    // If we have a request origin, echo it to allow credentials
    if (requestOrigin) {
      return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': requestOrigin,
        'Access-Control-Allow-Credentials': 'true',
        'Vary': 'Origin',
      }
    }
    // No origin provided - use wildcard without credentials
    return {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Vary': 'Origin',
    }
  }

  // Check if request origin is in allowed list
  const allowedList = allowedOrigins.split(',').map((o) => o.trim()).filter(Boolean)

  // If request origin matches allowed list, return it
  if (requestOrigin && allowedList.includes(requestOrigin)) {
    return {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': requestOrigin,
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin',
    }
  }

  // If no request origin provided but we have allowed origins, use the first one
  // This handles cases where origin header wasn't passed through the code
  if (!requestOrigin && allowedList.length > 0) {
    return {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowedList[0],
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin',
    }
  }

  // Request origin not in allowed list - fail closed (no CORS headers)
  return {
    'Content-Type': 'application/json',
  }
}

/**
 * Create a success response
 */
export function successResponse(
  data: unknown,
  statusCode = 200,
  requestOrigin?: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: getCorsHeaders(requestOrigin),
    body: JSON.stringify(data),
  }
}

/**
 * Create an error response
 */
export function errorResponse(
  statusCode: number,
  message: string,
  requestOrigin?: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: getCorsHeaders(requestOrigin),
    body: JSON.stringify({ error: message }),
  }
}

/**
 * Create a rate limit response
 */
export function rateLimitResponse(
  retryAfter: number,
  message: string,
  requestOrigin?: string
): APIGatewayProxyResult {
  return {
    statusCode: 429,
    headers: {
      ...getCorsHeaders(requestOrigin),
      'Retry-After': retryAfter.toString(),
    },
    body: JSON.stringify({ error: message }),
  }
}
