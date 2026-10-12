'use client'

import { useEffect, useState } from 'react'
import { useTenant } from '@/app/contexts/TenantContext'
import { useRouter } from 'next/navigation'
import { Building2, Settings, Users, Crown, ShieldCheck, UserCog, User, Eye, ArrowLeftRight } from 'lucide-react'
import Image from 'next/image'

interface TenantSwitcherProps {
  isCollapsed: boolean
}

export default function TenantSwitcher({ isCollapsed }: TenantSwitcherProps) {
  const { tenant, tenantMember, loading, isAdmin } = useTenant()
  const router = useRouter()

  // The companies this login works in. The switcher appears only with two
  // or more; the choice is saved server-side (POST /api/me/companies), so
  // RLS, every API route and every page follow it from the next request.
  const [companies, setCompanies] = useState<Array<{ tenant_id: string; company_name: string; role: string }>>([])
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const memberTenantId = tenantMember?.tenant_id
  useEffect(() => {
    if (!memberTenantId) return
    let alive = true
    fetch('/api/me/companies')
      .then(r => r.json())
      .then(j => { if (alive && j?.success) setCompanies(j.data.companies ?? []) })
      .catch(() => {})
    return () => { alive = false }
  }, [memberTenantId])

  const switchTo = async (tenantId: string) => {
    if (!tenantId || tenantId === tenant?.id) return
    setSwitching(true)
    setSwitchError(null)
    try {
      const res = await fetch('/api/me/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.success) throw new Error(j.error || 'Could not switch company')
      // A full load: every context, cache and open page starts again in the
      // new company — nothing from the old one stays on screen.
      window.location.href = '/dashboard'
    } catch (e) {
      setSwitchError(e instanceof Error ? e.message : 'Could not switch company')
      setSwitching(false)
    }
  }

  // Skeleton only when there is nothing to show yet. While a background
  // refresh runs, keep rendering the current tenant — flipping to a
  // skeleton (which is a different height) made the whole block below
  // jump on every auth event.
  if (loading && (!tenant || !tenantMember)) {
    return (
      <div className="px-3 py-2 mb-2">
        <div className="animate-pulse">
          <div className="h-[26px] bg-gray-200 rounded-md"></div>
        </div>
      </div>
    )
  }

  if (!tenant || !tenantMember) {
    return null
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="w-4 h-4 text-yellow-500" />
      case 'admin':
        return <ShieldCheck className="w-4 h-4 text-purple-500" />
      case 'manager':
        return <UserCog className="w-4 h-4 text-blue-500" />
      case 'member':
        return <User className="w-4 h-4 text-green-500" />
      case 'viewer':
        return <Eye className="w-4 h-4 text-gray-500" />
      default:
        return <User className="w-4 h-4 text-gray-500" />
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'admin':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'manager':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'member':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'viewer':
        return 'bg-gray-100 text-gray-800 border-gray-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const switcher = companies.length > 1 && (
    <div className="mt-2">
      <label className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-400 mb-1">
        <ArrowLeftRight className="w-3 h-3" /> Company
      </label>
      <select
        value={tenant.id}
        disabled={switching}
        onChange={(e) => void switchTo(e.target.value)}
        className="w-full h-8 px-2 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50"
        aria-label="Switch company"
      >
        {companies.map(c => (
          <option key={c.tenant_id} value={c.tenant_id}>{c.company_name} · {c.role}</option>
        ))}
      </select>
      {switchError && <p className="mt-1 text-[11px] text-red-600">{switchError}</p>}
    </div>
  )

  // Collapsed state: show role icon only
  if (isCollapsed) {
    return (
      <div className="px-2 py-2 mb-2">
        <div
          className={`flex items-center justify-center p-1.5 rounded-md border ${getRoleBadgeColor(tenantMember.role)}`}
          title={`${tenantMember.role}`}
        >
          {getRoleIcon(tenantMember.role)}
        </div>
      </div>
    )
  }

  // Expanded state: show role badge and action buttons (tenant name is now in header)
  return (
    <div className="px-3 py-2 mb-2">
      <div className="flex items-center justify-between gap-2">
        {/* Role Badge */}
        <div
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium ${getRoleBadgeColor(
            tenantMember.role
          )}`}
        >
          {getRoleIcon(tenantMember.role)}
          <span className="capitalize">{tenantMember.role}</span>
        </div>

        {/* Action Buttons */}
        {isAdmin && (
          <div className="flex gap-1">
            <button
              onClick={() => router.push('/settings/tenant')}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              title="Organization Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={() => router.push('/users')}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              title="User Management"
            >
              <Users className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      {switcher}
    </div>
  )
}
