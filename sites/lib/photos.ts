// ============================================
// Photos for a tour, matched from its sights and cities (redesign mock-up)
// ============================================
// The shape of the planned photo library (operator, 2026-10-27): a shared,
// licensed set of Egypt's places, matched to each tour by the names in its
// records, so a tour has pictures without the agency doing anything. The
// agency's own photos (facts.images) always come first.
//
// MOCK-UP ONLY: these are Wikimedia Commons images, used for the local
// preview of the new design. Before this ships they are replaced by the
// licensed library (decision pending) and served from our own storage.

export interface Photo { src: string; alt: string; credit: string }

const commons = (file: string, alt: string): Photo => ({
  src: `https://commons.wikimedia.org/wiki/Special:FilePath/${file}?width=1600`,
  alt,
  credit: 'Wikimedia Commons',
})

/** Keywords (lower case) → photo. The first keyword found in a name wins. */
const LIBRARY: Array<{ keys: string[]; photo: Photo }> = [
  { keys: ['sphinx'], photo: commons('Great_Sphinx_of_Giza_-_20080716a.jpg', 'The Great Sphinx of Giza') },
  { keys: ['giza', 'pyramids'], photo: commons('All_Gizah_Pyramids.jpg', 'The pyramids of Giza') },
  { keys: ['saqqara', 'djoser', 'step pyramid', 'dahshur', 'red pyramid', 'memphis'], photo: commons('Saqqara_pyramid_ver_2.jpg', 'The Step Pyramid of Djoser at Saqqara') },
  { keys: ['abu simbel'], photo: commons('Abu_Simbel_Temple_May_30_2007.jpg', 'The temples of Abu Simbel') },
  { keys: ['valley of the kings', 'west bank', 'hatshepsut', 'thebes'], photo: commons('Valley_of_the_Kings_panorama.jpg', 'The Valley of the Kings') },
  { keys: ['luxor', 'karnak'], photo: commons('Luxor_Temple_R02.jpg', 'Luxor Temple') },
  { keys: ['egyptian museum', 'museum'], photo: commons('Egyptian_Museum_Cairo.jpg', 'The Egyptian Museum in Cairo') },
  { keys: ['white desert', 'desert', 'oasis', 'oases', 'bahariya', 'farafra'], photo: commons('White_Desert_Egypt.jpg', 'The White Desert') },
  { keys: ['aswan', 'philae', 'kom ombo', 'edfu'], photo: commons('Aswan_Nile.jpg', 'The Nile at Aswan') },
  { keys: ['felucca', 'nile', 'cruise', 'sailing'], photo: commons('Felucca_on_the_Nile.jpg', 'A felucca on the Nile') },
  { keys: ['cairo', 'citadel', 'khan', 'alexandria'], photo: commons('Cairo_From_Tower_(cropped).jpg', 'Cairo from above') },
]

const FALLBACK = LIBRARY.find(l => l.keys.includes('felucca'))!.photo

export function photoFor(name: string | null | undefined): Photo | null {
  const n = (name ?? '').toLowerCase()
  if (!n) return null
  return LIBRARY.find(l => l.keys.some(k => n.includes(k)))?.photo ?? null
}

/** A tour's photos: its own first, then the library's for its name, sights
 *  and cities — each once. Never empty: a tour always has a picture. */
export function tourPhotos(input: { name: string; images?: string[]; sights?: string[]; cities?: (string | null)[] }): Photo[] {
  const own = (input.images ?? []).map(src => ({ src, alt: input.name, credit: '' }))
  const matched = [input.name, ...(input.sights ?? []), ...(input.cities ?? [])].map(photoFor).filter((p): p is Photo => p !== null)
  const seen = new Set<string>()
  const out = [...own, ...matched].filter(p => (seen.has(p.src) ? false : (seen.add(p.src), true)))
  return out.length ? out : [FALLBACK]
}
