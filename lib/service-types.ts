/**
 * The vocabulary for `departments.service_types`.
 *
 * This is not cosmetic. `findDepartmentForServiceType` (lib/ai/task-generation)
 * matches an itinerary service's `service_type` against these arrays to decide
 * which department a generated task routes to, and returns null on no match —
 * so a task with an unrecognised service type lands unassigned, silently. That
 * is why the departments editor offers a fixed multi-select rather than free
 * text.
 *
 * Two groups:
 *
 *  - ROUTABLE — emitted by itinerary_services, so putting one of these on a
 *    department makes that department receive the matching auto-generated
 *    tasks.
 *  - BACK_OFFICE — no itinerary service ever emits these. The seeded
 *    Accounting department carries them (migration 214) and consequently
 *    receives no auto-generated tasks at all. They are kept because they
 *    describe what a department does, and removing them would silently
 *    rewrite the seeded rows.
 */

export interface ServiceTypeOption {
  value: string
  label: string
  /** Whether an itinerary service can actually emit this type. */
  routable: boolean
}

export const ROUTABLE_SERVICE_TYPES: ServiceTypeOption[] = [
  { value: 'accommodation', label: 'Accommodation', routable: true },
  { value: 'cruise', label: 'Nile cruises', routable: true },
  { value: 'meal', label: 'Meals & restaurants', routable: true },
  { value: 'transportation', label: 'Transport', routable: true },
  { value: 'flight', label: 'Flights', routable: true },
  { value: 'guide', label: 'Guides', routable: true },
  { value: 'entrance', label: 'Entrance tickets', routable: true },
  { value: 'airport_service', label: 'Airport services', routable: true },
  { value: 'hotel_service', label: 'Hotel porterage', routable: true },
]

export const BACK_OFFICE_SERVICE_TYPES: ServiceTypeOption[] = [
  { value: 'invoice', label: 'Invoices', routable: false },
  { value: 'payment', label: 'Payments', routable: false },
  { value: 'commission', label: 'Commissions', routable: false },
]

export const ALL_SERVICE_TYPES: ServiceTypeOption[] = [
  ...ROUTABLE_SERVICE_TYPES,
  ...BACK_OFFICE_SERVICE_TYPES,
]

const ALLOWED = new Set(ALL_SERVICE_TYPES.map(t => t.value))

export function isValidServiceType(value: string): boolean {
  return ALLOWED.has(value)
}

export function serviceTypeLabel(value: string): string {
  return ALL_SERVICE_TYPES.find(t => t.value === value)?.label ?? value
}
