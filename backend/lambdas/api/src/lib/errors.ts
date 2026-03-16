/**
 * Error handling utilities
 *
 * Provides typed error classes and safe error conversion utilities
 * to handle unknown throws in catch blocks.
 */

/**
 * Base class for application errors with HTTP status codes
 */
export class AppError extends Error {
  public readonly statusCode: number
  public readonly isOperational: boolean

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.isOperational = isOperational
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * 400 Bad Request - Invalid input from client
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400)
  }
}

/**
 * 401 Unauthorized - Missing or invalid authentication
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401)
  }
}

/**
 * 403 Forbidden - Authenticated but not authorized
 */
export class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403)
  }
}

/**
 * 404 Not Found - Resource does not exist
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404)
  }
}

/**
 * 409 Conflict - Resource state conflict
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409)
  }
}

/**
 * 429 Too Many Requests - Rate limited
 */
export class RateLimitError extends AppError {
  public readonly retryAfter: number

  constructor(message: string, retryAfter: number) {
    super(message, 429)
    this.retryAfter = retryAfter
  }
}

/**
 * 500 Internal Server Error - Unexpected error
 */
export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred') {
    super(message, 500, false)
  }
}

/**
 * 500 Database Error - DynamoDB operation failed
 */
export class DatabaseError extends AppError {
  constructor(message: string) {
    super(message, 500, false)
  }
}

/**
 * Safely convert an unknown thrown value to an Error object.
 *
 * JavaScript allows throwing any value (string, null, object, etc.),
 * so catch blocks receive `unknown`. This utility safely converts
 * any thrown value to a proper Error object.
 *
 * @param error - The unknown value caught in a catch block
 * @returns A proper Error object
 *
 * @example
 * ```typescript
 * try {
 *   await someOperation()
 * } catch (error) {
 *   const err = toError(error)
 *   log.error('operation_failed', { error: err.message, stack: err.stack })
 * }
 * ```
 */
export function toError(error: unknown): Error {
  // Already an Error - return as-is
  if (error instanceof Error) {
    return error
  }

  // String - wrap in Error
  if (typeof error === 'string') {
    return new Error(error)
  }

  // null or undefined
  if (error === null) {
    return new Error('An error occurred (null)')
  }

  if (error === undefined) {
    return new Error('An error occurred (undefined)')
  }

  // Object with message property
  if (
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    const err = new Error((error as { message: string }).message)
    // Copy over any additional properties
    Object.assign(err, error)
    return err
  }

  // Other objects - try to stringify
  if (typeof error === 'object') {
    try {
      return new Error(JSON.stringify(error))
    } catch {
      return new Error(String(error))
    }
  }

  // Primitive values
  return new Error(String(error))
}

/**
 * Get the HTTP status code for an error.
 * Returns 500 for non-AppError errors.
 */
export function getStatusCode(error: unknown): number {
  if (error instanceof AppError) {
    return error.statusCode
  }
  return 500
}

/**
 * Get a user-safe error message.
 * For operational errors, returns the error message.
 * For non-operational errors, returns a generic message.
 */
export function getUserMessage(error: unknown): string {
  if (error instanceof AppError && error.isOperational) {
    return error.message
  }
  return 'An unexpected error occurred'
}

/**
 * Type guard for errors with a name property (AWS SDK errors)
 */
export function isAwsError(error: unknown): error is Error & { name: string } {
  return error instanceof Error && typeof error.name === 'string'
}

/**
 * Type guard to check if an error has a specific name.
 * Useful for checking AWS SDK error types without unsafe casts.
 */
export function hasErrorName(error: unknown, name: string): boolean {
  return isAwsError(error) && error.name === name
}

/**
 * Check if an error is a DynamoDB conditional check failure
 */
export function isConditionalCheckFailed(error: unknown): boolean {
  return hasErrorName(error, 'ConditionalCheckFailedException')
}
