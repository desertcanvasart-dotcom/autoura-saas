// The vehicle classes a transport voucher can name, and how they print.
// One list for the edit page's picker and the voucher PDF.
export const VOUCHER_VEHICLE_TYPES: Record<string, string> = {
  sedan: 'Sedan (1-3 pax)',
  suv: 'SUV / 4x4 (1-4 pax)',
  minivan: 'Minivan (4-6 pax)',
  van: 'Van (7-10 pax)',
  minibus: 'Minibus (11-20 pax)',
  bus: 'Bus (21+ pax)',
  luxury_sedan: 'Luxury Sedan',
  luxury_van: 'Luxury Van / Sprinter',
}
