// ============================================
// Live inbox polling — what changed since the last historyId
// ============================================
// /api/gmail/poll reads Gmail's history since the inbox last looked and the
// inbox page adds every "new" message to its Inbox list. Three things went
// wrong there:
//
//   * Only the first page of history was read (Gmail pages at 100 records),
//     yet the historyId still advanced — changes past page one were lost.
//   * Every added message counted as new mail, including the user's own sent
//     replies and each Gmail draft autosave, so they appeared in the Inbox and
//     lit the "new email" banner.
//   * A label change only recorded the first message of each history record.
//
// The route pages through the history with this module; the rules live here
// so they can be tested without Gmail.

/** The slice of a gmail_v1 history record this module reads. */
export interface HistoryRecord {
  messagesAdded?: Array<{ message?: { id?: string | null; labelIds?: string[] | null } | null }> | null
  messagesDeleted?: Array<{ message?: { id?: string | null } | null }> | null
  labelsAdded?: Array<{ message?: { id?: string | null } | null; labelIds?: string[] | null }> | null
  labelsRemoved?: Array<{ message?: { id?: string | null } | null; labelIds?: string[] | null }> | null
}

export interface LabelChange {
  messageId: string
  labelsAdded?: string[]
  labelsRemoved?: string[]
}

export interface HistoryChanges {
  /** Inbox arrivals, oldest first, de-duplicated, minus any deleted since. */
  newMessageIds: string[]
  deletedMessageIds: string[]
  labelChanges: LabelChange[]
}

/** Most new messages the route fetches details for in one poll. */
export const MAX_NEW_FETCH = 10
/** Most history pages one poll reads before asking for a full refresh. */
export const MAX_HISTORY_PAGES = 10

/**
 * Whether an added message belongs in the Inbox list. When Gmail does not say
 * (no labelIds), it is kept here and the route checks the fetched labels.
 */
export function isInboxArrival(labelIds: string[] | null | undefined): boolean {
  if (!labelIds) return true
  return labelIds.includes('INBOX') && !labelIds.includes('DRAFT')
}

export function collectHistoryChanges(records: HistoryRecord[]): HistoryChanges {
  const added: string[] = []
  const addedSeen = new Set<string>()
  const deleted = new Set<string>()
  const labels = new Map<string, { added: Set<string>; removed: Set<string> }>()

  const labelEntry = (id: string) => {
    let e = labels.get(id)
    if (!e) labels.set(id, (e = { added: new Set(), removed: new Set() }))
    return e
  }

  for (const item of records) {
    for (const m of item.messagesAdded ?? []) {
      const id = m.message?.id
      if (!id || addedSeen.has(id) || !isInboxArrival(m.message?.labelIds)) continue
      addedSeen.add(id)
      added.push(id)
    }
    for (const m of item.messagesDeleted ?? []) {
      if (m.message?.id) deleted.add(m.message.id)
    }
    for (const l of item.labelsAdded ?? []) {
      const id = l.message?.id
      if (!id) continue
      const e = labelEntry(id)
      for (const lab of l.labelIds ?? []) { e.added.add(lab); e.removed.delete(lab) }
    }
    for (const l of item.labelsRemoved ?? []) {
      const id = l.message?.id
      if (!id) continue
      const e = labelEntry(id)
      for (const lab of l.labelIds ?? []) { e.removed.add(lab); e.added.delete(lab) }
    }
  }

  const labelChanges: LabelChange[] = []
  for (const [messageId, e] of labels) {
    if (deleted.has(messageId)) continue
    labelChanges.push({
      messageId,
      ...(e.added.size ? { labelsAdded: [...e.added] } : {}),
      ...(e.removed.size ? { labelsRemoved: [...e.removed] } : {}),
    })
  }

  return {
    newMessageIds: added.filter(id => !deleted.has(id)),
    deletedMessageIds: [...deleted],
    labelChanges,
  }
}
