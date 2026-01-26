'use client'

import { useState, useEffect } from 'react'
import { useTenant } from '@/app/contexts/TenantContext'
import { createClient } from '@/app/supabase'
import Link from 'next/link'
import {
  Users,
  UserPlus,
  Crown,
  ShieldCheck,
  UserCog,
  User as UserIcon,
  Eye,
  Trash2,
  Mail,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ArrowLeft,
  Loader2,
  X,
} from 'lucide-react'

const supabase = createClient()

interface TenantMemberWithUser {
  id: string
  tenant_id: string
  user_id: string
  role: 'owner' | 'admin' | 'manager' | 'member' | 'viewer'
  status: 'active' | 'invited' | 'suspended'
  invited_at: string | null
  joined_at: string | null
  created_at: string
  users: {
    email: string
  }
}

export default function TeamManagementPage() {
  const { tenant, tenantMember, canManageMembers } = useTenant()
  const [members, setMembers] = useState<TenantMemberWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'manager' | 'member' | 'viewer'>('member')
  const [inviting, setInviting] = useState(false)

  useEffect(() => {
    if (tenant) {
      fetchMembers()
    }
  }, [tenant])

  const fetchMembers = async () => {
    if (!tenant) return

    setLoading(true)
    try {
      const response = await fetch('/api/team/members')
      if (!response.ok) {
        throw new Error('Failed to fetch team members')
      }

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch team members')
      }

      setMembers(result.data || [])
    } catch (error: any) {
      console.error('Error fetching members:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to load team members' })
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    if (!canManageMembers) return

    setActionLoading(memberId)
    try {
      const response = await fetch(`/api/team/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      })

      if (!response.ok) {
        throw new Error('Failed to update member role')
      }

      await fetchMembers()
      setMessage({ type: 'success', text: 'Member role updated successfully' })
    } catch (error: any) {
      console.error('Error updating role:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to update member role' })
    } finally {
      setActionLoading(null)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!canManageMembers) return

    if (!confirm('Are you sure you want to remove this team member?')) return

    setActionLoading(memberId)
    try {
      const response = await fetch(`/api/team/members/${memberId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to remove member')
      }

      await fetchMembers()
      setMessage({ type: 'success', text: 'Member removed successfully' })
    } catch (error: any) {
      console.error('Error removing member:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to remove member' })
    } finally {
      setActionLoading(null)
    }
  }

  const handleSendInvite = async () => {
    if (!inviteEmail) {
      setMessage({ type: 'error', text: 'Please enter an email address' })
      return
    }

    setInviting(true)
    try {
      const response = await fetch('/api/onboarding/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members: [{ email: inviteEmail, role: inviteRole }]
        })
      })

      if (!response.ok) {
        throw new Error('Failed to send invitation')
      }

      setMessage({ type: 'success', text: `Invitation sent to ${inviteEmail}` })
      setShowInviteModal(false)
      setInviteEmail('')
      setInviteRole('member')
      await fetchMembers()
    } catch (error: any) {
      console.error('Error sending invite:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to send invitation' })
    } finally {
      setInviting(false)
    }
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
        return <UserIcon className="w-4 h-4 text-[#647C47]" />
      case 'viewer':
        return <Eye className="w-4 h-4 text-gray-500" />
      default:
        return <UserIcon className="w-4 h-4 text-gray-500" />
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-yellow-100 text-yellow-700'
      case 'admin':
        return 'bg-purple-100 text-purple-700'
      case 'manager':
        return 'bg-blue-100 text-blue-700'
      case 'member':
        return 'bg-green-100 text-green-700'
      case 'viewer':
        return 'bg-gray-100 text-gray-600'
      default:
        return 'bg-gray-100 text-gray-600'
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
            <CheckCircle2 className="w-3 h-3" />
            Active
          </span>
        )
      case 'invited':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
            <Mail className="w-3 h-3" />
            Invited
          </span>
        )
      case 'suspended':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
            <XCircle className="w-3 h-3" />
            Suspended
          </span>
        )
      default:
        return null
    }
  }

  // Loading state
  if (loading && !members.length) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-6 py-4">
            <h1 className="text-lg font-semibold text-gray-900">Team Management</h1>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-[#647C47] animate-spin" />
        </div>
      </div>
    )
  }

  // Access denied
  if (tenantMember && !canManageMembers) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-6 py-4">
            <h1 className="text-lg font-semibold text-gray-900">Team Management</h1>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-6 py-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-yellow-900">Access Denied</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Only owners and admins can manage team members.
              </p>
            </div>
          </div>
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
              <div className="w-10 h-10 rounded-lg bg-[#647C47]/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-[#647C47]" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Team Management</h1>
                <p className="text-sm text-gray-500">Manage members and permissions</p>
              </div>
            </div>

            <button
              onClick={() => setShowInviteModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white text-sm font-medium rounded-lg hover:bg-[#4f613a] transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Invite Member
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Message */}
        {message && (
          <div
            className={`rounded-lg p-4 flex items-start gap-3 ${
              message.type === 'success'
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <p
              className={`text-sm ${
                message.type === 'success' ? 'text-green-800' : 'text-red-800'
              }`}
            >
              {message.text}
            </p>
            <button
              onClick={() => setMessage(null)}
              className="ml-auto text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#647C47]/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-[#647C47]" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900">
                  {members.filter((m) => m.status === 'active').length}
                </p>
                <p className="text-xs text-gray-500">Active</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900">
                  {members.filter((m) => m.role === 'admin' || m.role === 'owner').length}
                </p>
                <p className="text-xs text-gray-500">Admins</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900">
                  {members.filter((m) => m.status === 'invited').length}
                </p>
                <p className="text-xs text-gray-500">Pending</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900">{members.length}</p>
                <p className="text-xs text-gray-500">Total</p>
              </div>
            </div>
          </div>
        </div>

        {/* Members List */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {members.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No team members found. Invite your first member to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Member
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Joined
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {members.map((member) => {
                    const isCurrentUser = member.id === tenantMember?.id
                    const isOwner = member.role === 'owner'

                    return (
                      <tr key={member.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#647C47]/10 flex items-center justify-center">
                              <UserIcon className="w-5 h-5 text-[#647C47]" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {member.users?.email || 'Unknown'}
                              </p>
                              {isCurrentUser && (
                                <span className="text-xs text-gray-400">(You)</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${getRoleBadgeColor(
                              member.role
                            )}`}
                          >
                            {getRoleIcon(member.role)}
                            <span className="capitalize">{member.role}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(member.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {member.joined_at
                            ? new Date(member.joined_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })
                            : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {!isCurrentUser && !isOwner && (
                            <div className="flex items-center justify-end gap-2">
                              <select
                                value={member.role}
                                onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                                disabled={actionLoading === member.id}
                                className="text-xs border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                              >
                                <option value="admin">Admin</option>
                                <option value="manager">Manager</option>
                                <option value="member">Member</option>
                                <option value="viewer">Viewer</option>
                              </select>

                              <button
                                onClick={() => handleRemoveMember(member.id)}
                                disabled={actionLoading === member.id}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                                title="Remove member"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Role Descriptions */}
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Role Permissions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <Crown className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Owner</p>
                <p className="text-xs text-gray-500">Full access to all features</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Admin</p>
                <p className="text-xs text-gray-500">Manage team and settings</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <UserCog className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Manager</p>
                <p className="text-xs text-gray-500">Create, edit, delete data</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <UserIcon className="w-5 h-5 text-[#647C47] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Member</p>
                <p className="text-xs text-gray-500">Create and edit quotes</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Eye className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Viewer</p>
                <p className="text-xs text-gray-500">Read-only access</p>
              </div>
            </div>
          </div>
        </div>

        {/* Invite Member Modal */}
        {showInviteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Invite Team Member</h3>
                <button
                  onClick={() => {
                    setShowInviteModal(false)
                    setInviteEmail('')
                    setInviteRole('member')
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="teammate@example.com"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                  >
                    <option value="member">Member</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>

                <div className="bg-[#647C47]/5 border border-[#647C47]/20 rounded-lg p-3">
                  <p className="text-xs text-gray-600">
                    The invitation link will be logged in your server console. Copy and send it manually.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 mt-5">
                <button
                  onClick={() => {
                    setShowInviteModal(false)
                    setInviteEmail('')
                    setInviteRole('member')
                  }}
                  disabled={inviting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendInvite}
                  disabled={inviting || !inviteEmail}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white text-sm font-medium rounded-lg hover:bg-[#4f613a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {inviting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      Send Invitation
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
