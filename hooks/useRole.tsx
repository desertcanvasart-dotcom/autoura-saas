'use client'

import { useAuth } from '@/app/contexts/AuthContext'
import { useMemo } from 'react'

export type UserRole = 'admin' | 'manager' | 'member' | 'viewer'

interface UseRoleReturn {
  role: UserRole
  isAdmin: boolean
  isManager: boolean
  isMember: boolean
  isViewer: boolean
  canAccess: (requiredRoles: UserRole[]) => boolean
  canManageTeam: boolean
  canManageSettings: boolean
  canViewFinancials: boolean
  canEditClients: boolean
  canDeleteRecords: boolean
}

const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 4,
  manager: 3,
  member: 2,
  viewer: 1
}

export function useRole(): UseRoleReturn {
  const { profile } = useAuth()
  
  const role = (profile?.role as UserRole) || 'viewer'
  
  return useMemo(() => {
    const roleLevel = ROLE_HIERARCHY[role] || 0
    
    return {
      role,
      isAdmin: role === 'admin',
      isManager: role === 'manager',
      isMember: role === 'member',
      isViewer: role === 'viewer',
      
      // Check if user can access based on required roles
      canAccess: (requiredRoles: UserRole[]) => {
        return requiredRoles.includes(role)
      },
      
      // Permission helpers
      canManageTeam: role === 'admin' || role === 'manager',
      canManageSettings: role === 'admin',
      canViewFinancials: role === 'admin' || role === 'manager',
      canEditClients: role !== 'viewer',
      canDeleteRecords: role === 'admin' || role === 'manager',
    }
  }, [role])
}

// Higher-order component for role-based rendering
interface WithRoleProps {
  children: React.ReactNode
  roles: UserRole[]
  fallback?: React.ReactNode
}

export function WithRole({ children, roles, fallback = null }: WithRoleProps) {
  const { canAccess } = useRole()
  
  if (!canAccess(roles)) {
    return <>{fallback}</>
  }
  
  return <>{children}</>
}

// Component to show content only to admins
export function AdminOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <WithRole roles={['admin']} fallback={fallback}>{children}</WithRole>
}

// Component to show content to admins and managers
export function ManagerOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <WithRole roles={['admin', 'manager']} fallback={fallback}>{children}</WithRole>
}

// Component to hide content from viewers
export function NotViewer({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <WithRole roles={['admin', 'manager', 'member']} fallback={fallback}>{children}</WithRole>
}