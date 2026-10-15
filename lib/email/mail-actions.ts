// ============================================
// What each inbox action does to an email's Gmail labels
// ============================================
// One table for /api/gmail/actions (a click on one email, a selection, or
// "select all" across pages) — and for mail rules, which apply the same
// changes at sync.

/** Most emails one action takes ("Select all N" stops here). */
export const MAX_ACTION_IDS = 5000

export type LabelChange = { addLabelIds?: string[]; removeLabelIds?: string[] }

/** A folder (user label) id as Gmail writes it — never a system label. */
export function isFolderId(id: unknown): id is string {
  return typeof id === 'string' && /^Label_[A-Za-z0-9_-]+$/.test(id)
}

/**
 * `fromLabelId`: the folder the emails are being moved OUT of. A move used
 * to add the new folder and drop only Inbox, so mail moved from one folder to
 * another was left in both.
 */
export function labelChange(
  action: string,
  labelId?: string | null,
  fromLabelId?: string | null,
): LabelChange | { error: string } {
  const from = isFolderId(fromLabelId) && fromLabelId !== labelId ? [fromLabelId] : []
  switch (action) {
    case 'delete': return { addLabelIds: ['TRASH'], removeLabelIds: ['INBOX'] }
    case 'archive': return { removeLabelIds: ['INBOX'] }
    case 'star': return { addLabelIds: ['STARRED'] }
    case 'unstar': return { removeLabelIds: ['STARRED'] }
    case 'markRead': return { removeLabelIds: ['UNREAD'] }
    case 'markUnread': return { addLabelIds: ['UNREAD'] }
    // Report spam: to Gmail's Spam, out of the Inbox — Gmail learns from it.
    case 'spam': return { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] }
    case 'notSpam': return { addLabelIds: ['INBOX'], removeLabelIds: ['SPAM'] }
    case 'move':
      if (!labelId) return { error: 'Label ID required for move action' }
      if (!isFolderId(labelId)) return { error: 'Choose one of your folders' }
      return { addLabelIds: [labelId], removeLabelIds: ['INBOX', ...from] }
    // Back to the Inbox, out of the folder it was filed in.
    case 'moveToInbox': return { addLabelIds: ['INBOX'], removeLabelIds: from }
    case 'addLabel':
      return labelId ? { addLabelIds: [labelId] } : { error: 'Label ID required' }
    case 'removeLabel':
      return labelId ? { removeLabelIds: [labelId] } : { error: 'Label ID required' }
    // Handled by the route itself (it refuses it plainly).
    case 'permanentDelete': return {}
    default: return { error: 'Invalid action' }
  }
}
