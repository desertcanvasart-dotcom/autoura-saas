import { SUPPORTED_CURRENCIES } from '@/lib/currency'
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
      // Low season EUR
      col('pp_double_eur', 'Low PP Double EUR', 'number', false),
      col('single_supp_eur', 'Low Single Supp EUR', 'number', false),
      col('triple_red_eur', 'Low Triple Red EUR', 'number', false),
      // Low season Non-EUR
      col('pp_double_non_eur', 'Low PP Double Non-EUR', 'number', false),
      col('single_supp_non_eur', 'Low Single Supp Non-EUR', 'number', false),
      col('triple_red_non_eur', 'Low Triple Red Non-EUR', 'number', false),
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
      // Peak season dates
      col('peak_season_from', 'Peak Season From', 'date', false),
      col('peak_season_to', 'Peak Season To', 'date', false),
      col('peak_season_2_from', 'Peak Season 2 From', 'date', false),
      col('peak_season_2_to', 'Peak Season 2 To', 'date', false),
      // Validity
      rateValidFrom(), rateValidTo(),
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
    // route_name is the identity column — transportation_rates has NO
    // service_code (matching on it made the existence check error out
    // silently, so every import row went down the raw-insert path and
    // 400'd on the phantom columns; this table also has no season,
    // validity dates, supplier_id or notes).
    uniqueKey: ['route_name'],
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
      // Vehicle rates
      col('sedan_rate_eur', 'Sedan Rate', 'number', false),
      legacyRate('sedan_rate_non_eur', 'Sedan Non-EUR (legacy)', 'sedan_rate_eur'),
      col('sedan_capacity_min', 'Sedan Cap Min', 'number', false),
      col('sedan_capacity_max', 'Sedan Cap Max', 'number', false),
      col('minivan_rate_eur', 'Minivan Rate', 'number', false),
      legacyRate('minivan_rate_non_eur', 'Minivan Non-EUR (legacy)', 'minivan_rate_eur'),
      col('minivan_capacity_min', 'Minivan Cap Min', 'number', false),
      col('minivan_capacity_max', 'Minivan Cap Max', 'number', false),
      col('van_rate_eur', 'Van Rate', 'number', false),
      legacyRate('van_rate_non_eur', 'Van Non-EUR (legacy)', 'van_rate_eur'),
      col('van_capacity_min', 'Van Cap Min', 'number', false),
      col('van_capacity_max', 'Van Cap Max', 'number', false),
      col('minibus_rate_eur', 'Minibus Rate', 'number', false),
      legacyRate('minibus_rate_non_eur', 'Minibus Non-EUR (legacy)', 'minibus_rate_eur'),
      col('minibus_capacity_min', 'Minibus Cap Min', 'number', false),
      col('minibus_capacity_max', 'Minibus Cap Max', 'number', false),
      col('bus_rate_eur', 'Bus Rate', 'number', false),
      legacyRate('bus_rate_non_eur', 'Bus Non-EUR (legacy)', 'bus_rate_eur'),
      col('bus_capacity_min', 'Bus Cap Min', 'number', false),
      col('bus_capacity_max', 'Bus Cap Max', 'number', false),
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
      col('egyptian_rate', 'Egyptian Rate', 'number', false),
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
      season(), rateValidFrom(), rateValidTo(),
      col('operator_name', 'Operator', 'text', false),
      supplierId(),
      col('description', 'Description', 'text', false),
      notes(), isActive(), createdAt(), updatedAt(),
      rateCurrency(),
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
// The per-vehicle bands lib/transport-rate-utils.ts falls back to. The sample
// must agree with them: a template that put 100 in every capacity column
// taught agencies that every vehicle seats exactly 100, and because
// getTransportRateForPax() matches a band and then falls back to the first
// tier whose max fits, EVERY group -- a couple or forty people -- came out
// priced as a sedan.
const SAMPLE_CAPACITY: Record<string, [number, number]> = {
  sedan: [1, 2],
  minivan: [3, 7],
  van: [8, 12],
  minibus: [13, 20],
  bus: [21, 45],
}

function sampleNumber(name: string): string {
  // Capacities are counts of people, not money.
  const cap = name.match(/^([a-z]+)_capacity_(min|max)$/)
  if (cap) {
    const band = SAMPLE_CAPACITY[cap[1]]
    if (band) return String(cap[2] === 'min' ? band[0] : band[1])
    return cap[2] === 'min' ? '1' : '45'
  }
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
  if (config.uniqueKey.includes(colDef.name)) return EXAMPLE_ROW_KEY

  const name = colDef.name
  if (/(^|_)(email)/.test(name)) return 'reservations@example-hotel.com'
  if (/(^|_)(phone|fax|mobile)/.test(name)) return '+20 100 000 0000'
  if (/(^|_)city$/.test(name) || name === 'embark_city' || name === 'disembark_city') return 'Cairo'
  if (/country/.test(name)) return 'Egypt'
  if (name === 'property_type') return 'hotel'
  if (name === 'board_basis') return 'BB'
  if (name === 'tier') return 'standard'
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
