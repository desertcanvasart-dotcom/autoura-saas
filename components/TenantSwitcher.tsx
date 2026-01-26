'use client'

import { useTenant } from '@/app/contexts/TenantContext'
import { useRouter } from 'next/navigation'
import { Building2, Settings, Users, Crown, ShieldCheck, UserCog, User, Eye } from 'lucide-react'
import Image from 'next/image'

interface TenantSwitcherProps {
  isCollapsed: boolean
}

export default function TenantSwitcher({ isCollapsed }: TenantSwitcherProps) {
  const { tenant, tenantMember, loading, isAdmin, hasB2C, hasB2B } = useTenant()
  const router = useRouter()

  // Derive business type from feature flags (more reliable than tenant.business_type)
  const getBusinessTypeDisplay = () => {
    if (hasB2C && hasB2B) return 'B2C & B2B'
    if (hasB2C && !hasB2B) return 'B2C Only'
    if (!hasB2C && hasB2B) return 'B2B Only'
    return null
  }

  if (loading) {
    return (
      <div className="px-3 py-2 mb-4">
        <div className="animate-pulse">
          <div className="h-10 bg-gray-200 rounded-lg"></div>
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
              onClick={() => router.push('/settings/team')}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              title="Team Management"
            >
              <Users className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
