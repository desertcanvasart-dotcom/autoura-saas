// ============================================
// WORKSPACE VISIBILITY vs ENTITLEMENT
// ============================================
// `RequireFeature` conflated two different things behind one boolean:
//
//   ENTITLEMENT   — a paid capability. Blocking is legitimate; the tenant
//                   has not bought it.
//   PREFERENCE    — whether a tenant wants to SEE a workspace. Blocking is
//                   wrong; the data is theirs and they merely tidied the nav.
//
// B2C and B2B are preferences, not entitlements — business model is available
// on every tier. But the component redirected to /dashboard when the flag was
// off, which made every client record unreachable by direct URL on seven
// pages. Hiding navigation had become hiding data.
//
// This module is the decision, extracted so it can be tested: the project's
// vitest environment is `node` with no React testing libraries, so a pure
// function is the only way to pin this behaviour rather than assert it in a
// comment.

export type GatedFeature = 'b2b' | 'b2c' | 'analytics' | 'whatsapp' | 'email' | 'pdf'

export type GateOutcome =
  /** Show the page normally. */
  | 'render'
  /** Show the page in full, with a note that the workspace is hidden. */
  | 'render-with-notice'
  /** Genuinely not entitled — show the upgrade screen. */
  | 'block'

/**
 * Features that are a tenant's own display choice, free on every tier.
 *
 * Anything here MUST NOT block access to data. If a future feature is added
 * to this set, it inherits that guarantee; if one is removed, it becomes
 * blockable — so the set is the whole policy.
 */
export const WORKSPACE_PREFERENCES: ReadonlySet<GatedFeature> = new Set<GatedFeature>([
  'b2c',
  'b2b',
])

export function isWorkspacePreference(feature: GatedFeature): boolean {
  return WORKSPACE_PREFERENCES.has(feature)
}

/**
 * What to do for a feature the tenant does or does not have.
 *
 * `hasAccess === null` means "not yet determined" — never block on unknown,
 * because a slow context load must not look like a paywall.
 */
export function resolveGate(feature: GatedFeature, hasAccess: boolean | null): GateOutcome {
  if (hasAccess === null) return 'render'
  if (hasAccess) return 'render'
  // The whole point: a hidden workspace still renders, in full.
  return isWorkspacePreference(feature) ? 'render-with-notice' : 'block'
}

export interface WorkspaceNotice {
  title: string
  body: string
  settingsHref: string
  settingsLabel: string
}

/** Copy for the "this workspace is hidden" note. */
export function workspaceNotice(feature: GatedFeature): WorkspaceNotice {
  const label = feature === 'b2c' ? 'Direct client (B2C)' : 'Partner (B2B)'
  return {
    title: `${label} workspace is hidden`,
    // Reassurance first: the operator arrived here from a link or a search
    // result and needs to know nothing is wrong with their data.
    body: 'Your records are all still here and fully editable. This workspace is just hidden from the sidebar.',
    settingsHref: '/settings/tenant',
    settingsLabel: 'Show it in Settings',
  }
}
