import { describe, it, expect } from 'vitest'
import { labelChange, isFolderId } from '@/lib/email/mail-actions'

// ============================================
// Move to folder
// ============================================
// A move added the new folder and dropped only the Inbox, so an email moved
// from one folder to another was left in both; there was no way back to the
// Inbox.

describe('move', () => {
  it('from the Inbox: into the folder, out of the Inbox', () => {
    expect(labelChange('move', 'Label_2')).toEqual({ addLabelIds: ['Label_2'], removeLabelIds: ['INBOX'] })
  })
  it('from another folder: out of that folder too', () => {
    expect(labelChange('move', 'Label_2', 'Label_1')).toEqual({ addLabelIds: ['Label_2'], removeLabelIds: ['INBOX', 'Label_1'] })
  })
  it('into the folder it is already in: nothing removed but the Inbox', () => {
    expect(labelChange('move', 'Label_2', 'Label_2')).toEqual({ addLabelIds: ['Label_2'], removeLabelIds: ['INBOX'] })
  })
  it('only ever into one of the mailbox’s own folders', () => {
    expect(labelChange('move', 'TRASH')).toEqual({ error: 'Choose one of your folders' })
    expect('error' in labelChange('move')).toBe(true)
  })
  it('never removes a system label passed as the source', () => {
    expect(labelChange('move', 'Label_2', 'SENT')).toEqual({ addLabelIds: ['Label_2'], removeLabelIds: ['INBOX'] })
  })
})

describe('move to the Inbox', () => {
  it('back into the Inbox, out of the folder', () => {
    expect(labelChange('moveToInbox', null, 'Label_1')).toEqual({ addLabelIds: ['INBOX'], removeLabelIds: ['Label_1'] })
  })
  it('from no folder: just back into the Inbox', () => {
    expect(labelChange('moveToInbox')).toEqual({ addLabelIds: ['INBOX'], removeLabelIds: [] })
  })
})

describe('isFolderId', () => {
  it('is a Gmail user label id', () => {
    expect(isFolderId('Label_12')).toBe(true)
    expect(isFolderId('INBOX')).toBe(false)
    expect(isFolderId('Label_1 OR x')).toBe(false)
    expect(isFolderId(undefined)).toBe(false)
  })
})
