// ============================================
// Handing a conversation to the Quote Builder
// ============================================
// "Parse" on a WhatsApp thread or an email put the whole conversation in the
// URL as base64: `btoa(String.fromCharCode(...bytes))` threw a RangeError on a
// long thread (too many arguments), and a long email made a URL past what
// servers and browsers take. The text now waits in this tab's sessionStorage
// under a short id, and the URL carries only the id.

const PREFIX = 'grid-handoff:'

/** Keep `text` for the grid; returns the id to put in ?handoff=. */
export function stashConversation(text: string): string | null {
  try {
    const id = Math.random().toString(36).slice(2, 10)
    sessionStorage.setItem(PREFIX + id, text)
    return id
  } catch {
    return null
  }
}

/** The text stashed under `id`, once — it is removed as it is read. */
export function takeConversation(id: string): string | null {
  try {
    const text = sessionStorage.getItem(PREFIX + id)
    sessionStorage.removeItem(PREFIX + id)
    return text
  } catch {
    return null
  }
}

/** Unicode-safe base64 for the fallback when storage is unavailable. */
export function toUrlBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
