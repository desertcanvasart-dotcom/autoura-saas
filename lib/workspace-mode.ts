// ============================================
// WORKSPACE MODE — cutover helpers
// ============================================
// Migration 239 introduced `tenants.workspace_mode` as the single source for
// which workspaces a tenant sees. The old `tenants.business_type` and
// `tenant_features.b2c_enabled/b2b_enabled` are still written during the
// additive-then-cutover rename, so a deploy running old code keeps working.
// Migration B drops them; these helpers go with them.

export type WorkspaceMode = 'b2c' | 'b2b' | 'both'
export type LegacyBusinessType = 'b2c_only' | 'b2b_only' | 'b2c_and_b2b'

export function workspaceModeFromFlags(showsB2c: boolean, showsB2b: boolean): WorkspaceMode {
  if (showsB2c && showsB2b) return 'both'
  if (showsB2c) return 'b2c'
  if (showsB2b) return 'b2b'
  // "Neither" is not a state anyone should reach — an empty app. Migration
  // 239's CHECK forbids it; this mirrors that rather than writing something
  // the database would reject.
  return 'both'
}

export function workspaceModeFromBusinessType(bt: string | null | undefined): WorkspaceMode {
  if (bt === 'b2c_only') return 'b2c'
  if (bt === 'b2b_only') return 'b2b'
  return 'both'
}

export function showsB2c(mode: WorkspaceMode): boolean {
  return mode === 'b2c' || mode === 'both'
}

export function showsB2b(mode: WorkspaceMode): boolean {
  return mode === 'b2b' || mode === 'both'
}

/** Legacy columns to write alongside workspace_mode until the cutover. */
export function legacyWorkspaceFields(mode: WorkspaceMode): {
  business_type: LegacyBusinessType
  b2c_enabled: boolean
  b2b_enabled: boolean
} {
  return {
    business_type:
      mode === 'both' ? 'b2c_and_b2b' : mode === 'b2c' ? 'b2c_only' : 'b2b_only',
    b2c_enabled: showsB2c(mode),
    b2b_enabled: showsB2b(mode),
  }
}
