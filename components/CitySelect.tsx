'use client'

// ============================================
// The one city dropdown
// ============================================
// Every city field in the app offers the tenant's destination vocabulary
// (useDestinationCities: the shared catalog, Egypt fallback). A value that
// is stored on the row but missing from the vocabulary — legacy free text —
// stays selectable, so editing an old record never silently blanks it.

import type { SelectHTMLAttributes, MouseEvent } from 'react'
import { useDestinationCities } from '@/hooks/useDestinationCities'

interface CitySelectProps {
  value: string
  onChange: (city: string) => void
  /** Placeholder for the empty option; pass null to omit the empty option. */
  placeholder?: string | null
  /** A city to hide (e.g. the origin, when picking a destination). */
  exclude?: string
  className?: string
  name?: string
  required?: boolean
  disabled?: boolean
  onClick?: (e: MouseEvent<HTMLSelectElement>) => void
  'aria-label'?: SelectHTMLAttributes<HTMLSelectElement>['aria-label']
}

/** The cities a dropdown offers: the vocabulary, plus the current value if it is outside it. */
export function cityOptionsFor(cities: string[], value: string, exclude?: string): string[] {
  const base = value && !cities.includes(value) ? [value, ...cities] : cities
  return exclude ? base.filter(c => c !== exclude) : base
}

export default function CitySelect({
  value, onChange, placeholder = 'Select City...', exclude,
  className = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg',
  name, required, disabled, onClick, 'aria-label': ariaLabel,
}: CitySelectProps) {
  const { cities } = useDestinationCities()
  const options = cityOptionsFor(cities, value, exclude)
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
      {placeholder !== null && <option value="">{placeholder}</option>}
      {options.map(city => (
        <option key={city} value={city}>{city}</option>
      ))}
    </select>
  )
}

/**
 * Suggestions for a free-text city input (`<input list={id} />`) — for fields
 * where the city may legitimately be outside the destination vocabulary,
 * such as a foreign client's address.
 */
export function CityDatalist({ id }: { id: string }) {
  const { cities } = useDestinationCities()
  return (
    <datalist id={id}>
      {cities.map(city => <option key={city} value={city} />)}
    </datalist>
  )
}
