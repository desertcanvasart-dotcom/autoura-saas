'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { 
  Settings2, Plus, Edit, Trash2, X, Save, Loader2,
  Car, Ticket, AlertCircle, CheckCircle2,
  ChevronDown, ChevronUp
} from 'lucide-react'

// ============================================
// B2B PRICING RULES MANAGEMENT
// File: app/b2b/pricing-rules/page.tsx
// Manage tiered pricing, boat sizes, transport packages
// ============================================

interface PricingRule {
  id: string
  rate_table: string | null
  service_name: string
  service_category: string
  pricing_model: string
  unit_type: string | null
  tier1_min_pax: number
  tier1_max_pax: number | null
  tier1_rate_eur: number | null
  tier1_label: string | null
  tier2_min_pax: number | null
  tier2_max_pax: number | null
  tier2_rate_eur: number | null
  tier2_label: string | null
  tier3_min_pax: number | null
  tier3_max_pax: number | null
  tier3_rate_eur: number | null
  tier3_label: string | null
  tier4_min_pax: number | null
  tier4_max_pax: number | null
  tier4_rate_eur: number | null
  tier4_label: string | null
  notes: string | null
  is_active: boolean
}

interface TransportPackage {
  id: string
  package_code: string
  package_name: string
  package_type: string
  origin_city: string
  destination_city: string
  duration_days: number
  sedan_rate: number | null
  sedan_capacity: number
  minivan_rate: number | null
  minivan_capacity: number
  van_rate: number | null
  van_capacity: number
  minibus_rate: number | null
  minibus_capacity: number
  bus_rate: number | null
  bus_capacity: number
  description: string | null
  includes: string | null
  is_active: boolean
}

interface Toast {
  id: string
  type: 'success' | 'error'
  message: string
}

interface RuleFormData {
  service_name: string
  service_category: string
  pricing_model: string
  unit_type: string
  tier1_min_pax: number
  tier1_max_pax: number
  tier1_rate_eur: number
  tier1_label: string
  tier2_min_pax: number
  tier2_max_pax: number
  tier2_rate_eur: number
  tier2_label: string
  tier3_min_pax: number
  tier3_max_pax: number
  tier3_rate_eur: number
  tier3_label: string
  tier4_min_pax: number
  tier4_max_pax: number
  tier4_rate_eur: number
  tier4_label: string
  notes: string
  is_active: boolean
}

interface PackageFormData {
  package_code: string
  package_name: string
  package_type: string
  origin_city: string
  destination_city: string
  duration_days: number
  sedan_rate: number
  sedan_capacity: number
  minivan_rate: number
  minivan_capacity: number
  van_rate: number
  van_capacity: number
  minibus_rate: number
  minibus_capacity: number
  bus_rate: number
  bus_capacity: number
  description: string
  includes: string
  is_active: boolean
}

const PRICING_MODELS = [
  { value: 'per_person', label: 'Per Person', desc: 'Fixed rate per traveler' },
  { value: 'per_unit', label: 'Per Unit (Boat/Vehicle)', desc: 'Flat rate for the whole unit' },
  { value: 'tiered', label: 'Tiered (Volume Discount)', desc: 'Rate decreases with group size' },
]

const UNIT_TYPES = [
  { value: 'boat', label: 'Boat' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'table', label: 'Table' },
  { value: 'room', label: 'Room' },
]

const SERVICE_CATEGORIES = [
  { value: 'activity', label: 'Activity' },
  { value: 'transportation', label: 'Transportation' },
  { value: 'entrance', label: 'Entrance Fee' },
  { value: 'meal', label: 'Meal' },
]

const DEFAULT_RULE_FORM: RuleFormData = {
  service_name: '',
  service_category: 'activity',
  pricing_model: 'per_unit',
  unit_type: 'boat',
  tier1_min_pax: 1,
  tier1_max_pax: 8,
  tier1_rate_eur: 0,
  tier1_label: 'Small',
  tier2_min_pax: 9,
  tier2_max_pax: 35,
  tier2_rate_eur: 0,
  tier2_label: 'Large',
  tier3_min_pax: 0,
  tier3_max_pax: 0,
  tier3_rate_eur: 0,
  tier3_label: '',
  tier4_min_pax: 0,
  tier4_max_pax: 0,
  tier4_rate_eur: 0,
  tier4_label: '',
  notes: '',
  is_active: true
}

const DEFAULT_PACKAGE_FORM: PackageFormData = {
  package_code: '',
  package_name: '',
  package_type: 'cruise_sightseeing',
  origin_city: 'Luxor',
  destination_city: 'Aswan',
  duration_days: 5,
  sedan_rate: 180,
  sedan_capacity: 3,
  minivan_rate: 250,
  minivan_capacity: 7,
  van_rate: 320,
  van_capacity: 12,
  minibus_rate: 400,
  minibus_capacity: 20,
  bus_rate: 500,
  bus_capacity: 50,
  description: '',
  includes: '',
  is_active: true
}

export default function B2BPricingRulesPage() {
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([])
  const [transportPackages, setTransportPackages] = useState<TransportPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState<Toast[]>([])
  
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [showPackageModal, setShowPackageModal] = useState(false)
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null)
  const [editingPackage, setEditingPackage] = useState<TransportPackage | null>(null)
  const [saving, setSaving] = useState(false)

  const [expandedRules, setExpandedRules] = useState(true)
  const [expandedPackages, setExpandedPackages] = useState(true)

  const [ruleForm, setRuleForm] = useState<RuleFormData>(DEFAULT_RULE_FORM)
  const [packageForm, setPackageForm] = useState<PackageFormData>(DEFAULT_PACKAGE_FORM)

  const showToast = (type: 'success' | 'error', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const rulesRes = await fetch('/api/b2b/pricing-rules')
      const rulesData = await rulesRes.json()
      if (rulesData.success) {
        setPricingRules(rulesData.data || [])
      }

      const packagesRes = await fetch('/api/b2b/transport-packages')
      const packagesData = await packagesRes.json()
      if (packagesData.success) {
        setTransportPackages(packagesData.data || [])
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      showToast('error', 'Failed to load pricing rules')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // ============================================
  // PRICING RULES HANDLERS
  // ============================================

  const handleAddRule = () => {
    setEditingRule(null)
    setRuleForm(DEFAULT_RULE_FORM)
    setShowRuleModal(true)
  }

  const handleEditRule = (rule: PricingRule) => {
    setEditingRule(rule)
    setRuleForm({
      service_name: rule.service_name || '',
      service_category: rule.service_category || 'activity',
      pricing_model: rule.pricing_model || 'per_unit',
      unit_type: rule.unit_type || 'boat',
      tier1_min_pax: rule.tier1_min_pax || 1,
      tier1_max_pax: rule.tier1_max_pax || 8,
      tier1_rate_eur: rule.tier1_rate_eur || 0,
      tier1_label: rule.tier1_label || '',
      tier2_min_pax: rule.tier2_min_pax || 0,
      tier2_max_pax: rule.tier2_max_pax || 0,
      tier2_rate_eur: rule.tier2_rate_eur || 0,
      tier2_label: rule.tier2_label || '',
      tier3_min_pax: rule.tier3_min_pax || 0,
      tier3_max_pax: rule.tier3_max_pax || 0,
      tier3_rate_eur: rule.tier3_rate_eur || 0,
      tier3_label: rule.tier3_label || '',
      tier4_min_pax: rule.tier4_min_pax || 0,
      tier4_max_pax: rule.tier4_max_pax || 0,
      tier4_rate_eur: rule.tier4_rate_eur || 0,
      tier4_label: rule.tier4_label || '',
      notes: rule.notes || '',
      is_active: rule.is_active
    })
    setShowRuleModal(true)
  }

  const handleSaveRule = async () => {
    if (!ruleForm.service_name) {
      showToast('error', 'Service name is required')
      return
    }

    setSaving(true)
    try {
      const url = editingRule 
        ? `/api/b2b/pricing-rules/${editingRule.id}`
        : '/api/b2b/pricing-rules'
      
      // Convert 0 values back to null for optional tiers
      const payload = {
        ...ruleForm,
        tier2_min_pax: ruleForm.tier2_min_pax || null,
        tier2_max_pax: ruleForm.tier2_max_pax || null,
        tier2_rate_eur: ruleForm.tier2_rate_eur || null,
        tier3_min_pax: ruleForm.tier3_min_pax || null,
        tier3_max_pax: ruleForm.tier3_max_pax || null,
        tier3_rate_eur: ruleForm.tier3_rate_eur || null,
        tier4_min_pax: ruleForm.tier4_min_pax || null,
        tier4_max_pax: ruleForm.tier4_max_pax || null,
        tier4_rate_eur: ruleForm.tier4_rate_eur || null,
      }

      const res = await fetch(url, {
        method: editingRule ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (data.success) {
        showToast('success', editingRule ? 'Rule updated!' : 'Rule created!')
        setShowRuleModal(false)
        fetchData()
      } else {
        showToast('error', data.error || 'Failed to save rule')
      }
    } catch (error) {
      showToast('error', 'Failed to save rule')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRule = async (rule: PricingRule) => {
    if (!confirm(`Delete pricing rule for "${rule.service_name}"?`)) return

    try {
      const res = await fetch(`/api/b2b/pricing-rules/${rule.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        showToast('success', 'Rule deleted!')
        fetchData()
      } else {
        showToast('error', data.error || 'Failed to delete')
      }
    } catch (error) {
      showToast('error', 'Failed to delete rule')
    }
  }

  // ============================================
  // TRANSPORT PACKAGES HANDLERS
  // ============================================

  const handleAddPackage = () => {
    setEditingPackage(null)
    setPackageForm(DEFAULT_PACKAGE_FORM)
    setShowPackageModal(true)
  }

  const handleEditPackage = (pkg: TransportPackage) => {
    setEditingPackage(pkg)
    setPackageForm({
      package_code: pkg.package_code || '',
      package_name: pkg.package_name || '',
      package_type: pkg.package_type || 'cruise_sightseeing',
      origin_city: pkg.origin_city || 'Luxor',
      destination_city: pkg.destination_city || 'Aswan',
      duration_days: pkg.duration_days || 5,
      sedan_rate: pkg.sedan_rate || 0,
      sedan_capacity: pkg.sedan_capacity || 3,
      minivan_rate: pkg.minivan_rate || 0,
      minivan_capacity: pkg.minivan_capacity || 7,
      van_rate: pkg.van_rate || 0,
      van_capacity: pkg.van_capacity || 12,
      minibus_rate: pkg.minibus_rate || 0,
      minibus_capacity: pkg.minibus_capacity || 20,
      bus_rate: pkg.bus_rate || 0,
      bus_capacity: pkg.bus_capacity || 50,
      description: pkg.description || '',
      includes: pkg.includes || '',
      is_active: pkg.is_active
    })
    setShowPackageModal(true)
  }

  const handleSavePackage = async () => {
    if (!packageForm.package_name) {
      showToast('error', 'Package name is required')
      return
    }

    setSaving(true)
    try {
      const url = editingPackage 
        ? `/api/b2b/transport-packages/${editingPackage.id}`
        : '/api/b2b/transport-packages'
      
      const res = await fetch(url, {
        method: editingPackage ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...packageForm,
          package_code: packageForm.package_code || `PKG-${Date.now()}`
        })
      })

      const data = await res.json()
      if (data.success) {
        showToast('success', editingPackage ? 'Package updated!' : 'Package created!')
        setShowPackageModal(false)
        fetchData()
      } else {
        showToast('error', data.error || 'Failed to save package')
      }
    } catch (error) {
      showToast('error', 'Failed to save package')
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePackage = async (pkg: TransportPackage) => {
    if (!confirm(`Delete transport package "${pkg.package_name}"?`)) return

    try {
      const res = await fetch(`/api/b2b/transport-packages/${pkg.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        showToast('success', 'Package deleted!')
        fetchData()
      } else {
        showToast('error', data.error || 'Failed to delete')
      }
    } catch (error) {
      showToast('error', 'Failed to delete package')
    }
  }

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-sm text-gray-600">Loading pricing rules...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div key={toast.id} className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg ${
            toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 lg:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings2 className="w-6 h-6 text-blue-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">B2B Pricing Rules</h1>
                <p className="text-sm text-gray-500">Manage tiered pricing, boat sizes, and transport packages</p>
              </div>
            </div>
            <Link href="/b2b" className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              ← Back to B2B
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 lg:px-6 py-6 space-y-6">
        
        {/* PRICING RULES SECTION */}
        <div className="bg-white rounded-lg shadow-md border overflow-hidden">
          <div 
            className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b cursor-pointer"
            onClick={() => setExpandedRules(!expandedRules)}
          >
            <div className="flex items-center gap-3">
              <Ticket className="w-5 h-5 text-amber-600" />
              <h2 className="text-lg font-semibold text-gray-900">Activity Pricing Rules</h2>
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                {pricingRules.length} rules
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); handleAddRule() }}
                className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Rule
              </button>
              {expandedRules ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </div>
          </div>

          {expandedRules && (
            <div className="p-6">
              {pricingRules.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Ticket className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No pricing rules yet</p>
                  <button onClick={handleAddRule} className="mt-2 text-amber-600 hover:underline text-sm">
                    Add your first rule
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {pricingRules.map(rule => (
                    <div key={rule.id} className={`border rounded-lg p-4 ${rule.is_active ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-medium text-gray-900">{rule.service_name}</h3>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              rule.pricing_model === 'per_unit' ? 'bg-blue-100 text-blue-700' :
                              rule.pricing_model === 'tiered' ? 'bg-purple-100 text-purple-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {rule.pricing_model === 'per_unit' ? `Per ${rule.unit_type}` : 
                               rule.pricing_model === 'tiered' ? 'Tiered' : 'Per Person'}
                            </span>
                            {!rule.is_active && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">Inactive</span>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap gap-3 text-sm">
                            {rule.tier1_rate_eur && (
                              <div className="px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                                <span className="text-green-700 font-medium">{rule.tier1_label || 'Tier 1'}</span>
                                <span className="text-gray-500 mx-1">({rule.tier1_min_pax}-{rule.tier1_max_pax} pax)</span>
                                <span className="text-green-600 font-bold">€{rule.tier1_rate_eur}</span>
                              </div>
                            )}
                            {rule.tier2_rate_eur && (
                              <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                                <span className="text-blue-700 font-medium">{rule.tier2_label || 'Tier 2'}</span>
                                <span className="text-gray-500 mx-1">({rule.tier2_min_pax}-{rule.tier2_max_pax || '∞'} pax)</span>
                                <span className="text-blue-600 font-bold">€{rule.tier2_rate_eur}</span>
                              </div>
                            )}
                            {rule.tier3_rate_eur && (
                              <div className="px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg">
                                <span className="text-purple-700 font-medium">{rule.tier3_label || 'Tier 3'}</span>
                                <span className="text-gray-500 mx-1">({rule.tier3_min_pax}-{rule.tier3_max_pax || '∞'} pax)</span>
                                <span className="text-purple-600 font-bold">€{rule.tier3_rate_eur}</span>
                              </div>
                            )}
                            {rule.tier4_rate_eur && (
                              <div className="px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg">
                                <span className="text-orange-700 font-medium">{rule.tier4_label || 'Tier 4'}</span>
                                <span className="text-gray-500 mx-1">({rule.tier4_min_pax}+ pax)</span>
                                <span className="text-orange-600 font-bold">€{rule.tier4_rate_eur}</span>
                              </div>
                            )}
                          </div>
                          
                          {rule.notes && (
                            <p className="text-xs text-gray-500 mt-2">{rule.notes}</p>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-1 ml-4">
                          <button onClick={() => handleEditRule(rule)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteRule(rule)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* TRANSPORT PACKAGES SECTION */}
        <div className="bg-white rounded-lg shadow-md border overflow-hidden">
          <div 
            className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-50 to-cyan-50 border-b cursor-pointer"
            onClick={() => setExpandedPackages(!expandedPackages)}
          >
            <div className="flex items-center gap-3">
              <Car className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">Transport Packages</h2>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                {transportPackages.length} packages
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); handleAddPackage() }}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Package
              </button>
              {expandedPackages ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </div>
          </div>

          {expandedPackages && (
            <div className="p-6">
              {transportPackages.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Car className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No transport packages yet</p>
                  <button onClick={handleAddPackage} className="mt-2 text-blue-600 hover:underline text-sm">
                    Add your first package
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {transportPackages.map(pkg => (
                    <div key={pkg.id} className={`border rounded-lg p-4 ${pkg.is_active ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-medium text-gray-900">{pkg.package_name}</h3>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                              {pkg.package_type.replace('_', ' ')}
                            </span>
                            <span className="text-xs text-gray-500">
                              {pkg.origin_city} → {pkg.destination_city}
                            </span>
                            {!pkg.is_active && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">Inactive</span>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-5 gap-2 text-sm mt-3">
                            <div className="text-center p-2 bg-gray-50 rounded">
                              <p className="text-xs text-gray-500">Sedan</p>
                              <p className="font-semibold text-gray-900">€{pkg.sedan_rate}</p>
                              <p className="text-xs text-gray-400">1-{pkg.sedan_capacity} pax</p>
                            </div>
                            <div className="text-center p-2 bg-gray-50 rounded">
                              <p className="text-xs text-gray-500">Minivan</p>
                              <p className="font-semibold text-gray-900">€{pkg.minivan_rate}</p>
                              <p className="text-xs text-gray-400">{pkg.sedan_capacity + 1}-{pkg.minivan_capacity} pax</p>
                            </div>
                            <div className="text-center p-2 bg-gray-50 rounded">
                              <p className="text-xs text-gray-500">Van</p>
                              <p className="font-semibold text-gray-900">€{pkg.van_rate}</p>
                              <p className="text-xs text-gray-400">{pkg.minivan_capacity + 1}-{pkg.van_capacity} pax</p>
                            </div>
                            <div className="text-center p-2 bg-gray-50 rounded">
                              <p className="text-xs text-gray-500">Minibus</p>
                              <p className="font-semibold text-gray-900">€{pkg.minibus_rate}</p>
                              <p className="text-xs text-gray-400">{pkg.van_capacity + 1}-{pkg.minibus_capacity} pax</p>
                            </div>
                            <div className="text-center p-2 bg-gray-50 rounded">
                              <p className="text-xs text-gray-500">Bus</p>
                              <p className="font-semibold text-gray-900">€{pkg.bus_rate}</p>
                              <p className="text-xs text-gray-400">{pkg.minibus_capacity + 1}+ pax</p>
                            </div>
                          </div>
                          
                          {pkg.includes && (
                            <p className="text-xs text-gray-500 mt-2">
                              <strong>Includes:</strong> {pkg.includes}
                            </p>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-1 ml-4">
                          <button onClick={() => handleEditPackage(pkg)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeletePackage(pkg)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* PRICING RULE MODAL */}
      {showRuleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingRule ? 'Edit Pricing Rule' : 'Add Pricing Rule'}
              </h2>
              <button onClick={() => setShowRuleModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Service Name *</label>
                  <input
                    type="text"
                    value={ruleForm.service_name}
                    onChange={(e) => setRuleForm({ ...ruleForm, service_name: e.target.value })}
                    placeholder="e.g., Felucca Sailboat Ride"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={ruleForm.service_category}
                    onChange={(e) => setRuleForm({ ...ruleForm, service_category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    {SERVICE_CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Pricing Model</label>
                <div className="grid grid-cols-3 gap-3">
                  {PRICING_MODELS.map(model => (
                    <button
                      key={model.value}
                      type="button"
                      onClick={() => setRuleForm({ ...ruleForm, pricing_model: model.value })}
                      className={`p-3 rounded-lg border text-left ${
                        ruleForm.pricing_model === model.value 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className="font-medium text-sm">{model.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{model.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {ruleForm.pricing_model === 'per_unit' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit Type</label>
                  <select
                    value={ruleForm.unit_type}
                    onChange={(e) => setRuleForm({ ...ruleForm, unit_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    {UNIT_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Tier 1 */}
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="font-medium text-green-800 mb-3">
                  {ruleForm.pricing_model === 'per_unit' ? 'Small Size' : 'Tier 1'}
                </h4>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Min Pax</label>
                    <input
                      type="number"
                      value={ruleForm.tier1_min_pax}
                      onChange={(e) => setRuleForm({ ...ruleForm, tier1_min_pax: parseInt(e.target.value) || 1 })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Max Pax</label>
                    <input
                      type="number"
                      value={ruleForm.tier1_max_pax || ''}
                      onChange={(e) => setRuleForm({ ...ruleForm, tier1_max_pax: parseInt(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Rate (€)</label>
                    <input
                      type="number"
                      value={ruleForm.tier1_rate_eur || ''}
                      onChange={(e) => setRuleForm({ ...ruleForm, tier1_rate_eur: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Label</label>
                    <input
                      type="text"
                      value={ruleForm.tier1_label}
                      onChange={(e) => setRuleForm({ ...ruleForm, tier1_label: e.target.value })}
                      placeholder="e.g., Small Felucca"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Tier 2 */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-medium text-blue-800 mb-3">
                  {ruleForm.pricing_model === 'per_unit' ? 'Large Size' : 'Tier 2'}
                </h4>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Min Pax</label>
                    <input
                      type="number"
                      value={ruleForm.tier2_min_pax || ''}
                      onChange={(e) => setRuleForm({ ...ruleForm, tier2_min_pax: parseInt(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Max Pax</label>
                    <input
                      type="number"
                      value={ruleForm.tier2_max_pax || ''}
                      onChange={(e) => setRuleForm({ ...ruleForm, tier2_max_pax: parseInt(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Rate (€)</label>
                    <input
                      type="number"
                      value={ruleForm.tier2_rate_eur || ''}
                      onChange={(e) => setRuleForm({ ...ruleForm, tier2_rate_eur: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Label</label>
                    <input
                      type="text"
                      value={ruleForm.tier2_label}
                      onChange={(e) => setRuleForm({ ...ruleForm, tier2_label: e.target.value })}
                      placeholder="e.g., Big Felucca"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Tier 3 & 4 (for tiered model) */}
              {ruleForm.pricing_model === 'tiered' && (
                <>
                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <h4 className="font-medium text-purple-800 mb-3">Tier 3 (Optional)</h4>
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Min Pax</label>
                        <input
                          type="number"
                          value={ruleForm.tier3_min_pax || ''}
                          onChange={(e) => setRuleForm({ ...ruleForm, tier3_min_pax: parseInt(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Max Pax</label>
                        <input
                          type="number"
                          value={ruleForm.tier3_max_pax || ''}
                          onChange={(e) => setRuleForm({ ...ruleForm, tier3_max_pax: parseInt(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Rate (€)</label>
                        <input
                          type="number"
                          value={ruleForm.tier3_rate_eur || ''}
                          onChange={(e) => setRuleForm({ ...ruleForm, tier3_rate_eur: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Label</label>
                        <input
                          type="text"
                          value={ruleForm.tier3_label}
                          onChange={(e) => setRuleForm({ ...ruleForm, tier3_label: e.target.value })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                    <h4 className="font-medium text-orange-800 mb-3">Tier 4 (Optional)</h4>
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Min Pax</label>
                        <input
                          type="number"
                          value={ruleForm.tier4_min_pax || ''}
                          onChange={(e) => setRuleForm({ ...ruleForm, tier4_min_pax: parseInt(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Max Pax</label>
                        <input
                          type="number"
                          value={ruleForm.tier4_max_pax || ''}
                          onChange={(e) => setRuleForm({ ...ruleForm, tier4_max_pax: parseInt(e.target.value) || 0 })}
                          placeholder="Leave 0 for unlimited"
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Rate (€)</label>
                        <input
                          type="number"
                          value={ruleForm.tier4_rate_eur || ''}
                          onChange={(e) => setRuleForm({ ...ruleForm, tier4_rate_eur: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Label</label>
                        <input
                          type="text"
                          value={ruleForm.tier4_label}
                          onChange={(e) => setRuleForm({ ...ruleForm, tier4_label: e.target.value })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={ruleForm.notes}
                  onChange={(e) => setRuleForm({ ...ruleForm, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Additional notes..."
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ruleForm.is_active}
                  onChange={(e) => setRuleForm({ ...ruleForm, is_active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">Active</span>
              </label>
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex gap-3">
              <button
                onClick={() => setShowRuleModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRule}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingRule ? 'Update Rule' : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TRANSPORT PACKAGE MODAL */}
      {showPackageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingPackage ? 'Edit Transport Package' : 'Add Transport Package'}
              </h2>
              <button onClick={() => setShowPackageModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Package Name *</label>
                  <input
                    type="text"
                    value={packageForm.package_name}
                    onChange={(e) => setPackageForm({ ...packageForm, package_name: e.target.value })}
                    placeholder="e.g., Cruise Sightseeing Transport"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Package Type</label>
                  <select
                    value={packageForm.package_type}
                    onChange={(e) => setPackageForm({ ...packageForm, package_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="cruise_sightseeing">Cruise Sightseeing</option>
                    <option value="cruise_transfer">Cruise Transfer</option>
                    <option value="multi_day">Multi-Day Tour</option>
                    <option value="day_tour">Day Tour</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Origin City</label>
                  <input
                    type="text"
                    value={packageForm.origin_city}
                    onChange={(e) => setPackageForm({ ...packageForm, origin_city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Destination City</label>
                  <input
                    type="text"
                    value={packageForm.destination_city}
                    onChange={(e) => setPackageForm({ ...packageForm, destination_city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (Days)</label>
                  <input
                    type="number"
                    value={packageForm.duration_days}
                    onChange={(e) => setPackageForm({ ...packageForm, duration_days: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-3">Vehicle Rates (€)</h4>
                <div className="grid grid-cols-5 gap-3">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <label className="block text-xs font-medium text-gray-600 mb-2">Sedan</label>
                    <input
                      type="number"
                      value={packageForm.sedan_rate || ''}
                      onChange={(e) => setPackageForm({ ...packageForm, sedan_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm mb-2"
                      placeholder="€"
                    />
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <span>1-</span>
                      <input
                        type="number"
                        value={packageForm.sedan_capacity}
                        onChange={(e) => setPackageForm({ ...packageForm, sedan_capacity: parseInt(e.target.value) || 3 })}
                        className="w-10 px-1 py-0.5 border border-gray-300 rounded text-center"
                      />
                      <span>pax</span>
                    </div>
                  </div>
                  
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <label className="block text-xs font-medium text-gray-600 mb-2">Minivan</label>
                    <input
                      type="number"
                      value={packageForm.minivan_rate || ''}
                      onChange={(e) => setPackageForm({ ...packageForm, minivan_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm mb-2"
                      placeholder="€"
                    />
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <span>{packageForm.sedan_capacity + 1}-</span>
                      <input
                        type="number"
                        value={packageForm.minivan_capacity}
                        onChange={(e) => setPackageForm({ ...packageForm, minivan_capacity: parseInt(e.target.value) || 7 })}
                        className="w-10 px-1 py-0.5 border border-gray-300 rounded text-center"
                      />
                      <span>pax</span>
                    </div>
                  </div>
                  
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <label className="block text-xs font-medium text-gray-600 mb-2">Van</label>
                    <input
                      type="number"
                      value={packageForm.van_rate || ''}
                      onChange={(e) => setPackageForm({ ...packageForm, van_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm mb-2"
                      placeholder="€"
                    />
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <span>{packageForm.minivan_capacity + 1}-</span>
                      <input
                        type="number"
                        value={packageForm.van_capacity}
                        onChange={(e) => setPackageForm({ ...packageForm, van_capacity: parseInt(e.target.value) || 12 })}
                        className="w-10 px-1 py-0.5 border border-gray-300 rounded text-center"
                      />
                      <span>pax</span>
                    </div>
                  </div>
                  
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <label className="block text-xs font-medium text-gray-600 mb-2">Minibus</label>
                    <input
                      type="number"
                      value={packageForm.minibus_rate || ''}
                      onChange={(e) => setPackageForm({ ...packageForm, minibus_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm mb-2"
                      placeholder="€"
                    />
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <span>{packageForm.van_capacity + 1}-</span>
                      <input
                        type="number"
                        value={packageForm.minibus_capacity}
                        onChange={(e) => setPackageForm({ ...packageForm, minibus_capacity: parseInt(e.target.value) || 20 })}
                        className="w-10 px-1 py-0.5 border border-gray-300 rounded text-center"
                      />
                      <span>pax</span>
                    </div>
                  </div>
                  
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <label className="block text-xs font-medium text-gray-600 mb-2">Bus</label>
                    <input
                      type="number"
                      value={packageForm.bus_rate || ''}
                      onChange={(e) => setPackageForm({ ...packageForm, bus_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm mb-2"
                      placeholder="€"
                    />
                    <div className="text-xs text-gray-500">
                      {packageForm.minibus_capacity + 1}+ pax
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">What&apos;s Included</label>
                <textarea
                  value={packageForm.includes}
                  onChange={(e) => setPackageForm({ ...packageForm, includes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="e.g., Luxor East Bank, Luxor West Bank, Edfu Temple..."
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={packageForm.is_active}
                  onChange={(e) => setPackageForm({ ...packageForm, is_active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">Active</span>
              </label>
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex gap-3">
              <button
                onClick={() => setShowPackageModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePackage}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingPackage ? 'Update Package' : 'Create Package'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}