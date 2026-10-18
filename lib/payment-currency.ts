// ============================================
// The currency a payment is recorded in
// ============================================
// A payment against a trip or an invoice is in THAT record's currency. The
// payment forms started on EUR and offered only EUR/USD/GBP, and the APIs kept
// whatever came in: a ¥450,000 trip payment was stored as EUR, and the
// customer's receipt (PDF and WhatsApp) said "EUR 450,000.00"; a EUR amount
// against a ¥ invoice came off its ¥ balance as if it were yen (the invoice
// trigger sums amounts without looking at currency).
//
// No currency sent: the record's. A different one: refused — nothing converts
// it, and guessing either way puts a wrong figure on a customer document.

export type PaymentCurrency = { ok: true; currency: string } | { ok: false; error: string }

export function paymentCurrencyFor(requested: unknown, recordCurrency: string | null | undefined): PaymentCurrency {
  const asked = typeof requested === 'string' && requested.trim() ? requested.trim().toUpperCase() : null
  const own = typeof recordCurrency === 'string' && recordCurrency.trim() ? recordCurrency.trim().toUpperCase() : null
  if (own && asked && asked !== own) {
    return { ok: false, error: `This payment is in ${asked}, but the record is in ${own}. Record it in ${own}.` }
  }
  return { ok: true, currency: own ?? asked ?? 'EUR' }
}
