// ============================================
// What each inbox action does to an email's Gmail labels
// ============================================
// One table for /api/gmail/actions (a click on one email, a selection, or
// "select all" across pages) — and for mail rules, which apply the same
// changes at sync.

/** Most emails one action takes ("Select all N" stops here). */
export const MAX_ACTION_IDS = 5000

export type LabelChange = { addLabelIds?: string[]; removeLabelIds?: string[] }

export function labelChange(action: string, labelId?: string | null): LabelChange | { error: string } {
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
      return labelId ? { addLabelIds: [labelId], removeLabelIds: ['INBOX'] } : { error: 'Label ID required for move action' }
    case 'addLabel':
      return labelId ? { addLabelIds: [labelId] } : { error: 'Label ID required' }
    case 'removeLabel':
      return labelId ? { removeLabelIds: [labelId] } : { error: 'Label ID required' }
    // Handled by the route itself (it refuses it plainly).
    case 'permanentDelete': return {}
    default: return { error: 'Invalid action' }
  }
}
