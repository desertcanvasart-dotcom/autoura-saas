// ============================================
// Expense categories, and which suppliers each one is paid to
// ============================================
// One list for every expense form (the itinerary's Add Expense, the Expenses
// page). `supplierTypes` are supplier-type BEHAVIOURS (lib/vocabulary): the
// form lists the agency's suppliers that fill one of those roles — its
// restaurants for a meal, its hotels for accommodation — instead of a blank
// name box. Categories with none (tips, fuel, office…) keep free text.
//
// The stored values are the ones the forms always saved; migration 395 lets
// the database accept all of them.

export interface ExpenseCategory {
  value: string
  label: string
  icon: string
  supplierTypes: string[]
  /** Only on the general Expenses page (not tied to a trip). */
  overhead?: boolean
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { value: 'guide', label: 'Tour Guide', icon: '👨‍🏫', supplierTypes: ['guide'] },
  { value: 'driver', label: 'Driver', icon: '🚗', supplierTypes: ['driver', 'transport_company'] },
  { value: 'hotel', label: 'Hotel/Accommodation', icon: '🏨', supplierTypes: ['hotel'] },
  { value: 'cruise', label: 'Nile Cruise', icon: '🚢', supplierTypes: ['cruise'] },
  { value: 'transportation', label: 'Transportation', icon: '🚐', supplierTypes: ['transport_company', 'driver', 'train_operator'] },
  { value: 'flights', label: 'Flights', icon: '🛫', supplierTypes: ['airline'] },
  { value: 'entrance', label: 'Entrance Fees', icon: '🎫', supplierTypes: ['attraction', 'activity_provider'] },
  { value: 'meal', label: 'Meals', icon: '🍽️', supplierTypes: ['restaurant'] },
  { value: 'activity', label: 'Activities & Tours', icon: '🎈', supplierTypes: ['activity_provider', 'tour_operator'] },
  { value: 'airport_staff', label: 'Airport Staff', icon: '✈️', supplierTypes: ['ground_handler'] },
  { value: 'hotel_staff', label: 'Hotel Staff', icon: '🛎️', supplierTypes: ['hotel'] },
  { value: 'ground_handler', label: 'Ground Handler', icon: '🧳', supplierTypes: ['ground_handler'] },
  { value: 'tipping', label: 'Tipping', icon: '💵', supplierTypes: [] },
  { value: 'permits', label: 'Permits/Permissions', icon: '📋', supplierTypes: [] },
  { value: 'toll', label: 'Toll Fees', icon: '🛣️', supplierTypes: [] },
  { value: 'parking', label: 'Parking', icon: '🅿️', supplierTypes: [] },
  { value: 'fuel', label: 'Fuel', icon: '⛽', supplierTypes: [] },
  { value: 'office', label: 'Office Expenses', icon: '🏢', supplierTypes: [], overhead: true },
  { value: 'marketing', label: 'Marketing', icon: '📢', supplierTypes: [], overhead: true },
  { value: 'software', label: 'Software/Subscriptions', icon: '💻', supplierTypes: [], overhead: true },
  { value: 'other', label: 'Other', icon: '📦', supplierTypes: [] },
]

/** The trip-related categories (the itinerary's Add Expense). */
export const TRIP_EXPENSE_CATEGORIES = EXPENSE_CATEGORIES.filter(c => !c.overhead)

export function expenseCategory(value: string): ExpenseCategory | undefined {
  return EXPENSE_CATEGORIES.find(c => c.value === value)
}

/** The supplier-type behaviours whose suppliers an expense of this category is paid to. */
export function supplierTypesForCategory(value: string): string[] {
  return expenseCategory(value)?.supplierTypes ?? []
}
