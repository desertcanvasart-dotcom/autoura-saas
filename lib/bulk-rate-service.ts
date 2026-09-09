import { SUPPORTED_CURRENCIES } from '@/lib/currency'
import { seasonsFromAccommodationColumns, seasonsFromCruiseColumns } from '@/lib/rates/rate-seasons'
import { cruiseNightsOf } from '@/lib/rates/cruise-ppd'
/**
 * Bulk Rate Import/Export Service
 * Provides CSV import/export for all rate tables with validation and upsert.
 */

// ============================================
// TYPES
// ============================================

export interface RateTableConfig {
  tableName: string
  displayName: string
  columns: ColumnDef[]
  uniqueKey: string[]       // columns used for upsert matching
}

export interface ColumnDef {
  name: string
  label: string
  type: 'text' | 'number' | 'boolean' | 'date'
  required: boolean
  exportOnly?: boolean     // e.g., id, created_at — included in export but not required for import
  // A column the FORM no longer asks for, kept so old files still import and
  // exports still round-trip, but left out of the template so nobody fills in
  // a field the UI cannot show them afterwards.
  legacy?: boolean
  // When this column is absent on import, copy that column's value into it.
  // Every rate form here already mirrors one price into both passport columns
  // on save; an import through the slimmed template has to do the same, or it
  // writes a row priced for one passport and blank for the other.
  mirrorFrom?: string
}

export interface ValidationError {
  row: number
  column: string
  message: string
}

export interface ImportResult {
  totalRows: number
  validRows: number
  invalidRows: number
  inserted: number
  updated: number
  errors: ValidationError[]
}

export interface ImportPreview {
  totalRows: number
  validRows: number
  invalidRows: number
  errors: ValidationError[]
  sampleData: Record<string, any>[]  // first 5 rows
}

// ============================================
// COLUMN HELPERS
// ============================================

function col(name: string, label: string, type: ColumnDef['type'], required: boolean, exportOnly = false): ColumnDef {
  return { name, label, type, required, exportOnly }
}

/**
 * A passport-split rate column the form stopped collecting. Out of the
 * template, never required, still imported when present, and mirrored from the
 * primary rate when it is not.
 *
 * The split is real for exactly two things — hotels and Nile cruises, where a
 * room carries two contracted prices. Everything else is one price.
 */
function legacyRate(name: string, label: string, mirrorFrom: string): ColumnDef {
  return { name, label, type: 'number', required: false, legacy: true, mirrorFrom }
}

function id(): ColumnDef { return col('id', 'ID', 'text', false, true) }
function serviceCode(): ColumnDef { return col('service_code', 'Service Code', 'text', false) }
function isActive(): ColumnDef { return col('is_active', 'Active', 'boolean', false) }
function notes(): ColumnDef { return col('notes', 'Notes', 'text', false) }
function createdAt(): ColumnDef { return col('created_at', 'Created At', 'date', false, true) }
function updatedAt(): ColumnDef { return col('updated_at', 'Updated At', 'date', false, true) }
function rateValidFrom(): ColumnDef { return col('rate_valid_from', 'Rate Valid From', 'date', false) }
function rateValidTo(): ColumnDef { return col('rate_valid_to', 'Rate Valid To', 'date', false) }
function supplierId(): ColumnDef { return col('supplier_id', 'Supplier ID', 'text', false) }
function season(): ColumnDef { return col('season', 'Season', 'text', false) }
// P3 per-rate currency: blank = EUR default; validated against the allowed set on import.
function rateCurrency(): ColumnDef { return col('rate_currency', 'Rate Currency', 'text', false) }

// ============================================
// TABLE CONFIGS (14 tables)
// ============================================

export const RATE_TABLE_CONFIGS: Record<string, RateTableConfig> = {
  accommodation_rates: {
    tableName: 'accommodation_rates',
    displayName: 'Hotels / Accommodation',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('property_name', 'Property Name', 'text', true),
      col('property_type', 'Property Type', 'text', false),
      col('city', 'City', 'text', false),
      col('board_basis', 'Board Basis', 'text', false),
      // The engine matches hotels BY TIER — a file without it lands rows in
      // the default bucket (2026-09-05 sweep).
      col('tier', 'Tier', 'text', false),
      col('supplier_name', 'Supplier Name', 'text', false),
      // Low season EUR
      col('pp_double_eur', 'Low PP Double EUR', 'number', false),
      col('single_supp_eur', 'Low Single Supp EUR', 'number', false),
      col('triple_red_eur', 'Low Triple Red EUR', 'number', false),
      // Low season Non-EUR
      col('pp_double_non_eur', 'Low PP Double Non-EUR', 'number', false),
      col('single_supp_non_eur', 'Low Single Supp Non-EUR', 'number', false),
      col('triple_red_non_eur', 'Low Triple Red Non-EUR', 'number', false),
      col('suite_rate_eur', 'Low Suite EUR', 'number', false),
      legacyRate('suite_rate_non_eur', 'Low Suite Non-EUR (legacy)', 'suite_rate_eur'),
      // Low season dates
      col('low_season_from', 'Low Season From', 'date', false),
      col('low_season_to', 'Low Season To', 'date', false),
      // High season EUR
      col('high_pp_double_eur', 'High PP Double EUR', 'number', false),
      col('high_single_supp_eur', 'High Single Supp EUR', 'number', false),
      col('high_triple_red_eur', 'High Triple Red EUR', 'number', false),
      // High season Non-EUR
      col('high_pp_double_non_eur', 'High PP Double Non-EUR', 'number', false),
      col('high_single_supp_non_eur', 'High Single Supp Non-EUR', 'number', false),
      col('high_triple_red_non_eur', 'High Triple Red Non-EUR', 'number', false),
      col('high_season_suite_eur', 'High Suite EUR', 'number', false),
      legacyRate('high_season_suite_non_eur', 'High Suite Non-EUR (legacy)', 'high_season_suite_eur'),
      // High season dates
      col('high_season_from', 'High Season From', 'date', false),
      col('high_season_to', 'High Season To', 'date', false),
      // Peak season EUR
      col('peak_pp_double_eur', 'Peak PP Double EUR', 'number', false),
      col('peak_single_supp_eur', 'Peak Single Supp EUR', 'number', false),
      col('peak_triple_red_eur', 'Peak Triple Red EUR', 'number', false),
      // Peak season Non-EUR
      col('peak_pp_double_non_eur', 'Peak PP Double Non-EUR', 'number', false),
      col('peak_single_supp_non_eur', 'Peak Single Supp Non-EUR', 'number', false),
      col('peak_triple_red_non_eur', 'Peak Triple Red Non-EUR', 'number', false),
      col('peak_season_suite_eur', 'Peak Suite EUR', 'number', false),
      legacyRate('peak_season_suite_non_eur', 'Peak Suite Non-EUR (legacy)', 'peak_season_suite_eur'),
      // Peak season dates
      col('peak_season_from', 'Peak Season From', 'date', false),
      col('peak_season_to', 'Peak Season To', 'date', false),
      col('peak_season_2_from', 'Peak Season 2 From', 'date', false),
      col('peak_season_2_to', 'Peak Season 2 To', 'date', false),
      // Validity
      rateValidFrom(), rateValidTo(), notes(),
      // Contact
      col('contact_name', 'Contact Name', 'text', false),
      col('contact_email', 'Contact Email', 'text', false),
      col('contact_phone', 'Contact Phone', 'text', false),
      col('reservations_email', 'Reservations Email', 'text', false),
      col('reservations_phone', 'Reservations Phone', 'text', false),
      isActive(), createdAt(), updatedAt(),
      rateCurrency(),
    ],
  },

  transportation_rates: {
    tableName: 'transportation_rates',
    displayName: 'Transportation',
    // ONE ROW PER VEHICLE on a route (migration 337): the vehicle is part of
    // the identity. transportation_rates has NO service_code; route_name
    // alone is a human label two distinct rows share (the same route as an
    // airport transfer and as a day tour) — matching on it alone silently
    // overwrote one with the other (A-item 5). This table also has no
    // season, validity dates or notes; supplier_id arrived with migration 355.
    uniqueKey: ['route_name', 'service_type', 'city', 'vehicle_type'],
    columns: [
      id(),
      col('route_name', 'Route Name', 'text', true),
      col('service_type', 'Service Type', 'text', true),
      col('city', 'City', 'text', true),
      col('origin_city', 'Origin City', 'text', false),
      col('destination_city', 'Destination City', 'text', false),
      col('duration', 'Duration', 'text', false),
      col('area', 'Area', 'text', false),
      col('includes', 'Includes', 'text', false),
      // The vehicle, in your own words (Settings → Your vocabulary); the
      // importer turns "Sedan" into its key.
      col('vehicle_type', 'Vehicle', 'text', true),
      col('base_rate_eur', 'Rate', 'number', true),
      legacyRate('base_rate_non_eur', 'Rate Non-EUR (legacy)', 'base_rate_eur'),
      supplierId(),
      col('capacity_min', 'Min Pax', 'number', false),
      col('capacity_max', 'Max Pax', 'number', false),
      isActive(), createdAt(), updatedAt(),
      rateCurrency(),
    ],
  },

  guide_rates: {
    tableName: 'guide_rates',
    displayName: 'Guide Rates',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('guide_language', 'Language', 'text', true),
      col('guide_type', 'Guide Type', 'text', true),
      col('city', 'City', 'text', false),
      col('tour_duration', 'Tour Duration', 'text', true),
      col('base_rate_eur', 'Rate', 'number', true),
      legacyRate('base_rate_non_eur', 'Rate Non-EUR (legacy)', 'base_rate_eur'),
      season(), rateValidFrom(), rateValidTo(),
      supplierId(), notes(), isActive(), createdAt(), updatedAt(),
      rateCurrency(),
    ],
  },

  meal_rates: {
    tableName: 'meal_rates',
    displayName: 'Meal Rates',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('restaurant_name', 'Restaurant Name', 'text', true),
      col('meal_type', 'Meal Type', 'text', false),
      col('cuisine_type', 'Cuisine Type', 'text', false),
      col('restaurant_type', 'Restaurant Type', 'text', false),
      col('city', 'City', 'text', false),
      col('base_rate_eur', 'Rate', 'number', true),
      legacyRate('base_rate_non_eur', 'Rate Non-EUR (legacy)', 'base_rate_eur'),
      col('tier', 'Tier', 'text', false),
      col('meal_category', 'Meal Category', 'text', false),
      col('per_person_rate', 'Per Person', 'boolean', false),
      col('minimum_pax', 'Min Pax', 'number', false),
      season(), rateValidFrom(), rateValidTo(),
      supplierId(),
      col('supplier_name', 'Supplier Name', 'text', false),
      notes(), isActive(),
      col('is_preferred', 'Preferred', 'boolean', false),
      createdAt(), updatedAt(),
      rateCurrency(),
    ],
  },

  entrance_fees: {
    tableName: 'entrance_fees',
    displayName: 'Attractions / Entrance Fees',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('attraction_name', 'Attraction Name', 'text', true),
      col('city', 'City', 'text', true),
      col('fee_type', 'Fee Type', 'text', false),
      col('eur_rate', 'Rate', 'number', true),
      legacyRate('non_eur_rate', 'Non-EUR Rate (legacy)', 'eur_rate'),
      col('student_discount_percentage', 'Student Discount %', 'number', false),
      col('child_discount_percent', 'Child Discount %', 'number', false),
      col('category', 'Category', 'text', false),
      col('is_addon', 'Is Add-on', 'boolean', false),
      col('addon_note', 'Add-on Note', 'text', false),
      season(), rateValidFrom(), rateValidTo(),
      supplierId(), notes(), isActive(), createdAt(), updatedAt(),
      rateCurrency(),
    ],
  },

  flight_rates: {
    tableName: 'flight_rates',
    displayName: 'Flight Rates',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('route_from', 'From', 'text', true),
      col('route_to', 'To', 'text', true),
      col('airline', 'Airline', 'text', true),
      col('flight_number', 'Flight Number', 'text', false),
      col('flight_type', 'Flight Type', 'text', false),
      col('cabin_class', 'Cabin Class', 'text', false),
      col('base_rate_eur', 'Rate', 'number', true),
      // Tax is priced with the fare (engine: fare + tax per pax) — a file
      // without it lands silently underpriced flights (2026-09-05 sweep).
      col('tax_eur', 'Tax EUR', 'number', false),
      legacyRate('tax_non_eur', 'Tax Non-EUR (legacy)', 'tax_eur'),
      // Throughout guide's negotiated fare (B-item 2): blank = customer
      // fare, 0 = rides free.
      col('guide_rate', 'Guide Fare', 'number', false),
      col('airline_code', 'Airline IATA Code', 'text', false),
      legacyRate('base_rate_non_eur', 'Rate Non-EUR (legacy)', 'base_rate_eur'),
      col('baggage_kg', 'Baggage (kg)', 'number', false),
      col('departure_time', 'Departure Time', 'text', false),
      col('arrival_time', 'Arrival Time', 'text', false),
      col('duration_minutes', 'Duration (min)', 'number', false),
      col('frequency', 'Frequency', 'text', false),
      season(), rateValidFrom(), rateValidTo(),
      supplierId(),
      col('supplier_name', 'Supplier Name', 'text', false),
      notes(), isActive(), createdAt(), updatedAt(),
      rateCurrency(),
    ],
  },

  activity_rates: {
    tableName: 'activity_rates',
    displayName: 'Activity Rates',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('activity_name', 'Activity Name', 'text', true),
      col('activity_category', 'Category', 'text', false),
      col('activity_type', 'Activity Type', 'text', false),
      col('duration', 'Duration', 'text', false),
      col('city', 'City', 'text', false),
      col('base_rate_eur', 'Rate', 'number', true),
      legacyRate('base_rate_non_eur', 'Rate Non-EUR (legacy)', 'base_rate_eur'),
      col('pricing_type', 'Pricing Type', 'text', false),
      col('unit_label', 'Unit Label', 'text', false),
      col('min_capacity', 'Min Capacity', 'number', false),
      col('max_capacity', 'Max Capacity', 'number', false),
      season(), rateValidFrom(), rateValidTo(),
      supplierId(),
      col('supplier_name', 'Supplier Name', 'text', false),
      notes(), isActive(), createdAt(), updatedAt(),
      rateCurrency(),
    ],
  },

  tipping_rates: {
    tableName: 'tipping_rates',
    displayName: 'Tipping Rates',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('role_type', 'Role Type', 'text', true),
      col('context', 'Context', 'text', false),
      col('city', 'City', 'text', false),
      col('rate_unit', 'Rate Unit', 'text', true),
      col('rate_eur', 'Rate', 'number', true),
      col('description', 'Description', 'text', false),
      notes(), isActive(),
      rateCurrency(),
    ],
  },

  airport_staff_rates: {
    tableName: 'airport_staff_rates',
    displayName: 'Airport Service Rates',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('airport_code', 'Airport Code', 'text', true),
      col('service_type', 'Service Type', 'text', true),
      col('direction', 'Direction', 'text', true),
      col('rate_eur', 'Rate', 'number', true),
      col('description', 'Description', 'text', false),
      notes(), isActive(),
      rateCurrency(),
    ],
  },

  hotel_staff_rates: {
    tableName: 'hotel_staff_rates',
    displayName: 'Hotel Service Rates',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('service_type', 'Service Type', 'text', true),
      col('hotel_category', 'Hotel Category', 'text', true),
      col('rate_eur', 'Rate', 'number', true),
      col('description', 'Description', 'text', false),
      notes(), isActive(),
      rateCurrency(),
    ],
  },

  nile_cruises: {
    tableName: 'nile_cruises',
    displayName: 'Nile Cruises',
    uniqueKey: ['cruise_code'],
    columns: [
      id(),
      col('cruise_code', 'Cruise Code', 'text', true),
      col('ship_name', 'Ship Name', 'text', true),
      col('ship_category', 'Category', 'text', true),
      col('route_name', 'Route', 'text', true),
      col('embark_city', 'Embark City', 'text', true),
      col('disembark_city', 'Disembark City', 'text', true),
      col('duration_nights', 'Duration (Nights)', 'number', true),
      // Low season
      col('low_season_start', 'Low Season Start', 'date', false),
      col('low_season_end', 'Low Season End', 'date', false),
      col('rate_low_single_eur', 'Low Single EUR', 'number', false),
      col('rate_low_double_eur', 'Low Double EUR', 'number', false),
      col('rate_low_triple_eur', 'Low Triple EUR', 'number', false),
      col('rate_low_suite_eur', 'Low Suite EUR', 'number', false),
      col('rate_low_single_non_eur', 'Low Single Non-EUR', 'number', false),
      col('rate_low_double_non_eur', 'Low Double Non-EUR', 'number', false),
      col('rate_low_triple_non_eur', 'Low Triple Non-EUR', 'number', false),
      col('rate_low_suite_non_eur', 'Low Suite Non-EUR', 'number', false),
      // High season
      col('high_season_start', 'High Season Start', 'date', false),
      col('high_season_end', 'High Season End', 'date', false),
      col('rate_high_single_eur', 'High Single EUR', 'number', false),
      col('rate_high_double_eur', 'High Double EUR', 'number', false),
      col('rate_high_triple_eur', 'High Triple EUR', 'number', false),
      col('rate_high_suite_eur', 'High Suite EUR', 'number', false),
      col('rate_high_single_non_eur', 'High Single Non-EUR', 'number', false),
      col('rate_high_double_non_eur', 'High Double Non-EUR', 'number', false),
      col('rate_high_triple_non_eur', 'High Triple Non-EUR', 'number', false),
      col('rate_high_suite_non_eur', 'High Suite Non-EUR', 'number', false),
      // Peak season
      col('peak_season_1_start', 'Peak Season 1 Start', 'date', false),
      col('peak_season_1_end', 'Peak Season 1 End', 'date', false),
      col('peak_season_2_start', 'Peak Season 2 Start', 'date', false),
      col('peak_season_2_end', 'Peak Season 2 End', 'date', false),
      col('rate_peak_single_eur', 'Peak Single EUR', 'number', false),
      col('rate_peak_double_eur', 'Peak Double EUR', 'number', false),
      col('rate_peak_triple_eur', 'Peak Triple EUR', 'number', false),
      col('rate_peak_suite_eur', 'Peak Suite EUR', 'number', false),
      col('rate_peak_single_non_eur', 'Peak Single Non-EUR', 'number', false),
      col('rate_peak_double_non_eur', 'Peak Double Non-EUR', 'number', false),
      col('rate_peak_triple_non_eur', 'Peak Triple Non-EUR', 'number', false),
      col('rate_peak_suite_non_eur', 'Peak Suite Non-EUR', 'number', false),
      // Other
      rateValidFrom(), rateValidTo(),
      col('meals_included', 'Meals Included', 'text', false),
      col('sightseeing_included', 'Sightseeing Included', 'boolean', false),
      col('tier', 'Tier', 'text', false),
      col('is_preferred', 'Preferred', 'boolean', false),
      supplierId(),
      col('description', 'Description', 'text', false),
      notes(), isActive(),
      col('created_at', 'Created At', 'date', false, true),
      rateCurrency(),
    ],
  },

  train_rates: {
    tableName: 'train_rates',
    displayName: 'Train Rates',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('origin_city', 'Origin City', 'text', true),
      col('destination_city', 'Destination City', 'text', true),
      col('class_type', 'Class Type', 'text', true),
      col('rate_eur', 'Rate', 'number', true),
      col('duration_hours', 'Duration (hours)', 'number', false),
      col('operator_name', 'Operator', 'text', false),
      col('departure_times', 'Departure Times', 'text', false),
      col('guide_rate', 'Guide Fare', 'number', false),
      rateValidFrom(), rateValidTo(),
      supplierId(),
      col('description', 'Description', 'text', false),
      notes(), isActive(), createdAt(), updatedAt(),
      rateCurrency(),
    ],
  },

  sleeping_train_rates: {
    tableName: 'sleeping_train_rates',
    displayName: 'Sleeping Train Rates',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('origin_city', 'Origin City', 'text', true),
      col('destination_city', 'Destination City', 'text', true),
      col('cabin_type', 'Cabin Type', 'text', true),
      col('rate_oneway_eur', 'One-Way EUR', 'number', true),
      col('rate_roundtrip_eur', 'Roundtrip EUR', 'number', false),
      col('departure_time', 'Departure Time', 'text', false),
      col('arrival_time', 'Arrival Time', 'text', false),
      season(), col('guide_rate', 'Guide Fare', 'number', false),
      rateValidFrom(), rateValidTo(),
      col('operator_name', 'Operator', 'text', false),
      supplierId(),
      col('description', 'Description', 'text', false),
      notes(), isActive(), createdAt(), updatedAt(),
      rateCurrency(),
    ],
  },

  extras_catalogue: {
    tableName: 'extras_catalogue',
    displayName: 'Extras Catalogue',
    uniqueKey: ['name'],
    columns: [
      id(),
      col('name', 'Name', 'text', true),
      col('category', 'Category', 'text', false),
      col('description', 'Description', 'text', false),
      // Cost is what the supplier charges; selling_price is an optional PIN —
      // blank means the engine prices cost + quote margin (the extras model).
      col('supplier_cost', 'Supplier Cost', 'number', false),
      col('selling_price', 'Selling Price (pin, optional)', 'number', false),
      col('unit', 'Unit', 'text', false),
      isActive(),
    ],
  },
  fixed_costs: {
    tableName: 'fixed_daily_costs',
    displayName: 'Fixed Costs',
    uniqueKey: ['cost_type'],
    columns: [
      id(),
      col('cost_type', 'Cost Type', 'text', true),
      col('cost_per_person_per_day', 'Cost Per Person/Day', 'number', true),
      col('description', 'Description', 'text', false),
      isActive(), createdAt(), updatedAt(),
      rateCurrency(),
    ],
  },
}

// supplier_code is the portable, human-readable supplier key (SUP-0001) shared
// with the sibling install. It is a VIRTUAL column on rates: no rate table
// stores it — the export fills it by joining the supplier (see the export
// route), and the import resolves it back to THIS tenant's supplier_id and then
// strips it (see the import route). Injected once here, right after
// supplier_id, so every supplier-bearing rate config carries it without editing
// each block. Optional: a row still resolves by supplier_id or supplier_name
// when no code is given.
for (const cfg of Object.values(RATE_TABLE_CONFIGS)) {
  const sidIdx = cfg.columns.findIndex(c => c.name === 'supplier_id')
  if (sidIdx >= 0 && !cfg.columns.some(c => c.name === 'supplier_code')) {
    cfg.columns.splice(sidIdx + 1, 0, col('supplier_code', 'Supplier Code', 'text', false))
  }
}

// ============================================
// VALIDATION
// ============================================

/**
 * Parse a cell value based on the column type.
 */
function parseCell(value: string | undefined | null, colDef: ColumnDef): { parsed: any; error: string | null } {
  const raw = (value ?? '').trim()

  // Empty value
  if (raw === '' || raw === 'null' || raw === 'NULL') {
    if (colDef.required) {
      return { parsed: null, error: `${colDef.label} is required` }
    }
    return { parsed: null, error: null }
  }

  switch (colDef.type) {
    case 'number': {
      const num = Number(raw)
      if (isNaN(num)) {
        return { parsed: null, error: `${colDef.label} must be a number` }
      }
      return { parsed: num, error: null }
    }
    case 'boolean': {
      const lower = raw.toLowerCase()
      if (['true', '1', 'yes', 'y'].includes(lower)) return { parsed: true, error: null }
      if (['false', '0', 'no', 'n'].includes(lower)) return { parsed: false, error: null }
      return { parsed: null, error: `${colDef.label} must be true/false` }
    }
    case 'date': {
      // Accept ISO dates or common formats
      if (/^\d{4}-\d{2}-\d{2}/.test(raw) || /^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
        return { parsed: raw, error: null }
      }
      return { parsed: raw, error: null } // Be lenient with date formats
    }
    case 'text':
    default:
      return { parsed: raw, error: null }
  }
}

/**
 * Validate parsed CSV data against a table config.
 * Returns an ImportPreview with validation results.
 */
export function validateImportData(
  rows: Record<string, string>[],
  config: RateTableConfig
): ImportPreview {
  const errors: ValidationError[] = []
  const validRows: Record<string, any>[] = []

  // Build a lookup of column defs by name
  const colMap = new Map<string, ColumnDef>()
  for (const c of config.columns) {
    colMap.set(c.name, c)
  }

  // Get importable columns (exclude export-only like id, created_at)
  const importableColumns = config.columns.filter(c => !c.exportOnly)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2 // +2 because row 1 is header, data starts at row 2
    const parsedRow: Record<string, any> = {}
    let rowValid = true

    for (const colDef of importableColumns) {
      const rawValue = row[colDef.name]
      const { parsed, error } = parseCell(rawValue, colDef)

      if (error) {
        errors.push({ row: rowNum, column: colDef.name, message: error })
        rowValid = false
      } else if (parsed !== null) {
        // Per-rate currency: only the supported set; blank = EUR default.
        if (colDef.name === 'rate_currency' && !(SUPPORTED_CURRENCIES as readonly string[]).includes(String(parsed).toUpperCase())) {
          errors.push({ row: rowNum, column: colDef.name, message: `Unsupported currency "${parsed}" — use one of ${SUPPORTED_CURRENCIES.join(', ')} (blank = default)` })
          rowValid = false
          continue
        }
        parsedRow[colDef.name] = colDef.name === 'rate_currency' ? String(parsed).toUpperCase() : parsed
      }
    }

    // Mirror before accepting: a file written from the current template has no
    // non-EU column at all, and a consumer that reads it without falling back
    // would price that traveller at zero.
    for (const colDef of importableColumns) {
      if (!colDef.mirrorFrom) continue
      if (parsedRow[colDef.name] == null && parsedRow[colDef.mirrorFrom] != null) {
        parsedRow[colDef.name] = parsedRow[colDef.mirrorFrom]
      }
    }

    if (rowValid) {
      validRows.push(parsedRow)
    }
  }

  return {
    totalRows: rows.length,
    validRows: validRows.length,
    invalidRows: rows.length - validRows.length,
    errors: errors.slice(0, 100), // Cap at 100 errors
    sampleData: validRows.slice(0, 5),
  }
}

/**
 * Generate CSV headers for a table config.
 */

// ============================================
// Canonical column aliases — healing the accommodation split-brain
// ============================================
// accommodation_rates grew two same-unit column families: the ENGINE family
// (ppd_eur / high_season_ppd_eur / …) that pricing, the rate form, and the
// period editor read, and the IMPORTER family (pp_double_eur /
// high_pp_double_eur / …) that this CSV surface and the pricing grid read.
// Migration 220 mirrored importer→engine ONCE; every hotel imported after it
// priced at 0 and opened blank, and every form-created hotel exported blank
// cells and was invisible to the grid. Both units are per-person-in-double —
// the alias is definitional, not a guess.
//
// The permanent rule: every WRITE through the bulk surface fills BOTH
// families (applyCanonicalAliases), the EXPORT reads either
// (exportCellValue), and imported season columns become real dated periods
// (deriveImportSeasons) so imports are native to the periods model.
// Migration 329 backfills existing rows in both directions.
// (nile_cruises is NOT aliased here: its importer family is per-ROOM rates,
// and room→per-person is a conversion, not an alias — tracked separately.)

export const CANONICAL_COLUMN_ALIASES: Record<string, Record<string, string>> = {
  accommodation_rates: {
    pp_double_eur: 'ppd_eur',
    single_supp_eur: 'single_supplement_eur',
    triple_red_eur: 'triple_reduction_eur',
    pp_double_non_eur: 'ppd_non_eur',
    single_supp_non_eur: 'single_supplement_non_eur',
    triple_red_non_eur: 'triple_reduction_non_eur',
    high_pp_double_eur: 'high_season_ppd_eur',
    high_single_supp_eur: 'high_season_single_supplement_eur',
    high_triple_red_eur: 'high_season_triple_reduction_eur',
    high_pp_double_non_eur: 'high_season_ppd_non_eur',
    high_single_supp_non_eur: 'high_season_single_supplement_non_eur',
    high_triple_red_non_eur: 'high_season_triple_reduction_non_eur',
    peak_pp_double_eur: 'peak_season_ppd_eur',
    peak_single_supp_eur: 'peak_season_single_supplement_eur',
    peak_triple_red_eur: 'peak_season_triple_reduction_eur',
    peak_pp_double_non_eur: 'peak_season_ppd_non_eur',
    peak_single_supp_non_eur: 'peak_season_single_supplement_non_eur',
    peak_triple_red_non_eur: 'peak_season_triple_reduction_non_eur',
  },
}


// ── nile_cruises: per-room-CSV ↔ per-person-per-night engine family ──────
// The cruise CSV (both apps, headers identical) carries whole-trip
// PER-PERSON rates by occupancy (Low/High/Peak x Single/Double/Triple),
// while the engine, the form, and the periods model use per-person
// PER-NIGHT figures (ppd / single_supplement / triple_reduction). The
// bridge is arithmetic, locked 2026-09-05 (PR #331 + sibling semantics):
//   ppd/night            = double_trip / nights
//   single supp/night    = (single_trip - double_trip) / nights
//   triple reduction/nt  = (double_trip - triple_trip) / nights
// Suites have no engine equivalent and pass through untouched.

const CRUISE_SEASON_PREFIX: Array<[string, string]> = [
  ['low', ''],
  ['high', 'high_season_'],
  ['peak', 'peak_season_'],
]

function cruiseImportDerive(record: Record<string, unknown>): void {
  const nights = cruiseNightsOf(record as { duration_nights?: number | string | null })
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const hole = (v: unknown) => !(typeof v === 'number' && Number.isFinite(v) && v !== 0)
  for (const [csvSeason, enginePrefix] of CRUISE_SEASON_PREFIX) {
    for (const p of ['eur', 'non_eur']) {
      const double = num(record[`rate_${csvSeason}_double_${p}`])
      if (double <= 0) continue
      const ppdCol = `${enginePrefix}ppd_${p}`
      const suppCol = `${enginePrefix}single_supplement_${p}`
      const redCol = `${enginePrefix}triple_reduction_${p}`
      if (hole(record[ppdCol])) record[ppdCol] = double / nights
      const single = num(record[`rate_${csvSeason}_single_${p}`])
      if (single > 0 && hole(record[suppCol])) {
        record[suppCol] = Math.max(0, (single - double) / nights)
      }
      const triple = num(record[`rate_${csvSeason}_triple_${p}`])
      if (triple > 0 && hole(record[redCol])) {
        record[redCol] = Math.max(0, (double - triple) / nights)
      }
    }
  }
}

/** Export-side reverse: a form-created cruise (engine family only) emits
 *  real per-room-CSV numbers. Returns undefined when not derivable. */
function cruiseExportDerive(row: Record<string, unknown>, column: string): unknown {
  const m = column.match(/^rate_(low|high|peak)_(single|double|triple)_(eur|non_eur)$/)
  if (!m) return undefined
  const [, csvSeason, occupancy, p] = m
  const enginePrefix = CRUISE_SEASON_PREFIX.find(([cs]) => cs === csvSeason)![1]
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const nights = cruiseNightsOf(row as { duration_nights?: number | string | null })
  const ppd = num(row[`${enginePrefix}ppd_${p}`])
  if (ppd <= 0) return undefined
  if (occupancy === 'double') return ppd * nights
  if (occupancy === 'single') return (ppd + num(row[`${enginePrefix}single_supplement_${p}`])) * nights
  return (ppd - num(row[`${enginePrefix}triple_reduction_${p}`])) * nights
}

/** Fill each family from the other, never overwriting an explicit value. */
export function applyCanonicalAliases(table: string, record: Record<string, unknown>): void {
  if (table === 'nile_cruises') {
    cruiseImportDerive(record)
    return
  }
  const aliases = CANONICAL_COLUMN_ALIASES[table]
  if (!aliases) return
  const usable = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v !== 0
  for (const [importer, canonical] of Object.entries(aliases)) {
    if (!usable(record[canonical]) && usable(record[importer])) record[canonical] = record[importer]
    else if (!usable(record[importer]) && usable(record[canonical])) record[importer] = record[canonical]
  }
}

/** Export cell: the named column, else its alias partner. */
export function exportCellValue(table: string, row: Record<string, unknown>, column: string): unknown {
  const direct = row[column]
  if (direct !== null && direct !== undefined && direct !== 0) return direct
  if (table === 'nile_cruises') {
    const derived = cruiseExportDerive(row, column)
    return derived === undefined ? direct : derived
  }
  const aliases = CANONICAL_COLUMN_ALIASES[table]
  if (!aliases) return direct
  const partner =
    aliases[column] ?? Object.entries(aliases).find(([, canon]) => canon === column)?.[0]
  if (!partner) return direct
  const v = row[partner]
  return v === null || v === undefined ? direct : v
}

/** Imported season columns become REAL dated periods, so a bulk-imported
 *  hotel is native to the periods model (free-text names, editable in the
 *  period editor) rather than a legacy-columns row. Only when the file
 *  carries at least one dated window; existing seasons are never replaced. */
export function deriveImportSeasons(table: string, record: Record<string, unknown>): void {
  if (record.seasons != null) return
  if (table === 'accommodation_rates') {
    const seasons = seasonsFromAccommodationColumns(record)
    if (seasons.length > 0) record.seasons = seasons
  } else if (table === 'nile_cruises') {
    // Runs AFTER cruiseImportDerive filled the engine family the derivation
    // reads; the dated windows come from the CSV's own season date columns.
    const seasons = seasonsFromCruiseColumns(record)
    if (seasons.length > 0) record.seasons = seasons
  }
}

export function getExportHeaders(config: RateTableConfig): string[] {
  return config.columns.map(c => c.name)
}

// The example row carries EXAMPLE_ROW_KEY in the unique-key column and the
// importer SKIPS it, so the classic mistake — filling in the sheet underneath
// and importing the sample along with it — cannot land a junk rate.

export const EXAMPLE_ROW_KEY = 'EXAMPLE-DELETE-THIS-ROW'

/** Is this the untouched sample row from a downloaded template? */
export function isExampleRow(value: unknown): boolean {
  return String(value ?? '').trim().toUpperCase() === EXAMPLE_ROW_KEY
}

/** A coherent sample calendar. A template whose every date is the same day
 *  teaches nothing about which column is a start and which an end, and a
 *  season list where low, high and peak share a window is not a rate card
 *  anyone would recognise. */
const SAMPLE_DATES: Record<string, [string, string]> = {
  low:      ['2026-05-01', '2026-09-30'],
  high:     ['2026-10-01', '2026-12-19'],
  peak:     ['2026-12-20', '2027-01-05'],
  peak_2:   ['2027-03-20', '2027-03-28'],
  validity: ['2026-04-01', '2027-03-31'],
  other:    ['2026-05-01', '2026-09-30'],
}

/** Which pair of dates a column belongs to, and whether it is the start. */
function sampleDate(name: string): string {
  const isEnd = /(_to|_end)$/.test(name)
  const band =
    /peak_season_2|peak_2/.test(name) ? 'peak_2'
    : /peak/.test(name) ? 'peak'
    : /high/.test(name) ? 'high'
    : /valid/.test(name) ? 'validity'
    : /low/.test(name) ? 'low'
    : 'other'
  return SAMPLE_DATES[band][isEnd ? 1 : 0]
}

/** Sample money. A row where every number is 100 does not show which column is
 *  the headline rate and which is a supplement — and a rate card where peak
 *  costs the same as low is not one either. */
// A template that put 100 in every capacity column once taught agencies
// that every vehicle seats exactly 100, and the engine priced every group —
// a couple or forty people — as a sedan. The sample row is a sedan: 1–2 pax.
function sampleNumber(name: string): string {
  // Capacities are counts of people, not money.
  if (name === 'capacity_min') return '1'
  if (name === 'capacity_max') return '2'
  if (/_capacity$|^capacity_/.test(name)) return '4'

  // Percentages are not money either. 100 in a discount column reads as
  // "everything is free".
  if (/(percent|percentage)$/.test(name)) {
    if (/child|infant/.test(name)) return '15'
    if (/student/.test(name)) return '50'
    return '10'
  }

  // Supplements and reductions are a fraction of the rate they attach to.
  const role =
    /supp/.test(name) ? 0.5
    : /(red|reduction|child|infant)/.test(name) ? 0.15
    : 1
  const season =
    /peak/.test(name) ? 1.8
    : /high/.test(name) ? 1.35
    : 1
  const base = /single/.test(name) && !/supp/.test(name) ? 140 : 100
  return String(Math.round(base * role * season))
}

/** Plausible sample values, so the row reads as a real rate rather than as
 *  filler. Matched on the column name first, then the declared type. */
function exampleValue(colDef: ColumnDef, config: RateTableConfig): string {
  // isExampleRow checks the FIRST key column; the rest of a compound key can
  // carry real samples (a route's vehicle, a service type).
  if (colDef.name === config.uniqueKey[0]) return EXAMPLE_ROW_KEY

  const name = colDef.name
  if (/(^|_)(email)/.test(name)) return 'reservations@example-hotel.com'
  if (/(^|_)(phone|fax|mobile)/.test(name)) return '+20 100 000 0000'
  if (/(^|_)city$/.test(name) || name === 'embark_city' || name === 'disembark_city') return 'Cairo'
  if (/country/.test(name)) return 'Egypt'
  if (name === 'property_type') return 'hotel'
  if (name === 'board_basis') return 'bb'
  if (name === 'tier') return 'standard'
  if (name === 'vehicle_type') return 'sedan'
  if (/(property|ship|hotel|supplier|contact|attraction|activity|guide|route|template)_?name/.test(name)) {
    return 'Example Name'
  }
  if (/notes|description|remarks/.test(name)) return 'Optional free text'

  switch (colDef.type) {
    case 'date':
      // ISO. The importer also accepts DD/MM/YYYY because Excel rewrites dates
      // on save, but the sample should show the form that always works.
      return sampleDate(name)
    case 'number':
      // Never 0: a blank or zero rate means "unpriced" in this system, and a
      // sample that teaches otherwise is a sample that causes holes.
      return sampleNumber(name)
    case 'boolean':
      return 'true'
    default:
      return colDef.required ? 'Required' : ''
  }
}

/** Headers for a template: everything the importer reads, and nothing it
 *  ignores — id and the timestamps are export-only and would just be noise on
 *  a sheet somebody is filling in by hand. */
export function getTemplateHeaders(config: RateTableConfig): string[] {
  return config.columns.filter(c => !c.exportOnly && !c.legacy).map(c => c.name)
}

/** The single example row, keyed by column name. */
export function buildTemplateRow(config: RateTableConfig): Record<string, string> {
  const row: Record<string, string> = {}
  for (const colDef of config.columns) {
    if (colDef.exportOnly || colDef.legacy) continue
    row[colDef.name] = exampleValue(colDef, config)
  }
  return row
}

/**
 * Get the display name for a table.
 */
export function getTableDisplayName(tableName: string): string {
  return RATE_TABLE_CONFIGS[tableName]?.displayName || tableName
}

/**
 * Get the list of all supported table names.
 */
export function getSupportedTables(): string[] {
  return Object.keys(RATE_TABLE_CONFIGS)
}

// ============================================
// Natural-key matching for imports (A-item 5)
// ============================================
// The import used to split rows into insert/update on ONE column
// (uniqueKey[0]) — the exact shape that cost the sibling live data: a
// second rate sharing that single column silently replaced the first
// ("13 creates, 0 inserts"). Matching now uses the FULL uniqueKey, and a
// file whose rows collide with EACH OTHER on that key is refused row-wise
// with a message naming the collision, never last-row-wins.

/** The row's natural key as a comparable string, or null when any part is
 *  missing (such rows always insert — same behaviour as before). */
export function importRowKey(
  record: Record<string, unknown>,
  uniqueKey: string[]
): string | null {
  const parts: string[] = []
  for (const col of uniqueKey) {
    const v = record[col]
    if (v === null || v === undefined || v === '') return null
    parts.push(String(v).trim().toLowerCase())
  }
  // NUL separator: a space would let ('a b','c') collide with ('a','b c').
  return parts.join('\u0000')
}

export interface ImportRowPartition<T> {
  /** Rows safe to import — at most one per natural key. */
  rows: T[]
  /** Rows refused because an earlier row in the SAME file has their key. */
  duplicates: Array<{ record: T; message: string }>
}

export function partitionImportRows<T extends Record<string, unknown>>(
  records: T[],
  uniqueKey: string[]
): ImportRowPartition<T> {
  const seen = new Set<string>()
  const rows: T[] = []
  const duplicates: Array<{ record: T; message: string }> = []
  for (const record of records) {
    const key = importRowKey(record, uniqueKey)
    if (key !== null && seen.has(key)) {
      const label = uniqueKey.map(c => `${c}=${String(record[c])}`).join(', ')
      duplicates.push({
        record,
        message:
          `Two rows in this file share the same ${uniqueKey.join(' + ')} (${label}). ` +
          `The second would silently overwrite the first — give each row its own identity, or merge them.`,
      })
      continue
    }
    if (key !== null) seen.add(key)
    rows.push(record)
  }
  return { rows, duplicates }
}
