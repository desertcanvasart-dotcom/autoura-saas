'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  CheckCircle, AlertCircle, Users, Calendar, MapPin,
  Loader2, MessageSquare, Sparkles,
  User, Mail, Phone, Globe, ChevronRight, UserPlus, ArrowLeft,
  Crown, Star, Settings, Check, X, Hotel, Plane, Car, Ship,
  Sun, Map, Building2, Package, Anchor, Clock, BadgeCheck,
  Percent, Languages, ChevronDown, ChevronUp, Info, Edit3, Save,
  Zap, Pencil, FileText, Wand2, ListChecks, AlertTriangle
} from 'lucide-react'
import Link from 'next/link'

// ============================================
// TYPES
// ============================================

interface UserPreferences {
  default_cost_mode: 'auto' | 'manual'
  default_tier: string
  default_margin_percent: number
  default_currency: string
}

interface ExtractedDay {
  day_number: number
  date: string | null
  date_display: string | null
  title: string
  city: string
  is_arrival: boolean
  is_departure: boolean
  is_transfer_only: boolean
  is_free_day: boolean
  activities: string[]
  attractions: string[]
  meals_included: {
    breakfast: boolean
    lunch: boolean
    dinner: boolean
  }
  guide_required: boolean
  transport_type: string | null
  flight_info: string | null
  hotel_name: string | null
  overnight_city: string
  notes: string | null
}

interface ExtractedData {
  client_name: string
  client_email: string
  client_phone: string
  tour_name: string
  start_date: string
  end_date: string | null
  duration_days: number
  num_adults: number
  num_children: number
  cities: string[]
  interests: string[]
  special_requests: string[]
  budget_level: string
  hotel_name: string
  hotel_location: string
  conversation_language: string
  confidence_score: number
  nationality?: string
  tier?: string
  // NEW: Structured input detection
  is_structured_input: boolean
  structure_confidence: number
  structure_signals: string[]
  extracted_days: ExtractedDay[] | null
  raw_itinerary: string | null
}

interface ExistingClient {
  id: string
  client_code: string
  full_name: string
  email: string
  phone: string
}

type PackageType = 'day-trips' | 'tours-only' | 'land-package' | 'full-package' | 'cruise-land' | 'shore-excursions'
type GenerationStep = 'idle' | 'creating-client' | 'checking-suppliers' | 'building-route' | 'calculating-margins' | 'finalizing' | 'complete'
type ClientStep = 'pending' | 'confirming' | 'confirmed' | 'existing-selected'
type GenerationMode = 'edit' | 'quick'

// NEW: Input mode type
type InputMode = 'creative' | 'structured'

// ============================================
// CONSTANTS
// ============================================

const TIER_OPTIONS = [
  { value: 'budget', label: 'Budget', icon: null, color: 'gray', description: 'Cost-effective, good value' },
  { value: 'standard', label: 'Standard', icon: null, color: 'blue', description: 'Comfortable mid-range' },
  { value: 'deluxe', label: 'Deluxe', icon: Star, color: 'purple', description: 'Superior quality' },
  { value: 'luxury', label: 'Luxury', icon: Crown, color: 'amber', description: 'Top-tier VIP experience' }
]

const PACKAGE_TYPES = [
  { slug: 'day-trips', name: 'Day Trips', icon: Sun, description: 'No accommodation', color: 'amber' },
  { slug: 'tours-only', name: 'Tours Only', icon: Map, description: 'Client has own hotel', color: 'blue' },
  { slug: 'full-package', name: 'Full Package', icon: Package, description: 'Everything included', color: 'primary' },
]

const DEFAULT_PREFERENCES: UserPreferences = {
  default_cost_mode: 'auto',
  default_tier: 'standard',
  default_margin_percent: 25,
  default_currency: 'EUR'
}

const GENERATION_STEPS: { key: GenerationStep; label: string }[] = [
  { key: 'creating-client', label: 'Creating client profile...' },
  { key: 'checking-suppliers', label: 'Checking supplier availability...' },
  { key: 'building-route', label: 'Building optimal route...' },
  { key: 'calculating-margins', label: 'Calculating margins...' },
  { key: 'finalizing', label: 'Finalizing itinerary...' },
]

const SAMPLE_CONVERSATION = `Cliente: Hola, queremos hacer un tour a Memphis, Sakkara
Agente: ¡Perfecto! ¿Cuántas personas?
Cliente: 4 adultos
Agente: ¿Para qué fecha?
Cliente: 12 de noviembre
Cliente: Y queremos añadir Dahshur también
Cliente: Mi nombre es Inmaculada Yurba Minguez
Cliente: Mi email es inmayurba@yahoo.es
Agente: Perfecto, ¿en qué hotel se alojan?
Cliente: Gran Plaza
Cliente: Queremos algo de lujo, es nuestro aniversario`

// ============================================
// HELPER FUNCTIONS
// ============================================

const mapBudgetToTier = (budgetLevel: string): string => {
  const mapping: Record<string, string> = {
    'budget': 'budget', 'economy': 'budget',
    'standard': 'standard', 'mid-range': 'standard', 'moderate': 'standard',
    'deluxe': 'deluxe', 'superior': 'deluxe',
    'luxury': 'luxury', 'premium': 'luxury', 'vip': 'luxury', 'high-end': 'luxury'
  }
  return mapping[budgetLevel?.toLowerCase()] || 'standard'
}

const getTierColor = (tier: string) => {
  const colors: Record<string, { bg: string; border: string; text: string; ring: string }> = {
    luxury: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', ring: 'ring-amber-500' },
    deluxe: { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700', ring: 'ring-purple-500' },
    standard: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', ring: 'ring-blue-500' },
    budget: { bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-700', ring: 'ring-gray-500' }
  }
  return colors[tier] || colors.standard
}

const parseConversation = (text: string): { sender: 'client' | 'agent'; message: string; highlight?: string[] }[] => {
  const lines = text.split('\n').filter(line => line.trim())
  return lines.map(line => {
    const isClient = line.toLowerCase().startsWith('client') || line.toLowerCase().startsWith('cliente')
    const message = line.replace(/^(cliente|client|agente|agent):\s*/i, '')
    
    const highlights: string[] = []
    if (/\d+\s*(adult|adulto|person|persona)/i.test(message)) highlights.push('travelers')
    if (/\d{1,2}\s*(de\s+)?\w+|\d{4}-\d{2}-\d{2}/i.test(message)) highlights.push('date')
    if (/@|\.com|\.es|\.org/i.test(message)) highlights.push('email')
    if (/lujo|luxury|premium|vip|deluxe/i.test(message)) highlights.push('tier')
    
    return { sender: isClient ? 'client' : 'agent', message, highlight: highlights }
  })
}

// ============================================
// CHAT BUBBLE COMPONENT
// ============================================

function ChatBubble({ sender, message, highlight }: { sender: 'client' | 'agent'; message: string; highlight?: string[] }) {
  const isClient = sender === 'client'
  
  return (
    <div className={`flex ${isClient ? 'justify-start' : 'justify-end'} mb-2`}>
      <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
        isClient 
          ? 'bg-white border border-gray-200 text-gray-900 rounded-bl-md' 
          : 'bg-[#DCF8C6] text-gray-900 rounded-br-md'
      }`}>
        <p className="text-xs font-medium mb-0.5 opacity-60">
          {isClient ? 'Client' : 'Agent'}
        </p>
        <p>
          {message}
          {highlight && highlight.length > 0 && (
            <span className="ml-1">
              {highlight.includes('travelers') && <Users className="inline w-3 h-3 text-blue-500" />}
              {highlight.includes('date') && <Calendar className="inline w-3 h-3 text-green-500 ml-0.5" />}
              {highlight.includes('email') && <Mail className="inline w-3 h-3 text-purple-500 ml-0.5" />}
              {highlight.includes('tier') && <Crown className="inline w-3 h-3 text-amber-500 ml-0.5" />}
            </span>
          )}
        </p>
      </div>
    </div>
  )
}

// ============================================
// CONFIDENCE BADGE COMPONENT
// ============================================

function ConfidenceBadge({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
      checked ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
    }`}>
      {checked ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
      {label}
    </div>
  )
}

// ============================================
// STEP INDICATOR COMPONENT
// ============================================

function StepIndicator({ 
  step, 
  label, 
  status, 
  isActive 
}: { 
  step: number; 
  label: string; 
  status: 'pending' | 'active' | 'complete'; 
  isActive: boolean 
}) {
  return (
    <div className={`flex items-center gap-2 p-3 rounded-lg transition-all ${
      status === 'complete' ? 'bg-green-50 border border-green-200' :
      status === 'active' ? 'bg-primary-50 border border-primary-200' :
      'bg-gray-50 border border-gray-200 opacity-60'
    }`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
        status === 'complete' ? 'bg-green-500 text-white' :
        status === 'active' ? 'bg-primary-500 text-white' :
        'bg-gray-300 text-gray-600'
      }`}>
        {status === 'complete' ? <Check className="w-4 h-4" /> : step}
      </div>
      <span className={`text-sm font-medium ${
        status === 'complete' ? 'text-green-700' :
        status === 'active' ? 'text-primary-700' :
        'text-gray-500'
      }`}>{label}</span>
    </div>
  )
}

// ============================================
// GENERATION PROGRESS COMPONENT
// ============================================

function GenerationProgress({ currentStep, mode, inputMode }: { currentStep: GenerationStep; mode: GenerationMode; inputMode: InputMode }) {
  const stepIndex = GENERATION_STEPS.findIndex(s => s.key === currentStep)
  
  const displaySteps = mode === 'edit' 
    ? GENERATION_STEPS.filter(s => s.key !== 'calculating-margins')
    : GENERATION_STEPS
  
  return (
    <div className="space-y-3 p-4 bg-primary-50 rounded-lg border border-primary-200">
      <div className="flex items-center gap-2">
        <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
        <span className="text-sm font-semibold text-primary-700">
          {mode === 'edit' ? 'Generating Draft Itinerary' : 'Generating Itinerary'}
        </span>
      </div>
      <div className="space-y-2">
        {displaySteps.map((step, idx) => {
          const originalIndex = GENERATION_STEPS.findIndex(s => s.key === step.key)
          return (
            <div key={step.key} className="flex items-center gap-2">
              {originalIndex < stepIndex ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : originalIndex === stepIndex ? (
                <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
              )}
              <span className={`text-xs ${originalIndex <= stepIndex ? 'text-gray-700' : 'text-gray-400'}`}>
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-2 text-xs text-primary-600 mt-2">
        {inputMode === 'structured' ? (
          <><ListChecks className="w-3 h-3" /> Following your provided itinerary</>
        ) : (
          <><Wand2 className="w-3 h-3" /> AI creating itinerary</>
        )}
      </div>
      {mode === 'edit' && (
        <p className="text-xs text-primary-600">
          ✏️ You'll be able to edit before pricing is calculated
        </p>
      )}
    </div>
  )
}

// ============================================
// CLIENT CONFIRMATION MODAL
// ============================================

function ClientConfirmationModal({
  extractedData,
  phoneNumber,
  tier,
  onConfirm,
  onCancel,
  isCreating
}: {
  extractedData: ExtractedData
  phoneNumber: string | null
  tier: string
  onConfirm: (editedData: Partial<ExtractedData>) => void
  onCancel: () => void
  isCreating: boolean
}) {
  const [editMode, setEditMode] = useState(false)
  const [editedData, setEditedData] = useState({
    client_name: extractedData.client_name || '',
    client_email: extractedData.client_email || '',
    client_phone: extractedData.client_phone || phoneNumber || '',
    nationality: extractedData.nationality || 'Unknown'
  })

  const tierColor = getTierColor(tier)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden">
        <div className={`px-6 py-4 ${tierColor.bg} border-b ${tierColor.border}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full ${tierColor.bg} border-2 ${tierColor.border} flex items-center justify-center`}>
              <UserPlus className={`w-5 h-5 ${tierColor.text}`} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Confirm New Client</h3>
              <p className="text-sm text-gray-600">This client will be added to your CRM</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setEditMode(!editMode)}
              className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              <Edit3 className="w-3 h-3" />
              {editMode ? 'Done Editing' : 'Edit Details'}
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Full Name *</label>
              {editMode ? (
                <input
                  type="text"
                  value={editedData.client_name}
                  onChange={(e) => setEditedData({ ...editedData, client_name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Enter client name"
                />
              ) : (
                <div className="flex items-center gap-2 mt-1 px-3 py-2 bg-gray-50 rounded-lg">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-900">
                    {editedData.client_name || <span className="text-red-500">Name required</span>}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email</label>
              {editMode ? (
                <input
                  type="email"
                  value={editedData.client_email}
                  onChange={(e) => setEditedData({ ...editedData, client_email: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="email@example.com"
                />
              ) : (
                <div className="flex items-center gap-2 mt-1 px-3 py-2 bg-gray-50 rounded-lg">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{editedData.client_email || 'Not provided'}</span>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Phone</label>
              {editMode ? (
                <input
                  type="tel"
                  value={editedData.client_phone}
                  onChange={(e) => setEditedData({ ...editedData, client_phone: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="+20 115 801 1600"
                />
              ) : (
                <div className="flex items-center gap-2 mt-1 px-3 py-2 bg-gray-50 rounded-lg">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{editedData.client_phone || 'Not provided'}</span>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nationality</label>
              {editMode ? (
                <input
                  type="text"
                  value={editedData.nationality}
                  onChange={(e) => setEditedData({ ...editedData, nationality: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="e.g., Spanish, Japanese"
                />
              ) : (
                <div className="flex items-center gap-2 mt-1 px-3 py-2 bg-gray-50 rounded-lg">
                  <Globe className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{editedData.nationality || 'Unknown'}</span>
                </div>
              )}
            </div>
          </div>

          <div className={`p-3 rounded-lg ${tierColor.bg} border ${tierColor.border}`}>
            <div className="flex items-center gap-2">
              <Crown className={`w-4 h-4 ${tierColor.text}`} />
              <span className={`text-sm font-semibold ${tierColor.text}`}>
                {tier.charAt(0).toUpperCase() + tier.slice(1)} Tier Client
              </span>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
          <button
            onClick={onCancel}
            disabled={isCreating}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(editedData)}
            disabled={isCreating || !editedData.client_name.trim()}
            className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isCreating ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Creating...</>
            ) : (
              <><UserPlus className="w-4 h-4" />Create Client & Generate</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// NEW: INPUT MODE SELECTOR COMPONENT
// ============================================

function InputModeSelector({ 
  mode, 
  onChange,
  autoDetected,
  confidence,
  signals,
  extractedDaysCount
}: { 
  mode: InputMode
  onChange: (mode: InputMode) => void
  autoDetected: InputMode | null
  confidence: number
  signals: string[]
  extractedDaysCount: number
}) {
  const [showDetails, setShowDetails] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-500" />
          Input Type
        </h3>
        {autoDetected && (
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <Info className="w-3 h-3" />
            {showDetails ? 'Hide' : 'Why?'}
          </button>
        )}
      </div>

      {/* Auto-detection banner */}
      {autoDetected && (
        <div className={`mb-3 p-2 rounded-lg text-xs ${
          autoDetected === 'structured' 
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' 
            : 'bg-blue-50 border border-blue-200 text-blue-700'
        }`}>
          <div className="flex items-center gap-2">
            {autoDetected === 'structured' ? (
              <><ListChecks className="w-3 h-3" /> Detected structured itinerary ({confidence}% confidence)</>
            ) : (
              <><Wand2 className="w-3 h-3" /> Detected general request</>
            )}
          </div>
          {showDetails && signals.length > 0 && (
            <div className="mt-2 pt-2 border-t border-current/20">
              <p className="font-medium mb-1">Detection signals:</p>
              <ul className="space-y-0.5">
                {signals.map((signal, idx) => (
                  <li key={idx}>• {signal}</li>
                ))}
              </ul>
              {extractedDaysCount > 0 && (
                <p className="mt-1 font-medium">📅 {extractedDaysCount} days extracted</p>
              )}
            </div>
          )}
        </div>
      )}
      
      <div className="grid grid-cols-2 gap-3">
        {/* Creative / General Request */}
        <button
          onClick={() => onChange('creative')}
          className={`p-4 rounded-xl border-2 text-left transition-all ${
            mode === 'creative'
              ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500 ring-offset-1'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              mode === 'creative' ? 'bg-blue-100' : 'bg-gray-100'
            }`}>
              <Wand2 className={`w-4 h-4 ${mode === 'creative' ? 'text-blue-600' : 'text-gray-500'}`} />
            </div>
            <span className={`text-sm font-semibold ${mode === 'creative' ? 'text-blue-700' : 'text-gray-700'}`}>
              Let AI Create
            </span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            AI suggests itinerary based on interests, cities, and duration.
          </p>
        </button>

        {/* Structured / Follow Provided */}
        <button
          onClick={() => onChange('structured')}
          className={`p-4 rounded-xl border-2 text-left transition-all ${
            mode === 'structured'
              ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500 ring-offset-1'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              mode === 'structured' ? 'bg-emerald-100' : 'bg-gray-100'
            }`}>
              <ListChecks className={`w-4 h-4 ${mode === 'structured' ? 'text-emerald-600' : 'text-gray-500'}`} />
            </div>
            <span className={`text-sm font-semibold ${mode === 'structured' ? 'text-emerald-700' : 'text-gray-700'}`}>
              Follow My Plan
            </span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            I provided a day-by-day itinerary. Follow it exactly.
          </p>
        </button>
      </div>

      {/* Warning if mismatched */}
      {autoDetected && mode !== autoDetected && (
        <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700">
            {mode === 'structured' 
              ? "Your input doesn't appear to have a clear day-by-day structure. The AI might not be able to follow a specific plan."
              : "Your input appears to contain a structured itinerary. Switching to 'Let AI Create' may ignore your specific plan."
            }
          </p>
        </div>
      )}

      {/* Info box */}
      <div className={`mt-3 p-3 rounded-lg text-xs ${
        mode === 'structured' 
          ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' 
          : 'bg-blue-50 border border-blue-200 text-blue-700'
      }`}>
        {mode === 'structured' ? (
          <p>
            <strong>📋 Follow My Plan:</strong> The AI will extract dates, cities, and activities from your input and create the itinerary exactly as specified. It won't add or change anything.
          </p>
        ) : (
          <p>
            <strong>✨ Let AI Create:</strong> The AI will design an optimal itinerary based on the cities, interests, and duration extracted from your input.
          </p>
        )}
      </div>
    </div>
  )
}

// ============================================
// GENERATION MODE SELECTOR COMPONENT
// ============================================

function GenerationModeSelector({ 
  mode, 
  onChange 
}: { 
  mode: GenerationMode; 
  onChange: (mode: GenerationMode) => void 
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <Settings className="w-4 h-4 text-gray-500" />
        Generation Mode
      </h3>
      
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onChange('edit')}
          className={`p-4 rounded-xl border-2 text-left transition-all ${
            mode === 'edit'
              ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500 ring-offset-1'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              mode === 'edit' ? 'bg-primary-100' : 'bg-gray-100'
            }`}>
              <Pencil className={`w-4 h-4 ${mode === 'edit' ? 'text-primary-600' : 'text-gray-500'}`} />
            </div>
            <div>
              <span className={`text-sm font-semibold ${mode === 'edit' ? 'text-primary-700' : 'text-gray-700'}`}>
                Edit First
              </span>
              {mode === 'edit' && (
                <span className="ml-2 px-1.5 py-0.5 bg-primary-500 text-white text-[10px] rounded font-bold">
                  RECOMMENDED
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Review & edit content before calculating pricing.
          </p>
        </button>

        <button
          onClick={() => onChange('quick')}
          className={`p-4 rounded-xl border-2 text-left transition-all ${
            mode === 'quick'
              ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-500 ring-offset-1'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              mode === 'quick' ? 'bg-amber-100' : 'bg-gray-100'
            }`}>
              <Zap className={`w-4 h-4 ${mode === 'quick' ? 'text-amber-600' : 'text-gray-500'}`} />
            </div>
            <span className={`text-sm font-semibold ${mode === 'quick' ? 'text-amber-700' : 'text-gray-700'}`}>
              Quick Generate
            </span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Auto-calculate pricing immediately.
          </p>
        </button>
      </div>
    </div>
  )
}

// ============================================
// EXTRACTED DAYS PREVIEW COMPONENT
// ============================================

function ExtractedDaysPreview({ days }: { days: ExtractedDay[] }) {
  const [expanded, setExpanded] = useState(false)
  
  if (!days || days.length === 0) return null

  const displayDays = expanded ? days : days.slice(0, 3)

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
          <ListChecks className="w-4 h-4" />
          Extracted Day-by-Day Plan
        </h4>
        <span className="text-xs text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full">
          {days.length} days
        </span>
      </div>

      <div className="space-y-2">
        {displayDays.map((day, idx) => (
          <div 
            key={idx} 
            className={`p-2 rounded-lg text-xs ${
              day.is_transfer_only || day.is_arrival || day.is_departure
                ? 'bg-white/50 border border-emerald-200'
                : 'bg-white border border-emerald-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-emerald-700">
                {day.date_display || `Day ${day.day_number}`}: {day.title || day.city}
              </span>
              <div className="flex gap-1">
                {day.is_arrival && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]">Arrival</span>}
                {day.is_departure && <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px]">Departure</span>}
                {day.is_transfer_only && <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">Transfer</span>}
                {day.guide_required && <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px]">Guide</span>}
              </div>
            </div>
            {day.attractions && day.attractions.length > 0 && (
              <p className="text-gray-600 mt-1">
                📍 {day.attractions.join(', ')}
              </p>
            )}
          </div>
        ))}
      </div>

      {days.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
        >
          {expanded ? (
            <><ChevronUp className="w-3 h-3" /> Show less</>
          ) : (
            <><ChevronDown className="w-3 h-3" /> Show {days.length - 3} more days</>
          )}
        </button>
      )}
    </div>
  )
}

// ============================================
// MAIN EXPORT WITH SUSPENSE WRAPPER
// ============================================

export default function WhatsAppParserPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600 mx-auto mb-3" />
          <p className="text-sm text-gray-600">Loading WhatsApp Parser...</p>
        </div>
      </div>
    }>
      <WhatsAppParserContent />
    </Suspense>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

function WhatsAppParserContent() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  const preSelectedClientId = searchParams?.get('clientId')
  const conversationParam = searchParams?.get('conversation')
  const phoneParam = searchParams?.get('phone')

  // ============================================
  // STATE
  // ============================================

  const [userPreferences, setUserPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES)
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)

  const [conversation, setConversation] = useState('')
  const [parsedMessages, setParsedMessages] = useState<ReturnType<typeof parseConversation>>([])
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedTier, setSelectedTier] = useState<string>('standard')
  const [packageType, setPackageType] = useState<PackageType>('full-package')
  // Package type state

  const [generationMode, setGenerationMode] = useState<GenerationMode>('edit')
  
  // NEW: Input mode state
  const [inputMode, setInputMode] = useState<InputMode>('creative')
  const [autoDetectedMode, setAutoDetectedMode] = useState<InputMode | null>(null)

  const [existingClients, setExistingClients] = useState<ExistingClient[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [clientStep, setClientStep] = useState<ClientStep>('pending')
  const [showClientConfirmation, setShowClientConfirmation] = useState(false)
  const [isCreatingClient, setIsCreatingClient] = useState(false)

  const [isGenerating, setIsGenerating] = useState(false)
  const [generationStep, setGenerationStep] = useState<GenerationStep>('idle')
  const [generatedItinerary, setGeneratedItinerary] = useState<any>(null)

  const [fromInbox, setFromInbox] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null)

  const itinerarySuccessRef = useRef<HTMLDivElement>(null)

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const step1Complete = !!extractedData
  const step2Complete = step1Complete && !!selectedTier && !!packageType
  const step3Complete = step2Complete && (clientStep === 'confirmed' || clientStep === 'existing-selected')
  const canGenerate = step2Complete && extractedData?.client_name?.trim()

  const getStepStatus = (step: number): 'pending' | 'active' | 'complete' => {
    if (step === 1) return extractedData ? 'complete' : (isAnalyzing ? 'active' : 'pending')
    if (step === 2) return step1Complete ? (step2Complete ? 'complete' : 'active') : 'pending'
    if (step === 3) return step2Complete ? (step3Complete ? 'complete' : 'active') : 'pending'
    if (step === 4) return generatedItinerary ? 'complete' : (isGenerating ? 'active' : 'pending')
    return 'pending'
  }

  // ============================================
  // EFFECTS
  // ============================================

  useEffect(() => {
    const loadUserPreferences = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setPreferencesLoaded(true); return }

        const { data } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user.id)
          .single()

        if (data) {
          const prefs: UserPreferences = {
            default_cost_mode: data.default_cost_mode || 'auto',
            default_tier: data.default_tier || 'standard',
            default_margin_percent: data.default_margin_percent || 25,
            default_currency: data.default_currency || 'EUR'
          }
          setUserPreferences(prefs)
          setSelectedTier(prefs.default_tier)
        }
      } catch (err) {
        console.error('Error loading preferences:', err)
      } finally {
        setPreferencesLoaded(true)
      }
    }
    loadUserPreferences()
  }, [])

  useEffect(() => {
    if (conversationParam) {
      try {
        const isBase64 = new URLSearchParams(window.location.search).get("encoded") === "base64"
        let decoded: string
        
        if (isBase64) {
          // Convert URL-safe base64 back to standard base64
          let base64 = conversationParam.replace(/-/g, '+').replace(/_/g, '/')
          // Add padding if needed
          while (base64.length % 4) {
            base64 += '='
          }
          // Proper Unicode base64 decoding
          const binaryString = atob(base64)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          decoded = new TextDecoder('utf-8').decode(bytes)
        } else {
          decoded = decodeURIComponent(conversationParam)
        }
        
        setConversation(decoded)
        setParsedMessages(parseConversation(decoded))
        setFromInbox(true)
      } catch (e) {
        console.error('Error decoding conversation:', e)
        setConversation(conversationParam)
        setParsedMessages(parseConversation(conversationParam))
        setFromInbox(true)
      }
    }
    if (phoneParam) setPhoneNumber(phoneParam)
  }, [conversationParam, phoneParam])

  useEffect(() => {
    if (preSelectedClientId && !selectedClientId) {
      setSelectedClientId(preSelectedClientId)
      setClientStep('existing-selected')
    }
  }, [preSelectedClientId])

  useEffect(() => {
    if (conversation) {
      setParsedMessages(parseConversation(conversation))
    }
  }, [conversation])

  // ============================================
  // HANDLERS
  // ============================================

  const loadSample = () => {
    setConversation(SAMPLE_CONVERSATION)
    setParsedMessages(parseConversation(SAMPLE_CONVERSATION))
    setExtractedData(null)
    setGeneratedItinerary(null)
    setError(null)
    setClientStep('pending')
    setSelectedClientId(null)
    setSelectedTier(userPreferences.default_tier)
    setPackageType('full-package')
    setInputMode('creative')
    setAutoDetectedMode(null)
  }

  const analyzeConversation = async () => {
    if (!conversation.trim()) {
      setError('Please paste a WhatsApp conversation')
      return
    }

    setIsAnalyzing(true)
    setError(null)
    setExtractedData(null)
    setExistingClients([])
    setSelectedClientId(preSelectedClientId || null)
    setClientStep(preSelectedClientId ? 'existing-selected' : 'pending')

    try {
      const response = await fetch('/api/ai/parse-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation })
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to analyze conversation')

      if (phoneNumber && !result.data.client_phone) {
        result.data.client_phone = phoneNumber
      }

      const aiDetectedTier = mapBudgetToTier(result.data.budget_level || '')
      const finalTier = result.data.budget_level ? aiDetectedTier : userPreferences.default_tier

      result.data.tier = finalTier
      setSelectedTier(finalTier)
      setExtractedData(result.data)

      // NEW: Set input mode based on detection
      if (result.data.is_structured_input) {
        setInputMode('structured')
        setAutoDetectedMode('structured')
      } else {
        setInputMode('creative')
        setAutoDetectedMode('creative')
      }

      // Search for existing clients
      if (result.data.client_email || result.data.client_phone) {
        try {
          const { data: clients } = await supabase
            .from('clients')
            .select('id, client_code, first_name, last_name, email, phone')
            .or(`email.eq.${result.data.client_email},phone.eq.${result.data.client_phone}`)
            .limit(5)

          if (clients && clients.length > 0) {
            setExistingClients(clients.map(c => ({
              ...c,
              full_name: `${c.first_name || ''} ${c.last_name || ''}`.trim()
            })))
          }
        } catch (e) {
          console.warn('Could not search for existing clients:', e)
        }
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const selectExistingClient = (clientId: string) => {
    setSelectedClientId(clientId)
    setClientStep('existing-selected')
  }

  const openClientConfirmation = () => {
    setShowClientConfirmation(true)
  }

  const handleConfirmClient = async (editedData: Partial<ExtractedData>) => {
    if (!extractedData) return

    setIsCreatingClient(true)
    setError(null)

    try {
      const clientName = (editedData.client_name || extractedData.client_name)?.trim()
      if (!clientName) {
        setError('Client name is required')
        setIsCreatingClient(false)
        return
      }

      const clientEmail = editedData.client_email || extractedData.client_email || null
      const clientPhone = editedData.client_phone || extractedData.client_phone || phoneNumber || null
      const clientNationality = editedData.nationality || extractedData.nationality || 'Unknown'

      // Build the updated data BEFORE any async operations
      // This ensures the correct values are passed to generateItinerary
      const updatedExtractedData: ExtractedData = {
        ...extractedData,
        client_name: clientName,
        client_email: clientEmail || '',
        client_phone: clientPhone || '',
        nationality: clientNationality
      }

      let clientId: string | null = null

      // Check if client exists
      if (clientEmail || clientPhone) {
        let query = supabase.from('clients').select('id, first_name, last_name, email, phone')
        
        if (clientEmail && clientPhone) {
          query = query.or(`email.eq.${clientEmail},phone.eq.${clientPhone}`)
        } else if (clientEmail) {
          query = query.eq('email', clientEmail)
        } else if (clientPhone) {
          query = query.eq('phone', clientPhone)
        }
        
        const { data: existingClients } = await query.limit(1)
        
        if (existingClients && existingClients.length > 0) {
          clientId = existingClients[0].id
          setSelectedClientId(clientId)
          setClientStep('existing-selected')
          setShowClientConfirmation(false)
          setExtractedData(updatedExtractedData)

          // Pass the updated data directly to avoid state timing issues
          setTimeout(() => generateItineraryWithData(clientId!, updatedExtractedData), 100)
          return
        }
      }

      // Create new client
      const nameParts = clientName.split(' ')
      const firstName = nameParts[0] || 'Unknown'
      const lastName = nameParts.slice(1).join(' ') || firstName

      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email: clientEmail,
          phone: clientPhone,
          nationality: clientNationality,
          status: 'prospect',
          client_type: extractedData.num_adults > 2 ? 'family' : 'individual',
          passport_type: 'other',
          preferred_language: extractedData.conversation_language || 'English',
          client_source: 'whatsapp',
          vip_status: selectedTier === 'luxury',
          preferences: {
            accommodation_type: selectedTier === 'luxury' ? '5-star' : selectedTier === 'deluxe' ? '4-star' : '3-star',
            tour_pace: 'moderate',
            interests: extractedData.interests?.join(', ') || '',
            tier: selectedTier
          },
          note: `WhatsApp inquiry: ${extractedData.tour_name}. ${extractedData.cities?.join(', ') || 'Egypt'}. ${extractedData.num_adults} adults.`,
          link_whatsapp_phone: phoneNumber
        })
      })

      const result = await response.json()
      
      if (!response.ok || !result.success) {
        if (result.error?.includes('duplicate') || result.error?.includes('already exists')) {
          if (clientEmail) {
            const { data: existingByEmail } = await supabase
              .from('clients')
              .select('id')
              .eq('email', clientEmail)
              .single()
            
            if (existingByEmail) {
              setSelectedClientId(existingByEmail.id)
              setClientStep('existing-selected')
              setShowClientConfirmation(false)
              setExtractedData(updatedExtractedData)
              setTimeout(() => generateItineraryWithData(existingByEmail.id, updatedExtractedData), 100)
              return
            }
          }
        }
        throw new Error(result.error || 'Failed to create client')
      }

      setSelectedClientId(result.data.id)
      setClientStep('confirmed')
      setShowClientConfirmation(false)
      setExtractedData(updatedExtractedData)

      // Pass the updated data directly to avoid state timing issues
      setTimeout(() => generateItineraryWithData(result.data.id, updatedExtractedData), 100)

    } catch (err: any) {
      setError(err.message || 'Failed to create client')
    } finally {
      setIsCreatingClient(false)
    }
  }

  // Generate itinerary with data passed directly (avoids state timing issues)
  const generateItineraryWithData = async (clientId: string, data: ExtractedData) => {
    setIsGenerating(true)
    setError(null)
    setGenerationStep('checking-suppliers')

    try {
      await new Promise(r => setTimeout(r, 800))
      setGenerationStep('building-route')
      await new Promise(r => setTimeout(r, 600))
      
      if (generationMode === 'quick') {
        setGenerationStep('calculating-margins')
        await new Promise(r => setTimeout(r, 500))
      }
      
      setGenerationStep('finalizing')

      const response = await fetch('/api/ai/generate-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          client_id: clientId,
          tier: selectedTier,
          budget_level: selectedTier,
          package_type: packageType,
          cost_mode: userPreferences.default_cost_mode,
          margin_percent: userPreferences.default_margin_percent,
          currency: userPreferences.default_currency,
          skip_pricing: generationMode === 'edit',
          input_mode_override: inputMode,
          is_structured_input: data.is_structured_input,
          extracted_days: data.extracted_days,
          raw_itinerary: data.raw_itinerary
        })
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to generate itinerary')

      setGenerationStep('complete')
      setGeneratedItinerary(result.data)

      if (generationMode === 'edit' && result.data?.redirect_to) {
        setTimeout(() => {
          router.push(result.data.redirect_to)
        }, 500)
        return
      }

      setTimeout(() => {
        itinerarySuccessRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)

    } catch (err: any) {
      setError(err.message || 'Generation failed')
      setGenerationStep('idle')
    } finally {
      setIsGenerating(false)
    }
  }

  // Generate itinerary using current extractedData state (for manual trigger)
  const generateItinerary = async (clientIdOverride?: string) => {
    if (!extractedData) return

    const clientIdToUse = clientIdOverride || selectedClientId

    if (!clientIdToUse) {
      openClientConfirmation()
      return
    }

    // Use the version that takes data directly
    await generateItineraryWithData(clientIdToUse, extractedData)
  }

  // ============================================
  // RENDER
  // ============================================

  if (!preferencesLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    )
  }

  const tierColor = getTierColor(selectedTier)

  return (
    <div className="min-h-screen bg-gray-50">
      {showClientConfirmation && extractedData && (
        <ClientConfirmationModal
          extractedData={extractedData}
          phoneNumber={phoneNumber}
          tier={selectedTier}
          onConfirm={handleConfirmClient}
          onCancel={() => setShowClientConfirmation(false)}
          isCreating={isCreatingClient}
        />
      )}

      {/* HEADER */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {fromInbox && (
                <Link href="/whatsapp-inbox" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                  <ArrowLeft className="w-5 h-5" />
                </Link>
              )}
              <div className="p-2 bg-primary-100 rounded-lg">
                <MessageSquare className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">WhatsApp to Itinerary</h1>
                <p className="text-xs text-gray-500">Analyze → Configure → Confirm Client → Generate</p>
              </div>
            </div>

            <Link href="/settings?tab=preferences" className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">
              <Settings className="w-4 h-4" />
              <span className={`font-medium ${tierColor.text}`}>{selectedTier}</span>
              <span>• {userPreferences.default_currency}</span>
            </Link>
          </div>

          <div className="grid grid-cols-4 gap-2 mt-3">
            <StepIndicator step={1} label="Analyze" status={getStepStatus(1)} isActive={!extractedData} />
            <StepIndicator step={2} label="Configure" status={getStepStatus(2)} isActive={step1Complete && !step2Complete} />
            <StepIndicator step={3} label="Client" status={getStepStatus(3)} isActive={step2Complete && !step3Complete} />
            <StepIndicator step={4} label="Generate" status={getStepStatus(4)} isActive={step3Complete} />
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="grid grid-cols-12 gap-4">

          {/* LEFT COLUMN */}
          <div className="col-span-5 space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#25D366]" />
                  <h2 className="text-sm font-semibold text-gray-900">Conversation</h2>
                </div>
                {!fromInbox && (
                  <button onClick={loadSample} className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                    Load Sample
                  </button>
                )}
              </div>

              {parsedMessages.length > 0 && !isAnalyzing ? (
                <div className="p-4 bg-[#E5DDD5] max-h-[400px] overflow-y-auto">
                  {parsedMessages.map((msg, idx) => (
                    <ChatBubble key={idx} sender={msg.sender} message={msg.message} highlight={msg.highlight} />
                  ))}
                </div>
              ) : (
                <textarea
                  value={conversation}
                  onChange={(e) => setConversation(e.target.value)}
                  placeholder="Paste WhatsApp conversation or structured itinerary here..."
                  className="w-full h-80 px-4 py-3 text-sm border-0 focus:ring-0 resize-none font-mono bg-gray-50"
                />
              )}

              <div className="px-4 py-3 border-t border-gray-100">
                <button
                  onClick={analyzeConversation}
                  disabled={isAnalyzing || !conversation.trim()}
                  className="w-full px-4 py-2.5 text-sm bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isAnalyzing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing with Claude AI...</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> {extractedData ? 'Re-Analyze' : 'Analyze with AI'}</>
                  )}
                </button>
              </div>
            </div>

            {extractedData && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Readiness Check</h3>
                <div className="flex flex-wrap gap-2">
                  <ConfidenceBadge label="Data extracted" checked={step1Complete} />
                  <ConfidenceBadge label={`Tier: ${selectedTier}`} checked={true} />
                  <ConfidenceBadge label={`Language: ${extractedData.conversation_language}`} checked={!!extractedData.conversation_language} />
                  <ConfidenceBadge label="Client confirmed" checked={step3Complete} />
                  <ConfidenceBadge 
                    label={inputMode === 'structured' ? 'Follow Plan' : 'AI Create'} 
                    checked={true} 
                  />
                </div>
              </div>
            )}

            {/* NEW: Extracted Days Preview */}
            {extractedData?.extracted_days && extractedData.extracted_days.length > 0 && inputMode === 'structured' && (
              <ExtractedDaysPreview days={extractedData.extracted_days} />
            )}
          </div>

          {/* RIGHT COLUMN */}
          <div className="col-span-7 space-y-4">

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">Error</p>
                  <p className="text-xs text-red-600 mt-1">{error}</p>
                </div>
              </div>
            )}

            {extractedData && (
              <>
                {/* Extracted Information */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <BadgeCheck className="w-4 h-4 text-green-500" />
                      <h2 className="text-sm font-semibold text-gray-900">Extracted Information</h2>
                    </div>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Claude AI • Editable</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Client</h4>
                      <div>
                        <label className="text-xs text-gray-500">Name <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={extractedData.client_name}
                          onChange={(e) => setExtractedData({ ...extractedData, client_name: e.target.value })}
                          className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          placeholder="Enter name"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Email</label>
                        <input
                          type="email"
                          value={extractedData.client_email}
                          onChange={(e) => setExtractedData({ ...extractedData, client_email: e.target.value })}
                          className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Phone</label>
                        <input
                          type="tel"
                          value={extractedData.client_phone || phoneNumber || ''}
                          onChange={(e) => setExtractedData({ ...extractedData, client_phone: e.target.value })}
                          className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Trip Details</h4>
                      <div>
                        <label className="text-xs text-gray-500">Tour</label>
                        <div className="mt-1 px-3 py-2 text-sm bg-gray-50 rounded-lg text-gray-700">{extractedData.tour_name}</div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Date</label>
                        <input
                          type="date"
                          value={extractedData.start_date}
                          onChange={(e) => setExtractedData({ ...extractedData, start_date: e.target.value })}
                          className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Travelers</label>
                        <div className="mt-1 px-3 py-2 text-sm bg-gray-50 rounded-lg text-gray-700">
                          {extractedData.num_adults} adults{extractedData.num_children > 0 && `, ${extractedData.num_children} children`}
                          {extractedData.duration_days > 1 && ` • ${extractedData.duration_days} days`}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* NEW: Input Mode Selector */}
                <InputModeSelector 
                  mode={inputMode}
                  onChange={setInputMode}
                  autoDetected={autoDetectedMode}
                  confidence={extractedData.structure_confidence || 0}
                  signals={extractedData.structure_signals || []}
                  extractedDaysCount={extractedData.extracted_days?.length || 0}
                />

                {/* Tier Selection */}
                <div className={`bg-white rounded-xl border-2 shadow-sm p-4 ${tierColor.border}`}>
                  {extractedData.budget_level && (
                    <div className={`mb-3 p-2 rounded-lg ${tierColor.bg} ${tierColor.text} text-sm`}>
                      <span className="font-medium">📊 AI Recommendation:</span>
                      <span className="font-bold ml-1">{selectedTier.charAt(0).toUpperCase() + selectedTier.slice(1)}</span>
                    </div>
                  )}

                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-500" />
                    Service Tier
                  </h3>

                  <div className="grid grid-cols-4 gap-2">
                    {TIER_OPTIONS.map((tier) => {
                      const isSelected = selectedTier === tier.value
                      const color = getTierColor(tier.value)
                      return (
                        <button
                          key={tier.value}
                          onClick={() => setSelectedTier(tier.value)}
                          className={`p-3 rounded-xl border-2 text-left transition-all ${
                            isSelected 
                              ? `${color.border} ${color.bg} ring-2 ${color.ring} ring-offset-1` 
                              : 'border-gray-200 hover:border-gray-300 opacity-70 hover:opacity-100'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            {tier.icon && <tier.icon className={`w-4 h-4 ${color.text}`} />}
                            <span className={`text-sm font-semibold ${isSelected ? color.text : 'text-gray-600'}`}>{tier.label}</span>
                          </div>
                          <p className="text-xs text-gray-500">{tier.description}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Package Type Selection */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary-500" />
                    Package Type
                  </h3>

                  <div className="grid grid-cols-3 gap-2">
                    {PACKAGE_TYPES.map((pkg) => {
                      const isSelected = packageType === pkg.slug
                      return (
                        <button
                          key={pkg.slug}
                          onClick={() => setPackageType(pkg.slug as PackageType)}
                          className={`p-3 rounded-xl border-2 text-left transition-all ${
                            isSelected 
                              ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500 ring-offset-1' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <pkg.icon className={`w-4 h-4 ${isSelected ? 'text-primary-600' : 'text-gray-400'}`} />
                            <span className={`text-sm font-semibold ${isSelected ? 'text-primary-700' : 'text-gray-700'}`}>{pkg.name}</span>
                          </div>
                          <p className="text-xs text-gray-500">{pkg.description}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Generation Mode */}
                <GenerationModeSelector mode={generationMode} onChange={setGenerationMode} />

                {/* Client Step */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <User className="w-4 h-4 text-primary-500" />
                    Step 3: Confirm Client
                  </h3>

                  {existingClients.length > 0 && clientStep !== 'confirmed' && (
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm font-medium text-amber-800 mb-2">⚠️ Possible existing client(s) found:</p>
                      <div className="space-y-2">
                        {existingClients.map((client) => (
                          <button
                            key={client.id}
                            onClick={() => selectExistingClient(client.id)}
                            className={`w-full p-3 text-left rounded-lg border-2 transition-all ${
                              selectedClientId === client.id && clientStep === 'existing-selected'
                                ? 'border-primary-500 bg-primary-50' 
                                : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm font-medium">{client.full_name}</div>
                                <div className="text-xs text-gray-500">{client.client_code} • {client.email || client.phone}</div>
                              </div>
                              {selectedClientId === client.id && clientStep === 'existing-selected' && (
                                <CheckCircle className="w-5 h-5 text-primary-500" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {clientStep === 'confirmed' && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-green-800">Client created successfully</p>
                        <p className="text-xs text-green-600">{extractedData.client_name} added to CRM</p>
                      </div>
                    </div>
                  )}

                  {clientStep === 'existing-selected' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-blue-500" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-800">Existing client selected</p>
                        <p className="text-xs text-blue-600">Will be linked to this itinerary</p>
                      </div>
                    </div>
                  )}

                  {clientStep === 'pending' && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <p className="text-sm text-gray-700 mb-3">
                        A new client profile will be created before generating.
                      </p>
                      <button
                        onClick={openClientConfirmation}
                        className="w-full px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-primary-500 hover:text-primary-600 hover:bg-primary-50 transition-all flex items-center justify-center gap-2"
                      >
                        <UserPlus className="w-4 h-4" />
                        Review & Create Client
                      </button>
                    </div>
                  )}
                </div>

                {/* Generate Button */}
                <div className={`rounded-xl p-4 shadow-lg ${
                  generationMode === 'edit' 
                    ? 'bg-gradient-to-r from-primary-500 to-primary-600' 
                    : 'bg-gradient-to-r from-green-500 to-emerald-600'
                }`}>
                  {isGenerating ? (
                    <GenerationProgress currentStep={generationStep} mode={generationMode} inputMode={inputMode} />
                  ) : (
                    <>
                      <p className="text-sm text-white/90 mb-3">
                        {step3Complete 
                          ? inputMode === 'structured'
                            ? `Generate from your ${extractedData.extracted_days?.length || 0}-day plan (${selectedTier.toUpperCase()})`
                            : `AI will create ${selectedTier.toUpperCase()} ${packageType.replace('-', ' ')} itinerary`
                          : 'Please confirm the client first to proceed.'
                        }
                      </p>
                      <button
                        onClick={() => generateItinerary()}
                        disabled={!canGenerate}
                        className={`w-full px-6 py-3 bg-white rounded-lg font-bold text-base disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-md ${
                          generationMode === 'edit' 
                            ? 'text-primary-700 hover:bg-primary-50' 
                            : 'text-green-700 hover:bg-green-50'
                        }`}
                      >
                        {inputMode === 'structured' ? (
                          <><ListChecks className="w-5 h-5" /> Generate from Plan</>
                        ) : generationMode === 'edit' ? (
                          <><Pencil className="w-5 h-5" /> Generate & Edit</>
                        ) : (
                          <><Zap className="w-5 h-5" /> Quick Generate</>
                        )}
                      </button>
                      {!canGenerate && !step3Complete && (
                        <p className="text-xs text-white/70 mt-2 text-center">
                          👆 Click "Review & Create Client" above first
                        </p>
                      )}
                    </>
                  )}
                </div>

                {/* Success States */}
                {generatedItinerary && generationMode === 'quick' && (
                  <div ref={itinerarySuccessRef} className="bg-green-50 border-2 border-green-300 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                        <Check className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-green-800">Itinerary Generated!</h3>
                        <p className="text-sm text-green-600">
                          {generatedItinerary.itinerary_code} • {generatedItinerary.generation_mode === 'structured' ? 'Followed your plan' : 'AI created'}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => router.push(`/itineraries/${generatedItinerary.id}`)}
                        className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 flex items-center justify-center gap-2"
                      >
                        View Itinerary <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => router.push(`/itineraries/${generatedItinerary.id}/edit`)}
                        className="px-4 py-2.5 border border-green-300 bg-white rounded-lg hover:bg-green-50 flex items-center gap-2 text-sm text-green-700"
                      >
                        <Pencil className="w-4 h-4" /> Edit
                      </button>
                    </div>
                  </div>
                )}

                {generatedItinerary && generationMode === 'edit' && (
                  <div ref={itinerarySuccessRef} className="bg-primary-50 border-2 border-primary-300 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
                      <div>
                        <h3 className="text-base font-bold text-primary-800">Draft Created!</h3>
                        <p className="text-sm text-primary-600">Redirecting to editor...</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Empty State */}
            {!extractedData && !isAnalyzing && (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-sm font-medium text-gray-600 mb-1">Paste a WhatsApp conversation or itinerary</h3>
                <p className="text-xs text-gray-400">
                  AI will auto-detect if you've provided a structured plan or a general request
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}