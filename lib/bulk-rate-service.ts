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
    ],
  },

  transportation_rates: {
    tableName: 'transportation_rates',
    displayName: 'Transportation',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('service_type', 'Service Type', 'text', true),
      col('city', 'City', 'text', true),
      col('origin_city', 'Origin City', 'text', false),
      col('destination_city', 'Destination City', 'text', false),
      col('route_name', 'Route Name', 'text', false),
      col('duration', 'Duration', 'text', false),
      col('area', 'Area', 'text', false),
      col('includes', 'Includes', 'text', false),
      // Vehicle rates
      col('sedan_rate_eur', 'Sedan EUR', 'number', false),
      col('sedan_rate_non_eur', 'Sedan Non-EUR', 'number', false),
      col('sedan_capacity_min', 'Sedan Cap Min', 'number', false),
      col('sedan_capacity_max', 'Sedan Cap Max', 'number', false),
      col('minivan_rate_eur', 'Minivan EUR', 'number', false),
      col('minivan_rate_non_eur', 'Minivan Non-EUR', 'number', false),
      col('minivan_capacity_min', 'Minivan Cap Min', 'number', false),
      col('minivan_capacity_max', 'Minivan Cap Max', 'number', false),
      col('van_rate_eur', 'Van EUR', 'number', false),
      col('van_rate_non_eur', 'Van Non-EUR', 'number', false),
      col('van_capacity_min', 'Van Cap Min', 'number', false),
      col('van_capacity_max', 'Van Cap Max', 'number', false),
      col('minibus_rate_eur', 'Minibus EUR', 'number', false),
      col('minibus_rate_non_eur', 'Minibus Non-EUR', 'number', false),
      col('minibus_capacity_min', 'Minibus Cap Min', 'number', false),
      col('minibus_capacity_max', 'Minibus Cap Max', 'number', false),
      col('bus_rate_eur', 'Bus EUR', 'number', false),
      col('bus_rate_non_eur', 'Bus Non-EUR', 'number', false),
      col('bus_capacity_min', 'Bus Cap Min', 'number', false),
      col('bus_capacity_max', 'Bus Cap Max', 'number', false),
      season(), rateValidFrom(), rateValidTo(),
      supplierId(), notes(), isActive(), createdAt(), updatedAt(),
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
      col('base_rate_eur', 'Rate EUR', 'number', true),
      col('base_rate_non_eur', 'Rate Non-EUR', 'number', true),
      season(), rateValidFrom(), rateValidTo(),
      supplierId(), notes(), isActive(), createdAt(), updatedAt(),
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
      col('base_rate_eur', 'Rate EUR', 'number', true),
      col('base_rate_non_eur', 'Rate Non-EUR', 'number', true),
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
      col('eur_rate', 'EUR Rate', 'number', true),
      col('non_eur_rate', 'Non-EUR Rate', 'number', true),
      col('egyptian_rate', 'Egyptian Rate', 'number', false),
      col('student_discount_percentage', 'Student Discount %', 'number', false),
      col('child_discount_percent', 'Child Discount %', 'number', false),
      col('category', 'Category', 'text', false),
      col('is_addon', 'Is Add-on', 'boolean', false),
      col('addon_note', 'Add-on Note', 'text', false),
      season(), rateValidFrom(), rateValidTo(),
      supplierId(), notes(), isActive(), createdAt(), updatedAt(),
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
      col('base_rate_eur', 'Rate EUR', 'number', true),
      col('base_rate_non_eur', 'Rate Non-EUR', 'number', true),
      col('baggage_kg', 'Baggage (kg)', 'number', false),
      col('departure_time', 'Departure Time', 'text', false),
      col('arrival_time', 'Arrival Time', 'text', false),
      col('duration_minutes', 'Duration (min)', 'number', false),
      col('frequency', 'Frequency', 'text', false),
      season(), rateValidFrom(), rateValidTo(),
      supplierId(),
      col('supplier_name', 'Supplier Name', 'text', false),
      notes(), isActive(), createdAt(), updatedAt(),
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
      col('base_rate_eur', 'Rate EUR', 'number', true),
      col('base_rate_non_eur', 'Rate Non-EUR', 'number', true),
      col('pricing_type', 'Pricing Type', 'text', false),
      col('unit_label', 'Unit Label', 'text', false),
      col('min_capacity', 'Min Capacity', 'number', false),
      col('max_capacity', 'Max Capacity', 'number', false),
      season(), rateValidFrom(), rateValidTo(),
      supplierId(),
      col('supplier_name', 'Supplier Name', 'text', false),
      notes(), isActive(), createdAt(), updatedAt(),
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
      col('rate_eur', 'Rate EUR', 'number', true),
      col('description', 'Description', 'text', false),
      notes(), isActive(),
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
      col('rate_eur', 'Rate EUR', 'number', true),
      col('description', 'Description', 'text', false),
      notes(), isActive(),
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
      col('rate_eur', 'Rate EUR', 'number', true),
      col('description', 'Description', 'text', false),
      notes(), isActive(),
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
      col('rate_eur', 'Rate EUR', 'number', true),
      col('duration_hours', 'Duration (hours)', 'number', false),
      col('operator_name', 'Operator', 'text', false),
      col('departure_times', 'Departure Times', 'text', false),
      rateValidFrom(), rateValidTo(),
      supplierId(),
      col('description', 'Description', 'text', false),
      notes(), isActive(), createdAt(), updatedAt(),
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
    ],
  },

  fixed_costs: {
    tableName: 'fixed_costs',
    displayName: 'Fixed Costs',
    uniqueKey: ['cost_type'],
    columns: [
      id(),
      col('cost_type', 'Cost Type', 'text', true),
      col('cost_per_person_per_day', 'Cost Per Person/Day', 'number', true),
      col('description', 'Description', 'text', false),
      isActive(), createdAt(), updatedAt(),
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
        parsedRow[colDef.name] = parsed
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
