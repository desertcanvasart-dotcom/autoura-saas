// ============================================
// The vehicle and driver a transport voucher names
// ============================================
// A transport voucher can carry several of the trip's transport lines
// (itinerary_services, which hold vehicle_type and driver_name since
// migration 132). The voucher has one vehicle field and one driver field
// (migration 402), so:
//   vehicle  the first line that names one: the PDF prints it as a vehicle
//            class (sedan, minivan…), so it stays a single key, not a list;
//   driver   every distinct name, in trip order.
// Neither is invented: a voucher whose lines name nothing stays blank and
// the PDF prints "To be assigned".

type CrewLine = { vehicle_type?: string | null; driver_name?: string | null }

export function transportCrew(lines: CrewLine[]): { vehicle_type: string | null; driver_name: string | null } {
  const vehicle = lines.map(l => l.vehicle_type?.trim()).find(Boolean) ?? null
  const drivers = [...new Set(lines.map(l => l.driver_name?.trim()).filter((d): d is string => !!d))]
  const driver = drivers.join(', ').slice(0, 255) || null
  return { vehicle_type: vehicle, driver_name: driver }
}
