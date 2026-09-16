// ============================================
// CLAUDE MODEL — the one place it is named
// ============================================
// `claude-sonnet-4-20250514` was hard-coded in ~15 places. When Anthropic
// retired it (404 not_found, 2026-09-16) every AI feature failed at once, and
// replacing it meant finding them all. Name the model here and nowhere else —
// lib/__tests__/anthropic-single-client.test.ts fails on any other literal.
//
// No imports: the prompt-library page (a client component) reads the options,
// and must not pull the Anthropic SDK into the browser bundle.

export const CLAUDE_MODEL = 'claude-sonnet-5'

/** The WhatsApp agent and copilot honour WHATSAPP_AI_MODEL when it is set. */
export function whatsappModel(): string {
  return process.env.WHATSAPP_AI_MODEL || CLAUDE_MODEL
}

/** Choices offered in the prompt library. */
export const CLAUDE_MODEL_OPTIONS = [
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
  { value: 'claude-opus-5', label: 'Claude Opus 5' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
] as const
