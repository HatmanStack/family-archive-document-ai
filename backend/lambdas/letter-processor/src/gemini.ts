/**
 * Gemini AI integration for letter parsing
 */
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ParsedLetterData, GeminiLetterResponse } from './types'
import { validateAndNormalizeParsedData } from './validation'
import { getGeminiApiKey, getGeminiModel } from './lib/config'
import {
  withRetry,
  isTransientError,
  TimeoutError,
  MaxRetriesExceededError,
} from './lib/retry'

// Retry configuration for Gemini API calls
const GEMINI_RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 8000,
  backoffMultiplier: 2,
  timeoutMs: 50000, // 50 second timeout per attempt (3 attempts + backoff fits within 180s Lambda timeout)
  isRetryable: isTransientError,
  onRetry: (attempt: number, error: unknown, delayMs: number) => {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.warn(
      `Gemini API attempt ${attempt} failed: ${errorMsg}. ` +
        `Retrying in ${delayMs}ms...`
    )
  },
}

/**
 * Parse a letter PDF using Gemini AI
 *
 * Extracts structured data including date, author, recipient, location,
 * full transcription, summary, and topic tags.
 *
 * Includes retry logic with exponential backoff for transient failures
 * and a 50-second timeout per attempt.
 */
export async function parseLetter(pdfBuffer: Buffer): Promise<ParsedLetterData> {
  const apiKey = getGeminiApiKey()
  const modelName = getGeminiModel()

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: modelName })

  const prompt = `
    Analyze this family letter (PDF or image). Your goal is to provide a high-fidelity transcription and structured metadata.

    INSTRUCTIONS:
    1. CONTENT: Perform a full, verbatim transcription of the letter's text.
       - Preserve paragraphs and line breaks where they appear intentional.
       - If text is handwritten and difficult to read, do your best to transcribe it accurately.
       - Do not summarize the content field; it must be the full text.

    2. METADATA: Extract the following fields:
       - date: YYYY-MM-DD format. If only a year is mentioned, use YYYY-01-01. If unknown, use 1900-01-01.
       - author: The name of the person who wrote/sent the letter.
       - recipient: The name of the person to whom the letter is addressed.
       - location: The origin city/state/country mentioned in the letterhead or text.
       - summary: A brief 2-3 sentence overview of the letter's main themes or events.
       - tags: An array of 3-5 keywords or topics (e.g., "World War II", "Graduation", "Travel").

    3. FORMAT: Return ONLY a valid JSON object with the following keys:
       "date", "author", "recipient", "location", "content", "summary", "tags".

    Do not include any markdown formatting (like \`\`\`json) or explanatory text in your response.
  `

  const parts = [
    prompt,
    {
      inlineData: {
        data: Buffer.from(pdfBuffer).toString('base64'),
        mimeType: 'application/pdf',
      },
    },
  ]

  try {
    const rawData = await withRetry(async () => {
      const result = await model.generateContent(parts)
      const response = await result.response
      const text = response.text()

      // Clean up code blocks if present
      const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim()

      return JSON.parse(jsonStr) as GeminiLetterResponse
    }, GEMINI_RETRY_CONFIG)

    return validateAndNormalizeParsedData(rawData)
  } catch (err) {
    // Provide clear error messages for different failure modes
    if (err instanceof TimeoutError) {
      console.error('Gemini API timed out after multiple attempts')
      throw new Error(
        'Letter parsing timed out. The document may be too complex or the service is slow. ' +
          'Please try again later.'
      )
    }

    if (err instanceof MaxRetriesExceededError) {
      console.error(
        `Gemini API failed after ${err.attempts} attempts:`,
        err.lastError
      )
      throw new Error(
        'Letter parsing failed after multiple attempts. ' +
          'Please try again later or contact support if the issue persists.'
      )
    }

    console.error('Gemini processing failed:', err)
    throw err
  }
}
