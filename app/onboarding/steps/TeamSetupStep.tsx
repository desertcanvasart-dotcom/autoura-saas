'use client'

import { useState } from 'react'
import { ArrowRight, ArrowLeft, Users, Mail, Trash2, Plus, Info } from 'lucide-react'
import { showToast } from '@/app/contexts/ToastContext'

interface TeamSetupStepProps {
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  currentStep: number
  tenant: any
}

interface TeamMember {
  id: string
  email: string
  role: string
}

const ROLES = [
  {
    value: 'admin',
    label: 'Admin',
    description: 'Full access, can manage users and settings'
  },
  {
    value: 'manager',
    label: 'Manager',
    description: 'Can manage data, quotes, and clients'
  },
  {
    value: 'member',
    label: 'Member',
    description: 'Can create and edit assigned data'
  },
  {
    value: 'viewer',
    label: 'Viewer',
    description: 'Read-only access to data'
  }
]

export default function TeamSetupStep({ onNext, onBack, onSkip, currentStep, tenant }: TeamSetupStepProps) {
  const [members, setMembers] = useState<TeamMember[]>([
    { id: '1', email: '', role: 'member' }
  ])
  const [sending, setSending] = useState(false)

  const addMember = () => {
    setMembers([
      ...members,
      { id: Date.now().toString(), email: '', role: 'member' }
    ])
  }

  const removeMember = (id: string) => {
    if (members.length > 1) {
      setMembers(members.filter(m => m.id !== id))
    }
  }

  const updateMember = (id: string, field: keyof TeamMember, value: string) => {
    setMembers(members.map(m =>
      m.id === id ? { ...m, [field]: value } : m
    ))
  }

  const validateEmails = () => {
    const filledMembers = members.filter(m => m.email.trim())

    if (filledMembers.length === 0) {
      return true // It's okay to skip
    }

    // Check for valid emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const invalidEmails = filledMembers.filter(m => !emailRegex.test(m.email))

    if (invalidEmails.length > 0) {
      showToast('Please enter valid email addresses', 'error')
      return false
    }

    // Check for duplicate emails
    const emails = filledMembers.map(m => m.email.toLowerCase())
    const uniqueEmails = new Set(emails)

    if (emails.length !== uniqueEmails.size) {
      showToast('Duplicate email addresses found', 'error')
      return false
    }

    return true
  }

  const handleSendInvites = async () => {
    if (!validateEmails()) return

    const filledMembers = members.filter(m => m.email.trim())

    if (filledMembers.length === 0) {
      // Skip if no members added
      onNext()
      return
    }

    setSending(true)

    try {
      const response = await fetch('/api/onboarding/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members: filledMembers.map(m => ({
            email: m.email.trim(),
            role: m.role
          })),
          current_step: currentStep
        })
      })

      if (response.ok) {
        const result = await response.json()
        showToast(`Invitations sent to ${filledMembers.length} team member${filledMembers.length > 1 ? 's' : ''}!`, 'success')
        onNext()
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('❌ Team invitation error:', {
          status: response.status,
          error: errorData
        })
        showToast(`Failed to send invitations: ${errorData.error || 'Unknown error'}`, 'error')
      }
    } catch (error: any) {
      console.error('❌ Error sending invites:', error)
      showToast(`An error occurred: ${error?.message || 'Unknown error'}`, 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        {/* Title */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Invite Your Team
          </h2>
          <p className="text-gray-600">
            Collaborate with your team (you can add more later)
          </p>
        </div>

        {/* Roles Info */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-gray-900 mb-2">Team Roles:</p>
              <ul className="space-y-1 text-gray-600">
                {ROLES.map(role => (
                  <li key={role.value}>
                    <strong>{role.label}:</strong> {role.description}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Team Members List */}
        <div className="space-y-4 mb-6">
          {members.map((member, index) => (
            <div key={member.id} className="flex items-start gap-3">
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={member.email}
                    onChange={(e) => updateMember(member.id, 'email', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2d3b2d] focus:border-transparent"
                    placeholder="team@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    value={member.role}
                    onChange={(e) => updateMember(member.id, 'role', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2d3b2d] focus:border-transparent"
                  >
                    {ROLES.map(role => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {members.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeMember(member.id)}
                  className="mt-7 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  aria-label="Remove team member"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add More Button */}
        {members.length < 10 && (
          <button
            type="button"
            onClick={addMember}
            className="w-full mb-6 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Another Team Member
          </button>
        )}

        {/* Note */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-600">
            <strong>Note:</strong> Team members will receive an email invitation to join your workspace.
            They'll need to create an account and accept the invitation to get access.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-6 border-t border-gray-200">
          <button
            onClick={onBack}
            className="px-6 py-2 text-gray-600 hover:text-gray-900 font-medium flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onSkip}
              className="px-6 py-2 text-gray-600 hover:text-gray-900 font-medium flex items-center gap-2 transition-colors"
            >
              Skip for Now
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={handleSendInvites}
              disabled={sending}
              className="bg-[#2d3b2d] text-white py-2 px-6 rounded-lg hover:bg-[#3d4b3d] disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2 transition-colors"
            >
              {sending ? 'Sending...' : 'Send Invites'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
