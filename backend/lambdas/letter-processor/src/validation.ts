/**
 * Validation utilities for Gemini response parsing
 */
import type { ParsedLetterData, GeminiLetterResponse } from './types'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DEFAULT_DATE = '1900-01-01'

/**
 * Get the number of days in a given month (handles leap years)
 */
function getDaysInMonth(year: number, month: number): number {
  // month is 1-indexed (1=Jan, 12=Dec)
  // Using day 0 of the next month gives the last day of the current month
  return new Date(year, month, 0).getDate()
}

/**
 * Validate a date string is in YYYY-MM-DD format with valid components.
 * Does component-level validation to reject dates like 2024-02-31.
 */
function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (!DATE_PATTERN.test(value)) return false

  // Parse components for validation
  const parts = value.split('-')
  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10)
  const day = parseInt(parts[2], 10)

  // Validate month range (1-12)
  if (month < 1 || month > 12) return false

  // Validate day range (1 to days in that month)
  const daysInMonth = getDaysInMonth(year, month)
  if (day < 1 || day > daysInMonth) return false

  return true
}

/**
 * Safely convert unknown value to string or null.
 * Named safeToString to avoid shadowing the global toString.
 */
function safeToString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.trim() || null
  return String(value)
}

/**
 * Safely convert unknown value to string array
 */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => item.length > 0)
}

/**
 * Validate and normalize Gemini response to ParsedLetterData
 *
 * Handles:
 * - Missing fields (uses null/defaults)
 * - Type coercion (numbers to strings)
 * - Field mapping (content -> transcription)
 * - Date format validation
 * - Array validation for tags
 */
export function validateAndNormalizeParsedData(
  raw: GeminiLetterResponse
): ParsedLetterData {
  // Validate and normalize date
  let date: string
  if (isValidDate(raw.date)) {
    date = raw.date
  } else if (typeof raw.date === 'string') {
    // Try to parse and reformat
    const parsed = new Date(raw.date)
    if (!isNaN(parsed.getTime())) {
      date = parsed.toISOString().split('T')[0]
    } else {
      console.warn(`Invalid date format: ${raw.date}, using default`)
      date = DEFAULT_DATE
    }
  } else {
    console.warn('Missing date, using default')
    date = DEFAULT_DATE
  }

  return {
    date,
    author: safeToString(raw.author),
    recipient: safeToString(raw.recipient),
    location: safeToString(raw.location),
    // Map 'content' from Gemini to both 'transcription' (legacy/internal) and 'content' (API/frontend)
    transcription: safeToString(raw.content),
    content: safeToString(raw.content),
    summary: safeToString(raw.summary),
    tags: toStringArray(raw.tags),
  }
}
