// Formatting facts for the page, in the page's language. Formatting only —
// every figure comes from the payload as it is.

/** A price as shown: whole units, rounded UP, so the page never states less
 *  than the engine's price (a cent-rounding the customer could hold us to). */
/** The whole amount a price is shown as: rounded UP, never below the real
 *  price. The structured data (sites/lib/seo.ts) states this same number. */
export function shownAmount(amount: number): number {
  return Math.ceil(amount)
}

export function formatPrice(amount: number, currency: string, language: string): string {
  return new Intl.NumberFormat(language, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 })
    .format(shownAmount(amount))
}

/** An indicative conversion: approximate by nature, rounded normally. */
export function formatApprox(amount: number, currency: string, language: string): string {
  return `≈ ${new Intl.NumberFormat(language, { style: 'currency', currency, maximumFractionDigits: 0 }).format(Math.round(amount))}`
}

export function formatDate(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`))
}

const WEEKDAY_INDEX: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 }

/** "Monday, Thursday" in the page's language — the names come from Intl. */
export function formatWeekdays(days: string[], language: string): string {
  const fmt = new Intl.DateTimeFormat(language, { weekday: 'long', timeZone: 'UTC' })
  // 2023-01-01 was a Sunday.
  const names = days.map(d => fmt.format(new Date(Date.UTC(2023, 0, 1 + WEEKDAY_INDEX[d]))))
  return new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(names)
}
