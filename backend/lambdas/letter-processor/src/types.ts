/**
 * Type definitions for letter-processor Lambda
 */

export interface FileInput {
  buffer: Buffer
  type: string
}

export interface ParsedLetterData {
  date: string
  author: string | null
  recipient: string | null
  location: string | null
  transcription: string | null
  content: string | null
  summary: string | null
  tags: string[]
}

/**
 * Raw response from Gemini (uses 'content' not 'transcription')
 */
export interface GeminiLetterResponse {
  date?: unknown
  author?: unknown
  recipient?: unknown
  location?: unknown
  content?: unknown
  summary?: unknown
  tags?: unknown
}

export interface ProcessorEvent {
  uploadId: string
  requesterId?: string
}

export interface ProcessorResult {
  status: 'success' | 'error'
  uploadId: string
  error?: string
}
