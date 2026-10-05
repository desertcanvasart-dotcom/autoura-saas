// Meta won't let an agency's number start a WhatsApp chat without an approved
// template, so assignments go out from the office's OWN WhatsApp (wa.me with
// the text pre-typed). These pin what that text says, and that people typed in
// by hand for one trip can be reached too.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { buildAssignmentMessage, parseManualAssignee } from '@/lib/notify/assignment-message'
import { resolveAssigneeContact } from '@/lib/staff-link'

describe('buildAssignmentMessage', () => {
  const full = buildAssignmentMessage({
    name: 'Ahmed Hassan', agency: 'Travel2Egypt', tripName: 'Cairo & Alexandria Classic',
    clientName: 'Marie Dupont', startDate: '2026-10-01', endDate: '2026-10-04', travelers: 2,
    notes: 'Pick-up at Mena House, 8:00', url: 'https://getautoura.net/staff/abc',
  })

  it('says everything the person needs, by first name, signed by the agency', () => {
    expect(full).toContain('Hello Ahmed,')
    expect(full).toContain('New assignment from Travel2Egypt:')
    expect(full).toContain('Trip: Cairo & Alexandria Classic')
    expect(full).toContain('Date: Thu, 1 Oct 2026 – Sun, 4 Oct 2026')
    expect(full).toContain('Client: Marie Dupont')
    expect(full).toContain('Guests: 2')
    expect(full).toContain('Notes: Pick-up at Mena House, 8:00')
  })

  it('ends with the check-in link', () => {
    expect(full.trim().endsWith('https://getautoura.net/staff/abc')).toBe(true)
  })

  it('leaves out what it does not know, and shows one date for a one-day job', () => {
    const bare = buildAssignmentMessage({ startDate: '2026-10-01', endDate: '2026-10-01', url: 'u' })
    expect(bare).toContain('Hello there,')
    expect(bare).toContain('You have a new assignment:')
    expect(bare).toContain('Date: Thu, 1 Oct 2026\n')
    expect(bare).not.toMatch(/Client|Guests|Notes|Trip/)
  })
})

describe('parseManualAssignee', () => {
  it('reads back what the assignment modal saved', () => {
    expect(parseManualAssignee('Ahmed Hassan · +20 100 123 4567 (outside)')).toEqual({ name: 'Ahmed Hassan', phone: '+20 100 123 4567' })
    expect(parseManualAssignee('Ahmed Hassan (outside)')).toEqual({ name: 'Ahmed Hassan', phone: null })
  })

  it('ignores names from the directory', () => {
    expect(parseManualAssignee('Mona - Cairo Airport (Rep)')).toBeNull()
    expect(parseManualAssignee(null)).toBeNull()
  })
})

describe('resolveAssigneeContact for someone typed in by hand', () => {
  const empty = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }

  it('finds the phone in the saved name when there is no directory row', async () => {
    expect(await resolveAssigneeContact(empty, { resource_type: 'driver', resource_id: 'x', resource_name: 'Sayed · 0100 111 2222 (outside)' }))
      .toEqual({ name: 'Sayed', phone: '0100 111 2222' })
  })

  it('still returns nothing for a venue', async () => {
    expect(await resolveAssigneeContact(empty, { resource_type: 'hotel', resource_id: 'x', resource_name: 'Mena House (Giza)' })).toBeNull()
  })
})

describe('the picker', () => {
  it('sends the full assignment from the office’s own WhatsApp', () => {
    const src = readFileSync(join(process.cwd(), 'app/components/ResourceAssignmentV2.tsx'), 'utf8')
    expect(src).toContain('buildAssignmentMessage({')
    expect(src).toContain('Send via my WhatsApp')
  })
})
