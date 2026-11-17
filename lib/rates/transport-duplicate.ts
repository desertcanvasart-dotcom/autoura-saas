// ============================================================================
// "This card already exists" — said so the operator knows what to do
// ============================================================================
// A transport card is told apart by: service type, city, route name, pickup
// area, vehicle and supplier (the unique index, migrations 460/471/472). The
// sights a card covers are NOT part of that: one half-day card lists every
// sight it can take in, and the engine picks the smallest card covering ALL
// of a day's sights (lib/pricing/transport-zone.ts). One card per temple would
// leave a Karnak + Luxor Temple half day with no card at all.
//
// Seen live 2026-11-17: a second Luxor half-day card for Luxor Temple, under
// the same route name as the Karnak one, was refused with "this supplier
// already prices sedan on this route" — which read as a bug.
//
// Pure, safe in the browser.

export function duplicateTransportCardMessage(p: {
  vehicle: string
  routeName: string
  city?: string | null
  areaLabel?: string | null
  hasSupplier: boolean
  coversSights?: readonly string[] | null
}): string {
  const where = [p.city?.trim(), p.areaLabel?.trim()].filter(Boolean).join(', ')
  const card = `"${p.routeName}"${where ? ` (${where})` : ''}`
  const who = p.hasSupplier ? 'for this supplier' : 'with no supplier'
  const lines = [`A ${p.vehicle} card named ${card} already exists ${who}.`]
  if ((p.coversSights?.length ?? 0) > 0) {
    lines.push(
      `Sights don't make a separate card: open ${card} and add the sight to its "Sights covered" — one card can cover several sights, and a day visiting two of them is then priced too.`,
      'If this one really has its own price, give it a different route name.',
    )
  } else {
    lines.push(`Edit ${card} instead, or give this one a different route name${p.hasSupplier ? '' : ' or pick its supplier'}.`)
  }
  return lines.join(' ')
}
