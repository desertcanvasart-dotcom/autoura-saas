// ============================================
// Reading typed cities and languages into the network lists (server)
// ============================================
// Split on commas and "and"/"و", matched case-insensitively, Arabic names
// mapped to the English ones (lib/supplier-network-lists). Anything that
// does not match comes back as `unknown`, so the supplier is asked to pick
// again. Pure; used by the profile routes, not by client components.

import { NETWORK_CITIES, NETWORK_LANGUAGES } from '@/lib/supplier-network-lists'

/** Arabic letters folded so spelling variants meet (أ/إ/آ → ا, ة → ه, ى → ي). */
const foldArabic = (s: string) => s
  .replace(/[ً-ْ]/g, '')
  .replace(/[أإآ]/g, 'ا')
  .replace(/ة/g, 'ه')
  .replace(/ى/g, 'ي')

const CITY_ALIASES: Record<string, string> = {
  'القاهره': 'Cairo', 'الجيزه': 'Giza', 'الاقصر': 'Luxor', 'اسوان': 'Aswan',
  'الاسكندريه': 'Alexandria', 'اسكندريه': 'Alexandria', 'الغردقه': 'Hurghada',
  'شرم الشيخ': 'Sharm El Sheikh', 'دهب': 'Dahab', 'سيوه': 'Siwa', 'الفيوم': 'Fayoum',
  'مرسي علم': 'Marsa Alam', 'ابو سمبل': 'Abu Simbel', 'ادفو': 'Edfu', 'كوم امبو': 'Kom Ombo',
  'سانت كاترين': 'Saint Catherine', 'بورسعيد': 'Port Said', 'بور سعيد': 'Port Said',
  'السويس': 'Suez', 'الاسماعيليه': 'Ismailia', 'العلمين': 'Alamein', 'سقاره': 'Saqqara',
  'الواحات البحريه': 'Bahariya', 'البحريه': 'Bahariya', 'طابا': 'Taba', 'نويبع': 'Nuweiba',
  'سفاجا': 'Safaga', 'القصير': 'El Quseir', 'الجونه': 'El Gouna', 'المنيا': 'Minya',
  'اسيوط': 'Asyut', 'سوهاج': 'Sohag', 'قنا': 'Qena', 'دندره': 'Dendera', 'اسنا': 'Esna',
  'ابيدوس': 'Abydos', 'رشيد': 'Rosetta (Rashid)',
  sharm: 'Sharm El Sheikh', hurgada: 'Hurghada', alex: 'Alexandria', 'st catherine': 'Saint Catherine',
}

const LANGUAGE_ALIASES: Record<string, string> = {
  'الانجليزيه': 'English', 'انجليزي': 'English', 'الانجليزي': 'English', 'العربيه': 'Arabic', 'عربي': 'Arabic',
  'الفرنسيه': 'French', 'فرنسي': 'French', 'الالمانيه': 'German', 'الماني': 'German',
  'الاسبانيه': 'Spanish', 'اسباني': 'Spanish', 'الايطاليه': 'Italian', 'ايطالي': 'Italian',
  'البرتغاليه': 'Portuguese', 'الروسيه': 'Russian', 'روسي': 'Russian', 'الاوكرانيه': 'Ukrainian',
  'البولنديه': 'Polish', 'اليونانيه': 'Greek', 'الهولنديه': 'Dutch', 'التركيه': 'Turkish',
  'العبريه': 'Hebrew', 'الفارسيه': 'Persian', 'الهنديه': 'Hindi', 'الصينيه': 'Chinese',
  'اليابانيه': 'Japanese', 'ياباني': 'Japanese', 'الكوريه': 'Korean', 'التايلانديه': 'Thai',
  mandarin: 'Chinese', farsi: 'Persian',
}

/** "Luxor and Aswan", "الاقصر وأسوان", "Cairo / Giza" → separate words. */
export function splitPicks(values: readonly string[]): string[] {
  return values
    .flatMap(v => String(v).split(/[,،;\/&]|\s+and\s+|\s+و(?=\S)/i))
    .map(v => v.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
}

/**
 * What was typed or picked → the list's words. `known` keeps the list's
 * spelling, in order, without repeats; `unknown` is what matched nothing.
 */
export function normalizePicks(values: readonly string[] | null | undefined, kind: 'city' | 'language'): { known: string[]; unknown: string[] } {
  const listed = kind === 'city' ? NETWORK_CITIES : NETWORK_LANGUAGES
  const aliases = kind === 'city' ? CITY_ALIASES : LANGUAGE_ALIASES
  const byLower = new Map(listed.map(w => [w.toLowerCase(), w]))
  const known: string[] = []
  const unknown: string[] = []
  for (const raw of splitPicks(values ?? [])) {
    const key = foldArabic(raw.toLowerCase())
    const hit = byLower.get(key) ?? aliases[key] ?? aliases[key.replace(/^ال/, '')] ?? aliases[`ال${key}`]
    if (hit) { if (!known.includes(hit)) known.push(hit) }
    else if (!unknown.includes(raw)) unknown.push(raw)
  }
  return { known, unknown }
}
