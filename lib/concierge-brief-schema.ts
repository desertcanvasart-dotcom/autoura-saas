// ============================================
// CONCIERGE BRIEF — VALIDATION + MAPPING (pure, no DB)
// ============================================
// Validates the inbound payload and maps it onto:
//   - a concierge_briefs row
//   - a clients upsert (status='prospect', client_source='concierge')
//   - client_preferences + client_notes payloads
//
// Pure functions only, so the webhook route AND the dry-run preview
// share identical logic.
// ============================================

export interface ConciergeBriefPayload {
  session_id?: string
  conversation_id?: string
  submitted_at?: string
  prompt_version?: string
  language?: string
  /** Origin brand key; routes the brief to a tenant via concierge_brand_mappings. */
  brand?: string
  brief_revision?: number
  is_update?: boolean
  visitor?: {
    name?: string
    email?: string
    phone?: string
    preferred_contact?: string
    timezone?: string
  }
  trip?: {
    travelers_count?: number
    travelers_detail?: string
    dates_specific?: string | null
    dates_window?: string | null
    trip_length_days?: number
    origin_city?: string
    nationality?: string
    international_flights?: boolean
  }
  preferences?: {
    destinations?: string[]
    comfort_level?: string
    interests?: string[]
    must_see?: string[]
    must_avoid?: string[]
  }
  constraints?: {
    dietary?: string | null
    mobility?: string | null
    religious?: string | null
    medical?: string | null
  }
  brief_summary?: string
  full_transcript?: Array<{ role?: string; content?: string; timestamp?: string }>
  follow_up_window?: {
    committed_response_by?: string
    cairo_time_label?: string
    visitor_local_label?: string
  }
  [key: string]: unknown
}

export interface ValidationError {
  field: string
  message: string
}

// ---- comfort_level -> client_preferences.preferred_tier ----
// PROVISIONAL. The concierge prompt may emit richer terms (boutique 5-star,
// international 5-star, mid-range...); final mapping confirmed from the
// concierge's briefExtraction.ts.
export const COMFORT_LEVEL_TO_TIER: Record<string, string> = {
  luxury: 'luxury',
  'boutique 5-star': 'luxury',
  boutique: 'luxury',
  'international 5-star': 'deluxe',
  comfort: 'deluxe',
  deluxe: 'deluxe',
  standard: 'standard',
  'mid-range': 'standard',
  midrange: 'standard',
  budget: 'budget',
}

export function mapComfortLevelToTier(comfortLevel?: string | null): string {
  if (!comfortLevel) return 'standard'
  const key = comfortLevel.trim().toLowerCase()
  if (COMFORT_LEVEL_TO_TIER[key]) return COMFORT_LEVEL_TO_TIER[key]
  // keyword fallback so an unforeseen value still lands sensibly
  if (key.includes('lux') || key.includes('boutique')) return 'luxury'
  if (key.includes('deluxe') || key.includes('comfort')) return 'deluxe'
  if (key.includes('budget') || key.includes('economy')) return 'budget'
  return 'standard'
}

export function mapLanguageToLabel(language?: string | null): string {
  switch ((language || '').trim().toLowerCase()) {
    case 'en': return 'English'
    case 'es': return 'Spanish'
    default: return 'English'
  }
}

export function splitName(name?: string | null): { first_name: string; last_name: string } {
  const trimmed = (name || '').trim()
  if (!trimmed) return { first_name: 'Concierge', last_name: 'Lead' }
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return { first_name: parts[0], last_name: parts[0] }
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') }
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  return v.filter((x): x is string => typeof x === 'string')
}

function nonEmpty(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

// ---- validation ----
export const BRAND_KEY_MAX_LENGTH = 64

/**
 * Canonical form of a brand key: lowercase, trimmed. Returns null when the
 * value is absent, not a string, or empty after trimming — the routing layer
 * treats null as "no brand" (legacy env/first-tenant resolution).
 */
export function normalizeBrandKey(brand: unknown): string | null {
  if (typeof brand !== 'string') return null
  const key = brand.trim().toLowerCase()
  return key.length > 0 ? key : null
}

export interface ValidateOk { ok: true; payload: ConciergeBriefPayload }
export interface ValidateErr { ok: false; errors: ValidationError[] }

/**
 * Structural validation. Returns 422-worthy errors. Note: a missing
 * email AND phone is NOT an error here — it is allowed and flagged
 * downstream as `unactionable_no_contact`.
 */
export function validateBrief(body: unknown): ValidateOk | ValidateErr {
  const errors: ValidationError[] = []

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, errors: [{ field: '(root)', message: 'Payload must be a JSON object.' }] }
  }
  const p = body as ConciergeBriefPayload

  if (!nonEmpty(p.conversation_id)) {
    errors.push({ field: 'conversation_id', message: 'conversation_id is required and must be a non-empty string.' })
  }

  if (p.brief_revision !== undefined) {
    if (typeof p.brief_revision !== 'number' || !Number.isInteger(p.brief_revision) || p.brief_revision < 1) {
      errors.push({ field: 'brief_revision', message: 'brief_revision must be an integer >= 1 when present.' })
    }
  }

  if (p.is_update !== undefined && typeof p.is_update !== 'boolean') {
    errors.push({ field: 'is_update', message: 'is_update must be a boolean when present.' })
  }

  if (p.brand !== undefined) {
    if (typeof p.brand !== 'string' || p.brand.trim().length === 0) {
      errors.push({ field: 'brand', message: 'brand must be a non-empty string when present.' })
    } else if (p.brand.trim().length > BRAND_KEY_MAX_LENGTH) {
      errors.push({ field: 'brand', message: `brand must be at most ${BRAND_KEY_MAX_LENGTH} characters.` })
    }
  }

  if (p.visitor !== undefined && (typeof p.visitor !== 'object' || p.visitor === null || Array.isArray(p.visitor))) {
    errors.push({ field: 'visitor', message: 'visitor must be an object when present.' })
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, payload: p }
}

// ---- mapping ----
export interface MappedBrief {
  // concierge_briefs scalar columns (sans id/timestamps/client_id/raw_payload)
  briefRow: Record<string, unknown>
  // clients upsert (mirrors app/api/clients/route.ts insert shape)
  client: {
    first_name: string
    last_name: string
    email: string | null
    phone: string | null
    nationality: string
    status: string
    client_type: string
    passport_type: string
    preferred_language: string
    client_source: string
    vip_status: boolean
  }
  clientMatch: { email: string | null; phone: string | null }
  preferences: {
    preferred_tier: string
    interests: string
    special_needs: string | null
  }
  note: string | null
  flags: string[]
  isActionable: boolean
  briefRevision: number
}

/** Concatenate the four structured constraints into the single
 *  client_preferences.special_needs free-text field. */
export function buildSpecialNeeds(c?: ConciergeBriefPayload['constraints']): string | null {
  if (!c) return null
  const parts: string[] = []
  if (nonEmpty(c.dietary)) parts.push(`Dietary: ${c.dietary}`)
  if (nonEmpty(c.mobility)) parts.push(`Mobility: ${c.mobility}`)
  if (nonEmpty(c.religious)) parts.push(`Religious: ${c.religious}`)
  if (nonEmpty(c.medical)) parts.push(`Medical: ${c.medical}`)
  return parts.length ? parts.join(' | ') : null
}

export function mapBrief(p: ConciergeBriefPayload): MappedBrief {
  const visitor = p.visitor ?? {}
  const trip = p.trip ?? {}
  const prefs = p.preferences ?? {}
  const constraints = p.constraints ?? {}
  const followUp = p.follow_up_window ?? {}

  const email = nonEmpty(visitor.email)
  const phone = nonEmpty(visitor.phone)
  const isActionable = !!(email || phone)
  const flags: string[] = []
  if (!isActionable) flags.push('unactionable_no_contact')

  const { first_name, last_name } = splitName(visitor.name)
  const briefRevision = typeof p.brief_revision === 'number' ? p.brief_revision : 1

  const interestsArr = asStringArray(prefs.interests) ?? []

  const briefRow: Record<string, unknown> = {
    conversation_id: p.conversation_id,
    session_id: nonEmpty(p.session_id),
    brief_revision: briefRevision,
    is_update: p.is_update ?? false,
    prompt_version: nonEmpty(p.prompt_version),
    language: nonEmpty(p.language),
    brand: normalizeBrandKey(p.brand),
    submitted_at: nonEmpty(p.submitted_at),

    visitor_name: nonEmpty(visitor.name),
    visitor_email: email,
    visitor_phone: phone,
    preferred_contact: nonEmpty(visitor.preferred_contact),
    visitor_timezone: nonEmpty(visitor.timezone),

    travelers_count: typeof trip.travelers_count === 'number' ? trip.travelers_count : null,
    travelers_detail: nonEmpty(trip.travelers_detail),
    dates_specific: nonEmpty(trip.dates_specific),
    dates_window: nonEmpty(trip.dates_window),
    trip_length_days: typeof trip.trip_length_days === 'number' ? trip.trip_length_days : null,
    origin_city: nonEmpty(trip.origin_city),
    nationality: nonEmpty(trip.nationality),
    international_flights: typeof trip.international_flights === 'boolean' ? trip.international_flights : null,

    destinations: asStringArray(prefs.destinations),
    comfort_level: nonEmpty(prefs.comfort_level),
    interests: asStringArray(prefs.interests),
    must_see: asStringArray(prefs.must_see),
    must_avoid: asStringArray(prefs.must_avoid),

    constraint_dietary: nonEmpty(constraints.dietary),
    constraint_mobility: nonEmpty(constraints.mobility),
    constraint_religious: nonEmpty(constraints.religious),
    constraint_medical: nonEmpty(constraints.medical),

    brief_summary: nonEmpty(p.brief_summary),
    full_transcript: Array.isArray(p.full_transcript) ? p.full_transcript : null,

    committed_response_by: nonEmpty(followUp.committed_response_by),
    cairo_time_label: nonEmpty(followUp.cairo_time_label),
    visitor_local_label: nonEmpty(followUp.visitor_local_label),

    is_actionable: isActionable,
    flags,
  }

  return {
    briefRow,
    client: {
      first_name,
      last_name,
      email,
      phone,
      nationality: nonEmpty(trip.nationality) ?? 'Unknown',
      status: 'prospect',
      client_type: 'individual',
      passport_type: 'other',
      preferred_language: mapLanguageToLabel(p.language),
      client_source: 'concierge',
      vip_status: false,
    },
    clientMatch: { email, phone },
    preferences: {
      preferred_tier: mapComfortLevelToTier(prefs.comfort_level),
      interests: interestsArr.join(', '),
      special_needs: buildSpecialNeeds(constraints),
    },
    note: nonEmpty(p.brief_summary),
    flags,
    isActionable,
    briefRevision,
  }
}
