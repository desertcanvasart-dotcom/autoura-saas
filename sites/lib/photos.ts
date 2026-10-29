// ============================================
// Photos for a tour, matched from its sights and cities (redesign mock-up)
// ============================================
// The shape of the planned photo library (operator, 2026-10-27): a shared,
// licensed set of Egypt's places, matched to each tour by the names in its
// records, so a tour has pictures without the agency doing anything. The
// agency's own photos (facts.images) always come first.
//
// The library is OFF unless PUBLISH_PHOTO_LIBRARY=commons — set only for the
// local preview (.claude/launch.json). These are Wikimedia Commons images,
// whose licences ask for each photographer's credit, so they never reach a
// live company site (operator, 2026-10-28). With the library off, a tour
// shows the agency's own photos, and the themes draw a colour panel in the
// agency's palette where there are none. The licensed library (decision
// pending) replaces this list and is served from our own storage.

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

/** Whether library photos may be shown (local preview only, for now). */
export function libraryEnabled(): boolean {
  return process.env.PUBLISH_PHOTO_LIBRARY === 'commons'
}

export function photoFor(name: string | null | undefined): Photo | null {
  const n = (name ?? '').toLowerCase()
  if (!n || !libraryEnabled()) return null
  return LIBRARY.find(l => l.keys.some(k => n.includes(k)))?.photo ?? null
}

/** A tour's photos: its own first, then the library's for its name, sights
 *  and cities — each once. With the library on, never empty; with it off,
 *  only the agency's own (possibly none — the theme draws a colour panel). */
export function tourPhotos(input: { name: string; images?: string[]; sights?: string[]; cities?: (string | null)[] }): Photo[] {
  const own = (input.images ?? []).map(src => ({ src, alt: input.name, credit: '' }))
  const matched = [input.name, ...(input.sights ?? []), ...(input.cities ?? [])].map(photoFor).filter((p): p is Photo => p !== null)
  const seen = new Set<string>()
  const out = [...own, ...matched].filter(p => (seen.has(p.src) ? false : (seen.add(p.src), true)))
  return out.length || !libraryEnabled() ? out : [FALLBACK]
}

// ---------- the default pictures (live on every site) ----------
// Never an empty box (operator, 2026-10-29): a tour with no photo of its own
// shows the default picture of its first itinerary site, a destination its
// own. Until the licensed photo set is chosen, the defaults are line
// drawings of each place in the agency's colours (blocks/SiteArt.tsx) — our
// own work, so they may appear on any live site. The agency's uploads always
// replace them.

export type ArtKey = 'step-pyramid' | 'giza' | 'sphinx' | 'abu-simbel' | 'valley' | 'karnak' | 'temple' | 'museum'
  | 'desert' | 'sea' | 'alexandria' | 'cairo' | 'nile'

/** Keywords (lower case) → drawing; the first keyword found in a name wins,
 *  so the more particular places come first. Names are the records' own. */
const ART: Array<{ keys: string[]; art: ArtKey; alt: string }> = [
  { keys: ['sphinx'], art: 'sphinx', alt: 'The Great Sphinx of Giza' },
  { keys: ['step pyramid', 'djoser', 'saqqara', 'sakkara', 'dahshur', 'red pyramid', 'bent pyramid', 'memphis'], art: 'step-pyramid', alt: 'The Step Pyramid of Djoser at Saqqara' },
  { keys: ['giza', 'pyramid'], art: 'giza', alt: 'The pyramids of Giza' },
  { keys: ['abu simbel'], art: 'abu-simbel', alt: 'The temples of Abu Simbel' },
  { keys: ['valley of the kings', 'valley of the queens', 'west bank', 'hatshepsut', 'deir el', 'thebes', 'tomb', 'colossi'], art: 'valley', alt: 'The Valley of the Kings' },
  { keys: ['karnak', 'luxor', 'hypostyle'], art: 'karnak', alt: 'The columns of Karnak' },
  { keys: ['edfu', 'kom ombo', 'philae', 'dendera', 'esna', 'abydos', 'horus', 'temple'], art: 'temple', alt: 'An ancient Egyptian temple' },
  { keys: ['museum'], art: 'museum', alt: 'The Egyptian Museum' },
  { keys: ['white desert', 'black desert', 'desert', 'oasis', 'oases', 'bahariya', 'farafra', 'siwa', 'crystal mountain', 'safari', 'fayoum', 'wadi'], art: 'desert', alt: 'The Western Desert' },
  { keys: ['red sea', 'hurghada', 'sharm', 'dahab', 'marsa', 'gouna', 'makadi', 'soma bay', 'snorkel', 'diving', 'sinai'], art: 'sea', alt: 'The Red Sea coast' },
  { keys: ['alexandria', 'qaitbay'], art: 'alexandria', alt: 'The Citadel of Qaitbay in Alexandria' },
  { keys: ['cairo', 'citadel', 'khan', 'mosque', 'coptic', 'islamic', 'bazaar'], art: 'cairo', alt: 'The domes and minarets of Cairo' },
  { keys: ['aswan', 'felucca', 'nile', 'cruise', 'sailing', 'nubia', 'nubian'], art: 'nile', alt: 'A felucca on the Nile' },
]
const ART_FALLBACK = ART[ART.length - 1]

/** A picture: the agency's (or the preview library's) photo, or a drawing. */
export type Picture = { kind: 'photo'; src: string; alt: string } | { kind: 'art'; art: ArtKey; alt: string }

function artFor(name: string | null | undefined): { art: ArtKey; alt: string } | null {
  const n = (name ?? '').toLowerCase()
  return n ? ART.find(l => l.keys.some(k => n.includes(k))) ?? null : null
}

/** The default picture for the first of these names the library knows —
 *  pass them in order (the first itinerary site first). Never null. */
export function defaultPicture(names: Array<string | null | undefined>): Picture {
  for (const name of names) {
    const photo = photoFor(name)
    if (photo) return { kind: 'photo', src: photo.src, alt: photo.alt }
    const art = artFor(name)
    if (art) return { kind: 'art', ...art }
  }
  return { kind: 'art', art: ART_FALLBACK.art, alt: ART_FALLBACK.alt }
}

/** A tour's picture: its own first photo, else the default of its first
 *  itinerary site (then its other sites, its name and its cities). */
export function tourPicture(input: { name: string; image?: string | null; places?: string[]; cities?: string[] }): Picture {
  if (input.image) return { kind: 'photo', src: input.image, alt: input.name }
  return defaultPicture([...(input.places ?? []), input.name, ...(input.cities ?? [])])
}
