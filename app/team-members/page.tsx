'use client'

import { useState, useEffect } from 'react'
import { 
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  User,
  Mail,
  Phone,
  Shield,
  CheckCircle,
  XCircle,
  Users
} from 'lucide-react'

interface TeamMember {
  id: string
  name: string
  email: string
  phone: string
  role: string
  department_id: string | null
  notes: string
  is_active: boolean
  created_at: string
  updated_at: string
}

interface Department {
  id: string
  name: string
  description?: string
  service_types?: string[]
}

const ROLES = [
  { value: 'owner', label: 'Owner', icon: '👑', color: 'bg-purple-100 text-purple-700' },
  { value: 'manager', label: 'Manager', icon: '💼', color: 'bg-blue-100 text-blue-700' },
  { value: 'coordinator', label: 'Coordinator', icon: '📋', color: 'bg-green-100 text-green-700' },
  { value: 'sales', label: 'Sales', icon: '💰', color: 'bg-amber-100 text-amber-700' },
  { value: 'guide', label: 'Tour Guide', icon: '👨‍🏫', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'driver', label: 'Driver', icon: '🚗', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'staff', label: 'Staff', icon: '👤', color: 'bg-gray-100 text-gray-700' }
]

export default function TeamMembersPage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'staff',
    department_id: '',
    notes: ''
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchMembers()
  }, [showInactive])

  useEffect(() => {
    fetchDepartments()
  }, [])

  const fetchDepartments = async () => {
    try {
      const response = await fetch('/api/departments')
      if (response.ok) {
        const result = await response.json()
        if (result.success) setDepartments(result.data)
      }
    } catch (error) {
      console.error('Error fetching departments:', error)
    }
  }

  const departmentName = (id: string | null) =>
    id ? departments.find(d => d.id === id)?.name : undefined

  const fetchMembers = async () => {
    try {
      const params = new URLSearchParams()
      if (!showInactive) params.append('active', 'true')
      
      const response = await fetch(`/api/team-members?${params}`)
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setMembers(result.data)
        }
      }
    } catch (error) {
      console.error('Error fetching team members:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const url = editingMember 
        ? `/api/team-members/${editingMember.id}`
        : '/api/team-members'
      
      const response = await fetch(url, {
        method: editingMember ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        // coerce empty department to null (avoids inserting '' into a uuid column)
        body: JSON.stringify({ ...formData, department_id: formData.department_id || null })
      })

      if (response.ok) {
        setShowModal(false)
        setEditingMember(null)
        resetForm()
        fetchMembers()
      }
    } catch (error) {
      console.error('Error saving team member:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (member: TeamMember) => {
    setEditingMember(member)
    setFormData({
      name: member.name || '',
      email: member.email || '',
      phone: member.phone || '',
      role: member.role || 'staff',
      department_id: member.department_id || '',
      notes: member.notes || ''
    })
    setShowModal(true)
  }

  const handleDelete = async (member: TeamMember) => {
    if (!confirm(`Are you sure you want to deactivate ${member.name}?`)) return

    try {
      const response = await fetch(`/api/team-members/${member.id}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        fetchMembers()
      }
    } catch (error) {
      console.error('Error deleting team member:', error)
    }
  }

  const handleReactivate = async (member: TeamMember) => {
    try {
      const response = await fetch(`/api/team-members/${member.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true })
      })
      if (response.ok) {
        fetchMembers()
      }
    } catch (error) {
      console.error('Error reactivating team member:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      role: 'staff',
      department_id: '',
      notes: ''
    })
  }

  const openAddModal = () => {
    setEditingMember(null)
    resetForm()
    setShowModal(true)
  }

  const getRoleConfig = (role: string) => {
    return ROLES.find(r => r.value === role) || ROLES[ROLES.length - 1]
  }

  const filteredMembers = members.filter(member => {
    const matchesSearch = 
      member.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.email?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = !roleFilter || member.role === roleFilter
    const matchesDepartment = !departmentFilter || member.department_id === departmentFilter
    return matchesSearch && matchesRole && matchesDepartment
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-lg">
            👥
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Team Members</h1>
            <p className="text-sm text-gray-500">Manage your team for task assignments</p>
          </div>
        </div>

        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Member
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-gray-400" />
            <span className="text-xs text-gray-500">Total Members</span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">{members.filter(m => m.is_active).length}</p>
        </div>
        {ROLES.slice(0, 3).map(role => {
          const count = members.filter(m => m.role === role.value && m.is_active).length
          return (
            <div key={role.value} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span>{role.icon}</span>
                <span className="text-xs text-gray-500">{role.label}s</span>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{count}</p>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search team members..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47]"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
        >
          <option value="">All Roles</option>
          {ROLES.map(role => (
            <option key={role.value} value={role.value}>{role.icon} {role.label}</option>
          ))}
        </select>

        {departments.length > 0 && (
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
          >
            <option value="">All Departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>🏢 {d.name}</option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-gray-300 text-[#647C47] focus:ring-[#647C47]"
          />
          Show inactive
        </label>
      </div>

      {/* Team Members Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMembers.length === 0 ? (
          <div className="col-span-full bg-white border border-gray-200 rounded-lg p-8 text-center">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No team members found</p>
            <button
              onClick={openAddModal}
              className="mt-3 text-sm text-[#647C47] hover:underline"
            >
              Add your first team member
            </button>
          </div>
        ) : (
          filteredMembers.map(member => {
            const roleConfig = getRoleConfig(member.role)
            return (
              <div 
                key={member.id} 
                className={`bg-white border rounded-lg p-4 ${member.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-lg">
                      {roleConfig.icon}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{member.name}</h3>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${roleConfig.color}`}>
                        {roleConfig.label}
                      </span>
                      {departmentName(member.department_id) && (
                        <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                          🏢 {departmentName(member.department_id)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {member.is_active ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  {member.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail className="h-3.5 w-3.5 text-gray-400" />
                      <span className="truncate">{member.email}</span>
                    </div>
                  )}
                  {member.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="h-3.5 w-3.5 text-gray-400" />
                      <span>{member.phone}</span>
                    </div>
                  )}
                </div>

                {member.notes && (
                  <p className="text-xs text-gray-500 mb-3 line-clamp-2">{member.notes}</p>
                )}

                <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => handleEdit(member)}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors"
                  >
                    <Edit2 className="h-3 w-3" />
                    Edit
                  </button>
                  {member.is_active ? (
                    <button
                      onClick={() => handleDelete(member)}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                      Deactivate
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReactivate(member)}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50 rounded transition-colors"
                    >
                      <CheckCircle className="h-3 w-3" />
                      Reactivate
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingMember ? 'Edit Team Member' : 'Add Team Member'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  placeholder="John Doe"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  placeholder="+20 100 123 4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                >
                  {ROLES.map(role => (
                    <option key={role.value} value={role.value}>{role.icon} {role.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select
                  value={formData.department_id}
                  onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                >
                  <option value="">— No department —</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  rows={3}
                  placeholder="Additional notes..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingMember ? 'Update' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center pt-4">
        <p className="text-xs text-gray-400">© 2024 Autoura Operations System</p>
      </div>
    </div>
  )
}