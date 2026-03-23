/**
 * Structured logging utilities with correlation ID support
 */
import { randomUUID } from 'crypto'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  correlationId?: string
  data?: unknown
}

// Module-level state is safe in AWS Lambda: each execution environment processes
// one request at a time (even with Provisioned Concurrency). If this code is ever
// deployed as a long-running server (ECS/Fargate), migrate to AsyncLocalStorage.
// See: ADR-5 in docs/plans/2026-03-23-audit-document-ai/Phase-0.md
let currentCorrelationId: string | undefined

/**
 * Set the correlation ID for the current request.
 * Should be called at the start of each request handler.
 */
export function setCorrelationId(id: string | undefined): void {
  currentCorrelationId = id
}

/**
 * Get the current correlation ID.
 */
export function getCorrelationId(): string | undefined {
  return currentCorrelationId
}

/**
 * Extract correlation ID from AWS trace ID header or generate a new one.
 * The X-Amzn-Trace-Id header format is: Root=1-xxx;Parent=xxx;Sampled=1
 */
export function extractCorrelationId(traceIdHeader?: string): string {
  if (traceIdHeader) {
    // Extract the Root portion which is unique per request
    const rootMatch = traceIdHeader.match(/Root=([^;]+)/)
    if (rootMatch) {
      return rootMatch[1]
    }
    // If no Root, use the whole header
    return traceIdHeader
  }
  // Generate a new UUID if no trace header
  return randomUUID()
}

function formatLog(level: LogLevel, message: string, data?: unknown): string {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
  }

  if (currentCorrelationId) {
    entry.correlationId = currentCorrelationId
  }

  if (data !== undefined) {
    entry.data = data
  }

  return JSON.stringify(entry)
}

export const log = {
  debug(message: string, data?: unknown): void {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(formatLog('debug', message, data))
    }
  },

  info(message: string, data?: unknown): void {
    console.log(formatLog('info', message, data))
  },

  warn(message: string, data?: unknown): void {
    console.warn(formatLog('warn', message, data))
  },

  error(message: string, data?: unknown): void {
    console.error(formatLog('error', message, data))
  },
}
