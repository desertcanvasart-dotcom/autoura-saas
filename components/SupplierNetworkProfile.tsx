'use client'

import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, UserRound } from 'lucide-react'
import LoadError from '@/components/LoadError'
import { NETWORK_KINDS } from '@/lib/supplier-network'
import { NETWORK_STATUS_FOR_AGENCY, type ConnectedProfile } from '@/lib/supplier-network-connected'

// What a connected supplier wrote about themselves (their network profile),
// on this agency's supplier list and card. Read-only: it is the supplier's
// own description; the agency's record and rates stay the agency's.

/** One read for the whole Suppliers page: supplier id → their profile. */
export function useConnectedProfiles() {
  const [profiles, setProfiles] = useState<Record<string, ConnectedProfile>>({})
  const [loadFailed, setLoadFailed] = useState(false)
  const load = useCallback(async () => {
    const res = await fetch('/api/suppliers/network-profiles').catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    const ok = !!res?.ok && d.success
    setLoadFailed(!ok)
    if (ok) setProfiles(d.data)
  }, [])
  useEffect(() => { void load() }, [load])
  return { profiles, loadFailed, reload: load }
}

/** A line on the supplier's list card: their languages and cities. */
export function SupplierProfileLine({ profile }: { profile?: ConnectedProfile }) {
  if (!profile || (profile.languages.length === 0 && profile.cities.length === 0)) return null
  const bits = [profile.languages.join(', '), profile.cities.join(', ')].filter(Boolean)
  return (
    <p className="flex items-start gap-1.5 text-xs text-gray-600 mb-3" title="What they wrote in their own profile">
      <UserRound className="w-3.5 h-3.5 text-gray-400 mt-px shrink-0" aria-hidden />
      <span>{bits.join(' · ')}</span>
    </p>
  )
}

/** The block on the supplier's card. */
export default function SupplierNetworkProfile({ profile, loadFailed, onRetry }: {
  profile?: ConnectedProfile
  loadFailed?: boolean
  onRetry?: () => void
}) {
  if (loadFailed && onRetry) return <div className="mt-2"><LoadError compact what="their own profile" onRetry={onRetry} /></div>
  if (!profile) return null
  const row = (label: string, value: string | null) => value
    ? <div><dt className="text-xs text-gray-500">{label}</dt><dd className="text-sm text-gray-900">{value}</dd></div>
    : null
  return (
    <section className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          <UserRound className="w-4 h-4 text-gray-400" aria-hidden /> Their own profile
        </h3>
        <span className={`inline-flex items-center gap-1 text-xs ${profile.verification_status === 'verified' ? 'text-green-700' : 'text-gray-500'}`}>
          {profile.verification_status === 'verified' && <BadgeCheck className="w-3.5 h-3.5" aria-hidden />}
          {NETWORK_STATUS_FOR_AGENCY[profile.verification_status] ?? profile.verification_status}
          {profile.in_network ? ' · in the network' : ''}
        </span>
      </div>
      <p className="text-xs text-gray-500 mt-0.5">What they wrote when they signed in — your record and rates are not changed.</p>
      <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {row('Services', profile.kinds.map(k => NETWORK_KINDS[k] ?? k).join(', ') || null)}
        {row('Languages', profile.languages.join(', ') || null)}
        {row('Cities', profile.cities.join(', ') || null)}
        {row('About', profile.about)}
      </dl>
    </section>
  )
}
