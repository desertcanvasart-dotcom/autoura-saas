import { describe, it, expect } from 'vitest'
import { conciergeSla } from '@/lib/concierge-sla'

const NOW = new Date('2026-06-23T12:00:00Z').getTime()
const iso = (mins: number) => new Date(NOW + mins * 60000).toISOString()

describe('conciergeSla', () => {
  it('reports met when responded (regardless of deadline)', () => {
    expect(conciergeSla(iso(-120), 'responded', NOW)).toEqual({ level: 'met', label: 'Responded' })
  })

  it('reports none when archived', () => {
    expect(conciergeSla(iso(-120), 'archived', NOW).level).toBe('none')
  })

  it('reports none when no deadline is set', () => {
    expect(conciergeSla(null, 'needs_review', NOW)).toEqual({ level: 'none', label: 'No SLA' })
  })

  it('flags overdue with elapsed time', () => {
    const r = conciergeSla(iso(-90), 'needs_review', NOW)
    expect(r.level).toBe('overdue')
    expect(r.label).toBe('Overdue 1h')
  })

  it('flags soon when within 2 hours', () => {
    const r = conciergeSla(iso(45), 'in_progress', NOW)
    expect(r.level).toBe('soon')
    expect(r.label).toBe('Due in 45m')
  })

  it('reports ok when comfortably ahead', () => {
    const r = conciergeSla(iso(60 * 26), 'needs_review', NOW)
    expect(r.level).toBe('ok')
    expect(r.label).toBe('Due in 1d')
  })

  it('handles an unparseable deadline gracefully', () => {
    expect(conciergeSla('not-a-date', 'needs_review', NOW).level).toBe('none')
  })
})
