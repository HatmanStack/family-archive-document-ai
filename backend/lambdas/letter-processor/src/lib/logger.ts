/**
 * Structured logging for the letter-processor lambda.
 *
 * Mirrors backend/lambdas/api/src/lib/logger.ts but without correlation ID
 * plumbing (the processor is invoked async, not via API Gateway).
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  data?: unknown
}

function format(level: LogLevel, message: string, data?: unknown): string {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
  }
  if (data !== undefined) entry.data = data
  return JSON.stringify(entry)
}

export const log = {
  debug(message: string, data?: unknown): void {
    if (process.env.LOG_LEVEL === 'debug') console.log(format('debug', message, data))
  },
  info(message: string, data?: unknown): void {
    console.log(format('info', message, data))
  },
  warn(message: string, data?: unknown): void {
    console.warn(format('warn', message, data))
  },
  error(message: string, data?: unknown): void {
    console.error(format('error', message, data))
  },
}
