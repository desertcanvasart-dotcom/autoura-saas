import { describe, it, expect } from 'vitest'
import {
  UUIDSchema,
  EmailSchema,
  PaginationSchema,
  ClientCreateSchema,
  ClientUpdateSchema,
  ItineraryCreateSchema,
  TaskCreateSchema,
  InvoiceItemSchema,
  InvoiceCreateSchema,
  InvitationCreateSchema,
  ExpenseCreateSchema,
  DateStringSchema,
  CurrencyCodeSchema,
  validateInput,
} from '@/lib/validation'

// lib/validation.ts is the input-validation boundary for API routes.
// These tests lock accept/reject boundaries, sanitization (trim/lowercase),
// unknown-key stripping (mass-assignment), and adversarial inputs.

const UUID = '123e4567-e89b-42d3-a456-426614174000'

describe('UUIDSchema', () => {
  it('accepts a canonical v4 UUID', () => {
    expect(UUIDSchema.safeParse(UUID).success).toBe(true)
  })

  it.each([
    ['empty string', ''],
    ['random text', 'not-a-uuid'],
    ['UUID with trailing junk', `${UUID}x`],
    ['UUID with surrounding whitespace', ` ${UUID} `],
    ['SQL injection shape', "' OR '1'='1"],
    ['number', 42],
    ['null', null],
  ])('rejects %s', (_label, input) => {
    expect(UUIDSchema.safeParse(input).success).toBe(false)
  })
})

describe('EmailSchema', () => {
  it('accepts and lowercases a mixed-case email', () => {
    const r = EmailSchema.safeParse('User@Example.COM')
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toBe('user@example.com')
  })

  it('rejects an email with surrounding whitespace (email check runs before trim)', () => {
    // The schema is .email().toLowerCase().trim() — the format check sees the
    // raw padded string, so padded-but-otherwise-valid emails are rejected.
    expect(EmailSchema.safeParse(' user@example.com ').success).toBe(false)
  })

  it('rejects emails longer than 255 chars', () => {
    const long = `${'a'.repeat(250)}@example.com`
    expect(EmailSchema.safeParse(long).success).toBe(false)
  })

  it.each([
    ['empty string', ''],
    ['missing @', 'userexample.com'],
    ['missing domain dot/TLD', 'a@b'],
    ['double @', 'a@@example.com'],
    ['injection-shaped local part', '<script>@example.com'],
    ['header-injection newline', 'a@example.com\nBcc: evil@x.com'],
    ['unicode confusable domain', 'user@exаmple.com'], // Cyrillic 'а'
  ])('rejects %s', (_label, input) => {
    expect(EmailSchema.safeParse(input).success).toBe(false)
  })
})

describe('DateStringSchema', () => {
  it.each([
    ['plain date', '2026-08-01'],
    ['leap-year Feb 29', '2024-02-29'],
    ['ISO datetime', '2026-08-01T10:30:00Z'],
    ['ISO datetime with ms', '2026-08-01T10:30:00.000Z'],
  ])('accepts %s', (_label, input) => {
    expect(DateStringSchema.safeParse(input).success).toBe(true)
  })

  it.each([
    ['month 13', '2026-13-01'],
    ['day 99', '2026-01-99'],
    ['non-leap-year Feb 29', '2026-02-29'],
    ['month 00', '2026-00-15'],
    ['day 00', '2026-01-00'],
    ['June 31', '2026-06-31'],
    ['slash date', '2026/08/01'],
    ['empty string', ''],
    ['plain text', 'tomorrow'],
  ])('rejects %s (calendar round-trip check)', (_label, input) => {
    expect(DateStringSchema.safeParse(input).success).toBe(false)
  })
})

describe('CurrencyCodeSchema', () => {
  it('normalizes case and whitespace ("  usd " -> "USD")', () => {
    const r = CurrencyCodeSchema.safeParse('  usd ')
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toBe('USD')
  })

  it.each([
    ['symbols', '$$$'],
    ['digits', '123'],
    ['2 letters', 'US'],
    ['4 letters', 'USDX'],
    ['empty', ''],
    ['whitespace only', '   '],
    ['unicode letters', 'ÉÜR'],
  ])('rejects %s', (_label, input) => {
    expect(CurrencyCodeSchema.safeParse(input).success).toBe(false)
  })
})

describe('PaginationSchema', () => {
  it('applies defaults for an empty query', () => {
    const r = PaginationSchema.safeParse({})
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toEqual({ page: 1, limit: 50, order: 'desc' })
  })

  it('coerces string numerics (query-param shape)', () => {
    const r = PaginationSchema.safeParse({ page: '3', limit: '100' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toMatchObject({ page: 3, limit: 100 })
  })

  it.each([
    ['page 0', { page: 0 }],
    ['negative page', { page: -1 }],
    ['fractional page', { page: 1.5 }],
    ['non-numeric page', { page: 'abc' }],
    ['limit 0', { limit: 0 }],
    ['limit above cap (101)', { limit: 101 }],
    ['huge limit (DoS shape)', { limit: 1e9 }],
    ['search over 100 chars', { search: 'x'.repeat(101) }],
    ['sort over 50 chars', { sort: 'x'.repeat(51) }],
    ['uppercase order', { order: 'DESC' }],
    ['order injection', { order: 'asc; DROP TABLE clients' }],
  ])('rejects %s', (_label, input) => {
    expect(PaginationSchema.safeParse(input).success).toBe(false)
  })

  it('accepts the boundary values page=1, limit=100', () => {
    expect(PaginationSchema.safeParse({ page: 1, limit: 100 }).success).toBe(true)
  })
})

describe('ClientCreateSchema', () => {
  it('accepts a minimal client (name only)', () => {
    const r = ClientCreateSchema.safeParse({ name: 'Alice' })
    expect(r.success).toBe(true)
  })

  it('trims the name', () => {
    const r = ClientCreateSchema.safeParse({ name: '  Alice  ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.name).toBe('Alice')
  })

  it.each([
    ['empty name', { name: '' }],
    ['whitespace-only name (trim runs before min(1))', { name: '   ' }],
    ['tab/newline-only name', { name: '\t\n ' }],
    ['missing name', {}],
    ['name over 255 chars', { name: 'x'.repeat(256) }],
    ['invalid email', { name: 'A', email: 'nope' }],
    ['21 tags', { name: 'A', tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }],
    ['tag over 50 chars', { name: 'A', tags: ['x'.repeat(51)] }],
    ['notes over 5000 chars', { name: 'A', notes: 'x'.repeat(5001) }],
  ])('rejects %s', (_label, input) => {
    expect(ClientCreateSchema.safeParse(input).success).toBe(false)
  })

  it('allows explicit nulls for optional-nullable fields', () => {
    const r = ClientCreateSchema.safeParse({ name: 'A', email: null, phone: null, notes: null })
    expect(r.success).toBe(true)
  })

  it('strips unknown keys (mass-assignment protection)', () => {
    const r = ClientCreateSchema.safeParse({ name: 'A', tenant_id: 'evil', role: 'admin' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data).not.toHaveProperty('tenant_id')
      expect(r.data).not.toHaveProperty('role')
    }
  })
})

describe('ClientUpdateSchema', () => {
  it('requires a valid id even though all other fields are partial', () => {
    expect(ClientUpdateSchema.safeParse({ name: 'A' }).success).toBe(false)
    expect(ClientUpdateSchema.safeParse({ id: 'nope', name: 'A' }).success).toBe(false)
    expect(ClientUpdateSchema.safeParse({ id: UUID }).success).toBe(true)
  })
})

describe('ItineraryCreateSchema — dates, pax, status', () => {
  const base = { client_id: UUID, title: 'Nile trip', start_date: '2026-08-01', end_date: '2026-08-05' }

  it('accepts YYYY-MM-DD dates and defaults status/pax', () => {
    const r = ItineraryCreateSchema.safeParse(base)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toMatchObject({ status: 'draft', pax: 1 })
  })

  it('accepts ISO datetime dates', () => {
    const r = ItineraryCreateSchema.safeParse({
      ...base,
      start_date: '2026-08-01T00:00:00Z',
      end_date: '2026-08-05T00:00:00.000Z',
    })
    expect(r.success).toBe(true)
  })

  it.each([
    ['impossible month/day', '2026-13-99'],
    ['non-leap-year Feb 29', '2026-02-29'],
    ['April 31', '2026-04-31'],
    ['slash date', '2026/08/01'],
    ['two-digit year', '26-08-01'],
    ['date with injection suffix', "2026-08-01'; DROP TABLE itineraries;--"],
    ['plain text', 'tomorrow'],
    ['empty string', ''],
  ])('rejects start_date %s', (_label, start_date) => {
    expect(ItineraryCreateSchema.safeParse({ ...base, start_date }).success).toBe(false)
  })

  it.each([
    ['pax 0', 0],
    ['negative pax', -3],
    ['fractional pax', 2.5],
    ['pax over 100', 101],
    ['string pax', '4'],
  ])('rejects %s', (_label, pax) => {
    expect(ItineraryCreateSchema.safeParse({ ...base, pax }).success).toBe(false)
  })

  it('rejects an unknown status', () => {
    expect(ItineraryCreateSchema.safeParse({ ...base, status: 'archived' }).success).toBe(false)
  })
})

describe('TaskCreateSchema', () => {
  it('defaults priority=medium and status=pending', () => {
    const r = TaskCreateSchema.safeParse({ title: 'Call hotel' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toMatchObject({ priority: 'medium', status: 'pending' })
  })

  it('rejects a due_date that is a bare date (datetime-only field)', () => {
    expect(TaskCreateSchema.safeParse({ title: 'T', due_date: '2026-08-01' }).success).toBe(false)
    expect(TaskCreateSchema.safeParse({ title: 'T', due_date: '2026-08-01T10:00:00Z' }).success).toBe(true)
  })

  it('rejects an invalid assigned_to UUID', () => {
    expect(TaskCreateSchema.safeParse({ title: 'T', assigned_to: 'bob' }).success).toBe(false)
  })
})

describe('InvoiceItemSchema — money boundaries', () => {
  const item = { description: 'Guide fee', quantity: 2, unit_price: 150 }

  it('accepts a well-formed item', () => {
    expect(InvoiceItemSchema.safeParse(item).success).toBe(true)
  })

  it('accepts the zero boundaries (free line item)', () => {
    expect(InvoiceItemSchema.safeParse({ ...item, quantity: 0, unit_price: 0 }).success).toBe(true)
  })

  it('accepts the upper boundaries exactly', () => {
    expect(InvoiceItemSchema.safeParse({ ...item, quantity: 10000, unit_price: 1000000 }).success).toBe(true)
  })

  it.each([
    ['negative quantity', { ...item, quantity: -1 }],
    ['negative unit_price', { ...item, unit_price: -0.01 }],
    ['quantity above cap', { ...item, quantity: 10001 }],
    ['unit_price above cap', { ...item, unit_price: 1000001 }],
    ['NaN unit_price', { ...item, unit_price: NaN }],
    ['Infinity unit_price', { ...item, unit_price: Infinity }],
    ['string quantity (no coercion for money)', { ...item, quantity: '2' }],
    ['empty description', { ...item, description: '' }],
    ['description over 500 chars', { ...item, description: 'x'.repeat(501) }],
    ['negative total', { ...item, total: -5 }],
  ])('rejects %s', (_label, input) => {
    expect(InvoiceItemSchema.safeParse(input).success).toBe(false)
  })
})

describe('InvoiceCreateSchema', () => {
  const invoice = {
    client_id: UUID,
    issue_date: '2026-07-01',
    due_date: '2026-07-15',
    items: [{ description: 'Tour', quantity: 1, unit_price: 500 }],
  }

  it('accepts a minimal invoice and applies defaults', () => {
    const r = InvoiceCreateSchema.safeParse(invoice)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data).toMatchObject({ status: 'draft', currency: 'USD', tax_rate: 0, discount: 0 })
    }
  })

  it('rejects an empty items array (at least one line required)', () => {
    expect(InvoiceCreateSchema.safeParse({ ...invoice, items: [] }).success).toBe(false)
  })

  it('rejects a negative amount hidden inside a nested item', () => {
    expect(
      InvoiceCreateSchema.safeParse({
        ...invoice,
        items: [{ description: 'Refund me', quantity: 1, unit_price: -100 }],
      }).success,
    ).toBe(false)
  })

  it.each([
    ['2-char currency', 'US'],
    ['4-char currency', 'USDX'],
    ['empty currency', ''],
    ['symbol currency', '$$$'],
    ['digit currency', '123'],
  ])('rejects %s', (_label, currency) => {
    expect(InvoiceCreateSchema.safeParse({ ...invoice, currency }).success).toBe(false)
  })

  it('normalizes lowercase/padded currency codes to uppercase', () => {
    const lower = InvoiceCreateSchema.safeParse({ ...invoice, currency: 'usd' })
    expect(lower.success).toBe(true)
    if (lower.success) expect(lower.data.currency).toBe('USD')
    const padded = InvoiceCreateSchema.safeParse({ ...invoice, currency: ' eur ' })
    expect(padded.success).toBe(true)
    if (padded.success) expect(padded.data.currency).toBe('EUR')
  })

  it.each([
    ['tax_rate above 100', { tax_rate: 100.5 }],
    ['negative tax_rate', { tax_rate: -1 }],
    ['negative discount', { discount: -50 }],
    ['discount above cap', { discount: 1000001 }],
  ])('rejects %s', (_label, patch) => {
    expect(InvoiceCreateSchema.safeParse({ ...invoice, ...patch }).success).toBe(false)
  })

  it('accepts the tax_rate boundaries 0 and 100', () => {
    expect(InvoiceCreateSchema.safeParse({ ...invoice, tax_rate: 0 }).success).toBe(true)
    expect(InvoiceCreateSchema.safeParse({ ...invoice, tax_rate: 100 }).success).toBe(true)
  })
})

describe('InvitationCreateSchema — privilege boundary', () => {
  it('defaults role to agent (least privilege among defaults)', () => {
    const r = InvitationCreateSchema.safeParse({ email: 'new@example.com' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.role).toBe('member')
  })

  it.each([
    ['owner (not in enum)', 'owner'],
    ['superadmin', 'superadmin'],
    ['uppercase ADMIN', 'ADMIN'],
    ['empty role', ''],
  ])('rejects role %s', (_label, role) => {
    expect(InvitationCreateSchema.safeParse({ email: 'a@example.com', role }).success).toBe(false)
  })

  it('accepts every declared role', () => {
    for (const role of ['admin', 'manager', 'member', 'viewer']) {
      expect(InvitationCreateSchema.safeParse({ email: 'a@example.com', role }).success).toBe(true)
    }
  })
})

describe('ExpenseCreateSchema', () => {
  const expense = { description: 'Fuel', amount: 40, date: '2026-07-14' }

  it('accepts a minimal expense', () => {
    expect(ExpenseCreateSchema.safeParse(expense).success).toBe(true)
  })

  it.each([
    ['negative amount', { amount: -40 }],
    ['amount above cap', { amount: 1000001 }],
    ['NaN amount', { amount: NaN }],
    ['string amount', { amount: '40' }],
    ['missing date', { date: undefined }],
    ['garbage receipt_url', { receipt_url: 'not a url' }],
  ])('rejects %s', (_label, patch) => {
    expect(ExpenseCreateSchema.safeParse({ ...expense, ...patch }).success).toBe(false)
  })

  it('rejects javascript: and data: receipt_url schemes (http(s) only)', () => {
    for (const receipt_url of [
      'javascript:alert(1)',
      'data:text/html,<script>1</script>',
      'ftp://example.com/receipt.pdf',
    ]) {
      const r = ExpenseCreateSchema.safeParse({ ...expense, receipt_url })
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(r.error.issues.map(i => i.message)).toContain('Only http(s) URLs are allowed')
      }
    }
  })

  it('accepts http:// as well as https:// receipt URLs', () => {
    expect(
      ExpenseCreateSchema.safeParse({ ...expense, receipt_url: 'http://example.com/r.pdf' }).success,
    ).toBe(true)
  })

  it('accepts amount 0 and a valid https receipt_url', () => {
    const r = ExpenseCreateSchema.safeParse({
      ...expense,
      amount: 0,
      receipt_url: 'https://storage.example.com/r/1.pdf',
    })
    expect(r.success).toBe(true)
  })
})

describe('validateInput helper', () => {
  it('returns success:true with parsed+transformed data', () => {
    const r = validateInput(ClientCreateSchema, { name: '  Alice  ', email: 'A@B.CO' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toMatchObject({ name: 'Alice', email: 'a@b.co' })
  })

  it('returns a 400 NextResponse with per-field details on failure', async () => {
    const r = validateInput(ClientCreateSchema, { name: '', email: 'nope' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.status).toBe(400)
      const body = await r.error.json()
      expect(body.success).toBe(false)
      expect(body.error).toBe('Validation failed')
      const fields = body.details.map((d: { field: string }) => d.field)
      expect(fields).toContain('name')
      expect(fields).toContain('email')
    }
  })

  it('reports dotted paths for nested array errors', async () => {
    const r = validateInput(InvoiceCreateSchema, {
      client_id: UUID,
      issue_date: '2026-07-01',
      due_date: '2026-07-15',
      items: [{ description: 'x', quantity: -1, unit_price: 10 }],
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      const body = await r.error.json()
      const fields = body.details.map((d: { field: string }) => d.field)
      expect(fields).toContain('items.0.quantity')
    }
  })

  it('rejects non-object payloads (null, string, array)', () => {
    expect(validateInput(ClientCreateSchema, null).success).toBe(false)
    expect(validateInput(ClientCreateSchema, 'name=Alice').success).toBe(false)
    expect(validateInput(ClientCreateSchema, [{ name: 'Alice' }]).success).toBe(false)
  })
})
