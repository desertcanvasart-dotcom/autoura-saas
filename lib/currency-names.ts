import { CURRENCY_NAMES, type CurrencyCode } from '@/lib/currency'

export { PREFERRED_FIRST } from '@/lib/currency'

// A currency's full name for people to read: "UAE dirham", "Kenyan
// shilling". The old Preferences picker built names from a list that lacked
// eight of the supported currencies and showed "AED ()". Intl.DisplayNames
// knows every ISO code in the reader's language; the static list in
// lib/currency.ts covers runtimes without it.

let names: Intl.DisplayNames | null | undefined
function displayNames(): Intl.DisplayNames | null {
  if (names !== undefined) return names
  try {
    names = new Intl.DisplayNames(undefined, { type: 'currency' })
  } catch {
    names = null
  }
  return names
}

export function currencyName(code: string): string {
  const fromIntl = displayNames()?.of(code)
  if (fromIntl && fromIntl !== code) return fromIntl.charAt(0).toUpperCase() + fromIntl.slice(1)
  return CURRENCY_NAMES[code as CurrencyCode] ?? code
}
