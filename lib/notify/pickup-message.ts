// ============================================
// The pickup details message to the client
// ============================================
// What the traveller needs the evening before a day out: when and where they
// are picked up, and who will be there — the guide, the driver (and the car),
// the airport representative — with numbers they can call. Built from the
// trip's own assignments for that day, so it names the people actually
// booked. The operator reviews (and can edit) the text before it goes.
// Pure, so tested.

export interface PickupPerson {
  name: string
  phone?: string | null
}

export interface PickupMessageInput {
  agency?: string | null
  clientName?: string | null
  tripName?: string | null
  /** YYYY-MM-DD */
  date: string
  dayNumber?: number | null
  time?: string | null
  place?: string | null
  guide?: PickupPerson | null
  driver?: PickupPerson | null
  /** "Toyota HiAce (8 pax)" */
  vehicle?: string | null
  airport?: PickupPerson | null
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "Friday, 2 October" — spelled out here, since locale data differs between runtimes. */
function longDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

const person = (p: PickupPerson) => (p.phone?.trim() ? `${p.name.trim()} (${p.phone.trim()})` : p.name.trim())

export function buildPickupMessage(m: PickupMessageInput): string {
  const first = m.clientName?.trim().split(/\s+/)[0] || 'there'
  const lines: string[] = [`Hello ${first},`, '']
  lines.push(`Here are your pickup details for ${longDate(m.date)}${m.dayNumber ? ` (day ${m.dayNumber}` + (m.tripName?.trim() ? ` of ${m.tripName.trim()})` : ')') : m.tripName?.trim() ? ` — ${m.tripName.trim()}` : ''}:`)
  lines.push('')
  lines.push(`🕐 Pickup time: ${m.time?.trim() || 'to be confirmed'}`)
  lines.push(`📍 Pickup point: ${m.place?.trim() || 'to be confirmed'}`)
  if (m.airport?.name?.trim()) lines.push(`🛬 Meeting you at the airport: ${person(m.airport)}`)
  if (m.guide?.name?.trim()) lines.push(`🧭 Your guide: ${person(m.guide)}`)
  if (m.driver?.name?.trim()) lines.push(`🚐 Your driver: ${person(m.driver)}${m.vehicle?.trim() ? ` — ${m.vehicle.trim()}` : ''}`)
  else if (m.vehicle?.trim()) lines.push(`🚐 Your vehicle: ${m.vehicle.trim()}`)
  lines.push('')
  lines.push('Please be ready a few minutes early. If anything changes, reply to this message.')
  lines.push('')
  lines.push(m.agency?.trim() ? `${m.agency.trim()} team` : 'Your travel team')
  return lines.join('\n')
}
