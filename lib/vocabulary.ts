// ============================================
// Tenant vocabularies — each agency's own words
// ============================================
// The shared shape behind /settings/vocabulary, /api/vocabulary and the
// useVocabulary hook. What a KIND is, which kinds exist, what a supplier
// type's BEHAVIOUR means, and the pure helpers (slugs, ranks, lookups) —
// all tested in lib/__tests__/vocabulary.test.ts. The Egypt preset itself
// lives in SQL (seed_tenant_vocabulary, first in migration 334, last
// redefined in 341) so the database can seed a brand-new tenant without the
// app in the loop.

export const VOCABULARY_KINDS = [
  'tier', 'supplier_type', 'board_basis', 'vehicle_type',
  'cruise_cabin', 'sleeper_cabin', 'meal_type', 'hotel_property_type',
  'train_class',
] as const
export type VocabularyKind = (typeof VOCABULARY_KINDS)[number]

export function isVocabularyKind(v: unknown): v is VocabularyKind {
  return (VOCABULARY_KINDS as readonly string[]).includes(String(v))
}

export interface VocabularyKindInfo {
  kind: VocabularyKind
  title: string
  /** One line for the settings screen: what this list is. */
  description: string
  /** Where the agency will meet these words. */
  usedIn: string
  /** Fewer than this and the app cannot work (a quote needs a tier). */
  minItems: number
  /** Example of "your own words", to invite renaming. */
  example: string
}

export const VOCABULARY_KIND_INFO: Record<VocabularyKind, VocabularyKindInfo> = {
  tier: {
    kind: 'tier',
    title: 'Service tiers',
    description: 'The quality levels you sell, from lowest to highest. Every rate, quote and tour variation is filed under one of these.',
    usedIn: 'Quotes, tour variations, hotel and cruise rates, content library',
    minItems: 2,
    example: 'Budget / Standard / Deluxe / Luxury — or 3★ / 4★ / 5★',
  },
  supplier_type: {
    kind: 'supplier_type',
    title: 'Supplier types',
    description: 'The kinds of companies you buy from. Each one behaves like a built-in kind (a hotel gets a Properties tab, a transport company gets rate linkage) — rename them, hide the ones you never use, or add your own.',
    usedIn: 'Suppliers section, rate forms, expenses',
    minItems: 1,
    example: '"Fleet partner" instead of "Transport Company"',
  },
  board_basis: {
    kind: 'board_basis',
    title: 'Board basis',
    description: 'Meal plans a hotel rate can carry.',
    usedIn: 'Hotel rates, quotes',
    minItems: 1,
    example: 'Room Only / B&B / Half Board / Full Board / All Inclusive',
  },
  vehicle_type: {
    kind: 'vehicle_type',
    title: 'Vehicle types',
    description: 'The vehicles you price transport with, and how many passengers each carries — the pricing engine picks the smallest vehicle that fits the group.',
    usedIn: 'Transport rates, pricing engine, supplier fleets',
    minItems: 1,
    example: 'Sedan (1–2) / Minivan (3–8) / Coach (25–45)',
  },
  cruise_cabin: {
    kind: 'cruise_cabin',
    title: 'Cruise cabin types',
    description: 'Cabin categories on a Nile or lake cruise.',
    usedIn: 'Cruise rates',
    minItems: 1,
    example: 'Standard / Deluxe / Suite',
  },
  sleeper_cabin: {
    kind: 'sleeper_cabin',
    title: 'Sleeping-train cabins',
    description: 'Cabin types on overnight trains.',
    usedIn: 'Sleeping-train rates',
    minItems: 1,
    example: 'Half Twin / Single',
  },
  train_class: {
    kind: 'train_class',
    title: 'Train classes',
    description: 'Seat classes on day trains.',
    usedIn: 'Train rates, quotes',
    minItems: 1,
    example: 'First Class / Second Class AC / Business Class',
  },
  meal_type: {
    kind: 'meal_type',
    title: 'Meal types',
    description: 'The meals a restaurant rate can be for.',
    usedIn: 'Restaurant and meal rates, itinerary days',
    minItems: 1,
    example: 'Breakfast / Lunch / Dinner',
  },
  hotel_property_type: {
    kind: 'hotel_property_type',
    title: 'Accommodation types',
    description: 'What kind of place a hotel rate is for.',
    usedIn: 'Hotel rates',
    minItems: 1,
    example: 'Hotel / Resort / Camp / Dahabiya',
  },
}

/** The built-in supplier kinds the app knows how to treat. An agency's
 *  supplier type entry points at one of these; the label is theirs. */
export const SUPPLIER_BEHAVIORS = [
  { key: 'hotel', label: 'Hotel', effect: 'Properties tab (hotels); picked by hotel rates' },
  { key: 'transport_company', label: 'Transport company', effect: 'Rates tab; picked by transport rates' },
  { key: 'airline', label: 'Airline', effect: 'Picked by flight rates' },
  { key: 'train_operator', label: 'Train operator', effect: 'Properties tab (trains); picked by train rates' },
  { key: 'driver', label: 'Driver', effect: 'Rates tab; commissions' },
  { key: 'guide', label: 'Guide', effect: 'Picked by guide rates; commissions' },
  { key: 'cruise', label: 'Cruise line', effect: 'Properties tab (ships); picked by cruise rates' },
  { key: 'activity_provider', label: 'Activity provider', effect: 'Picked by activity rates' },
  { key: 'attraction', label: 'Attraction', effect: 'Picked by entrance fees' },
  { key: 'tour_operator', label: 'Tour operator', effect: 'Partner agencies' },
  { key: 'ground_handler', label: 'Ground handler', effect: 'Service orders; commissions' },
  { key: 'restaurant', label: 'Restaurant', effect: 'Picked by meal rates' },
  { key: 'shop', label: 'Shop', effect: 'Commissions' },
  { key: 'other', label: 'Other', effect: 'No special behaviour' },
] as const
export type SupplierBehavior = (typeof SUPPLIER_BEHAVIORS)[number]['key']

export function isSupplierBehavior(v: unknown): v is SupplierBehavior {
  return SUPPLIER_BEHAVIORS.some(b => b.key === v)
}

export interface VocabularyItem {
  id: string
  tenant_id: string
  kind: VocabularyKind | string
  key: string
  label: string
  description: string | null
  behavior: string | null
  rank: number
  meta: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
}

export const KEY_PATTERN = /^[a-z0-9][a-z0-9_]{0,59}$/
export const MAX_LABEL_LENGTH = 80

/** A machine key from the agency's word: "5★ Deluxe" → "5_deluxe",
 *  "Bed & Breakfast" → "bed_breakfast". Empty when nothing survives. */
export function slugifyKey(label: string): string {
  return String(label ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 60)
}

/** A key that does not collide with the existing ones: "van", "van_2", … */
export function uniqueKey(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing)
  const root = base || 'item'
  if (!taken.has(root)) return root
  for (let i = 2; ; i++) {
    const candidate = `${root.slice(0, 60 - String(i).length - 1)}_${i}`
    if (!taken.has(candidate)) return candidate
  }
}

export function nextRank(items: Pick<VocabularyItem, 'rank'>[]): number {
  return items.reduce((m, i) => Math.max(m, i.rank), 0) + 1
}

/** Active entries in display order. */
export function activeInOrder<T extends Pick<VocabularyItem, 'rank' | 'is_active' | 'label'>>(items: T[]): T[] {
  return items.filter(i => i.is_active).sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
}

/** The agency's word for a stored key; the key itself when unknown (a row
 *  written before the entry was deleted must still read as something). */
export function labelFor(items: Pick<VocabularyItem, 'key' | 'label'>[], key: string | null | undefined): string {
  if (key == null || key === '') return ''
  return items.find(i => i.key === key)?.label ?? key
}

export type VocabularyValidation = { ok: true } | { ok: false; error: string }

/** Whether an entry may be written: label present and short, key well
 *  formed, behaviour only on supplier types and only a known one, pax range
 *  sane on vehicle types. */
export function validateVocabularyItem(input: {
  kind: string
  key: string
  label: string
  behavior?: string | null
  meta?: Record<string, unknown> | null
}): VocabularyValidation {
  if (!isVocabularyKind(input.kind)) return { ok: false, error: 'Unknown vocabulary kind' }
  const label = String(input.label ?? '').trim()
  if (!label) return { ok: false, error: 'A label is required' }
  if (label.length > MAX_LABEL_LENGTH) return { ok: false, error: `Labels are at most ${MAX_LABEL_LENGTH} characters` }
  if (!KEY_PATTERN.test(input.key)) return { ok: false, error: 'The key must be lowercase letters, digits and underscores' }
  if (input.kind === 'supplier_type') {
    if (!isSupplierBehavior(input.behavior)) return { ok: false, error: 'A supplier type must behave like one of the built-in kinds' }
  } else if (input.behavior) {
    return { ok: false, error: 'Only supplier types carry a behaviour' }
  }
  if (input.kind === 'vehicle_type') {
    const min = Number(input.meta?.min_pax), max = Number(input.meta?.max_pax)
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
      return { ok: false, error: 'A vehicle type needs a passenger range (minimum 1, maximum at least the minimum)' }
    }
  }
  return { ok: true }
}

/** Whether deactivating or deleting this entry would leave the kind below
 *  its minimum. */
export function wouldBreakMinimum(kind: VocabularyKind, items: Pick<VocabularyItem, 'id' | 'is_active'>[], removingId: string): boolean {
  const remaining = items.filter(i => i.is_active && i.id !== removingId).length
  return remaining < VOCABULARY_KIND_INFO[kind].minItems
}

/** Group a flat fetch by kind, active and ordered inside each. */
export function groupByKind(items: VocabularyItem[]): Record<VocabularyKind, VocabularyItem[]> {
  const out = Object.fromEntries(VOCABULARY_KINDS.map(k => [k, [] as VocabularyItem[]])) as Record<VocabularyKind, VocabularyItem[]>
  for (const it of items) if (isVocabularyKind(it.kind)) out[it.kind].push(it)
  for (const k of VOCABULARY_KINDS) out[k].sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
  return out
}

// ------------------------------------------------------------------
// Translating between the agency's ladder and the platform's preset
// ------------------------------------------------------------------
// The pricing engine and the AI parsers were written against four words.
// Where they still need a NOTION of "low / mid / high" (a tipping
// multiplier, a staff-rate category, a prompt hint), they ask for the
// preset word at the same POSITION on the agency's ladder — never the
// agency's word itself.

export const PRESET_TIERS = ['budget', 'standard', 'deluxe', 'luxury'] as const
export type PresetTier = (typeof PRESET_TIERS)[number]

/** Words people use for a tier, mapped onto the preset. */
export const TIER_SYNONYMS: Record<string, PresetTier> = {
  budget: 'budget', economy: 'budget', cheap: 'budget', basic: 'budget', '3 star': 'budget', '3-star': 'budget', '3*': 'budget',
  standard: 'standard', 'mid-range': 'standard', midrange: 'standard', moderate: 'standard', '4 star': 'standard', '4-star': 'standard', '4*': 'standard',
  deluxe: 'deluxe', superior: 'deluxe', 'first class': 'deluxe', 'first-class': 'deluxe', '5 star': 'deluxe', '5-star': 'deluxe', '5*': 'deluxe',
  luxury: 'luxury', premium: 'luxury', vip: 'luxury', 'high-end': 'luxury', ultra: 'luxury',
}

/** Position 0..total-1 → step 0..steps-1 on the preset ladder. */
export function ladderStep(position: number, total: number, steps: number = PRESET_TIERS.length): number {
  if (total <= 1 || position < 0) return steps - 1
  const p = Math.min(position, total - 1)
  // Round half DOWN: the middle of a three-tier ladder is "standard", not "deluxe".
  return Math.ceil((p * (steps - 1)) / (total - 1) - 0.5)
}

/** The preset word at this tier's position on the agency's ladder. An
 *  unknown tier reads as 'standard'. */
export function presetTierFor(ladder: readonly string[], tier: string | null | undefined): PresetTier {
  if (!tier) return 'standard'
  const pos = ladder.indexOf(tier)
  if (pos < 0) return (PRESET_TIERS as readonly string[]).includes(tier) ? (tier as PresetTier) : 'standard'
  return PRESET_TIERS[ladderStep(pos, ladder.length)]
}

/** The agency's tier at the preset word's position: budget → lowest,
 *  luxury → highest, standard / deluxe → a third and two thirds up. */
export function tierFromPreset(ladder: readonly string[], preset: PresetTier): string {
  if (ladder.length === 0) return preset
  const step = PRESET_TIERS.indexOf(preset)
  const pos = Math.round((step * (ladder.length - 1)) / (PRESET_TIERS.length - 1))
  return ladder[pos]
}

/** What "standard" means on this ladder — the default tier for anything
 *  that arrives without one. */
export function defaultTierKey(ladder: readonly string[]): string {
  return tierFromPreset(ladder, 'standard')
}

/** A stored key from whatever a person typed: the key itself, the label
 *  (case-insensitive), or anything that slugifies to the key. */
export function resolveVocabularyKey(items: readonly Pick<VocabularyItem, 'key' | 'label'>[], value: string | null | undefined): string | null {
  if (value == null) return null
  const raw = String(value).trim()
  if (!raw) return null
  const lower = raw.toLowerCase()
  const slug = slugifyKey(raw)
  const hit = items.find(i => i.key === raw)
    ?? items.find(i => i.label.toLowerCase() === lower)
    ?? items.find(i => i.key === slug)
    ?? items.find(i => slugifyKey(i.label) === slug)
  return hit?.key ?? null
}

/** A tier key for a free-text tier: the agency's own word if it matches,
 *  else a synonym mapped by position, else the ladder's default. */
export function normalizeTierKey(value: string | null | undefined, items: readonly Pick<VocabularyItem, 'key' | 'label'>[]): string {
  const ladder = items.map(i => i.key)
  const direct = resolveVocabularyKey(items, value)
  if (direct) return direct
  const lower = String(value ?? '').trim().toLowerCase()
  const preset = lower ? TIER_SYNONYMS[lower] : undefined
  if (preset) return tierFromPreset(ladder, preset)
  return defaultTierKey(ladder)
}

/** Tipping and similar per-tier multipliers, by ladder position. */
export function tierMultiplier(ladder: readonly string[], tier: string, table: readonly number[] = [0.8, 1.0, 1.2, 1.5]): number {
  const pos = ladder.indexOf(tier)
  if (pos < 0) return table[1]
  return table[ladderStep(pos, ladder.length, table.length)]
}

export interface VehicleBand { key: string; min_pax: number; max_pax: number }

/** The smallest vehicle that seats the group; failing that, the smallest
 *  whose maximum covers it; failing that, the largest there is. */
export function vehicleForPax(vehicles: readonly VehicleBand[], pax: number): string | null {
  if (vehicles.length === 0) return null
  const sized = [...vehicles].sort((a, b) => a.max_pax - b.max_pax || a.min_pax - b.min_pax)
  const exact = sized.find(v => pax >= v.min_pax && pax <= v.max_pax)
  if (exact) return exact.key
  const covers = sized.find(v => v.max_pax >= pax)
  if (covers) return covers.key
  return sized[sized.length - 1].key
}

/** Which import/CSV columns are vocabulary keys, and of which kind. */
export const VOCABULARY_COLUMNS: Record<string, VocabularyKind> = {
  tier: 'tier',
  board_basis: 'board_basis',
  meal_type: 'meal_type',
  vehicle_type: 'vehicle_type',
  property_type: 'hotel_property_type',
  cabin_type: 'sleeper_cabin',
  class_type: 'train_class',
  ship_category: 'tier',
}

/** Re-file a record's vocabulary columns as stored keys. Values that match
 *  nothing are reported, never guessed. */
export function resolveRecordKeys(
  record: Record<string, unknown>,
  vocab: Partial<Record<VocabularyKind, readonly Pick<VocabularyItem, 'key' | 'label'>[]>>,
  columnKinds: Record<string, VocabularyKind> = VOCABULARY_COLUMNS
): { record: Record<string, unknown>; errors: string[] } {
  const out = { ...record }
  const errors: string[] = []
  for (const [column, kind] of Object.entries(columnKinds)) {
    const value = out[column]
    if (value == null || String(value).trim() === '') continue
    const items = vocab[kind]
    if (!items || items.length === 0) continue // no vocabulary for this kind: leave as typed
    const key = resolveVocabularyKey(items, String(value))
    if (key) out[column] = key
    else errors.push(`${column}: "${String(value)}" is not in your ${kind.replace(/_/g, ' ')} list (Settings → Your vocabulary)`)
  }
  return { record: out, errors }
}
