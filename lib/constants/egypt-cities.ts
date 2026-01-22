// Egyptian Cities - Shared constant for all supplier and rate modules
export const EGYPT_CITIES = [
  'Abu Simbel',
  'Abydos',
  'Alamein',
  'Alexandria',
  'Aswan',
  'Asyut',
  'Bahariya',
  'Beni Suef',
  'Cairo',
  'Dahab',
  'Dakhla',
  'Dendera',
  'Edfu',
  'El Arish',
  'El Balyana',
  'El Gouna',
  'El Quseir',
  'El Tor',
  'Esna',
  'Farafra',
  'Fayoum',
  'Giza',
  'Hurghada',
  'Ismailia',
  'Kharga',
  'Kom Ombo',
  'Luxor',
  'Marsa Alam',
  'Memphis',
  'Minya',
  'Nuweiba',
  'Port Said',
  'Qena',
  'Rafah',
  'Rosetta (Rashid)',
  'Safaga',
  'Saint Catherine',
  'Saqqara',
  'Sharm El Sheikh',
  'Sheikh Zuweid',
  'Siwa',
  'Sohag',
  'Suez',
  'Taba'
] as const

export type EgyptCity = typeof EGYPT_CITIES[number]

// Helper for dropdowns - returns options with value and label
export const EGYPT_CITY_OPTIONS = EGYPT_CITIES.map(city => ({
  value: city,
  label: city
}))