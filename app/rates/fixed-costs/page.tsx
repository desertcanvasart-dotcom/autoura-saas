'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { Plus, Edit, Save, X, Loader2, DollarSign } from 'lucide-react'

interface FixedCost {
  id: string
  cost_type: string
  cost_per_person_per_day: number
  description: string | null
  is_active: boolean
}

function FixedCostsContent() {
  const [costs, setCosts] = useState<FixedCost[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ cost_type: '', cost_per_person_per_day: '', description: '', is_active: true })
  const [saving, setSaving] = useState(false)

  const fetchCosts = useCallback(async () => {
    try {
      const res = await fetch('/api/rates/fixed-costs')
      const data = await res.json()
      if (data.success) setCosts(data.data)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchCosts() }, [fetchCosts])

  const handleSave = async () => {
    setSaving(true)
    try {
      const url = '/api/rates/fixed-costs'
      const method = editingId ? 'PUT' : 'POST'
      const body = editingId ? { id: editingId, ...form, cost_per_person_per_day: parseFloat(form.cost_per_person_per_day) || 0 }
        : { ...form, cost_per_person_per_day: parseFloat(form.cost_per_person_per_day) || 0 }

      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) {
        setShowForm(false); setEditingId(null)
        setForm({ cost_type: '', cost_per_person_per_day: '', description: '', is_active: true })
        fetchCosts()
      }
    } catch {} finally { setSaving(false) }
  }

  const handleEdit = (c: FixedCost) => {
    setForm({ cost_type: c.cost_type, cost_per_person_per_day: String(c.cost_per_person_per_day), description: c.description || '', is_active: c.is_active })
    setEditingId(c.id)
    setShowForm(true)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-[#647C47]" /> Fixed Daily Costs
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Per-person daily costs (water, tips, service fees)</p>
          </div>
          <button onClick={() => { setForm({ cost_type: '', cost_per_person_per_day: '', description: '', is_active: true }); setEditingId(null); setShowForm(true) }}
            className="btn-primary text-sm px-4 py-2 rounded-lg flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Cost
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : costs.length === 0 && !showForm ? (
          <div className="text-center py-12 text-gray-400">No fixed costs defined yet.</div>
        ) : (
          <div className="space-y-3">
            {costs.map(c => (
              <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-800">{c.cost_type}</h3>
                  {c.description && <p className="text-sm text-gray-500">{c.description}</p>}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-lg font-bold text-[#647C47]">{'\u20AC'}{c.cost_per_person_per_day.toFixed(2)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {c.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <button onClick={() => handleEdit(c)} className="p-1.5 text-gray-400 hover:text-[#647C47]"><Edit className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showForm && (
          <div className="mt-4 bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="font-medium text-gray-800 mb-3">{editingId ? 'Edit' : 'New'} Fixed Cost</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Cost Type</label>
                <input value={form.cost_type} onChange={e => setForm(f => ({ ...f, cost_type: e.target.value }))}
                  placeholder="e.g., Water, Tips, Service Fee" className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-[#647C47]" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Cost Per Person/Day (EUR)</label>
                <input type="number" step="0.01" value={form.cost_per_person_per_day} onChange={e => setForm(f => ({ ...f, cost_per_person_per_day: e.target.value }))}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-[#647C47]" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none" />
              </div>
            </div>
            <div className="flex items-center justify-between mt-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded" /> Active</label>
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-gray-500"><X className="w-4 h-4 inline mr-1" />Cancel</button>
                <button onClick={handleSave} disabled={saving || !form.cost_type} className="btn-primary px-4 py-1.5 text-sm rounded-lg flex items-center gap-2 disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FixedCostsPage() {
  return <Suspense fallback={<div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div></div>}><FixedCostsContent /></Suspense>
}
