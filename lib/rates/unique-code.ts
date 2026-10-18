// ============================================
// A generated service code no other rate of the table already has
// ============================================
// The tipping, hotel-service and airport-service forms built a rate's code
// from its fields alone (TIP-GUIDE-DAY_TOUR), so the Cairo and Luxor rows, or
// two suppliers' porter rates, shared one code. The CSV import matches rows
// on that code, and a re-import then wrote one row's figures over both. The
// code steps past any code already taken: BASE, BASE-2, BASE-3 …

/** Upper-case slug for a code part: "Sharm El Sheikh" → "SHARM-EL-SHEIKH". */
export function codePart(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function uniqueServiceCode(base: string, taken: Iterable<string | null | undefined>): string {
  const used = new Set<string>()
  for (const c of taken) if (c) used.add(c.toUpperCase())
  let code = base, n = 2
  while (used.has(code.toUpperCase())) code = `${base}-${n++}`
  return code
}
