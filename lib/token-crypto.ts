// ============================================
// Gmail OAuth tokens, encrypted at rest
// ============================================
// A refresh token reads and sends the user's mail for as long as it lives;
// they were stored in plain text (migration 273 only hid the columns from the
// browser). With TOKEN_ENCRYPTION_KEY set, tokens are sealed with AES-256-GCM
// when written and opened where they are used (lib/gmail.ts and the few
// routes that build their own Google client).
//
// Backward compatible both ways: a plain-text value (written before the key
// was set) is read as is, and is sealed on its next refresh; with no key,
// nothing is sealed. Losing the key means every mailbox must reconnect — keep
// it with the other secrets.

import crypto from 'crypto'

const PREFIX = 'enc:v1:'

function key(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY
  if (!raw || raw.trim().length < 16) return null
  // Any sufficiently long secret: hashed to exactly 32 bytes.
  return crypto.createHash('sha256').update(raw.trim()).digest()
}

export function isSealed(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

/** Encrypt a token for storage (unchanged when no key is configured). */
export function sealToken<T extends string | null | undefined>(value: T): T {
  const k = key()
  if (!k || typeof value !== 'string' || value === '' || isSealed(value)) return value
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv)
  const ct = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return (PREFIX + Buffer.concat([iv, tag, ct]).toString('base64')) as T
}

/** The usable token: opens a sealed value, passes a plain one through. */
export function openToken<T extends string | null | undefined>(value: T): T {
  if (!isSealed(value)) return value
  const k = key()
  if (!k) throw new Error('A Gmail token is encrypted but TOKEN_ENCRYPTION_KEY is not set')
  const raw = Buffer.from((value as string).slice(PREFIX.length), 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', k, raw.subarray(0, 12))
  decipher.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8') as T
}
