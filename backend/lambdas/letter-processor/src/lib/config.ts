/**
 * Configuration validation for letter-processor Lambda
 *
 * Validates required environment variables at startup (fail fast).
 * Logs warnings for suspicious configurations.
 */

interface Config {
  geminiApiKey: string
  geminiModel: string
  tableName: string
  archiveBucket: string
}

// Placeholder patterns that indicate misconfiguration
const PLACEHOLDER_PATTERNS = [
  /^your[-_]?api[-_]?key/i,
  /^test[-_]?key/i,
  /^placeholder/i,
  /^xxx+$/i,
  /^TODO/i,
  /^REPLACE/i,
]

/**
 * Check if a value looks like a placeholder rather than a real API key
 */
function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value))
}

/**
 * Validate Gemini API key format
 * Real Gemini API keys are typically 39 characters starting with 'AI'
 */
function validateGeminiApiKey(key: string): void {
  if (!key) {
    throw new Error(
      'GEMINI_API_KEY environment variable is not set. ' +
        'This is required for letter parsing functionality.'
    )
  }

  if (isPlaceholder(key)) {
    console.warn(
      'CONFIG_WARNING: GEMINI_API_KEY appears to be a placeholder value. ' +
        'Letter parsing will likely fail.'
    )
  }

  // Gemini API keys typically start with 'AI' and are 39 chars
  // Log warning if it doesn't match expected format
  if (key.length < 20) {
    console.warn(
      'CONFIG_WARNING: GEMINI_API_KEY appears unusually short. ' +
        'Expected ~39 characters for a valid Gemini API key.'
    )
  }
}

/**
 * Load and validate configuration from environment variables.
 * Called at module load time to fail fast on misconfiguration.
 */
function loadConfig(): Config {
  const geminiApiKey = process.env.GEMINI_API_KEY || ''
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview'
  const tableName = process.env.TABLE_NAME || ''
  const archiveBucket = process.env.ARCHIVE_BUCKET || ''

  // Validate required variables
  if (!tableName) {
    throw new Error('TABLE_NAME environment variable is not set')
  }

  if (!archiveBucket) {
    throw new Error('ARCHIVE_BUCKET environment variable is not set')
  }

  // Validate API key (may be missing in test environments)
  if (process.env.NODE_ENV !== 'test') {
    validateGeminiApiKey(geminiApiKey)
  }

  return {
    geminiApiKey,
    geminiModel,
    tableName,
    archiveBucket,
  }
}

// Load config at module initialization (fail fast)
export const config = loadConfig()

/**
 * Get the Gemini API key, throwing if not configured
 */
export function getGeminiApiKey(): string {
  if (!config.geminiApiKey) {
    throw new Error('Gemini API key is not configured')
  }
  return config.geminiApiKey
}

/**
 * Get the Gemini model name
 */
export function getGeminiModel(): string {
  return config.geminiModel
}
