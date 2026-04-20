// ============================================
// EGYPT CITY COORDINATES
// Hardcoded lat/lng — no geocoding API needed.
// ============================================

export interface CityCoordinate {
  lat: number
  lng: number
  label: string
}

export const EGYPT_CITY_COORDINATES: Record<string, CityCoordinate> = {
  'Abu Simbel':       { lat: 22.3372, lng: 31.6258, label: 'Abu Simbel' },
  'Abydos':           { lat: 26.1852, lng: 31.9190, label: 'Abydos' },
  'Alamein':          { lat: 30.8340, lng: 28.9564, label: 'Alamein' },
  'Alexandria':       { lat: 31.2001, lng: 29.9187, label: 'Alexandria' },
  'Aswan':            { lat: 24.0889, lng: 32.8998, label: 'Aswan' },
  'Asyut':            { lat: 27.1809, lng: 31.1837, label: 'Asyut' },
  'Bahariya':         { lat: 28.3486, lng: 28.8628, label: 'Bahariya' },
  'Beni Suef':        { lat: 29.0661, lng: 31.0994, label: 'Beni Suef' },
  'Cairo':            { lat: 30.0444, lng: 31.2357, label: 'Cairo' },
  'Dahab':            { lat: 28.5007, lng: 34.5133, label: 'Dahab' },
  'Dakhla':           { lat: 25.4948, lng: 29.0009, label: 'Dakhla' },
  'Dendera':          { lat: 26.1424, lng: 32.6700, label: 'Dendera' },
  'Edfu':             { lat: 24.9779, lng: 32.8734, label: 'Edfu' },
  'El Arish':         { lat: 31.1311, lng: 33.7956, label: 'El Arish' },
  'El Balyana':       { lat: 26.2350, lng: 31.8994, label: 'El Balyana' },
  'El Gouna':         { lat: 27.1827, lng: 33.6807, label: 'El Gouna' },
  'El Quseir':        { lat: 26.1000, lng: 34.2800, label: 'El Quseir' },
  'El Tor':           { lat: 28.2406, lng: 33.6192, label: 'El Tor' },
  'Esna':             { lat: 25.2919, lng: 32.5540, label: 'Esna' },
  'Farafra':          { lat: 27.0568, lng: 27.9700, label: 'Farafra' },
  'Fayoum':           { lat: 29.3084, lng: 30.8428, label: 'Fayoum' },
  'Giza':             { lat: 30.0131, lng: 31.2089, label: 'Giza' },
  'Hurghada':         { lat: 27.2579, lng: 33.8116, label: 'Hurghada' },
  'Ismailia':         { lat: 30.5965, lng: 32.2715, label: 'Ismailia' },
  'Kharga':           { lat: 25.4397, lng: 30.5590, label: 'Kharga' },
  'Kom Ombo':         { lat: 24.4520, lng: 32.9457, label: 'Kom Ombo' },
  'Luxor':            { lat: 25.6872, lng: 32.6396, label: 'Luxor' },
  'Marsa Alam':       { lat: 25.0633, lng: 34.8980, label: 'Marsa Alam' },
  'Memphis':          { lat: 29.8516, lng: 31.2545, label: 'Memphis' },
  'Minya':            { lat: 28.0871, lng: 30.7500, label: 'Minya' },
  'Nuweiba':          { lat: 29.0469, lng: 34.6726, label: 'Nuweiba' },
  'Port Said':        { lat: 31.2653, lng: 32.3019, label: 'Port Said' },
  'Qena':             { lat: 26.1551, lng: 32.7180, label: 'Qena' },
  'Rafah':            { lat: 31.2747, lng: 34.2383, label: 'Rafah' },
  'Rosetta (Rashid)': { lat: 31.4040, lng: 30.4168, label: 'Rosetta' },
  'Safaga':           { lat: 26.7472, lng: 33.9360, label: 'Safaga' },
  'Saint Catherine':  { lat: 28.5588, lng: 33.9385, label: 'Saint Catherine' },
  'Saqqara':          { lat: 29.8713, lng: 31.2165, label: 'Saqqara' },
  'Sharm El Sheikh':  { lat: 27.9158, lng: 34.3300, label: 'Sharm El Sheikh' },
  'Sheikh Zuweid':    { lat: 31.2156, lng: 34.0925, label: 'Sheikh Zuweid' },
  'Siwa':             { lat: 29.2032, lng: 25.5195, label: 'Siwa' },
  'Sohag':            { lat: 26.5591, lng: 31.6948, label: 'Sohag' },
  'Suez':             { lat: 29.9668, lng: 32.5498, label: 'Suez' },
  'Taba':             { lat: 29.4913, lng: 34.8980, label: 'Taba' },
}

const CITY_ALIASES: Record<string, string> = {
  'cairo/giza': 'Cairo', 'giza pyramids': 'Giza', 'pyramids': 'Giza',
  'old cairo': 'Cairo', 'islamic cairo': 'Cairo', 'coptic cairo': 'Cairo',
  'khan el khalili': 'Cairo', 'egyptian museum': 'Cairo', 'citadel': 'Cairo',
  'valley of the kings': 'Luxor', 'valley of the queens': 'Luxor',
  'karnak': 'Luxor', 'karnak temple': 'Luxor', 'luxor temple': 'Luxor',
  'west bank': 'Luxor', 'east bank': 'Luxor', 'hatshepsut temple': 'Luxor',
  'colossi of memnon': 'Luxor', 'philae': 'Aswan', 'philae temple': 'Aswan',
  'unfinished obelisk': 'Aswan', 'high dam': 'Aswan', 'nubian village': 'Aswan',
  'sharm': 'Sharm El Sheikh', 'sharm el-sheikh': 'Sharm El Sheikh',
  'siwa oasis': 'Siwa', 'bahariya oasis': 'Bahariya', 'white desert': 'Farafra',
  'black desert': 'Bahariya', 'western desert': 'Bahariya',
  'dakhla oasis': 'Dakhla', 'kharga oasis': 'Kharga', 'farafra oasis': 'Farafra',
  'rosetta': 'Rosetta (Rashid)', 'rashid': 'Rosetta (Rashid)',
  'el fayoum': 'Fayoum', 'st. catherine': 'Saint Catherine',
  'st catherine': 'Saint Catherine', 'mount sinai': 'Saint Catherine',
  'el alamein': 'Alamein', 'port said': 'Port Said', 'marsa alam': 'Marsa Alam',
  'el gouna': 'El Gouna', 'el quseir': 'El Quseir', 'beni suef': 'Beni Suef',
  'abu simbel': 'Abu Simbel', 'kom ombo': 'Kom Ombo',
}

export const NILE_CRUISE_CITIES = ['Luxor', 'Esna', 'Edfu', 'Kom Ombo', 'Aswan']

export function resolveCityCoordinates(cityName: string): CityCoordinate | null {
  if (!cityName || cityName.trim() === '') return null
  const trimmed = cityName.trim()

  // Exact match
  if (EGYPT_CITY_COORDINATES[trimmed]) return EGYPT_CITY_COORDINATES[trimmed]

  // Alias match
  const aliasKey = trimmed.toLowerCase()
  if (CITY_ALIASES[aliasKey]) return EGYPT_CITY_COORDINATES[CITY_ALIASES[aliasKey]] || null

  // Case-insensitive
  const lower = trimmed.toLowerCase()
  for (const [key, coords] of Object.entries(EGYPT_CITY_COORDINATES)) {
    if (key.toLowerCase() === lower) return coords
  }

  // Partial match
  for (const [key, coords] of Object.entries(EGYPT_CITY_COORDINATES)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return coords
  }

  // Alias partial match
  for (const [alias, canonical] of Object.entries(CITY_ALIASES)) {
    if (lower.includes(alias) || alias.includes(lower)) return EGYPT_CITY_COORDINATES[canonical] || null
  }

  return null
}
