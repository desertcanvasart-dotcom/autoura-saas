import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Links that pointed at pages that do not exist (404 on click).
describe('dead links stay fixed', () => {
  it('a client\'s trip opens the itinerary page', () => {
    const src = readFileSync(join(process.cwd(), 'app/clients/[id]/page.tsx'), 'utf8')
    expect(src).not.toContain('/view-itinerary/')
    expect(src).toContain('href={`/itineraries/${booking.id}`}')
  })

  it('the guide rates page links to the guides list in Resources', () => {
    const src = readFileSync(join(process.cwd(), 'app/rates/guides/guide-rates-content.tsx'), 'utf8')
    expect(src).not.toMatch(/href="\/guides"/)
    expect(src).toContain('href="/resources"')
  })
})
