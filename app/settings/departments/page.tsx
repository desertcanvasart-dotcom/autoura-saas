'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Lock,
  AlertCircle,
  X,
  Info,
} from 'lucide-react'
import {
  ROUTABLE_SERVICE_TYPES,
  BACK_OFFICE_SERVICE_TYPES,
  serviceTypeLabel,
} from '@/lib/service-types'

interface Department {
  id: string
  tenant_id: string | null
  name: string
  description: string | null
  service_types: string[] | null
  is_active: boolean | null
}

interface TeamMember {
  id: string
  department_id: string | null
}

const EMPTY_FORM = { name: '', description: '', service_types: [] as string[], is_active: true }

export default function DepartmentsSettingsPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Department | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [confirmDelete, setConfirmDelete] = useState<Department | null>(null)

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    try {
      const [deptRes, memberRes] = await Promise.all([
        fetch('/api/departments?includeInactive=true'),
        fetch('/api/team-members'),
      ])
      const deptData = await deptRes.json()
      const memberData = await memberRes.json()

      if (deptData.success) setDepartments(deptData.data || [])
      if (memberData.success) setMembers(memberData.data || [])
    } catch {
      setError('Could not load departments')
    } finally {
      setLoading(false)
    }
  }

  /** Built-in departments are shared platform-wide and read-only to tenants. */
  const isBuiltIn = (dept: Department) => dept.tenant_id === null

  const memberCount = (deptId: string) =>
    members.filter(m => m.department_id === deptId).length

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowModal(true)
  }

  const openEdit = (dept: Department) => {
    setEditing(dept)
    setForm({
      name: dept.name,
      description: dept.description || '',
      service_types: dept.service_types || [],
      is_active: dept.is_active !== false,
    })
    setError(null)
    setShowModal(true)
  }

  const toggleServiceType = (value: string) => {
    setForm(prev => ({
      ...prev,
      service_types: prev.service_types.includes(value)
        ? prev.service_types.filter(t => t !== value)
        : [...prev.service_types, value],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const response = await fetch(
        editing ? `/api/departments/${editing.id}` : '/api/departments',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        }
      )
      const result = await response.json().catch(() => ({}))

      if (!response.ok || result.success === false) {
        setError(result.error || 'Could not save the department')
        return
      }

      setShowModal(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      setNotice(editing ? 'Department updated' : 'Department created')
      await loadAll()
    } catch {
      setError('Could not save the department')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/departments/${confirmDelete.id}`, { method: 'DELETE' })
      const result = await response.json().catch(() => ({}))

      if (!response.ok || result.success === false) {
        setError(result.error || 'Could not delete the department')
        return
      }

      const unfiled = result.unfiled?.team_members || 0
      setNotice(
        unfiled > 0
          ? `Department deleted. ${unfiled} team member${unfiled === 1 ? '' : 's'} now have no department.`
          : 'Department deleted'
      )
      setConfirmDelete(null)
      await loadAll()
    } catch {
      setError('Could not delete the department')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading departments…
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#647C47]/10 rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-[#647C47]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Departments</h1>
            <p className="text-sm text-gray-500">
              Group staff by the work they handle, and route generated tasks to them
            </p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] transition-colors"
        >
          <Plus className="w-4 h-4" />
          New department
        </button>
      </div>

      <div className="mb-4 flex gap-2 items-start p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          Service types decide which department a generated task goes to. When an itinerary
          generates tasks, each one is routed to the department that handles its service type —
          so a service type no department covers produces an unassigned task.{' '}
          <Link href="/team-members" className="underline font-medium">
            Assign staff to departments
          </Link>
          .
        </p>
      </div>

      {notice && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 flex justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && !showModal && !confirmDelete && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-200">
        {departments.length === 0 && (
          <p className="p-6 text-sm text-gray-500">No departments yet.</p>
        )}

        {departments.map(dept => (
          <div key={dept.id} className="p-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-gray-900">{dept.name}</span>
                {isBuiltIn(dept) && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 border border-gray-200">
                    <Lock className="w-3 h-3" />
                    Built-in
                  </span>
                )}
                {dept.is_active === false && (
                  <span className="px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200">
                    Inactive
                  </span>
                )}
                <span className="text-xs text-gray-500">
                  {memberCount(dept.id)} member{memberCount(dept.id) === 1 ? '' : 's'}
                </span>
              </div>

              {dept.description && (
                <p className="text-sm text-gray-600 mt-1">{dept.description}</p>
              )}

              <div className="flex flex-wrap gap-1 mt-2">
                {(dept.service_types || []).length === 0 && (
                  <span className="text-xs text-gray-400">No service types — receives no generated tasks</span>
                )}
                {(dept.service_types || []).map(type => (
                  <span
                    key={type}
                    className="px-2 py-0.5 rounded text-xs bg-[#647C47]/10 text-[#4f6238] border border-[#647C47]/20"
                  >
                    {serviceTypeLabel(type)}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {isBuiltIn(dept) ? (
                <span className="text-xs text-gray-400 px-2">Shared platform-wide</span>
              ) : (
                <>
                  <button
                    onClick={() => openEdit(dept)}
                    className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                    aria-label={`Edit ${dept.name}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { setError(null); setConfirmDelete(dept) }}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    aria-label={`Delete ${dept.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create / edit modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {editing ? `Edit ${editing.name}` : 'New department'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="dept-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  id="dept-name"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                  maxLength={100}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                />
              </div>

              <div>
                <label htmlFor="dept-description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="dept-description"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                />
              </div>

              <fieldset>
                <legend className="block text-sm font-medium text-gray-700 mb-1">
                  Service types handled
                </legend>
                <p className="text-xs text-gray-500 mb-2">
                  Tasks generated for these services route to this department.
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {ROUTABLE_SERVICE_TYPES.map(type => (
                    <label key={type.value} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={form.service_types.includes(type.value)}
                        onChange={() => toggleServiceType(type.value)}
                        className="rounded border-gray-300 text-[#647C47] focus:ring-[#647C47]"
                      />
                      {type.label}
                    </label>
                  ))}
                </div>

                <p className="text-xs text-gray-500 mt-3 mb-2">
                  Back-office work. No itinerary service produces these, so they never generate tasks —
                  they only describe what the department does.
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {BACK_OFFICE_SERVICE_TYPES.map(type => (
                    <label key={type.value} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={form.service_types.includes(type.value)}
                        onChange={() => toggleServiceType(type.value)}
                        className="rounded border-gray-300 text-[#647C47] focus:ring-[#647C47]"
                      />
                      {type.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded border-gray-300 text-[#647C47] focus:ring-[#647C47]"
                />
                Active — inactive departments stay on existing records but are hidden from pickers
              </label>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setError(null) }}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] disabled:opacity-50 text-sm"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editing ? 'Save changes' : 'Create department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Delete {confirmDelete.name}?
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              {memberCount(confirmDelete.id) > 0 ? (
                <>
                  {memberCount(confirmDelete.id)} team member
                  {memberCount(confirmDelete.id) === 1 ? '' : 's'} will be left with no department,
                  and tasks filed here keep their assignee but lose their department. Deactivating
                  keeps the grouping instead.
                </>
              ) : (
                <>
                  Nobody is filed under this department. Tasks that reference it will lose their
                  department.
                </>
              )}
            </p>

            {error && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setConfirmDelete(null); setError(null) }}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
