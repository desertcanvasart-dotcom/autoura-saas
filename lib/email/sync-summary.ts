// ============================================
// What a manual "Sync" tells the person who clicked it
// ============================================
// The inbox's refresh icon ignored the sync's answer entirely, and the
// Conversations page reported a partial run (mail that could not be
// downloaded or saved) as plain success. A sync that refused — no Gmail
// connected for this login, the Google sign-in expired — looked exactly like
// "no new mail" (2026-10-02).

export interface SyncResponse {
  success?: boolean
  error?: string
  warning?: string
  messages_created?: number
  conversations_created?: number
  conversations_updated?: number
  conversations_reopened?: number
}

/** Why a refused sync was refused, in words the person can act on. */
function explainError(error: string): string {
  if (/gmail not connected/i.test(error)) {
    return 'No Gmail account is connected to your login, so there is nothing to sync. Connect Gmail in Settings → Email, or sync from the account that connected it.'
  }
  if (/invalid_grant|token has been expired or revoked|unauthorized_client/i.test(error)) {
    return 'Google no longer accepts this Gmail connection. Reconnect Gmail in Settings → Email.'
  }
  return `Sync failed: ${error}`
}

export function syncSummary(ok: boolean, data: SyncResponse): { kind: 'success' | 'warning' | 'error' | 'info'; text: string } {
  if (!ok || data.success === false) return { kind: 'error', text: explainError(data.error || 'unknown error') }

  const created = data.messages_created ?? 0
  const reopened = data.conversations_reopened ?? 0
  const parts = [`${created} new message${created === 1 ? '' : 's'}`]
  if (data.conversations_created) parts.push(`${data.conversations_created} new conversation${data.conversations_created === 1 ? '' : 's'}`)
  if (reopened) parts.push(`${reopened} moved back from Archived`)
  const text = parts.join(', ')

  if (data.warning) return { kind: 'warning', text: `${text}. ${data.warning}` }
  return created === 0 && !reopened
    ? { kind: 'info', text: 'Up to date: no new mail since the last sync.' }
    : { kind: 'success', text: `Synced: ${text}.` }
}
