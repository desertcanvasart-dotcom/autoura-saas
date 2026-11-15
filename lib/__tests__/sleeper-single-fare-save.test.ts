// The sleeper form has ONE fare (single-rate entry, #224): every traveller
// pays it. Its save never filled the non-EU columns, which stayed 0 — and the
// engine read that 0 as a free ticket for non-EU travellers (2026-11-15).
// The engine now treats 0 as "not entered" (ticket-legs-engine.test.ts); the
// saves also mirror the fare into the non-EU columns, as the flight form does.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (...p: string[]) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8')

describe('sleeping-train saves mirror the one fare into the non-EU columns', () => {
  it('create', () => {
    const src = read('app', 'api', 'rates', 'sleeping-trains', 'route.ts')
    expect(src).toMatch(/rate_oneway_non_eur: parseFloat\(body\.rate_oneway_eur\)/)
    expect(src).toMatch(/rate_roundtrip_non_eur: body\.rate_roundtrip_eur \?/)
  })
  it('edit', () => {
    const src = read('app', 'api', 'rates', 'sleeping-trains', '[id]', 'route.ts')
    expect(src).toMatch(/updateData\.rate_oneway_eur = updateData\.rate_oneway_non_eur = /)
    expect(src).toMatch(/updateData\.rate_roundtrip_eur = updateData\.rate_roundtrip_non_eur = /)
  })
})
