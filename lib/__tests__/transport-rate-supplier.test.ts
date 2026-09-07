// transportation_rates.supplier_id (migration 355): the transport company a
// route is bought from. Pins the write path, the form, and the import
// template so the column cannot silently fall out of any of them again.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { RATE_TABLE_CONFIGS } from '@/lib/bulk-rate-service'

const ROOT = join(__dirname, '..', '..')
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8')

describe('transport rates carry their supplier', () => {
  it('migration 355 adds the column with the supplier FK', () => {
    expect(read('supabase', 'migrations', '355_transport_rates_supplier.sql'))
      .toMatch(/ALTER TABLE transportation_rates\s+ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers\(id\) ON DELETE SET NULL/)
  })
  it('the route endpoint writes supplier_id onto every vehicle row of the route', () => {
    expect(read('app', 'api', 'resources', 'transportation', 'route.ts')).toMatch(/const routeFields = \{[\s\S]{0,800}supplier_id: body\.supplier_id \|\| null/)
  })
  it('the form offers transport-company suppliers and submits the choice', () => {
    const form = read('app', 'rates', 'transportation', 'transportation-content.tsx')
    expect(form).toMatch(/\/api\/suppliers\?type=transport_company&status=active/)
    expect(form).toMatch(/supplier_id: formData\.supplier_id \|\| null/)
    expect(form).toMatch(/supplier_id: rate\.supplier_id \|\| ''/)
  })
  it('the CSV template includes Supplier ID', () => {
    expect(RATE_TABLE_CONFIGS.transportation_rates.columns.map(c => c.name)).toContain('supplier_id')
  })
})
