// =====================================================
// CONTENT LIBRARY - WRITING RULES PAGE
// =====================================================
// 📁 COPY TO: app/content-library/rules/page.tsx
// =====================================================

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/app/supabase'
import {
  Plus,
  Edit,
  Trash2,
  X,
  Save,
  AlertCircle,
  CheckCircle2,
  Loader2,
  BookOpen,
  Heart,
  Type,
  LayoutList,
  Award,
  ChevronDown,
  ChevronUp,
  GripVertical
} from 'lucide-react'

const CATEGORIES = [
  { id: 'tone', label: 'Tone', icon: Heart, color: 'pink' },
  { id: 'vocabulary', label: 'Vocabulary', icon: BookOpen, color: 'blue' },
  { id: 'structure', label: 'Structure', icon: LayoutList, color: 'green' },
  { id: 'formatting', label: 'Formatting', icon: Type, color: 'orange' },
  { id: 'brand', label: 'Brand', icon: Award, color: 'purple' },
] as const

const RULE_TYPES = [
  { id: 'enforce', label: 'Must Follow', color: 'red' },
  { id: 'prefer', label: 'Preferred', color: 'amber' },
  { id: 'avoid', label: 'Avoid', color: 'gray' },
] as const

const APPLIES_TO = [
  { id: 'all', label: 'All' },
  { id: 'itinerary', label: 'Itineraries' },
  { id: 'email', label: 'Emails' },
  { id: 'whatsapp', label: 'WhatsApp' },
]

type RuleCategory = 'tone' | 'vocabulary' | 'structure' | 'formatting' | 'brand'
type RuleType = 'enforce' | 'prefer' | 'avoid'

interface WritingRule {
  id: string
  name: string
  category: RuleCategory
  rule_type: RuleType
  description: string
  examples: {
    good?: string[]
    bad?: string[]
  }
  priority: number
  applies_to: string[]
  is_active: boolean
}

interface RuleFormData {
  id?: string
  name: string
  category: RuleCategory
  rule_type: RuleType
  description: string
  examples: {
    good: string[]
    bad: string[]
  }
  priority: number
  applies_to: string[]
}

const DEFAULT_FORM: RuleFormData = {
  name: '',
  category: 'vocabulary',
  rule_type: 'enforce',
  description: '',
  examples: { good: [''], bad: [''] },
  priority: 5,
  applies_to: ['all'],
}

export default function WritingRulesPage() {
  const [rules, setRules] = useState<WritingRule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<RuleFormData>(DEFAULT_FORM)
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set())
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    fetchRules()
  }, [])

  async function fetchRules() {
    try {
      const response = await fetch('/api/content-library/writing-rules')
      if (!response.ok) throw new Error('Failed to fetch rules')
      const data = await response.json()
      setRules(data)
    } catch (err) {
      console.error('Error fetching rules:', err)
      setError('Failed to load writing rules')
    } finally {
      setLoading(false)
    }
  }

  function toggleExpanded(id: string) {
    const newExpanded = new Set(expandedRules)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRules(newExpanded)
  }

  function handleEdit(rule: WritingRule) {
    setFormData({
      id: rule.id,
      name: rule.name,
      category: rule.category,
      rule_type: rule.rule_type,
      description: rule.description,
      examples: {
        good: rule.examples?.good?.length ? rule.examples.good : [''],
        bad: rule.examples?.bad?.length ? rule.examples.bad : [''],
      },
      priority: rule.priority,
      applies_to: rule.applies_to || ['all'],
    })
    setShowForm(true)
  }

  function handleNew() {
    setFormData(DEFAULT_FORM)
    setShowForm(true)
  }

  async function handleSave() {
    if (!formData.name || !formData.description) {
      setError('Name and description are required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const payload = {
        ...formData,
        examples: {
          good: formData.examples.good.filter(e => e.trim()),
          bad: formData.examples.bad.filter(e => e.trim()),
        },
      }

      if (formData.id) {
        // Update
        const response = await fetch('/api/content-library/writing-rules', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!response.ok) throw new Error('Failed to update')
      } else {
        // Create
        const response = await fetch('/api/content-library/writing-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!response.ok) throw new Error('Failed to create')
      }

      setSuccess(formData.id ? 'Rule updated!' : 'Rule created!')
      setShowForm(false)
      fetchRules()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      console.error('Save error:', err)
      setError('Failed to save rule')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const response = await fetch(`/api/content-library/writing-rules?id=${id}`, {
        method: 'DELETE'
      })
      if (!response.ok) throw new Error('Failed to delete')
      
      setRules(rules.filter(r => r.id !== id))
      setDeleteId(null)
      setSuccess('Rule deleted')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      console.error('Delete error:', err)
      setError('Failed to delete rule')
    }
  }

  function updateExample(type: 'good' | 'bad', index: number, value: string) {
    const newExamples = { ...formData.examples }
    newExamples[type][index] = value
    setFormData({ ...formData, examples: newExamples })
  }

  function addExample(type: 'good' | 'bad') {
    const newExamples = { ...formData.examples }
    newExamples[type].push('')
    setFormData({ ...formData, examples: newExamples })
  }

  function removeExample(type: 'good' | 'bad', index: number) {
    const newExamples = { ...formData.examples }
    newExamples[type] = newExamples[type].filter((_, i) => i !== index)
    setFormData({ ...formData, examples: newExamples })
  }

  const filteredRules = filterCategory
    ? rules.filter(r => r.category === filterCategory)
    : rules

  const groupedRules = filteredRules.reduce((acc, rule) => {
    if (!acc[rule.rule_type]) acc[rule.rule_type] = []
    acc[rule.rule_type].push(rule)
    return acc
  }, {} as Record<string, WritingRule[]>)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl">
      {/* Toolbar */}
      <div>
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-500">
              {rules.length} rules defining your content style
            </p>
            <button
              onClick={handleNew}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f613a] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Rule
            </button>
          </div>
        </div>
      </div>

      <div className="pt-6">
        {/* Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
            <span>{success}</span>
          </div>
        )}

        {/* Category Filter */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setFilterCategory(null)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              filterCategory === null
                ? 'bg-[#647C47] text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-[#647C47]'
            }`}
          >
            All Rules
          </button>
          {CATEGORIES.map(cat => {
            const Icon = cat.icon
            const count = rules.filter(r => r.category === cat.id).length
            return (
              <button
                key={cat.id}
                onClick={() => setFilterCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  filterCategory === cat.id
                    ? 'bg-[#647C47] text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-[#647C47]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {cat.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  filterCategory === cat.id ? 'bg-white/20' : 'bg-gray-100'
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Rules List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {RULE_TYPES.map(type => {
              const typeRules = groupedRules[type.id] || []
              if (typeRules.length === 0) return null
              
              return (
                <div key={type.id}>
                  <h2 className={`text-sm font-semibold mb-3 flex items-center gap-2 text-${type.color}-700`}>
                    <span className={`w-2 h-2 rounded-full bg-${type.color}-500`}></span>
                    {type.label}
                    <span className="text-gray-400 font-normal">({typeRules.length})</span>
                  </h2>
                  <div className="space-y-2">
                    {typeRules.sort((a, b) => b.priority - a.priority).map(rule => {
                      const CategoryIcon = CATEGORIES.find(c => c.id === rule.category)?.icon || BookOpen
                      const isExpanded = expandedRules.has(rule.id)
                      
                      return (
                        <div
                          key={rule.id}
                          className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                        >
                          <div
                            className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => toggleExpanded(rule.id)}
                          >
                            <CategoryIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">{rule.name}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded bg-${type.color}-50 text-${type.color}-700`}>
                                  {type.label}
                                </span>
                                <span className="text-xs text-gray-400">
                                  Priority: {rule.priority}
                                </span>
                              </div>
                              {!isExpanded && (
                                <p className="text-sm text-gray-500 truncate mt-0.5">
                                  {rule.description}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleEdit(rule)
                                }}
                                className="p-1.5 text-gray-400 hover:text-[#647C47] hover:bg-gray-100 rounded-lg transition-colors"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDeleteId(rule.id)
                                }}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-gray-400" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                              )}
                            </div>
                          </div>
                          
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-0 border-t border-gray-100">
                              <p className="text-sm text-gray-600 mt-3 mb-4">
                                {rule.description}
                              </p>
                              
                              {rule.examples && (Object.keys(rule.examples).length > 0) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {rule.examples.bad && rule.examples.bad.length > 0 && (
                                    <div>
                                      <h4 className="text-xs font-medium text-red-600 mb-2">❌ Avoid</h4>
                                      <div className="space-y-1">
                                        {rule.examples.bad.map((ex, i) => (
                                          <p key={i} className="text-sm text-gray-600 bg-red-50 px-3 py-2 rounded-lg">
                                            "{ex}"
                                          </p>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {rule.examples.good && rule.examples.good.length > 0 && (
                                    <div>
                                      <h4 className="text-xs font-medium text-emerald-600 mb-2">✓ Better</h4>
                                      <div className="space-y-1">
                                        {rule.examples.good.map((ex, i) => (
                                          <p key={i} className="text-sm text-gray-600 bg-emerald-50 px-3 py-2 rounded-lg">
                                            "{ex}"
                                          </p>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              <div className="mt-3 flex flex-wrap gap-2">
                                <span className="text-xs text-gray-400">Applies to:</span>
                                {(rule.applies_to || ['all']).map(a => (
                                  <span key={a} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                                    {APPLIES_TO.find(at => at.id === a)?.label || a}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full my-8 shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {formData.id ? 'Edit Rule' : 'New Writing Rule'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rule Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder='e.g., "Avoid Generic Superlatives"'
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                />
              </div>

              {/* Category & Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as RuleCategory })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rule Type</label>
                  <select
                    value={formData.rule_type}
                    onChange={(e) => setFormData({ ...formData, rule_type: e.target.value as RuleType })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                  >
                    {RULE_TYPES.map(type => (
                      <option key={type.id} value={type.id}>{type.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Explain this rule clearly..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47] resize-none"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority: {formData.priority}
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                  className="w-full accent-[#647C47]"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Low</span>
                  <span>High</span>
                </div>
              </div>

              {/* Applies To */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Applies To</label>
                <div className="flex flex-wrap gap-2">
                  {APPLIES_TO.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        const current = formData.applies_to
                        if (opt.id === 'all') {
                          setFormData({ ...formData, applies_to: ['all'] })
                        } else {
                          const filtered = current.filter(a => a !== 'all')
                          if (filtered.includes(opt.id)) {
                            setFormData({ ...formData, applies_to: filtered.filter(a => a !== opt.id) })
                          } else {
                            setFormData({ ...formData, applies_to: [...filtered, opt.id] })
                          }
                        }
                      }}
                      className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                        formData.applies_to.includes(opt.id)
                          ? 'bg-[#647C47] text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Examples */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Bad Examples */}
                <div>
                  <label className="block text-sm font-medium text-red-600 mb-2">❌ Bad Examples</label>
                  <div className="space-y-2">
                    {formData.examples.bad.map((ex, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          type="text"
                          value={ex}
                          onChange={(e) => updateExample('bad', i, e.target.value)}
                          placeholder="What to avoid..."
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                        />
                        <button
                          onClick={() => removeExample('bad', i)}
                          className="p-2 text-gray-400 hover:text-red-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addExample('bad')}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      + Add example
                    </button>
                  </div>
                </div>

                {/* Good Examples */}
                <div>
                  <label className="block text-sm font-medium text-emerald-600 mb-2">✓ Good Examples</label>
                  <div className="space-y-2">
                    {formData.examples.good.map((ex, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          type="text"
                          value={ex}
                          onChange={(e) => updateExample('good', i, e.target.value)}
                          placeholder="Better alternative..."
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                        />
                        <button
                          onClick={() => removeExample('good', i)}
                          className="p-2 text-gray-400 hover:text-red-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addExample('good')}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      + Add example
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-gray-200">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f613a] disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save Rule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Rule?</h3>
            <p className="text-gray-600 mb-6">
              This writing rule will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}