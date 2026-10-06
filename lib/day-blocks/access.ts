// Who may change the block library: the same people who keep the agency's
// vocabulary and attraction names.
export const BLOCK_WRITE_ROLES = ['owner', 'admin']
export const BLOCK_WRITE_DENIED = 'Only an owner or admin can change the day blocks.'
export const BLOCK_COLS =
  'id, code, name, shorthand, day_type, city, to_city, night, night_place, attractions, photo_stops, guide, meals, transport, assistance, optional_extras, description, notes, source, is_active, updated_at'
