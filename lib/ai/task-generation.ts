// ============================================
// TASK GENERATION: AI-powered operations task creation
// Analyzes itinerary services and generates actionable tasks
// ============================================

// Service type to department mapping (matches departments.service_types in DB)
export const SERVICE_TYPE_TO_DEPARTMENT: Record<string, string> = {
  accommodation: 'Reservation',
  cruise: 'Reservation',
  meal: 'Reservation',
  transportation: 'Reservation',
  flight: 'Aviation',
  guide: 'Execution',
  entrance: 'Execution',
  airport_service: 'Execution',
  hotel_service: 'Execution',
}

export interface ItineraryForTasks {
  itinerary_code: string
  client_name: string
  start_date: string
  end_date: string
  total_days: number
  num_adults: number
  num_children: number
  num_infants?: number
  status: string
  trip_name?: string
}

export interface DayForTasks {
  day_number: number
  date: string
  city: string
  title: string
  overnight_city?: string
  services: ServiceForTasks[]
}

export interface ServiceForTasks {
  service_type: string
  service_name: string
  quantity: number
  total_cost: number
  notes: string | null
  supplier_name: string | null
}

export interface GeneratedTask {
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  suggested_due_date: string
  service_type: string
}

/**
 * Build the Claude prompt for task generation
 */
export function buildTaskGenerationPrompt(
  itinerary: ItineraryForTasks,
  daysWithServices: DayForTasks[]
): string {
  const paxDesc = [
    `${itinerary.num_adults} adult${itinerary.num_adults !== 1 ? 's' : ''}`,
    itinerary.num_children > 0 ? `${itinerary.num_children} child${itinerary.num_children !== 1 ? 'ren' : ''}` : '',
    (itinerary.num_infants || 0) > 0 ? `${itinerary.num_infants} infant${(itinerary.num_infants || 0) !== 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(', ')

  const servicesSection = daysWithServices.map(day => {
    const serviceLines = day.services.map(s => {
      const parts = [`  - ${s.service_type}: "${s.service_name}" | qty: ${s.quantity}`]
      if (s.total_cost) parts.push(`cost: EUR ${s.total_cost}`)
      if (s.supplier_name) parts.push(`supplier: ${s.supplier_name}`)
      if (s.notes) parts.push(`notes: ${s.notes}`)
      return parts.join(' | ')
    }).join('\n')
    return `Day ${day.day_number} (${day.date}) - ${day.city}${day.overnight_city && day.overnight_city !== day.city ? ` → overnight: ${day.overnight_city}` : ''} - "${day.title}":\n${serviceLines}`
  }).join('\n\n')

  return `You are an operations manager for an Egypt travel agency. Analyze this confirmed itinerary and generate a list of specific, actionable operations tasks that need to be completed before the trip begins.

ITINERARY:
- Code: ${itinerary.itinerary_code}
- Client: ${itinerary.client_name}
- Trip: ${itinerary.trip_name || 'N/A'}
- Dates: ${itinerary.start_date} to ${itinerary.end_date} (${itinerary.total_days} days)
- Travelers: ${paxDesc}

SERVICES BY DAY:
${servicesSection}

TASK GENERATION RULES:
1. Create ONE task per logical reservation/operation.
2. CONSOLIDATE multi-day services: If the same hotel appears on Day 1-4, create ONE task "Reserve 4 nights at [Hotel Name]" — NOT four separate tasks.
3. CONSOLIDATE same-type services across days: If guides are needed Day 1-5, create ONE task for booking the guide covering all dates.
4. For each task provide:
   - title: Short, imperative, actionable (e.g., "Reserve 4 nights at Marriott Mena House")
   - description: Full operational details — dates, room count, pax count, supplier name, special requirements, check-in/out dates
   - priority: "high" for accommodation and flights, "medium" for guides and transport, "low" for entrance tickets
   - suggested_due_date: ISO date string calculated as follows:
     * Accommodation bookings: 14 days before trip start (${itinerary.start_date})
     * Flight tickets: 14 days before trip start
     * Guide bookings: 7 days before trip start
     * Vehicle/transport arrangements: 7 days before trip start
     * Airport services: 5 days before trip start
     * Entrance tickets: 3 days before trip start
     * Restaurant/meal reservations: 5 days before trip start
   - service_type: ONE of: "accommodation", "cruise", "meal", "transportation", "flight", "guide", "entrance", "airport_service", "hotel_service"

5. DO NOT create tasks for: tips, water bottles, supplies, or items marked as automatically handled.
6. DO create tasks for: hotel reservations, guide bookings, vehicle arrangements, airport rep coordination, cruise cabin bookings, specific restaurant reservations, bulk entrance ticket purchases, flight ticket bookings (if flight_info is mentioned in notes).
7. If flight information appears in service notes (e.g., "Flight: MS956 arriving 05:10"), create a "flight" type task for coordinating/confirming that flight ticket.
8. For cruise services, create a task for cabin booking with embarkation/disembarkation details.

Return ONLY a valid JSON array. No markdown, no explanation, just the array:
[
  {
    "title": "Reserve 4 nights at Marriott Mena House, Cairo",
    "description": "Book 1 double room for 2 guests.\\nCheck-in: 2025-04-15\\nCheck-out: 2025-04-19\\nGuests: Mr. & Mrs. Johnson (2 adults)\\nSupplier: Marriott Mena House",
    "priority": "high",
    "suggested_due_date": "2025-04-01",
    "service_type": "accommodation"
  }
]`
}

/**
 * Parse Claude's response to extract the task array
 */
export function parseTaskGenerationResponse(responseText: string): GeneratedTask[] {
  // Try to extract JSON array
  const jsonMatch = responseText.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    throw new Error('AI response did not contain a valid JSON array')
  }

  const parsed = JSON.parse(jsonMatch[0])
  if (!Array.isArray(parsed)) {
    throw new Error('AI response is not an array')
  }

  // Validate and sanitize each task
  const validServiceTypes = new Set([
    'accommodation', 'cruise', 'meal', 'transportation',
    'flight', 'guide', 'entrance', 'airport_service', 'hotel_service'
  ])

  return parsed
    .filter((task: any) => task.title && task.service_type)
    .map((task: any) => ({
      title: String(task.title).slice(0, 500),
      description: String(task.description || '').slice(0, 2000),
      priority: ['low', 'medium', 'high', 'urgent'].includes(task.priority) ? task.priority : 'medium',
      suggested_due_date: task.suggested_due_date || '',
      service_type: validServiceTypes.has(task.service_type) ? task.service_type : 'transportation',
    }))
}

/**
 * Find the department that handles a given service_type
 */
export function findDepartmentForServiceType(
  serviceType: string,
  departments: { id: string; name: string; service_types: string[] }[]
): { id: string; name: string } | null {
  for (const dept of departments) {
    if (dept.service_types?.includes(serviceType)) {
      return { id: dept.id, name: dept.name }
    }
  }
  return null
}
