// ============================================
// The lines a supplier voucher prints, and what the edit page's picker adds
// ============================================
// A voucher's `services` are its lines: Generate writes them from the trip,
// with each line's date and notes.
//
//   * The PDF took the first of selected_routes / selected_meals /
//     selected_guides / selected_attractions / services that was not null.
//     supplier_documents has no selected_* columns today, so `services` won —
//     but an empty list is not null, and the sibling app's
//     selected_attractions DEFAULT '[]' printed every generated voucher with
//     an empty items table. The first list that HAS lines wins here.
//   * The edit page's attractions picker replaced `services` on every save,
//     for every document type — a hotel, cruise or generated service order
//     lost its lines. The picker cannot be loaded back (there is no column
//     for it), so what it holds is lines to ADD.

type Line = Record<string, unknown>

function nonEmpty(list: unknown): list is Line[] {
  return Array.isArray(list) && list.length > 0
}

/** The lines to print: `services` when there are any, else the first other list with lines. */
export function voucherLines(doc: {
  services?: unknown
  selected_routes?: unknown
  selected_meals?: unknown
  selected_guides?: unknown
  selected_attractions?: unknown
}): Line[] {
  const lists = [doc.services, doc.selected_routes, doc.selected_meals, doc.selected_guides, doc.selected_attractions]
  return lists.find(nonEmpty) ?? []
}

export interface PickedAttraction {
  attraction_name: string
  city?: string | null
  eur_rate: number
  quantity: number
}

/** A voucher's lines with the picked entrance fees added after them. */
export function withPickedAttractions(services: unknown, picked: PickedAttraction[]): Line[] {
  const existing = Array.isArray(services) ? (services as Line[]) : []
  return [
    ...existing,
    ...picked.map(a => ({
      service_name: a.attraction_name,
      service_type: 'entrance_fee',
      city: a.city ?? null,
      quantity: a.quantity,
      unit_rate: a.eur_rate,
      total_cost: a.eur_rate * a.quantity,
    })),
  ]
}
