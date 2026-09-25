// ============================================
// Which Gmail messages a sync run downloads
// ============================================
// Before (checked live, 2026-09-25): every ten minutes the scheduled sync
// listed a date window, downloaded EVERY message in it in full — 28 for
// Travel2Egypt alone — and only then found each already stored. A download
// that failed was skipped by `catch {}`, so a partial failure read as a
// clean run. email_sync_state.last_history_id was never written.
// (travel-ops-pro fixed the same in #515; this is that approach, here.)
//
// Now:
//   * the mailbox's Gmail historyId is read FIRST (users.getProfile), so a
//     message arriving mid-run is in the next run, not lost between;
//   * with a stored history id, the scheduled run asks Gmail for what was
//     added since (users.history.list); Gmail answers 404/400 when the id is
//     too old or not a real id, and the run falls back to the date window;
//   * drafts, spam and trash are never candidates (a stored draft would read
//     as our reply);
//   * the store is checked in ONE query per 100 ids before anything is
//     downloaded, and only new messages are fetched, five at a time;
//   * every download failure is COUNTED — the caller only advances the
//     history id after a clean run, so failures are retried, not lost.

import type { gmail_v1 } from 'googleapis'

export type Gmail = gmail_v1.Gmail

export interface CandidateRef {
  id: string
  threadId: string | null
}

export interface Candidates {
  mode: 'history' | 'listing'
  /** Why a history run fell back to listing, when it did. */
  fellBackBecause?: string
  refs: CandidateRef[]
  /** The mailbox's history id read BEFORE listing — store it after a clean run. */
  historyId: string | null
  /** More history than one run takes: do not advance the id yet. */
  truncated: boolean
}

const SKIP_LABELS = new Set(['DRAFT', 'SPAM', 'TRASH'])
export const NOISE_LABELS = new Set(['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_FORUMS'])
/** One run takes at most this many history records' worth of messages. */
export const MAX_HISTORY_MESSAGES = 300

function errStatus(e: unknown): number | undefined {
  const o = e as { code?: number; status?: number; response?: { status?: number } }
  return o?.response?.status ?? o?.status ?? o?.code
}

/** The history id to store, or null when Gmail would not say. */
export async function currentHistoryId(gmail: Gmail): Promise<string | null> {
  try {
    const { data } = await gmail.users.getProfile({ userId: 'me' })
    return data.historyId ? String(data.historyId) : null
  } catch {
    return null
  }
}

async function fromHistory(gmail: Gmail, startHistoryId: string): Promise<{ refs: CandidateRef[]; truncated: boolean; noiseIds: Set<string> }> {
  const byId = new Map<string, CandidateRef>()
  const noiseIds = new Set<string>()
  let pageToken: string | undefined
  let truncated = false
  do {
    const { data } = await gmail.users.history.list({
      userId: 'me',
      startHistoryId,
      historyTypes: ['messageAdded'],
      maxResults: 500,
      ...(pageToken ? { pageToken } : {}),
    })
    for (const h of data.history ?? []) {
      for (const added of h.messagesAdded ?? []) {
        const m = added.message
        if (!m?.id) continue
        const labels = m.labelIds ?? []
        if (labels.some(l => SKIP_LABELS.has(l))) continue
        if (labels.some(l => NOISE_LABELS.has(l))) noiseIds.add(m.id)
        byId.set(m.id, { id: m.id, threadId: m.threadId ?? null })
      }
    }
    pageToken = data.nextPageToken ?? undefined
    // At the cap: stop, and do not advance the id — the next run replays from
    // the same point, and the stored-check skips what this run already saved.
    if (byId.size >= MAX_HISTORY_MESSAGES) { truncated = true; break }
  } while (pageToken)
  return { refs: [...byId.values()].slice(0, MAX_HISTORY_MESSAGES), truncated, noiseIds }
}

async function fromListing(gmail: Gmail, mainQuery: string, rescueQueries: string[], maxResults: number): Promise<CandidateRef[]> {
  const byId = new Map<string, CandidateRef>()
  const add = (ms: gmail_v1.Schema$Message[] | undefined) => {
    for (const m of ms ?? []) if (m.id && !byId.has(m.id)) byId.set(m.id, { id: m.id, threadId: m.threadId ?? null })
  }
  // The main listing failing IS the run failing — never swallowed.
  add((await gmail.users.messages.list({ userId: 'me', maxResults, q: mainQuery })).data.messages)
  for (const q of rescueQueries) {
    try {
      add((await gmail.users.messages.list({ userId: 'me', maxResults: 50, q })).data.messages)
    } catch (e) {
      console.error('[Email Sync] rescue query failed:', e instanceof Error ? e.message : e)
    }
  }
  return [...byId.values()]
}

/**
 * The messages this run should consider. Noise-category messages found via
 * history are kept only when the sender is already on record (the listing's
 * rescue rule); that needs the From header, so they are checked by metadata.
 */
export async function collectCandidates(
  gmail: Gmail,
  opts: {
    useHistory: boolean
    startHistoryId: string | null
    mainQuery: string
    rescueQueries: string[]
    maxResults: number
    knownSenders: ReadonlySet<string>
  },
): Promise<Candidates> {
  const historyId = await currentHistoryId(gmail)

  if (opts.useHistory && opts.startHistoryId) {
    try {
      const { refs, truncated, noiseIds } = await fromHistory(gmail, opts.startHistoryId)
      const kept: CandidateRef[] = []
      for (const r of refs) {
        if (!noiseIds.has(r.id)) { kept.push(r); continue }
        try {
          const { data } = await gmail.users.messages.get({ userId: 'me', id: r.id, format: 'metadata', metadataHeaders: ['From'] })
          const from = data.payload?.headers?.find(h => h.name?.toLowerCase() === 'from')?.value ?? ''
          const addr = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase()
          if (addr && opts.knownSenders.has(addr)) kept.push(r)
        } catch {
          kept.push(r) // unsure → let the full download and its filters decide
        }
      }
      return { mode: 'history', refs: kept, historyId, truncated }
    } catch (e) {
      const status = errStatus(e)
      if (status !== 404 && status !== 400) throw e
      const refs = await fromListing(gmail, opts.mainQuery, opts.rescueQueries, opts.maxResults)
      return { mode: 'listing', fellBackBecause: `history id ${status === 404 ? 'too old' : 'not accepted'}`, refs, historyId, truncated: false }
    }
  }

  const refs = await fromListing(gmail, opts.mainQuery, opts.rescueQueries, opts.maxResults)
  return { mode: 'listing', refs, historyId, truncated: false }
}

/** Ids already stored for the tenant — one query per 100. */
export async function storedIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { from(table: string): any },
  tenantId: string,
  ids: string[],
): Promise<Set<string>> {
  const out = new Set<string>()
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const { data, error } = await db
      .from('email_messages')
      .select('gmail_message_id')
      .eq('tenant_id', tenantId)
      .in('gmail_message_id', chunk)
    if (error) throw new Error(`Could not check stored mail: ${error.message}`)
    for (const r of (data ?? []) as { gmail_message_id: string }[]) out.add(r.gmail_message_id)
  }
  return out
}

/** Download in full, `concurrency` at a time; failures counted, never hidden. */
export async function downloadMessages(
  gmail: Gmail,
  refs: CandidateRef[],
  concurrency = 5,
): Promise<{ messages: gmail_v1.Schema$Message[]; failed: number; skipped: number }> {
  const messages: gmail_v1.Schema$Message[] = []
  let failed = 0
  let skipped = 0
  for (let i = 0; i < refs.length; i += concurrency) {
    const batch = await Promise.allSettled(
      refs.slice(i, i + concurrency).map(r => gmail.users.messages.get({ userId: 'me', id: r.id, format: 'full' })),
    )
    for (const b of batch) {
      if (b.status === 'rejected') { failed++; continue }
      const labels = b.value.data.labelIds ?? []
      if (labels.some(l => SKIP_LABELS.has(l))) { skipped++; continue }
      messages.push(b.value.data)
    }
  }
  return { messages, failed, skipped }
}
