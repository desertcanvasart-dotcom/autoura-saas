// ============================================
// The network profile's cities and languages: picked from fixed lists
// ============================================
// Suppliers used to type them as free text ("الاقصر وأسوان", "الإنجليزية
// والروسية"), so a search for Luxor or English never found them and the
// English-only rule (D3) did not hold. The profile form offers these lists;
// what was typed before is read on the server by lib/supplier-network-picks
// (kept out of here so its Arabic name maps never reach a browser bundle).

import { EGYPT_CITIES } from '@/lib/constants/egypt-cities'

export const NETWORK_CITIES: readonly string[] = EGYPT_CITIES

export const NETWORK_LANGUAGES: readonly string[] = [
  'English', 'Arabic', 'French', 'German', 'Spanish', 'Italian', 'Portuguese', 'Russian',
  'Ukrainian', 'Polish', 'Czech', 'Hungarian', 'Romanian', 'Greek', 'Dutch', 'Swedish',
  'Norwegian', 'Danish', 'Finnish', 'Turkish', 'Hebrew', 'Persian', 'Hindi', 'Chinese',
  'Japanese', 'Korean', 'Thai', 'Vietnamese', 'Indonesian', 'Malay',
]
