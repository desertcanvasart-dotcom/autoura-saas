import { describe, it, expect } from 'vitest'
import { CLIENT_STAGES, DEFAULT_CLIENT_STAGE, normalizeClientStage, clientStageLabel, isLead, isCustomer } from '@/lib/client-stage'
import fs from 'node:fs'
import path from 'node:path'

describe('client stages', () => {
  it('a new record is a lead; the words are Lead and Customer', () => {
    expect(DEFAULT_CLIENT_STAGE).toBe('lead')
    expect(clientStageLabel('lead')).toBe('Lead')
    expect(clientStageLabel('active')).toBe('Customer')
  })

  it('old spellings map to the stage they meant', () => {
    expect(normalizeClientStage('prospect')).toBe('lead')
    expect(normalizeClientStage('blacklisted')).toBe('blocked')
    expect(normalizeClientStage(null)).toBe('lead')
    expect(normalizeClientStage('garbage')).toBe('lead')
    expect(isLead('prospect')).toBe(true)
    expect(isCustomer('active')).toBe(true)
  })

  it('the database CHECK (migration 352) allows exactly these stages', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/352_client_lead_customer_stages.sql'), 'utf8')
    const check = sql.match(/CHECK \(status IN \(([^)]*)\)\)/)![1].match(/'([a-z_]+)'/g)!.map(s => s.replace(/'/g, ''))
    expect(check.sort()).toEqual(CLIENT_STAGES.map(s => s.key).sort())
    // The first booking promotes a lead — in the database, not a click.
    expect(sql).toContain("AFTER INSERT ON bookings")
    expect(sql).toContain("SET status = 'active'")
  })
})
