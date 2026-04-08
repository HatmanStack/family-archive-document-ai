/**
 * Safely convert an unknown thrown value to an Error.
 *
 * Mirrors backend/lambdas/api/src/lib/errors.ts:toError so the
 * letter-processor can avoid `(error as Error)` casts.
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) return error
  if (typeof error === 'string') return new Error(error)
  if (error === null) return new Error('An error occurred (null)')
  if (error === undefined) return new Error('An error occurred (undefined)')
  if (
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    const err = new Error((error as { message: string }).message)
    Object.assign(err, error)
    return err
  }
  if (typeof error === 'object') {
    try {
      return new Error(JSON.stringify(error))
    } catch {
      return new Error(String(error))
    }
  }
  return new Error(String(error))
}
