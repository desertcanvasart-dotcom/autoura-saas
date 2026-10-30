'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { useRole } from '@/hooks/useRole'
import { useTenant } from '@/app/contexts/TenantContext'
import { useVocabulary } from '@/hooks/useVocabulary'
import { getCurrencySymbol } from '@/lib/currency'
import { DEFAULT_MARGIN_PERCENT } from '@/lib/ai/parsing-utils'
import { SettingsCard, SettingsRow, Segmented, NumberStepper, Note, SaveBar, useUnsavedGuard } from '@/components/settings/SettingsUI'
import { sellingPrice, marginFromMarkup, markupForMargin, pct, SEASON_FORMULA } from '@/lib/pricing/markup-wording'

// Settings › Pricing defaults: the company's cost mode, service tier and
// markup for every new quote and itinerary (migration 456). The layout gives
// the page its title and description; one sticky bar saves.

interface Defaults {
  default_cost_mode: 'auto' | 'manual'
  default_tier: string | null
  default_margin_percent: number | null
}

const MAX_MARKUP = 200

export default function PricingDefaultsPage() {
  const { isAdmin } = useRole()
  const { tenant, refetchTenant } = useTenant()
  const { items: tiers } = useVocabulary('tier')
  const [saved, setSaved] = useState<Defaults | null>(null)
  const [draft, setDraft] = useState<Defaults | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings/pricing')
      .then(r => r.json())
      .then(j => {
        if (!j?.success) throw new Error(j?.error || 'Could not load the pricing defaults')
        setSaved(j.data)
        setDraft(j.data)
      })
      .catch(e => setLoadError(e instanceof Error ? e.message : 'Could not load the pricing defaults'))
  }, [])

  const changes = useMemo(() => {
    if (!saved || !draft) return 0
    return (['default_cost_mode', 'default_tier', 'default_margin_percent'] as const).filter(k => saved[k] !== draft[k]).length
  }, [saved, draft])
  useUnsavedGuard(changes > 0)

  if (loadError) return <div className="px-4 sm:px-6 lg:px-8 py-6 text-sm text-red-600">{loadError}</div>
  if (!draft) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-10">
        <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
      </div>
    )
  }

  const readOnly = !isAdmin
  const sym = getCurrencySymbol(tenant?.default_currency || 'EUR')
  // NULL = the company has not chosen: the Quote Builder starts at the constant.
  const markup = draft.default_margin_percent ?? DEFAULT_MARGIN_PERCENT
  const forMargin = markupForMargin(markup)
  const set = (patch: Partial<Defaults>) => setDraft(d => (d ? { ...d, ...patch } : d))

  const save = async () => {
    if (!saved) return
    setSaving(true)
    setSaveError(null)
    try {
      const body: Partial<Defaults> = {}
      for (const k of ['default_cost_mode', 'default_tier', 'default_margin_percent'] as const) {
        if (saved[k] !== draft[k]) Object.assign(body, { [k]: draft[k] })
      }
      const res = await fetch('/api/settings/pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.success) throw new Error(j.error || 'Could not save')
      setSaved(j.data)
      setDraft(j.data)
      void refetchTenant()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl">
      {readOnly && (
        <p className="mb-4 text-sm text-gray-600">You can see these defaults; only an admin can change them.</p>
      )}

      <SettingsCard>
        <SettingsRow label="Cost calculation" description="Auto-calculate takes costs from your rates. Manual lets staff type each cost.">
          <Segmented
            label="Cost calculation"
            disabled={readOnly}
            value={draft.default_cost_mode}
            onChange={v => set({ default_cost_mode: v })}
            options={[{ value: 'auto', label: 'Auto-calculate' }, { value: 'manual', label: 'Manual entry' }]}
          />
        </SettingsRow>

        <SettingsRow label="Default service tier" description="Copilot picks suppliers that match this tier for new itineraries.">
          {tiers.length === 0 ? (
            <p className="text-sm text-gray-500">
              Your vocabulary has no service tiers yet. <Link href="/settings/vocabulary" className="text-primary-700 underline">Add them in Vocabulary</Link>.
            </p>
          ) : (
            <Segmented
              label="Default service tier"
              disabled={readOnly}
              value={draft.default_tier}
              onChange={v => set({ default_tier: v })}
              options={tiers.map(t => ({ value: t.key, label: t.label }))}
            />
          )}
        </SettingsRow>

        <SettingsRow label="Markup on supplier cost" description="Added to the total supplier cost to make the selling price.">
          <NumberStepper
            label="Markup on supplier cost"
            disabled={readOnly}
            value={markup}
            max={MAX_MARKUP}
            onChange={v => set({ default_margin_percent: v })}
          />
          <Note>
            <p>
              <strong>Example:</strong> supplier cost {sym}100 → selling price{' '}
              <strong>{sym}{sellingPrice(100, markup).toFixed(2)}</strong>
            </p>
            <p className="mt-1">
              That is a {pct(marginFromMarkup(markup))}% profit margin on the selling price.
              {forMargin !== null && <> For a {pct(markup)}% margin you would need a {pct(forMargin)}% markup.</>}
            </p>
            {draft.default_margin_percent === null && (
              <p className="mt-1 text-gray-500">Not set yet: new quotes start at {pct(DEFAULT_MARGIN_PERCENT)}%.</p>
            )}
          </Note>
        </SettingsRow>

        <SettingsRow label="Seasonal premiums" description="Peak dates and their premium live in Seasonal premiums.">
          <Note>
            Applied after markup: {SEASON_FORMULA}. Where peak dates overlap, the highest premium applies — premiums do not add up.
          </Note>
          <Link href="/settings/seasons" className="inline-block mt-3 text-sm font-medium text-primary-800 underline">
            Manage seasonal premiums →
          </Link>
        </SettingsRow>
      </SettingsCard>

      <div className="mt-6">
        <SettingsCard>
          <SettingsRow label="Currency and exchange rates" description="Default quote currency, conversion buffer and rate overrides.">
            <div className="min-[720px]:text-right">
              <Link href="/settings/currencies" className="inline-flex items-center h-10 px-4 rounded-lg border border-gray-200 text-sm font-medium text-gray-800 hover:bg-gray-50">
                Open currencies
              </Link>
            </div>
          </SettingsRow>
        </SettingsCard>
      </div>

      {!readOnly && (
        <SaveBar
          changes={changes}
          saving={saving}
          error={saveError}
          onDiscard={() => { setDraft(saved); setSaveError(null) }}
          onSave={save}
        />
      )}
    </div>
  )
}
