'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useRole } from '@/hooks/useRole'
import { useAuth } from '@/app/contexts/AuthContext'
import { useTenant } from '@/app/contexts/TenantContext'
import Link from 'next/link'
import {
  Users,
  UserPlus,
  Mail,
  Search,
  Shield,
  CheckCircle,
  XCircle,
  Clock,
  Send,
  Loader2,
  AlertCircle,
  X,
  RefreshCw,
  Trash2,
  ArrowLeft,
  User as UserIcon,
} from 'lucide-react'

interface TeamMember {
  id: string
  full_name: string
  email: string
  role: string
  phone?: string
  is_active: boolean
  last_login_at?: string
  created_at: string
}

interface Invitation {
  id: string
  email: string
  role: string
  expires_at: string
  accepted_at: string | null
  created_at: string
  inviter?: {
    full_name: string
    email: string
  }
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrator', desc: 'Full access to everything' },
  { value: 'manager', label: 'Manager', desc: 'Manage clients, tasks, and reports' },
  { value: 'member', label: 'Member', desc: 'Work on assigned tasks and clients' },
  { value: 'viewer', label: 'Viewer', desc: 'Read-only access' }
]

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  member: 'bg-green-100 text-green-700',
  viewer: 'bg-gray-100 text-gray-600'
}

export default function UserManagementPage() {
  const router = useRouter()
  const { isAdmin, canManageTeam } = useRole()
  const { user } = useAuth()
  const { tenant } = useTenant()

  const [activeTab, setActiveTab] = useState<'users' | 'invitations'>('users')
  const [members, setMembers] = useState<TeamMember[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'member' })
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)

  // Fetch data
  useEffect(() => {
    fetchMembers()
    fetchInvitations()
  }, [])

  const fetchMembers = async () => {
    try {
      const response = await fetch('/api/profiles')
      if (response.ok) {
        const data = await response.json()
        setMembers(data.data || data.profiles || [])
      }
    } catch (error) {
      console.error('Error fetching members:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchInvitations = async () => {
    try {
      const response = await fetch('/api/invitations')
      if (response.ok) {
        const data = await response.json()
        setInvitations(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching invitations:', error)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteError(null)
    setInviteSuccess(null)
    setInviting(true)

    try {
      const response = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteForm.email,
          role: inviteForm.role,
          tenant_id: tenant?.id,
          invited_by: user?.id
        })
      })

      const data = await response.json()

      if (data.success) {
        setInviteSuccess(`Invitation sent to ${inviteForm.email}`)
        setInviteForm({ email: '', role: 'member' })
        fetchInvitations()
        setTimeout(() => {
          setShowInviteModal(false)
          setInviteSuccess(null)
        }, 2000)
      } else {
        setInviteError(data.error || 'Failed to send invitation')
      }
    } catch (error) {
      setInviteError('Failed to send invitation')
    } finally {
      setInviting(false)
    }
  }

  const cancelInvitation = async (id: string) => {
    if (!confirm('Cancel this invitation?')) return

    try {
      const response = await fetch(`/api/invitations?id=${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        fetchInvitations()
      }
    } catch (error) {
      console.error('Error cancelling invitation:', error)
    }
  }

  const resendInvitation = async (invitation: Invitation) => {
    try {
      await fetch(`/api/invitations?id=${invitation.id}`, { method: 'DELETE' })

      await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: invitation.email,
          role: invitation.role,
          tenant_id: tenant?.id,
          invited_by: user?.id
        })
      })

      fetchInvitations()
    } catch (error) {
      console.error('Error resending invitation:', error)
    }
  }

  const updateMemberRole = async (memberId: string, newRole: string) => {
    try {
      const response = await fetch(`/api/profiles/${memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      })

      if (response.ok) {
        fetchMembers()
      }
    } catch (error) {
      console.error('Error updating role:', error)
    }
  }

  const toggleMemberStatus = async (memberId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/profiles/${memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentStatus })
      })

      if (response.ok) {
        fetchMembers()
      }
    } catch (error) {
      console.error('Error updating status:', error)
    }
  }

  const filteredMembers = members.filter(m =>
    m.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const pendingInvitations = invitations.filter(i => !i.accepted_at && new Date(i.expires_at) > new Date())
  const expiredInvitations = invitations.filter(i => !i.accepted_at && new Date(i.expires_at) <= new Date())

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-6 py-4">
            <h1 className="text-lg font-semibold text-gray-900">User Management</h1>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-[#647C47] animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Settings
          </Link>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <Shield className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">User Management</h1>
                <p className="text-sm text-gray-500">Manage user accounts and access permissions</p>
              </div>
            </div>

            {canManageTeam && (
              <button
                type="button"
                onClick={() => setShowInviteModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Invite User
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900">{members.length}</p>
                <p className="text-xs text-gray-500">Total Users</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-green-600">
                  {members.filter(m => m.is_active).length}
                </p>
                <p className="text-xs text-gray-500">Active</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-amber-600">{pendingInvitations.length}</p>
                <p className="text-xs text-gray-500">Pending Invites</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Shield className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-purple-600">
                  {members.filter(m => m.role === 'admin').length}
                </p>
                <p className="text-xs text-gray-500">Admins</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-6">
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'users'
                  ? 'border-[#647C47] text-[#647C47]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Users ({members.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('invitations')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'invitations'
                  ? 'border-[#647C47] text-[#647C47]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Invitations ({pendingInvitations.length})
            </button>
          </nav>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={activeTab === 'users' ? 'Search users...' : 'Search invitations...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
          />
        </div>

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-3">
            {filteredMembers.length === 0 ? (
              <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No users found</p>
              </div>
            ) : (
              filteredMembers.map(member => (
                <div key={member.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        member.is_active ? 'bg-[#647C47]/10' : 'bg-gray-100'
                      }`}>
                        <span className="text-sm font-medium text-[#647C47]">
                          {member.full_name?.charAt(0) || member.email.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium text-gray-900">
                            {member.full_name || 'Unnamed'}
                          </h4>
                          {!member.is_active && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded">
                              Inactive
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{member.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Role Badge/Selector */}
                      {isAdmin ? (
                        <select
                          value={member.role}
                          onChange={(e) => updateMemberRole(member.id, e.target.value)}
                          aria-label="Change user role"
                          className={`px-2 py-1 text-xs font-medium rounded border-0 cursor-pointer ${ROLE_COLORS[member.role]}`}
                        >
                          {ROLE_OPTIONS.map(role => (
                            <option key={role.value} value={role.value}>{role.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`px-2 py-1 text-xs font-medium rounded ${ROLE_COLORS[member.role]}`}>
                          {ROLE_OPTIONS.find(r => r.value === member.role)?.label || member.role}
                        </span>
                      )}

                      {/* Actions */}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => toggleMemberStatus(member.id, member.is_active)}
                          className={`p-1.5 rounded transition-colors ${
                            member.is_active
                              ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                              : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                          }`}
                          title={member.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {member.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Last login info */}
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-400">
                    <span>
                      Joined {new Date(member.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </span>
                    {member.last_login_at && (
                      <span>
                        Last login: {new Date(member.last_login_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Invitations Tab */}
        {activeTab === 'invitations' && (
          <div className="space-y-6">
            {/* Pending Invitations */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Pending ({pendingInvitations.length})</h3>
              {pendingInvitations.length === 0 ? (
                <div className="text-center py-8 bg-white border border-gray-200 rounded-lg">
                  <Mail className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No pending invitations</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingInvitations.map(invitation => (
                    <div key={invitation.id} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-amber-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{invitation.email}</p>
                            <p className="text-xs text-gray-500">
                              Expires {new Date(invitation.expires_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${ROLE_COLORS[invitation.role]}`}>
                            {ROLE_OPTIONS.find(r => r.value === invitation.role)?.label}
                          </span>

                          <button
                            type="button"
                            onClick={() => resendInvitation(invitation)}
                            className="p-1.5 text-gray-400 hover:text-[#647C47] hover:bg-gray-100 rounded transition-colors"
                            title="Resend invitation"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelInvitation(invitation.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Cancel invitation"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Expired Invitations */}
            {expiredInvitations.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">Expired ({expiredInvitations.length})</h3>
                <div className="space-y-2">
                  {expiredInvitations.map(invitation => (
                    <div key={invitation.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 opacity-60">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                            <XCircle className="w-5 h-5 text-gray-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-600">{invitation.email}</p>
                            <p className="text-xs text-gray-400">
                              Expired {new Date(invitation.expires_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => resendInvitation(invitation)}
                            className="px-3 py-1 text-xs font-medium text-[#647C47] hover:bg-[#647C47]/10 rounded transition-colors"
                            title="Resend expired invitation"
                          >
                            Resend
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelInvitation(invitation.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete invitation"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Invite Modal */}
        {showInviteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
              <div className="flex items-center justify-between p-5 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Invite User</h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteModal(false)
                    setInviteError(null)
                    setInviteSuccess(null)
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                  title="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleInvite} className="p-5 space-y-4">
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    placeholder="colleague@example.com"
                    required
                  />
                </div>

                {/* Role */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                  <div className="space-y-2">
                    {ROLE_OPTIONS.map(role => (
                      <label
                        key={role.value}
                        className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                          inviteForm.role === role.value
                            ? 'border-[#647C47] bg-[#647C47]/5'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="role"
                          value={role.value}
                          checked={inviteForm.role === role.value}
                          onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                          className="mt-0.5 text-[#647C47] focus:ring-[#647C47]"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{role.label}</p>
                          <p className="text-xs text-gray-500">{role.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Error */}
                {inviteError && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                    <p className="text-sm text-red-600">{inviteError}</p>
                  </div>
                )}

                {/* Success */}
                {inviteSuccess && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <p className="text-sm text-green-600">{inviteSuccess}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviting || !!inviteSuccess}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
                  >
                    {inviting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send Invitation
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
