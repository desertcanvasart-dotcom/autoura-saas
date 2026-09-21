// Who may change an agency's attraction aliases, and what a refusal says.
// Kept out of the route files: a Next route file is for handlers.

/** The tenant's owner is its first admin — naming 'admin' alone locked the
 *  person who created the agency out of their own settings (see the
 *  vocabulary API, where that was first reported). */
export const ALIAS_WRITE_ROLES = ['owner', 'admin']

export const ALIAS_WRITE_DENIED =
  'Only the agency owner or an admin can change attraction names. Ask one of them to make the change, or to make you an admin under Settings → User Management.'

export const ALIAS_COLS = 'id, tenant_id, alias, canonical, is_active, created_at, updated_at'
