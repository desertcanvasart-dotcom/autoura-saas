import { describe, it, expect } from 'vitest'
import { parsePaymentInput } from '@/lib/payment-input'

// ============================================================================
// Recording a payment was broken on every path since the table was created:
// the API spread the raw request body into the insert, and the UI sends
// `payment_status`, which is not a column — PostgREST answered PGRST204 and
// the route 500'd. Verified against production before the fix: 0 payments had
// ever been recorded, on any tenant.
//
// These pin BOTH directions of the allowlist: unknown fields must be dropped
// (not poison the insert), and only permitted columns may be written.
// ============================================================================

const valid = {
  amount: '250.50',
  payment_method: 'bank_transfer',
  payment_date: '2026-07-28',
  currency: 'eur',
}

const ok = (body: Record<string, unknown>) => {
  const r = parsePaymentInput(body)
  if (!r.ok) throw new Error(`expected ok, got: ${JSON.stringify(r.errors)}`)
  return r.value
}

describe('the bug that kept payments broken', () => {
  it('accepts payment_status and maps it onto the real `status` column', () => {
    const v = ok({ ...valid, payment_status: 'pending' })
    expect(v.status).toBe('pending')
    expect(v).not.toHaveProperty('payment_status') // never reaches the insert
  })

  it('an explicit status wins over payment_status', () => {
    expect(ok({ ...valid, status: 'failed', payment_status: 'completed' }).status).toBe('failed')
  })

  it('defaults to completed — recording a payment usually means it happened', () => {
    expect(ok(valid).status).toBe('completed')
  })

  it('DROPS unknown fields instead of failing the whole insert', () => {
    const v = ok({ ...valid, target_id: 'x', nonsense: 1, payment_status: 'completed' })
    expect(v).not.toHaveProperty('target_id')
    expect(v).not.toHaveProperty('nonsense')
  })
})

describe('the allowlist blocks what a client must not set', () => {
  it('refuses id, tenant_id, created_at even when supplied', () => {
    const v = ok({
      ...valid,
      id: 'attacker-chosen',
      tenant_id: 'another-tenant',
      created_at: '1999-01-01',
      updated_at: '1999-01-01',
    }) as Record<string, unknown>
    for (const k of ['id', 'tenant_id', 'created_at', 'updated_at']) {
      expect(v, k).not.toHaveProperty(k)
    }
  })
})

describe('money', () => {
  it('parses the string form the form submits', () => {
    expect(ok(valid).amount).toBe(250.5)
  })

  it('rounds to cents rather than carrying floating dust', () => {
    expect(ok({ ...valid, amount: 0.1 + 0.2 }).amount).toBe(0.3)
    expect(ok({ ...valid, amount: '166.6665' }).amount).toBe(166.67)
  })

  it('rejects a non-numeric amount instead of writing NaN to a DECIMAL', () => {
    const r = parsePaymentInput({ ...valid, amount: 'abc' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0].field).toBe('amount')
  })

  it('rejects zero and negative amounts', () => {
    for (const bad of [0, -50, '-1']) {
      expect(parsePaymentInput({ ...valid, amount: bad }).ok, String(bad)).toBe(false)
    }
  })
})

describe('vocabularies match the CHECK constraints', () => {
  it('rejects a status the CHECK would refuse, rather than 500ing at insert', () => {
    const r = parsePaymentInput({ ...valid, status: 'partial' }) // the invoices-page mistake
    expect(r.ok).toBe(false)
  })

  it('rejects an unknown payment_method', () => {
    expect(parsePaymentInput({ ...valid, payment_method: 'crypto' }).ok).toBe(false)
  })

  it('accepts every payment_type the migration allows', () => {
    for (const t of ['deposit', 'installment', 'balance', 'full_payment', 'refund', 'penalty']) {
      expect(ok({ ...valid, payment_type: t }).payment_type, t).toBe(t)
    }
  })

  it('accepts every option the payment forms actually offer', () => {
    // These are the literal <option value=...> strings in /payments/new and
    // /payments/record. Before normalisation, "full" and "final" were not
    // valid payment_type values and would have been rejected at the CHECK.
    const fromForms: Record<string, string> = {
      deposit_10: 'deposit', deposit_15: 'deposit', deposit_20: 'deposit',
      deposit_25: 'deposit', deposit_30: 'deposit', deposit_50: 'deposit',
      installment: 'installment',
      final: 'balance',
      full: 'full_payment',
    }
    for (const [sent, stored] of Object.entries(fromForms)) {
      expect(ok({ ...valid, payment_type: sent }).payment_type, sent).toBe(stored)
    }
  })

  it('still rejects a genuinely unknown type', () => {
    expect(parsePaymentInput({ ...valid, payment_type: 'gift_card' }).ok).toBe(false)
  })

  it('defaults payment_type to full_payment', () => {
    expect(ok(valid).payment_type).toBe('full_payment')
  })
})

describe('dates and currency', () => {
  it('requires a usable payment_date', () => {
    for (const bad of [undefined, '', 'not-a-date']) {
      expect(parsePaymentInput({ ...valid, payment_date: bad }).ok, String(bad)).toBe(false)
    }
  })

  it('due_date is optional but must be valid when present', () => {
    expect(ok({ ...valid, due_date: '' }).due_date).toBeNull()
    expect(ok({ ...valid, due_date: '2026-09-01' }).due_date).toBe('2026-09-01')
    expect(parsePaymentInput({ ...valid, due_date: 'soon' }).ok).toBe(false)
  })

  it('normalises currency and rejects a non-code', () => {
    expect(ok(valid).currency).toBe('EUR')
    expect(parsePaymentInput({ ...valid, currency: 'euros' }).ok).toBe(false)
  })

  it('blank optional text becomes null, not an empty string', () => {
    const v = ok({ ...valid, notes: '   ', transaction_reference: '' })
    expect(v.notes).toBeNull()
    expect(v.transaction_reference).toBeNull()
  })
})
