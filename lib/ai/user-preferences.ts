// ============================================
// FETCH USER PREFERENCES
// ============================================

import type { ServiceTier } from './parsing-utils'
import { DEFAULT_MARGIN_PERCENT, normalizeTier } from './parsing-utils'
import { resolveMarginPercent } from '@/lib/pricing/resolve-margin'

export async function getUserPreferences(supabase: any): Promise<{
  default_cost_mode: 'auto' | 'manual'
  default_tier: ServiceTier
  default_margin_percent: number
  default_currency: string
}> {
  const defaults = {
    default_cost_mode: 'auto' as const,
    default_tier: 'standard' as ServiceTier,
    default_margin_percent: DEFAULT_MARGIN_PERCENT,
    default_currency: 'EUR'
  }

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return defaults

    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    // The tenant's house rate — the step that did not exist before migration
    // 279. Without it a colleague who never set a personal margin fell all the
    // way through to the platform constant, so two people in the same agency
    // quoted the same trip differently and nobody could set the house rate.
    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    let tenantMargin: number | null = null
    if (member?.tenant_id) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('default_margin_percent')
        .eq('id', member.tenant_id)
        .maybeSingle()
      tenantMargin = tenant?.default_margin_percent ?? null
    }

    const margin = resolveMarginPercent({
      userDefault: prefs?.default_margin_percent,
      tenantDefault: tenantMargin,
    })

    if (!prefs) {
      return { ...defaults, default_margin_percent: margin.marginPercent }
    }

    return {
      default_cost_mode: prefs.default_cost_mode || defaults.default_cost_mode,
      default_tier: normalizeTier(prefs.default_tier) || defaults.default_tier,
      default_margin_percent: margin.marginPercent,
      default_currency: prefs.default_currency || defaults.default_currency
    }
  } catch (error) {
    return defaults
  }
}
