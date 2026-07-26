// ============================================
// WORKSPACE MODE — cutover helpers
// ============================================
// Migration 239 introduced `tenants.workspace_mode` as the single source for
// which workspaces a tenant sees. Migration 240 dropped the three columns that
// used to mirror it (`tenants.business_type`,
// `tenant_features.b2c_enabled/b2b_enabled`) — three copies of one fact that
// were written by different code paths and could disagree.
//
// `workspaceModeFromBusinessType` survives the drop because it parses a REQUEST
// BODY, not a column: a browser holding a cached bundle can still POST
// `business_type` to /api/onboarding/business during a deploy.

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
