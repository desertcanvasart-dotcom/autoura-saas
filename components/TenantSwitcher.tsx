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

  if (isCollapsed) {
    return (
      <div className="px-3 py-2 mb-4">
        <button
          onClick={() => isAdmin && router.push('/settings/tenant')}
          className="w-full flex items-center justify-center p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
          title={`${tenant.company_name} (${tenantMember.role})`}
        >
          {tenant.logo_url ? (
            <div className="relative w-8 h-8">
              <Image
                src={tenant.logo_url}
                alt={tenant.company_name}
                fill
                className="object-contain"
              />
            </div>
          ) : (
            <Building2 className="w-5 h-5 text-blue-600" />
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="px-3 py-2 mb-4">
      <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
        {/* Tenant Name */}
        <div className="flex items-start gap-2">
          {tenant.logo_url ? (
            <div className="relative w-10 h-10 flex-shrink-0 bg-gray-50 rounded-md overflow-hidden">
              <Image
                src={tenant.logo_url}
                alt={tenant.company_name}
                fill
                className="object-contain p-1"
              />
            </div>
          ) : (
            <Building2 className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {tenant.company_name}
            </p>
            {getBusinessTypeDisplay() && (
              <p className="text-xs text-gray-500">
                {getBusinessTypeDisplay()}
              </p>
            )}
          </div>
        </div>

        {/* Role Badge */}
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium ${getRoleBadgeColor(
              tenantMember.role
            )}`}
          >
            {getRoleIcon(tenantMember.role)}
            <span className="capitalize">{tenantMember.role}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-1">
          {isAdmin && (
            <button
              onClick={() => router.push('/settings/tenant')}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => router.push('/settings/team')}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Team</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
