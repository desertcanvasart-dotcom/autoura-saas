// ============================================
// SHARED ANTHROPIC CLIENT WITH RETRY LOGIC
// ============================================
// Single source of truth for all Anthropic API calls.
// Handles 429 (rate limit) and 529 (overloaded) errors
// with exponential backoff + jitter.

import Anthropic from '@anthropic-ai/sdk'

// Singleton client instance
let _client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not configured')
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

// ============================================
// RETRY CONFIGURATION
// ============================================

interface RetryConfig {
  maxRetries: number      // Maximum number of retry attempts
  baseDelayMs: number     // Initial delay before first retry
  maxDelayMs: number      // Cap on exponential backoff
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,   // 1 second
  maxDelayMs: 15000,    // 15 seconds max
}

// Retryable HTTP status codes from Anthropic API
const RETRYABLE_STATUS_CODES = new Set([
  429, // Rate limited
  529, // Overloaded
  500, // Internal server error (transient)
  503, // Service unavailable
])

// ============================================
// RETRY WRAPPER
// ============================================

/**
 * Create a message with automatic retry on transient errors.
 * Retries on 429 (rate limit), 529 (overloaded), 500, and 503 errors.
 * Uses exponential backoff with jitter to avoid thundering herd.
 */
export async function createMessageWithRetry(
  params: Anthropic.MessageCreateParamsNonStreaming,
  config: Partial<RetryConfig> = {}
): Promise<Anthropic.Message> {
  const { maxRetries, baseDelayMs, maxDelayMs } = { ...DEFAULT_RETRY_CONFIG, ...config }
  const client = getAnthropicClient()

  let lastError: unknown = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const message = await client.messages.create(params)
      return message
    } catch (error: unknown) {
      lastError = error

      // Check if this is a retryable error
      const statusCode = getStatusCode(error)
      const isRetryable = statusCode !== null && RETRYABLE_STATUS_CODES.has(statusCode)

      if (!isRetryable || attempt === maxRetries) {
        // Not retryable or out of retries — throw immediately
        throw error
      }

      // Calculate delay with exponential backoff + jitter
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt)
      const jitter = Math.random() * baseDelayMs
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs)

      // Check for Retry-After header from API
      const retryAfterMs = getRetryAfterMs(error)
      const effectiveDelay = retryAfterMs ? Math.max(delay, retryAfterMs) : delay

      console.warn(
        `⚠️ Anthropic API ${statusCode} error (attempt ${attempt + 1}/${maxRetries + 1}). ` +
        `Retrying in ${Math.round(effectiveDelay)}ms...`
      )

      await sleep(effectiveDelay)
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError
}

// ============================================
// HELPERS
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Extract HTTP status code from Anthropic SDK error
 */
function getStatusCode(error: unknown): number | null {
  if (error && typeof error === 'object') {
    // Anthropic SDK errors have a `status` property
    if ('status' in error && typeof (error as any).status === 'number') {
      return (error as any).status
    }
    // Some errors embed it in error.error
    if ('error' in error && typeof (error as any).error === 'object') {
      const inner = (error as any).error
      if ('status' in inner && typeof inner.status === 'number') {
        return inner.status
      }
    }
  }
  return null
}

// ============================================
// USER-FRIENDLY ERROR MESSAGES
// ============================================

/**
 * Convert raw Anthropic SDK / API errors into human-readable messages.
 * Use this in route catch blocks so users never see raw JSON dumps.
 */
export function getUserFriendlyError(error: unknown): { message: string; status: number } {
  const statusCode = getStatusCode(error)

  // Log the raw error details for debugging (visible in server logs / Vercel)
  const rawMessage = error instanceof Error ? error.message : String(error)
  const rawBody = (error as any)?.error?.message || (error as any)?.message || ''
  console.error(`[AI Error] status=${statusCode} message="${rawMessage}" body="${rawBody}"`)

  // Check for billing/credit issues first — Anthropic may return these as 400 with
  // "credit balance is too low" in the message body, not always as 402
  if (statusCode === 402 || /credit.*(low|insufficient|balance)|billing|payment.*(required|failed)/i.test(rawBody + rawMessage)) {
    return { message: 'AI service billing issue — insufficient credits or payment required. Please check your Anthropic account.', status: 402 }
  }

  switch (statusCode) {
    case 429:
      return { message: 'AI service rate limit reached. Please wait a moment and try again.', status: 429 }
    case 529:
      return { message: 'AI service is temporarily busy. Please try again in a moment.', status: 503 }
    case 500:
      return { message: 'AI service encountered an internal error. Please try again.', status: 502 }
    case 503:
      return { message: 'AI service is temporarily unavailable. Please try again shortly.', status: 503 }
    case 401:
      return { message: 'AI service authentication failed. Please contact support.', status: 500 }
    case 400:
      return { message: 'The request was too large or malformed for the AI service. Try shortening the input.', status: 400 }
  }

  // Check for missing API key (thrown by getAnthropicClient)
  if (error instanceof Error && error.message === 'ANTHROPIC_API_KEY is not configured') {
    return { message: 'AI service is not configured. Please contact support.', status: 500 }
  }

  // Fallback
  return { message: 'An unexpected error occurred. Please try again.', status: 500 }
}

/**
 * Extract Retry-After header value as milliseconds
 */
function getRetryAfterMs(error: unknown): number | null {
  if (error && typeof error === 'object' && 'headers' in error) {
    const headers = (error as any).headers
    if (headers && typeof headers === 'object') {
      const retryAfter = headers['retry-after'] || headers['Retry-After']
      if (retryAfter) {
        const seconds = parseFloat(retryAfter)
        if (!isNaN(seconds)) {
          return seconds * 1000
        }
      }
    }
  }
  return null
}
