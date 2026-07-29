'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/app/supabase'
import type { Json } from '@/types/database.types'
import { useAuth } from './AuthContext'

interface Tenant {
  id: string
  company_name: string
  contact_email: string | null
  /**
   * Which workspaces this tenant chooses to see. A free preference on every
   * tier — never an entitlement. Hiding one hides NAVIGATION only; records
   * stay reachable (see lib/workspace-visibility.ts).
   */
  workspace_mode: 'b2c' | 'b2b' | 'both'
  logo_url: string | null
  // Branding — on TENANTS, the single source of truth since migration 255.
  // These were undeclared here while existing at runtime (select('*')),
  // which is how code reading the wrong table type-checked for two days.
  primary_color: string | null
  secondary_color: string | null
  company_phone: string | null
  company_website: string | null
  tagline: string | null
  created_at: string | null
  updated_at: string | null
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
  created_at: string | null
  updated_at: string | null
}

interface TenantFeatures {
  id: string
  tenant_id: string
  whatsapp_integration: boolean
  email_integration: boolean
  pdf_generation: boolean
  analytics_enabled: boolean
  /** DEPRECATED (mig 255): branding lives on Tenant. Never read these. */
  logo_url: string | null
  primary_color: string | null
  secondary_color: string | null
  custom_settings: Json | null
  created_at: string | null
  updated_at: string | null
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
  /** Tenant chooses to see the direct-client workspace. Never a paywall. */
  showsB2cWorkspace: boolean
  /** Tenant chooses to see the partner workspace. Never a paywall. */
  showsB2bWorkspace: boolean
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

      // role/status are DB-constrained strings; narrow them to the app-level unions
      setTenantMember({
        ...memberData,
        role: memberData.role as TenantMember['role'],
        status: memberData.status as TenantMember['status'],
      })

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

      setTenant({
        ...tenantData,
        workspace_mode: tenantData.workspace_mode as Tenant['workspace_mode'],
      })

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

  // Workspace visibility — a PREFERENCE, read from tenants.workspace_mode.
  // Defaults to showing everything while the tenant is still loading, so a
  // slow context never briefly hides half the product.
  const workspaceMode = tenant?.workspace_mode ?? 'both'
  const showsB2cWorkspace = workspaceMode === 'b2c' || workspaceMode === 'both'
  const showsB2bWorkspace = workspaceMode === 'b2b' || workspaceMode === 'both'

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

    // Workspace preferences
    showsB2cWorkspace,
    showsB2bWorkspace,
    hasWhatsApp,
    hasEmail,
    hasPDF,
    hasAnalytics,
  }

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

// No-op fallback for SSR/prerendering when TenantProvider isn't available
const noopTenantContext: TenantContextType = {
  tenant: null,
  tenantMember: null,
  features: null,
  loading: true, // Treat as loading during SSR to prevent content flash
  refetchTenant: async () => {},

  // Permissions (default to false during SSR)
  isOwner: false,
  isAdmin: false,
  isManager: false,
  canManageMembers: false,
  canDeleteQuotes: false,
  canManagePartners: false,

  // Features (default to false during SSR)
  showsB2cWorkspace: true,
  showsB2bWorkspace: true,
  hasWhatsApp: false,
  hasEmail: false,
  hasPDF: false,
  hasAnalytics: false,
}

export function useTenant() {
  const context = useContext(TenantContext)

  // During SSR/prerendering, context won't be available
  // Return a no-op fallback to allow initial render to complete
  if (context === undefined) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn('useTenant: TenantProvider not found, using no-op fallback')
    }
    return noopTenantContext
  }

  return context
}
