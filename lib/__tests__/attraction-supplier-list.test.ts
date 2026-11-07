// The attraction form's supplier list holds Attraction suppliers only
// (operator, 2026-11-07: felucca, camel and balloon companies were listed).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PAGE = readFileSync(join(__dirname, '..', '..', 'app', 'rates', 'attractions', 'attractions-content.tsx'), 'utf8')
const fetchSuppliers = PAGE.slice(PAGE.indexOf('const fetchSuppliers'), PAGE.indexOf('useEffect(', PAGE.indexOf('const fetchSuppliers')))

describe('attraction form supplier list', () => {
  it('asks the server for Attraction suppliers (every role, the agency’s type words)', () => {
    expect(fetchSuppliers).toContain("/api/suppliers?type=attraction")
  })

  it('does not add activity providers, "other", or fall back to every supplier', () => {
    expect(fetchSuppliers).not.toMatch(/activity_provider|'other'/)
    expect(fetchSuppliers).not.toMatch(/fetch\('\/api\/suppliers'\)/)
  })
})
