'use client'

import { useState, useEffect } from 'react'
import {
  FileText,
  Plus,
  Search,
  Mail,
  MessageSquare,
  Users,
  Building2,
  Briefcase,
  Edit2,
  Trash2,
  Copy,
  Send,
  ChevronDown,
  Loader2,
  Check,
  X,
  Eye,
  Filter,
  Sparkles,
  Ship,
  Car,
  Hotel,
  User,
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle2,
  Package,
  Handshake
} from 'lucide-react'
import { useTenant } from '../contexts/TenantContext'

// ============================================
// TYPES
// ============================================

interface Template {
  id: string
  name: string
  description: string
  category: 'customer' | 'supplier' | 'partner' | 'internal'
  subcategory: string
  channel: 'email' | 'whatsapp' | 'sms' | 'both'
  subject?: string
  body: string
  placeholders: string[]
  is_active: boolean
  usage_count: number
  last_used_at: string | null
  created_at: string
  updated_at?: string
  version?: number
  language?: string
  parent_template_id?: string | null
}

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'ar', name: 'Arabic', flag: '🇪🇬' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
]

interface Placeholder {
  placeholder: string
  display_name: string
  description: string
  category: string
  example_value: string
}

interface Recipient {
  id: string
  name: string
  email?: string
  phone?: string
  type: 'client' | 'hotel' | 'cruise' | 'transport' | 'guide' | 'b2b_partner'
}

// ============================================
// CONSTANTS
// ============================================

// All available categories
const ALL_CATEGORIES = [
  { id: 'all', label: 'All Templates', icon: FileText },
  { id: 'customer', label: 'Customer', icon: Users },
  { id: 'supplier', label: 'Supplier', icon: Package },
  { id: 'partner', label: 'B2B Partner', icon: Handshake, requiresB2B: true },
  { id: 'internal', label: 'Internal', icon: Briefcase },
]

const CHANNELS = [
  { id: 'all', label: 'All Channels' },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { id: 'sms', label: 'SMS', icon: MessageSquare },
  { id: 'both', label: 'Both', icon: Sparkles },
]

const SUBCATEGORY_LABELS: Record<string, string> = {
  // Customer subcategories
  lead_response: 'Lead Response',
  quotation: 'Quotation',
  booking_confirmation: 'Booking Confirmation',
  deposit_request: 'Deposit Request',
  day_before: 'Day Before',
  check_in: 'Check-in',
  post_trip: 'Post Trip',
  // Supplier subcategories (Hotels, Cruises, Guides, Transport)
  hotel_voucher: 'Hotel Voucher',
  cruise_voucher: 'Cruise Voucher',
  guide_voucher: 'Guide Voucher',
  transport_voucher: 'Transport Voucher',
  rate_request: 'Rate Request',
  booking_request: 'Booking Request',
  cruise_hold: 'Cruise Hold',
  transport_booking: 'Transport Booking',
  guide_booking: 'Guide Booking',
  // B2B Partner subcategories
  rate_sheet: 'Rate Sheet',
  partner_quote: 'Partner Quote',
  commission_statement: 'Commission Statement',
  partnership: 'Partnership',
  // Internal subcategories
  handover: 'Handover',
  incident: 'Incident',
  debrief: 'Debrief',
}

// Map supplier subcategories to supplier types
const SUBCATEGORY_TO_SUPPLIER_TYPE: Record<string, string> = {
  hotel_voucher: 'hotel',
  rate_request: 'hotel',
  booking_request: 'hotel',
  cruise_voucher: 'cruise',
  cruise_hold: 'cruise',
  transport_voucher: 'transport',
  transport_booking: 'transport',
  guide_voucher: 'guide',
  guide_booking: 'guide',
}

// ============================================
// COMPONENT
// ============================================

export default function TemplatesPage() {
  const { hasB2B } = useTenant()
  const [templates, setTemplates] = useState<Template[]>([])
  const [placeholders, setPlaceholders] = useState<Placeholder[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedChannel, setSelectedChannel] = useState('all')

  // Filter categories based on tenant business type
  const CATEGORIES = ALL_CATEGORIES.filter(cat =>
    !cat.requiresB2B || hasB2B
  )
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [showDropdown, setShowDropdown] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  
  // Form states
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'customer' as const,
    subcategory: '',
    channel: 'email' as const,
    subject: '',
    body: '',
    language: 'en',
    parent_template_id: null as string | null,
  })
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  // Analytics state
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [analytics, setAnalytics] = useState<{
    overview: { totalTemplates: number; totalSentLast30Days: number; successRate: number; pendingScheduled: number }
    topTemplates: { id: string; name: string; channel: string; usage_count: number }[]
    channelDistribution: { email: number; whatsapp: number; sms: number; both: number }
    recentSends: { id: string; channel: string; status: string; created_at: string; template: { name: string } | null }[]
  } | null>(null)

  // ============================================
  // DATA FETCHING
  // ============================================

  useEffect(() => {
    fetchTemplates()
    fetchPlaceholders()
    fetchAnalytics()
  }, [])

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/templates')
      if (response.ok) {
        const result = await response.json()
        
        let templateData = []
        if (Array.isArray(result)) {
          templateData = result
        } else if (result.data && Array.isArray(result.data)) {
          templateData = result.data
        } else if (result.success && Array.isArray(result.data)) {
          templateData = result.data
        }
        
        setTemplates(templateData)
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPlaceholders = async () => {
    try {
      const response = await fetch('/api/templates/placeholders')
      if (response.ok) {
        const data = await response.json()
        setPlaceholders(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching placeholders:', error)
    }
  }

  const fetchAnalytics = async () => {
    try {
      const response = await fetch('/api/templates/analytics')
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setAnalytics(data.data)
        }
      }
    } catch (error) {
      console.error('Error fetching analytics:', error)
    }
  }

  // ============================================
  // FILTERING
  // ============================================

  const filteredTemplates = templates.filter(template => {
    const searchLower = searchQuery.toLowerCase()
    const matchesSearch = !searchQuery || 
      template.name?.toLowerCase().includes(searchLower) ||
      template.description?.toLowerCase().includes(searchLower) ||
      template.body?.toLowerCase().includes(searchLower)
    
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory
    
    let matchesChannel = selectedChannel === 'all'
    if (!matchesChannel) {
      if (selectedChannel === 'email') {
        matchesChannel = template.channel === 'email' || template.channel === 'both'
      } else if (selectedChannel === 'whatsapp') {
        matchesChannel = template.channel === 'whatsapp' || template.channel === 'both'
      } else if (selectedChannel === 'sms') {
        matchesChannel = template.channel === 'sms' || template.channel === 'both'
      } else if (selectedChannel === 'both') {
        matchesChannel = template.channel === 'both'
      }
    }
    
    return matchesSearch && matchesCategory && matchesChannel
  })

  // ============================================
  // ACTIONS
  // ============================================

  const handleCopy = async (template: Template) => {
    const text = template.channel === 'email' 
      ? `Subject: ${template.subject}\n\n${template.body}`
      : template.body
    
    await navigator.clipboard.writeText(text)
    setCopied(template.id)
    setTimeout(() => setCopied(null), 2000)
    
    fetch(`/api/templates/${template.id}/use`, { method: 'POST' })
  }

  const handlePreview = (template: Template) => {
    setSelectedTemplate(template)
    setShowPreviewModal(true)
  }

  const handleSend = (template: Template) => {
    setSelectedTemplate(template)
    setShowSendModal(true)
  }

  const handleEdit = (template: Template) => {
    setFormData({
      name: template.name,
      description: template.description || '',
      category: template.category as any,
      subcategory: template.subcategory || '',
      channel: template.channel as any,
      subject: template.subject || '',
      body: template.body,
      language: template.language || 'en',
      parent_template_id: template.parent_template_id || null,
    })
    setSelectedTemplate(template)
    setShowCreateModal(true)
  }

  const handleAddTranslation = (template: Template) => {
    setFormData({
      name: `${template.name} (Translation)`,
      description: template.description || '',
      category: template.category as any,
      subcategory: template.subcategory || '',
      channel: template.channel as any,
      subject: template.subject || '',
      body: template.body,
      language: 'ar', // Default to Arabic for Egypt travel
      parent_template_id: template.parent_template_id || template.id, // Link to parent
    })
    setSelectedTemplate(null) // Creating new, not editing
    setShowCreateModal(true)
  }

  const handleDelete = async (template: Template) => {
    if (!confirm(`Delete template "${template.name}"?`)) return

    try {
      const response = await fetch(`/api/templates/${template.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setTemplates(templates.filter(t => t.id !== template.id))
      }
    } catch (error) {
      console.error('Error deleting template:', error)
    }
  }

  const handleDuplicate = async (template: Template) => {
    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${template.name} (Copy)`,
          description: template.description,
          category: template.category,
          subcategory: template.subcategory,
          channel: template.channel,
          subject: template.subject,
          body: template.body,
        }),
      })

      if (response.ok) {
        fetchTemplates()
      }
    } catch (error) {
      console.error('Error duplicating template:', error)
    }
  }

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    
    try {
      const url = selectedTemplate 
        ? `/api/templates/${selectedTemplate.id}`
        : '/api/templates'
      
      const response = await fetch(url, {
        method: selectedTemplate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      
      if (response.ok) {
        fetchTemplates()
        setShowCreateModal(false)
        setSelectedTemplate(null)
        setFormData({
          name: '',
          description: '',
          category: 'customer',
          subcategory: '',
          channel: 'email',
          subject: '',
          body: '',
          language: 'en',
          parent_template_id: null,
        })
      }
    } catch (error) {
      console.error('Error saving template:', error)
    } finally {
      setSaving(false)
    }
  }

  // ============================================
  // RENDER HELPERS
  // ============================================

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email': return <Mail className="w-4 h-4" />
      case 'whatsapp': return <MessageSquare className="w-4 h-4" />
      case 'sms': return <MessageSquare className="w-4 h-4" />
      case 'both': return <Sparkles className="w-4 h-4" />
      default: return null
    }
  }

  const getChannelColor = (channel: string) => {
    switch (channel) {
      case 'email': return 'bg-blue-100 text-blue-700'
      case 'whatsapp': return 'bg-green-100 text-green-700'
      case 'sms': return 'bg-orange-100 text-orange-700'
      case 'both': return 'bg-purple-100 text-purple-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'customer': return 'bg-emerald-100 text-emerald-700'
      case 'supplier': return 'bg-cyan-100 text-cyan-700'
      case 'partner': return 'bg-amber-100 text-amber-700'
      case 'internal': return 'bg-slate-100 text-slate-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Message Templates</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filteredTemplates.length} of {templates.length} templates • Quick-send via Email, WhatsApp, or SMS
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAnalytics(!showAnalytics)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
              showAnalytics
                ? 'bg-purple-50 border-purple-200 text-purple-700'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Analytics
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedTemplate(null)
              setFormData({
                name: '',
                description: '',
                category: 'customer',
                subcategory: '',
                channel: 'email',
                subject: '',
                body: '',
                language: 'en',
                parent_template_id: null,
              })
              setShowCreateModal(true)
            }}
            className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4f6339] transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Template
          </button>
        </div>
      </div>

      {/* Analytics Panel */}
      {showAnalytics && analytics && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-600" />
              Template Analytics
            </h2>
            <span className="text-xs text-gray-500">Last 30 days</span>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                <FileText className="w-4 h-4" />
                Total Templates
              </div>
              <div className="text-2xl font-bold text-gray-900">{analytics.overview.totalTemplates}</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-blue-600 text-xs mb-1">
                <Send className="w-4 h-4" />
                Messages Sent
              </div>
              <div className="text-2xl font-bold text-blue-700">{analytics.overview.totalSentLast30Days}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-green-600 text-xs mb-1">
                <CheckCircle2 className="w-4 h-4" />
                Success Rate
              </div>
              <div className="text-2xl font-bold text-green-700">{analytics.overview.successRate}%</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-amber-600 text-xs mb-1">
                <Clock className="w-4 h-4" />
                Scheduled
              </div>
              <div className="text-2xl font-bold text-amber-700">{analytics.overview.pendingScheduled}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Templates */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Most Used Templates
              </h3>
              <div className="space-y-2">
                {analytics.topTemplates.length > 0 ? (
                  analytics.topTemplates.map((t, i) => (
                    <div key={t.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">#{i + 1}</span>
                        <span className="text-sm font-medium text-gray-900">{t.name}</span>
                      </div>
                      <span className="text-xs text-gray-500">{t.usage_count} uses</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-400 italic">No usage data yet</p>
                )}
              </div>
            </div>

            {/* Channel Distribution */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Templates by Channel</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-gray-700">Email</span>
                  </div>
                  <span className="text-sm font-medium text-blue-700">{analytics.channelDistribution.email}</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-gray-700">WhatsApp</span>
                  </div>
                  <span className="text-sm font-medium text-green-700">{analytics.channelDistribution.whatsapp}</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-orange-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-orange-600" />
                    <span className="text-sm text-gray-700">SMS</span>
                  </div>
                  <span className="text-sm font-medium text-orange-700">{analytics.channelDistribution.sms}</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-purple-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <span className="text-sm text-gray-700">All Channels</span>
                  </div>
                  <span className="text-sm font-medium text-purple-700">{analytics.channelDistribution.both}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            />
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <cat.icon className="w-4 h-4" />
                {cat.label}
              </button>
            ))}
          </div>

          {/* Channel Filter */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {CHANNELS.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setSelectedChannel(ch.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                  selectedChannel === ch.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {ch.icon && <ch.icon className="w-4 h-4" />}
                {ch.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No templates found</p>
          <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or create a new template</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md hover:border-gray-300 transition-all group"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 text-sm truncate">{template.name}</h3>
                </div>
                <div className="flex items-center gap-1">
                  {template.language && (
                    <span className="text-sm" title={LANGUAGES.find(l => l.code === template.language)?.name || template.language}>
                      {LANGUAGES.find(l => l.code === template.language)?.flag || template.language}
                    </span>
                  )}
                  <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${getChannelColor(template.channel)}`}>
                    {getChannelIcon(template.channel)}
                  </span>
                </div>
              </div>

              {/* Preview */}
              <div className="bg-gray-50 rounded p-2 mb-2 text-xs text-gray-600 line-clamp-2 font-mono leading-relaxed h-[40px] overflow-hidden">
                {template.body.substring(0, 80)}...
              </div>

              {/* Tags */}
              <div className="flex items-center gap-1.5 mb-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${getCategoryColor(template.category)}`}>
                  {template.category}
                </span>
                <span className="text-[10px] text-gray-400 uppercase">
                  {SUBCATEGORY_LABELS[template.subcategory] || template.subcategory}
                </span>
                {template.version && template.version > 1 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600" title={`Version ${template.version}`}>
                    v{template.version}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 pt-2 border-t border-gray-100">
                <button
                  onClick={() => handleCopy(template)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  title="Copy to clipboard"
                >
                  {copied === template.id ? (
                    <Check className="w-3 h-3 text-green-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
                <button
                  onClick={() => handlePreview(template)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  title="Preview"
                >
                  <Eye className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleSend(template)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-white bg-[#647C47] hover:bg-[#4f6339] rounded transition-colors ml-auto"
                >
                  <Send className="w-3 h-3" />
                  Send
                </button>
                <div className="relative">
                  <button 
                    onClick={() => setShowDropdown(showDropdown === template.id ? null : template.id)}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {showDropdown === template.id && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 min-w-[100px]">
                      <button
                        type="button"
                        onClick={() => { handleEdit(template); setShowDropdown(null); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        <Edit2 className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => { handleDuplicate(template); setShowDropdown(null); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        <Copy className="w-3 h-3" />
                        Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={() => { handleAddTranslation(template); setShowDropdown(null); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50"
                      >
                        <FileText className="w-3 h-3" />
                        Add Translation
                      </button>
                      <button
                        type="button"
                        onClick={() => { handleDelete(template); setShowDropdown(null); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {selectedTemplate ? 'Edit Template' : 'New Template'}
              </h2>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  >
                    <option value="customer">Customer (B2C Travelers)</option>
                    <option value="supplier">Supplier (Hotels, Cruises, Guides)</option>
                    {hasB2B && <option value="partner">B2B Partner (Tour Operators)</option>}
                    <option value="internal">Internal (Team)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Channel</label>
                  <select
                    value={formData.channel}
                    onChange={(e) => setFormData({ ...formData, channel: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  >
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="sms">SMS</option>
                    <option value="both">All Channels</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subcategory</label>
                  <input
                    type="text"
                    value={formData.subcategory}
                    onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                    placeholder="e.g., quotation, voucher"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                    placeholder="Brief description of when to use this template"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
                  <select
                    value={formData.language}
                    onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                    title="Template language"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  >
                    {LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.flag} {lang.name}
                      </option>
                    ))}
                  </select>
                  {formData.parent_template_id && (
                    <p className="text-xs text-blue-600 mt-1">This is a translation variant</p>
                  )}
                </div>
              </div>

              {(formData.channel === 'email' || formData.channel === 'both') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject (Email)</label>
                  <input
                    type="text"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                    placeholder="Email subject line with {{placeholders}}"
                  />
                </div>
              )}

              {/* Quick Placeholder Insert */}
              <div className="bg-gray-50 rounded-lg p-3">
                <label className="block text-xs font-medium text-gray-500 mb-2">Quick Insert Placeholders (click to copy)</label>
                <div className="flex flex-wrap gap-1">
                  {['{{GuestName}}', '{{ClientEmail}}', '{{ClientPhone}}', '{{TourName}}', '{{StartDate}}', '{{EndDate}}', '{{TotalPrice}}', '{{DepositAmount}}', '{{HotelName}}', '{{FlightDetails}}', '{{AgentName}}', '{{CompanyName}}'].map((ph) => (
                    <button
                      key={ph}
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(ph)
                        // Also append to body if focused
                        setFormData(prev => ({ ...prev, body: prev.body + ph }))
                      }}
                      className="px-2 py-1 bg-white border border-gray-200 rounded text-xs font-mono text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
                    >
                      {ph}
                    </button>
                  ))}
                </div>
              </div>

              {/* Body with Live Preview */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                <div className="grid grid-cols-2 gap-4">
                  {/* Editor */}
                  <div>
                    <textarea
                      value={formData.body}
                      onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] font-mono text-sm"
                      rows={12}
                      placeholder="Template content with {{placeholders}}"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Use {"{{PlaceholderName}}"} for dynamic content
                    </p>
                  </div>
                  {/* Live Preview */}
                  <div>
                    <div className="h-[288px] p-3 bg-gray-50 border border-gray-200 rounded-lg overflow-y-auto">
                      <div className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                        <Eye className="w-3 h-3" /> Live Preview
                      </div>
                      {formData.body ? (
                        <div className="text-sm whitespace-pre-wrap">
                          {formData.body.split(/(\{\{[^}]+\}\})/).map((part, i) => {
                            if (part.match(/^\{\{[^}]+\}\}$/)) {
                              return (
                                <span key={i} className="px-1 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-mono">
                                  {part}
                                </span>
                              )
                            }
                            return <span key={i}>{part}</span>
                          })}
                        </div>
                      ) : (
                        <p className="text-gray-400 text-sm italic">Start typing to see preview...</p>
                      )}
                    </div>
                    {/* Detected Placeholders */}
                    {formData.body && (
                      <div className="mt-2">
                        <span className="text-xs text-gray-500">Placeholders: </span>
                        {[...new Set(formData.body.match(/\{\{[^}]+\}\}/g) || [])].map((ph, i) => (
                          <span key={i} className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-mono mr-1 mb-1">
                            {ph}
                          </span>
                        ))}
                        {!(formData.body.match(/\{\{[^}]+\}\}/g)) && (
                          <span className="text-xs text-gray-400">None detected</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4f6339] transition-colors disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {selectedTemplate ? 'Update Template' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selectedTemplate.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${getCategoryColor(selectedTemplate.category)}`}>
                    {selectedTemplate.category}
                  </span>
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${getChannelColor(selectedTemplate.channel)}`}>
                    {getChannelIcon(selectedTemplate.channel)}
                    {selectedTemplate.channel}
                  </span>
                </div>
              </div>
              <button onClick={() => setShowPreviewModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {selectedTemplate.subject && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-500 mb-1">Subject</label>
                  <div className="p-3 bg-gray-50 rounded-lg text-gray-900">{selectedTemplate.subject}</div>
                </div>
              )}

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-500 mb-1">Body</label>
                <div className="p-4 bg-gray-50 rounded-lg whitespace-pre-wrap font-mono text-sm text-gray-800">
                  {selectedTemplate.body}
                </div>
              </div>

              {selectedTemplate.placeholders && selectedTemplate.placeholders.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-2">Placeholders Used</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedTemplate.placeholders.map((ph) => (
                      <span key={ph} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-mono">
                        {ph}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => handleCopy(selectedTemplate)}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
              <button
                onClick={() => {
                  setShowPreviewModal(false)
                  handleSend(selectedTemplate)
                }}
                className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4f6339] transition-colors"
              >
                <Send className="w-4 h-4" />
                Send This Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Modal */}
      {showSendModal && selectedTemplate && (
        <SendTemplateModal
          template={selectedTemplate}
          onClose={() => setShowSendModal(false)}
          placeholders={placeholders}
        />
      )}
    </div>
  )
}

// ============================================
// SEND TEMPLATE MODAL - UPDATED WITH PARTNER SUPPORT
// ============================================

interface SendTemplateModalProps {
  template: Template
  onClose: () => void
  placeholders: Placeholder[]
}

function SendTemplateModal({ template: initialTemplate, onClose, placeholders }: SendTemplateModalProps) {
  // Language variants support
  const [activeTemplate, setActiveTemplate] = useState<Template>(initialTemplate)
  const [languageVariants, setLanguageVariants] = useState<Template[]>([])
  const [loadingVariants, setLoadingVariants] = useState(true)

  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null)
  const [selectedRecipients, setSelectedRecipients] = useState<Recipient[]>([]) // For bulk send
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [isScheduleMode, setIsScheduleMode] = useState(false)
  const [scheduledFor, setScheduledFor] = useState('')
  const [bulkProgress, setBulkProgress] = useState<{ sent: number; failed: number; total: number } | null>(null)
  const [filledValues, setFilledValues] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [channel, setChannel] = useState<'email' | 'whatsapp' | 'sms'>(
    initialTemplate.channel === 'both' ? 'whatsapp' : initialTemplate.channel === 'sms' ? 'sms' : initialTemplate.channel as 'email' | 'whatsapp'
  )

  // Determine recipient type based on template category
  const isSupplierTemplate = activeTemplate.category === 'supplier'
  const isPartnerTemplate = activeTemplate.category === 'partner'
  const isInternalTemplate = activeTemplate.category === 'internal'

  // Get supplier type from subcategory mapping
  const supplierType = SUBCATEGORY_TO_SUPPLIER_TYPE[activeTemplate.subcategory] || 'hotel'

  // Fetch language variants on mount
  useEffect(() => {
    fetchLanguageVariants()
  }, [])

  const fetchLanguageVariants = async () => {
    setLoadingVariants(true)
    try {
      // Determine the parent template ID (could be self if this is the parent)
      const parentId = initialTemplate.parent_template_id || initialTemplate.id

      // Fetch all templates to find variants (same parent_template_id or the parent itself)
      const response = await fetch('/api/templates')
      if (response.ok) {
        const result = await response.json()
        let allTemplates: Template[] = []

        if (Array.isArray(result)) {
          allTemplates = result
        } else if (result.data && Array.isArray(result.data)) {
          allTemplates = result.data
        }

        // Find all variants: templates with same parent_template_id, OR the parent template itself
        const variants = allTemplates.filter(t =>
          t.id === parentId || // The parent template
          t.parent_template_id === parentId || // Children of the parent
          (initialTemplate.parent_template_id && t.id === initialTemplate.parent_template_id) // If current is a child, include parent
        )

        // Sort by language code for consistent ordering
        variants.sort((a, b) => (a.language || 'en').localeCompare(b.language || 'en'))

        setLanguageVariants(variants)
      }
    } catch (error) {
      console.error('Error fetching language variants:', error)
      // Fall back to just the current template
      setLanguageVariants([initialTemplate])
    } finally {
      setLoadingVariants(false)
    }
  }

  // Handle language change
  const handleLanguageChange = (templateId: string) => {
    const variant = languageVariants.find(v => v.id === templateId)
    if (variant) {
      setActiveTemplate(variant)
      // Reset preview with new template body
      setFilledValues({})
    }
  }

  // Get language info helper
  const getLanguageInfo = (code: string) => {
    return LANGUAGES.find(l => l.code === code) || { code, name: code, flag: '🌐' }
  }

  const getRecipientLabel = () => {
    if (isPartnerTemplate) return 'Select B2B Partner'
    if (isInternalTemplate) return 'Select Team Member'
    if (isSupplierTemplate) {
      switch (supplierType) {
        case 'hotel': return 'Select Hotel'
        case 'cruise': return 'Select Nile Cruise'
        case 'transport': return 'Select Transport Supplier'
        case 'guide': return 'Select Guide'
        default: return 'Select Supplier'
      }
    }
    return 'Select Client'
  }

  const getRecipientIcon = () => {
    if (isPartnerTemplate) return <Handshake className="w-4 h-4" />
    if (isInternalTemplate) return <Briefcase className="w-4 h-4" />
    if (isSupplierTemplate) {
      switch (supplierType) {
        case 'hotel': return <Hotel className="w-4 h-4" />
        case 'cruise': return <Ship className="w-4 h-4" />
        case 'transport': return <Car className="w-4 h-4" />
        case 'guide': return <User className="w-4 h-4" />
        default: return <Package className="w-4 h-4" />
      }
    }
    return <User className="w-4 h-4" />
  }

  useEffect(() => {
    fetchRecipients()
  }, [])

  useEffect(() => {
    // Auto-fill from selected recipient
    if (selectedRecipient) {
      const values: Record<string, string> = {}

      if (isPartnerTemplate) {
        // B2B Partner placeholders
        values['{{PartnerName}}'] = selectedRecipient.name || ''
        values['{{PartnerCompany}}'] = selectedRecipient.name || ''
        values['{{PartnerEmail}}'] = selectedRecipient.email || ''
        values['{{PartnerPhone}}'] = selectedRecipient.phone || ''
      } else if (isSupplierTemplate) {
        // Supplier placeholders based on type
        values['{{SupplierName}}'] = selectedRecipient.name || ''
        values['{{SupplierEmail}}'] = selectedRecipient.email || ''
        values['{{SupplierPhone}}'] = selectedRecipient.phone || ''
        // Type-specific placeholders
        if (supplierType === 'hotel') {
          values['{{HotelName}}'] = selectedRecipient.name || ''
        } else if (supplierType === 'cruise') {
          values['{{CruiseName}}'] = selectedRecipient.name || ''
        } else if (supplierType === 'guide') {
          values['{{GuideName}}'] = selectedRecipient.name || ''
        } else if (supplierType === 'transport') {
          values['{{TransportCompany}}'] = selectedRecipient.name || ''
        }
      } else if (isInternalTemplate) {
        // Internal team member placeholders
        values['{{TeamMemberName}}'] = selectedRecipient.name || ''
        values['{{TeamMemberEmail}}'] = selectedRecipient.email || ''
      } else {
        // Customer placeholders
        values['{{GuestName}}'] = selectedRecipient.name || ''
        values['{{ClientName}}'] = selectedRecipient.name || ''
        values['{{ClientPhone}}'] = selectedRecipient.phone || ''
        values['{{ClientEmail}}'] = selectedRecipient.email || ''
      }

      setFilledValues(prev => ({ ...prev, ...values }))
    }
  }, [selectedRecipient, isPartnerTemplate, isSupplierTemplate, isInternalTemplate, supplierType])

  useEffect(() => {
    // Generate preview
    let text = activeTemplate.body
    Object.entries(filledValues).forEach(([key, value]) => {
      text = text.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value || key)
    })
    setPreview(text)
  }, [filledValues, activeTemplate.body])

  const fetchRecipients = async () => {
    setLoading(true)
    try {
      let endpoint = '/api/clients?limit=100'
      let recipientType: Recipient['type'] = 'client'

      // Determine endpoint based on template category
      if (isPartnerTemplate) {
        // B2B Partners (tour operators, agencies)
        endpoint = '/api/b2b/partners'
        recipientType = 'b2b_partner'
      } else if (isSupplierTemplate) {
        // Suppliers (hotels, cruises, guides, transport)
        recipientType = supplierType as Recipient['type']
        switch (supplierType) {
          case 'hotel':
            endpoint = '/api/resources/hotels'
            break
          case 'cruise':
            endpoint = '/api/rates/cruises'
            break
          case 'transport':
            endpoint = '/api/rates/transportation'
            break
          case 'guide':
            endpoint = '/api/rates/guides'
            break
          default:
            endpoint = '/api/suppliers'
        }
      } else if (isInternalTemplate) {
        // Internal team members
        endpoint = '/api/team-members'
        recipientType = 'client' // Using client type for team members
      }
      // else: Customer templates use /api/clients (default)

      const response = await fetch(endpoint)
      if (response.ok) {
        const data = await response.json()

        // Handle different response formats
        let items: any[] = []
        if (Array.isArray(data)) {
          items = data
        } else if (Array.isArray(data.data)) {
          items = data.data
        } else if (data.success && Array.isArray(data.data)) {
          items = data.data
        }

        // Normalize to Recipient format based on type
        const normalized: Recipient[] = items.map(item => ({
          id: item.id,
          name: item.name || item.company_name || item.hotel_name || item.cruise_name || item.full_name || 'Unknown',
          email: item.email || item.contact_email || item.reservations_email,
          phone: item.phone || item.contact_phone || item.whatsapp_number,
          type: recipientType
        }))

        setRecipients(normalized)
      }
    } catch (error) {
      console.error('Error fetching recipients:', error)
      setRecipients([])
    } finally {
      setLoading(false)
    }
  }

  // Extract placeholders from template
  const templatePlaceholders = activeTemplate.body.match(/\{\{[^}]+\}\}/g) || []
  const uniquePlaceholders = [...new Set(templatePlaceholders)]

  const handleSend = async () => {
    if (!selectedRecipient) {
      alert('Please select a recipient')
      return
    }

    const recipientContact = channel === 'email' ? selectedRecipient.email : selectedRecipient.phone
    if (!recipientContact) {
      alert(`No ${channel === 'email' ? 'email' : 'phone number'} available for this recipient`)
      return
    }

    setSending(true)
    try {
      const response = await fetch('/api/templates/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: activeTemplate.id,
          channel,
          recipientId: selectedRecipient.id,
          recipientType: selectedRecipient.type,
          recipient: recipientContact,
          subject: activeTemplate.subject ? Object.entries(filledValues).reduce(
            (s, [k, v]) => s.replace(new RegExp(k.replace(/[{}]/g, '\\$&'), 'g'), v),
            activeTemplate.subject
          ) : undefined,
          body: preview,
        }),
      })

      if (response.ok) {
        alert('Message sent successfully!')
        onClose()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to send message')
      }
    } catch (error) {
      console.error('Error sending:', error)
      alert('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  // Schedule send handler
  const handleScheduleSend = async () => {
    if (!selectedRecipient) {
      alert('Please select a recipient')
      return
    }

    if (!scheduledFor) {
      alert('Please select a date and time')
      return
    }

    const recipientContact = channel === 'email' ? selectedRecipient.email : selectedRecipient.phone
    if (!recipientContact) {
      alert(`No ${channel === 'email' ? 'email' : 'phone number'} available for this recipient`)
      return
    }

    setSending(true)
    try {
      const response = await fetch('/api/templates/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: activeTemplate.id,
          channel,
          recipientId: selectedRecipient.id,
          recipientType: selectedRecipient.type,
          recipientContact,
          subject: activeTemplate.subject ? Object.entries(filledValues).reduce(
            (s, [k, v]) => s.replace(new RegExp(k.replace(/[{}]/g, '\\$&'), 'g'), v),
            activeTemplate.subject
          ) : undefined,
          body: preview,
          scheduledFor: new Date(scheduledFor).toISOString(),
        }),
      })

      if (response.ok) {
        alert(`Message scheduled for ${new Date(scheduledFor).toLocaleString()}`)
        onClose()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to schedule message')
      }
    } catch (error) {
      console.error('Error scheduling:', error)
      alert('Failed to schedule message')
    } finally {
      setSending(false)
    }
  }

  // Bulk send handler
  const handleBulkSend = async () => {
    if (selectedRecipients.length === 0) {
      alert('Please select at least one recipient')
      return
    }

    setSending(true)
    setBulkProgress({ sent: 0, failed: 0, total: selectedRecipients.length })

    let sent = 0
    let failed = 0

    for (const recipient of selectedRecipients) {
      const recipientContact = channel === 'email' ? recipient.email : recipient.phone
      if (!recipientContact) {
        failed++
        setBulkProgress({ sent, failed, total: selectedRecipients.length })
        continue
      }

      // Generate personalized message for this recipient
      let personalizedBody = activeTemplate.body
      const recipientValues: Record<string, string> = {}

      if (isPartnerTemplate) {
        // B2B Partner placeholders
        recipientValues['{{PartnerName}}'] = recipient.name || ''
        recipientValues['{{PartnerCompany}}'] = recipient.name || ''
        recipientValues['{{PartnerEmail}}'] = recipient.email || ''
        recipientValues['{{PartnerPhone}}'] = recipient.phone || ''
      } else if (isSupplierTemplate) {
        // Supplier placeholders
        recipientValues['{{SupplierName}}'] = recipient.name || ''
        recipientValues['{{SupplierEmail}}'] = recipient.email || ''
        recipientValues['{{SupplierPhone}}'] = recipient.phone || ''
        if (supplierType === 'hotel') {
          recipientValues['{{HotelName}}'] = recipient.name || ''
        } else if (supplierType === 'cruise') {
          recipientValues['{{CruiseName}}'] = recipient.name || ''
        } else if (supplierType === 'guide') {
          recipientValues['{{GuideName}}'] = recipient.name || ''
        } else if (supplierType === 'transport') {
          recipientValues['{{TransportCompany}}'] = recipient.name || ''
        }
      } else if (isInternalTemplate) {
        // Internal team member placeholders
        recipientValues['{{TeamMemberName}}'] = recipient.name || ''
        recipientValues['{{TeamMemberEmail}}'] = recipient.email || ''
      } else {
        // Customer placeholders
        recipientValues['{{GuestName}}'] = recipient.name || ''
        recipientValues['{{ClientName}}'] = recipient.name || ''
        recipientValues['{{ClientPhone}}'] = recipient.phone || ''
        recipientValues['{{ClientEmail}}'] = recipient.email || ''
      }

      // Merge with manual values (manual values take priority)
      const allValues = { ...recipientValues, ...filledValues }
      Object.entries(allValues).forEach(([key, value]) => {
        personalizedBody = personalizedBody.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value || key)
      })

      try {
        const response = await fetch('/api/templates/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: activeTemplate.id,
            channel,
            recipientId: recipient.id,
            recipientType: recipient.type,
            recipient: recipientContact,
            subject: activeTemplate.subject ? Object.entries(allValues).reduce(
              (s, [k, v]) => s.replace(new RegExp(k.replace(/[{}]/g, '\\$&'), 'g'), v),
              activeTemplate.subject
            ) : undefined,
            body: personalizedBody,
          }),
        })

        if (response.ok) {
          sent++
        } else {
          failed++
        }
      } catch {
        failed++
      }

      setBulkProgress({ sent, failed, total: selectedRecipients.length })
    }

    setSending(false)
    alert(`Bulk send complete!\n✓ Sent: ${sent}\n✗ Failed: ${failed}`)

    if (failed === 0) {
      onClose()
    }
  }

  // Toggle recipient selection for bulk mode
  const toggleRecipientSelection = (recipient: Recipient) => {
    setSelectedRecipients(prev => {
      const isSelected = prev.some(r => r.id === recipient.id)
      if (isSelected) {
        return prev.filter(r => r.id !== recipient.id)
      } else {
        return [...prev, recipient]
      }
    })
  }

  // Select/deselect all
  const toggleSelectAll = () => {
    if (selectedRecipients.length === recipients.length) {
      setSelectedRecipients([])
    } else {
      setSelectedRecipients([...recipients])
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Send: {activeTemplate.name}</h2>
            <p className="text-sm text-gray-500">
              {isBulkMode ? `Bulk send to ${selectedRecipients.length} recipients` : 'Fill in the placeholders and send'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Schedule Mode Toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isScheduleMode}
                onChange={(e) => {
                  setIsScheduleMode(e.target.checked)
                  if (e.target.checked) {
                    setIsBulkMode(false) // Can't bulk schedule yet
                  }
                }}
                className="w-4 h-4 text-[#647C47] rounded focus:ring-[#647C47]"
              />
              <span className="text-sm text-gray-600">Schedule</span>
            </label>
            {/* Bulk Mode Toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isBulkMode}
                onChange={(e) => {
                  setIsBulkMode(e.target.checked)
                  if (e.target.checked) {
                    setIsScheduleMode(false) // Can't schedule bulk yet
                    setSelectedRecipients([])
                    setBulkProgress(null)
                  }
                }}
                className="w-4 h-4 text-[#647C47] rounded focus:ring-[#647C47]"
              />
              <span className="text-sm text-gray-600">Bulk</span>
            </label>
            <button type="button" onClick={onClose} title="Close" className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 divide-x divide-gray-200">
            {/* Left: Fill Values */}
            <div className="p-6 space-y-4">
              {/* Language Selector - Show if multiple variants exist */}
              {languageVariants.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
                  <div className="flex flex-wrap gap-2">
                    {languageVariants.map((variant) => {
                      const langInfo = getLanguageInfo(variant.language || 'en')
                      const isActive = variant.id === activeTemplate.id
                      return (
                        <button
                          key={variant.id}
                          type="button"
                          onClick={() => handleLanguageChange(variant.id)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                            isActive
                              ? 'border-[#647C47] bg-[#647C47]/10 text-[#647C47] font-medium'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <span className="text-lg">{langInfo.flag}</span>
                          <span className="text-sm">{langInfo.name}</span>
                        </button>
                      )
                    })}
                  </div>
                  {loadingVariants && (
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading translations...
                    </p>
                  )}
                </div>
              )}

              {/* Channel Selector */}
              {activeTemplate.channel === 'both' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Send via</label>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setChannel('whatsapp')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
                        channel === 'whatsapp'
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => setChannel('sms')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
                        channel === 'sms'
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      SMS
                    </button>
                    <button
                      type="button"
                      onClick={() => setChannel('email')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
                        channel === 'email'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      <Mail className="w-4 h-4" />
                      Email
                    </button>
                  </div>
                </div>
              )}

              {/* Recipient Selector */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  {getRecipientIcon()}
                  {isBulkMode ? `Select Recipients (${selectedRecipients.length}/${recipients.length})` : `${getRecipientLabel()} (auto-fill)`}
                </label>
                {loading ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </div>
                ) : isBulkMode ? (
                  /* Bulk Mode: Checkbox List */
                  <div className="border border-gray-200 rounded-lg max-h-[200px] overflow-y-auto">
                    {/* Select All Header */}
                    <div className="sticky top-0 bg-gray-50 border-b border-gray-200 px-3 py-2 flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedRecipients.length === recipients.length && recipients.length > 0}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 text-[#647C47] rounded focus:ring-[#647C47]"
                        />
                        <span className="text-sm font-medium text-gray-700">Select All</span>
                      </label>
                      <span className="text-xs text-gray-500">{selectedRecipients.length} selected</span>
                    </div>
                    {/* Recipient List */}
                    {recipients.map((recipient) => {
                      const isSelected = selectedRecipients.some(r => r.id === recipient.id)
                      const hasContact = channel === 'email' ? recipient.email : recipient.phone
                      return (
                        <label
                          key={recipient.id}
                          className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-b-0 ${!hasContact ? 'opacity-50' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRecipientSelection(recipient)}
                            disabled={!hasContact}
                            className="w-4 h-4 text-[#647C47] rounded focus:ring-[#647C47]"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{recipient.name}</p>
                            <p className="text-xs text-gray-500 truncate">
                              {channel === 'email' ? recipient.email || 'No email' : recipient.phone || 'No phone'}
                            </p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                ) : (
                  /* Normal Mode: Dropdown Select */
                  <select
                    value={selectedRecipient?.id || ''}
                    onChange={(e) => {
                      const recipient = recipients.find(r => r.id === e.target.value)
                      setSelectedRecipient(recipient || null)
                    }}
                    title={getRecipientLabel()}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  >
                    <option value="">-- {getRecipientLabel()} --</option>
                    {recipients.map((recipient) => (
                      <option key={recipient.id} value={recipient.id}>
                        {recipient.name} {recipient.email ? `(${recipient.email})` : recipient.phone ? `(${recipient.phone})` : ''}
                      </option>
                    ))}
                  </select>
                )}
                {recipients.length === 0 && !loading && (
                  <p className="text-xs text-amber-600 mt-1">
                    No {isPartnerTemplate ? 'B2B partners' : isSupplierTemplate ? `${supplierType}s` : isInternalTemplate ? 'team members' : 'clients'} found. Add some first.
                  </p>
                )}
              </div>

              {/* Schedule DateTime Picker */}
              {isScheduleMode && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <label className="block text-sm font-medium text-blue-800 mb-2">
                    Schedule Send Time
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    title="Schedule date and time"
                    placeholder="Select date and time"
                    className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  <p className="text-xs text-blue-600 mt-1">
                    Message will be sent at the scheduled time (your local timezone)
                  </p>
                </div>
              )}

              {/* Placeholder Fields */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">Fill Placeholders</label>
                {uniquePlaceholders.map((ph) => {
                  const info = placeholders.find(p => p.placeholder === ph)
                  return (
                    <div key={ph}>
                      <label className="block text-xs text-gray-500 mb-1">
                        {info?.display_name || ph}
                        {info?.example_value && (
                          <span className="text-gray-400 ml-1">e.g., {info.example_value}</span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={filledValues[ph] || ''}
                        onChange={(e) => setFilledValues({ ...filledValues, [ph]: e.target.value })}
                        placeholder={info?.example_value || ph}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right: Preview */}
            <div className="p-6 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Preview</label>
                {languageVariants.length > 1 && (
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    {getLanguageInfo(activeTemplate.language || 'en').flag} {getLanguageInfo(activeTemplate.language || 'en').name}
                  </span>
                )}
              </div>
              {activeTemplate.subject && (
                <div className="mb-3">
                  <span className="text-xs text-gray-500">Subject:</span>
                  <div className="p-2 bg-white rounded border border-gray-200 text-sm">
                    {Object.entries(filledValues).reduce(
                      (s, [k, v]) => s.replace(new RegExp(k.replace(/[{}]/g, '\\$&'), 'g'), v || k),
                      activeTemplate.subject
                    )}
                  </div>
                </div>
              )}
              <div className="p-4 bg-white rounded-lg border border-gray-200 whitespace-pre-wrap text-sm max-h-[400px] overflow-y-auto">
                {preview}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-between items-center bg-gray-50">
          <div className="text-sm text-gray-500">
            {isBulkMode ? (
              bulkProgress ? (
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#647C47] transition-all"
                      style={{ width: `${((bulkProgress.sent + bulkProgress.failed) / bulkProgress.total) * 100}%` }}
                    />
                  </div>
                  <span>
                    {bulkProgress.sent + bulkProgress.failed}/{bulkProgress.total}
                    {bulkProgress.failed > 0 && <span className="text-red-500 ml-1">({bulkProgress.failed} failed)</span>}
                  </span>
                </div>
              ) : (
                selectedRecipients.length > 0 ? (
                  <span>Ready to send to <strong>{selectedRecipients.length}</strong> recipients</span>
                ) : (
                  <span className="text-amber-600">Select recipients to continue</span>
                )
              )
            ) : selectedRecipient ? (
              <>
                Sending to: <strong>{selectedRecipient.name}</strong>
                {channel === 'email' && selectedRecipient.email && ` (${selectedRecipient.email})`}
                {(channel === 'whatsapp' || channel === 'sms') && selectedRecipient.phone && ` (${selectedRecipient.phone})`}
              </>
            ) : null}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            {isBulkMode ? (
              <button
                type="button"
                onClick={handleBulkSend}
                disabled={sending || selectedRecipients.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4f6339] transition-colors disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send to {selectedRecipients.length} Recipients
              </button>
            ) : isScheduleMode ? (
              <button
                type="button"
                onClick={handleScheduleSend}
                disabled={sending || !selectedRecipient || !scheduledFor}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Schedule Send
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !selectedRecipient}
                className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4f6339] transition-colors disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send {channel === 'whatsapp' ? 'WhatsApp' : channel === 'sms' ? 'SMS' : 'Email'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}