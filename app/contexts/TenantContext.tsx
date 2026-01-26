'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/app/supabase'
import { useAuth } from './AuthContext'

interface Tenant {
  id: string
  company_name: string
  contact_email: string | null
  business_type: 'b2c_only' | 'b2b_only' | 'b2c_and_b2b'
  logo_url: string | null
  created_at: string
  updated_at: string
}

interface TenantMember {
  id: string
  tenant_id: string
  user_id: string
  role: 'owner' | 'admin' | 'manager' | 'member' | 'viewer'
  status: 'active' | 'invited' | 'suspended'
  invited_by: string | null
  invited_at: string | null
  joined_at: string | null
  created_at: string
  updated_at: string
}

interface TenantFeatures {
  id: string
  tenant_id: string
  b2c_enabled: boolean
  b2b_enabled: boolean
  whatsapp_integration: boolean
  email_integration: boolean
  pdf_generation: boolean
  analytics_enabled: boolean
  max_users: number
  max_quotes_per_month: number
  max_partners: number
  logo_url: string | null
  primary_color: string
  secondary_color: string
  custom_settings: Record<string, any>
  created_at: string
  updated_at: string
}

interface TenantContextType {
  tenant: Tenant | null
  tenantMember: TenantMember | null
  features: TenantFeatures | null
  loading: boolean
  refetchTenant: () => Promise<void>

  // Permission checks
  isOwner: boolean
  isAdmin: boolean
  isManager: boolean
  canManageMembers: boolean
  canDeleteQuotes: boolean
  canManagePartners: boolean

  // Feature checks
  hasB2C: boolean
  hasB2B: boolean
  hasWhatsApp: boolean
  hasEmail: boolean
  hasPDF: boolean
  hasAnalytics: boolean
}

const TenantContext = createContext<TenantContextType | undefined>(undefined)

const supabase = createClient()

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [tenantMember, setTenantMember] = useState<TenantMember | null>(null)
  const [features, setFeatures] = useState<TenantFeatures | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch tenant data when user is authenticated
  // Wait for auth to finish loading before making decisions
  useEffect(() => {
    // If auth is still loading, keep tenant loading true to prevent flash
    if (authLoading) {
      setLoading(true)
      return
    }

    if (user) {
      fetchTenantData()
    } else {
      // Auth is done loading and there's no user - clear data
      setTenant(null)
      setTenantMember(null)
      setFeatures(null)
      setLoading(false)
    }
  }, [user, authLoading])

  const fetchTenantData = async () => {
    if (!user) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)

      // 1. Get user's tenant membership
      const { data: memberData, error: memberError } = await supabase
        .from('tenant_members')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single()

      if (memberError) {
        console.error('Error fetching tenant member:', memberError)
        throw memberError
      }

      setTenantMember(memberData)

      // 2. Get tenant details
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', memberData.tenant_id)
        .single()

      if (tenantError) {
        console.error('Error fetching tenant:', tenantError)
        throw tenantError
      }

      setTenant(tenantData)

      // 3. Get tenant features
      const { data: featuresData, error: featuresError } = await supabase
        .from('tenant_features')
        .select('*')
        .eq('tenant_id', memberData.tenant_id)
        .single()

      if (featuresError) {
        console.error('Error fetching tenant features:', featuresError)
        throw featuresError
      }

      setFeatures(featuresData)

    } catch (error) {
      console.error('Failed to fetch tenant data:', error)
    } finally {
      setLoading(false)
    }
  }

  const refetchTenant = async () => {
    await fetchTenantData()
  }

  // Permission checks
  const isOwner = tenantMember?.role === 'owner'
  const isAdmin = tenantMember?.role === 'admin' || isOwner
  const isManager = tenantMember?.role === 'manager' || isAdmin
  const canManageMembers = isAdmin
  const canDeleteQuotes = isManager
  const canManagePartners = isManager

  // Feature checks
  const hasB2C = features?.b2c_enabled ?? false
  const hasB2B = features?.b2b_enabled ?? false
  const hasWhatsApp = features?.whatsapp_integration ?? false
  const hasEmail = features?.email_integration ?? false
  const hasPDF = features?.pdf_generation ?? false
  const hasAnalytics = features?.analytics_enabled ?? false

  const value = {
    tenant,
    tenantMember,
    features,
    loading,
    refetchTenant,

    // Permissions
    isOwner,
    isAdmin,
    isManager,
    canManageMembers,
    canDeleteQuotes,
    canManagePartners,

    // Features
    hasB2C,
    hasB2B,
    hasWhatsApp,
    hasEmail,
    hasPDF,
    hasAnalytics,
  }

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant() {
  const context = useContext(TenantContext)
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider')
  }
  return context
}
