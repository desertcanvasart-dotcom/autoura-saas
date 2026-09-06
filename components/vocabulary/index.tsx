'use client'

// ============================================
// Vocabulary-aware form pieces
// ============================================
// Every place a form offers or displays a tier, a supplier type, a cabin, a
// meal type… goes through these, so the agency's own words (Settings → Your
// vocabulary) appear everywhere and no page carries its own list.

import type { MouseEvent, SelectHTMLAttributes } from 'react'
import { Crown } from 'lucide-react'
import { useVocabulary } from '@/hooks/useVocabulary'
import type { VocabularyKind } from '@/lib/vocabulary'
import { paletteAt, tierPosition, variationDefaultsAt, type TierPalette, type VariationDefaults } from '@/lib/vocabulary-ui'
import { useMemo } from 'react'

export { useVocabulary } from '@/hooks/useVocabulary'

// ------------------------------------------------------------------
// Reading a stored key
// ------------------------------------------------------------------

/** The agency's word for a stored key, as text. Unknown keys show as
 *  themselves; empty shows `fallback`. */
export function VocabLabel({ kind, value, fallback = '' }: { kind: VocabularyKind; value: string | null | undefined; fallback?: string }) {
  const { labelFor } = useVocabulary(kind)
  return <>{value ? labelFor(value) : fallback}</>
}

/** Tier label + colour by ladder position. */
export function useTierPalette(): { labelFor: (key: string | null | undefined) => string; paletteFor: (key: string | null | undefined) => TierPalette; topKey: string | null } {
  const { all, labelFor, items } = useVocabulary('tier')
  return {
    labelFor,
    paletteFor: key => paletteAt(tierPosition(all, key)),
    topKey: items.length ? items[items.length - 1].key : null,
  }
}

export function TierBadge({ tier, className = '' }: { tier: string | null | undefined; className?: string }) {
  const { labelFor, paletteFor } = useTierPalette()
  if (!tier) return null
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${paletteFor(tier).badge} ${className}`}>
      {labelFor(tier)}
    </span>
  )
}

// ------------------------------------------------------------------
// Choosing a value
// ------------------------------------------------------------------

interface VocabSelectProps {
  kind: VocabularyKind
  value: string
  onChange: (value: string) => void
  /** Text of the empty option; null omits the empty option. */
  placeholder?: string | null
  /** Value of the empty option (some filters use 'all'). */
  emptyValue?: string
  className?: string
  name?: string
  required?: boolean
  disabled?: boolean
  onClick?: (e: MouseEvent<HTMLSelectElement>) => void
  'aria-label'?: SelectHTMLAttributes<HTMLSelectElement>['aria-label']
}

/** A native select over the active entries of one kind. A stored value the
 *  vocabulary no longer offers stays selectable, so editing an old row
 *  never silently blanks it. */
export function VocabSelect({
  kind, value, onChange, placeholder = 'Select…', emptyValue = '',
  className = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg',
  name, required, disabled, onClick, 'aria-label': ariaLabel,
}: VocabSelectProps) {
  const { items, all } = useVocabulary(kind)
  const known = items.some(i => i.key === value)
  const legacy = value && value !== emptyValue && !known ? (all.find(i => i.key === value)?.label ?? value) : null
  return (
    <select
      name={name}
      value={value}
      onChange={e => onChange(e.target.value)}
      onClick={onClick}
      required={required}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className}
    >
      {placeholder !== null && <option value={emptyValue}>{placeholder}</option>}
      {legacy !== null && <option value={value}>{legacy}</option>}
      {items.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
    </select>
  )
}

interface TierPickerProps {
  value: string
  onChange: (key: string) => void
  /** outline = border-2 + tint (rate forms); solid = filled (staff forms). */
  variant?: 'outline' | 'solid'
  size?: 'sm' | 'md'
  className?: string
}

/** The row of tier buttons every rate form uses. The top tier wears the crown. */
export function TierPicker({ value, onChange, variant = 'outline', size = 'md', className = '' }: TierPickerProps) {
  const { items, all } = useVocabulary('tier')
  const top = items.length ? items[items.length - 1].key : null
  const pad = size === 'sm' ? 'px-3 py-1.5' : 'px-4 py-2'
  const legacy = value && !items.some(i => i.key === value) ? (all.find(i => i.key === value) ?? { key: value, label: value }) : null
  const shown = legacy ? [...items, legacy] : items
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {shown.map(t => {
        const selected = value === t.key
        const palette = paletteAt(tierPosition(all, t.key))
        const cls = variant === 'solid'
          ? (selected ? palette.solid : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
          : (selected ? `border-2 ${palette.outline}` : 'border-2 border-gray-300 bg-white text-gray-700 hover:border-gray-400')
        return (
          <button key={t.key} type="button" onClick={() => onChange(t.key)}
            className={`${pad} text-sm rounded-lg font-medium transition-all flex items-center gap-1.5 ${cls}`}>
            {t.key === top && <Crown className="w-3.5 h-3.5" />}
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------------
// The whole ladder, configured — for screens that lay every tier out
// ------------------------------------------------------------------

export interface TierConfig {
  key: string
  label: string
  description: string
  /** Emoji for the position on the ladder (💰 … 👑). */
  icon: string
  bgColor: string
  textColor: string
  borderColor: string
  palette: TierPalette
  /** What a tour variation at this tier defaults to. */
  defaults: VariationDefaults
}

export function useTierConfigs(): { entries: TierConfig[]; byKey: Record<string, TierConfig>; labelFor: (key: string | null | undefined) => string } {
  const { items, all, labelFor } = useVocabulary('tier')
  const entries = useMemo(() => items.map((t, i) => {
    const d = variationDefaultsAt(i, items.length)
    const palette = paletteAt(tierPosition(all, t.key))
    return {
      key: t.key, label: t.label, description: t.description || d.description, icon: d.icon,
      bgColor: palette.bg, textColor: palette.text, borderColor: palette.border, palette, defaults: d,
    }
  }), [items, all])
  const byKey = useMemo(() => Object.fromEntries(entries.map(e => [e.key, e])) as Record<string, TierConfig>, [entries])
  return { entries, byKey, labelFor }
}
