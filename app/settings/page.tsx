'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/app/supabase'
import {
  User,
  Mail,
  Bell,
  CreditCard,
  Settings,
  Save,
  Loader2,
  Check,
  X,
  Plus,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  Globe,
  Clock,
  Camera,
  Link as LinkIcon,
  CheckCircle,
  AlertCircle,
  FileText,
  Send,
  Crown,
  Calculator,
  Info,
  RefreshCw,
  Wifi
} from 'lucide-react'

// ============================================
// TYPES
// ============================================

interface Profile {
  id: string
  full_name: string
  email: string
  phone?: string
  role?: string
  timezone?: string
  avatar_url?: string
  company_name?: string
  company_logo?: string
}

interface EmailSettings {
  gmail_connected: boolean
  gmail_email?: string
  signature?: string
  auto_reply_enabled: boolean
  auto_reply_message?: string
}

interface NotificationPreference {
  task_assigned: boolean
  task_due_soon: boolean
  task_overdue: boolean
  task_completed: boolean
  email_enabled: boolean
  in_app_enabled: boolean
}

interface UserPreferences {
  id?: string
  user_id?: string
  default_cost_mode: 'auto' | 'manual'
  default_tier: string
  default_margin_percent: number
  default_currency: string
}

interface ExchangeRate {
  id?: string
  base_currency: string
  target_currency: string
  rate: number
  source?: 'api' | 'manual'
  is_system_rate?: boolean
  is_override?: boolean
  api_fetched_at?: string
}

// ============================================
// TAB CONFIGURATION
// ============================================

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'preferences', label: 'Preferences', icon: Settings },
]

const TIMEZONES = [
  { value: 'Africa/Cairo', label: 'Cairo (EET, UTC+2)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
]

const TIER_OPTIONS = [
  { value: 'budget', label: 'Budget', description: 'Cost-effective options' },
  { value: 'standard', label: 'Standard', description: 'Comfortable mid-range' },
  { value: 'deluxe', label: 'Deluxe', description: 'Superior quality' },
  { value: 'luxury', label: 'Luxury', description: 'Top-tier VIP experience' }
]

const COST_MODE_OPTIONS = [
  { 
    value: 'auto', 
    label: 'Auto-Calculate', 
    description: 'System calculates costs from rates database automatically',
    icon: Calculator
  },
  { 
    value: 'manual', 
    label: 'Manual Entry', 
    description: 'Enter actual costs manually for each service',
    icon: Settings
  }
]

// ============================================
// MAIN COMPONENT
// ============================================

function SettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  
  const [activeTab, setActiveTab] = useState(tabParam || 'profile')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Data states
  const [profile, setProfile] = useState<Profile | null>(null)
  const [emailSettings, setEmailSettings] = useState<EmailSettings | null>(null)
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreference>({
    task_assigned: true,
    task_due_soon: true,
    task_overdue: true,
    task_completed: false,
    email_enabled: true,
    in_app_enabled: true
  })
  const [userPreferences, setUserPreferences] = useState<UserPreferences>({
    default_cost_mode: 'auto',
    default_tier: 'standard',
    default_margin_percent: 25,
    default_currency: 'EUR'
  })
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([
    { base_currency: 'EUR', target_currency: 'USD', rate: 1.08 },
    { base_currency: 'EUR', target_currency: 'GBP', rate: 0.86 },
    { base_currency: 'EUR', target_currency: 'EGP', rate: 53.50 }
  ])
  const [savingRates, setSavingRates] = useState(false)
  const [refreshingRates, setRefreshingRates] = useState(false)
  const [lastApiFetch, setLastApiFetch] = useState<string | null>(null)

  // Update URL when tab changes
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
    router.push(`/settings?tab=${tabId}`, { scroll: false })
  }

  // Load data based on active tab
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        switch (activeTab) {
          case 'profile':
            await fetchProfile()
            break
          case 'email':
            await fetchEmailSettings()
            break
          case 'notifications':
            await fetchNotificationPrefs()
            break
          case 'preferences':
            await fetchPreferences()
            break
        }
      } catch (err) {
        console.error('Error loading data:', err)
        setError('Failed to load settings')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [activeTab])

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchProfile = async () => {
    try {
      const response = await fetch('/api/profile')
      if (response.ok) {
        const result = await response.json()
        const profileData = result.data || result.profile || result
        console.log('Profile loaded:', profileData)
        setProfile(profileData)
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
    }
  }

  const fetchEmailSettings = async () => {
    try {
      const response = await fetch('/api/settings/email')
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data) {
          setEmailSettings(result.data)
        }
      }
    } catch (error) {
      console.error('Error fetching email settings:', error)
    }
  }

  const fetchPreferences = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) return
  
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single()
  
      if (data) {
        setUserPreferences({
          id: data.id,
          user_id: data.user_id,
          default_cost_mode: data.default_cost_mode || 'auto',
          default_tier: data.default_tier || 'standard',
          default_margin_percent: data.default_margin_percent || 25,
          default_currency: data.default_currency || 'EUR'
        })
      }
      // Also fetch exchange rates when loading preferences
      await fetchExchangeRates()
    } catch (error) {
      console.error('Error fetching preferences:', error)
    }
  }

  const fetchExchangeRates = async () => {
    try {
      const response = await fetch('/api/exchange-rates')
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data && data.data.length > 0) {
          // Filter to only show EUR-based rates for simplicity
          const eurRates = data.data.filter((r: ExchangeRate) => r.base_currency === 'EUR')
          if (eurRates.length > 0) {
            setExchangeRates(eurRates)
          }
          // Set last API fetch time
          if (data.lastApiFetch) {
            setLastApiFetch(data.lastApiFetch)
          }
        }
      }
    } catch (error) {
      console.error('Error fetching exchange rates:', error)
    }
  }

  const refreshExchangeRates = async () => {
    setRefreshingRates(true)
    setError(null)

    try {
      const response = await fetch('/api/exchange-rates/refresh', {
        method: 'POST'
      })

      const data = await response.json()

      if (data.success) {
        // Fetch the updated rates
        await fetchExchangeRates()
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 2000)
      } else {
        setError(data.error || 'Failed to refresh rates')
      }
    } catch (error: any) {
      setError(error.message || 'Failed to refresh rates from API')
    } finally {
      setRefreshingRates(false)
    }
  }

  const saveExchangeRates = async () => {
    setSavingRates(true)
    setError(null)

    try {
      const response = await fetch('/api/exchange-rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rates: exchangeRates })
      })

      const data = await response.json()

      if (data.success) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 2000)
      } else {
        setError(data.error || 'Failed to save exchange rates')
      }
    } catch (error: any) {
      setError(error.message || 'Failed to save exchange rates')
    } finally {
      setSavingRates(false)
    }
  }

  const updateExchangeRate = (targetCurrency: string, newRate: number) => {
    setExchangeRates(prev =>
      prev.map(r =>
        r.target_currency === targetCurrency ? { ...r, rate: newRate } : r
      )
    )
  }

  const fetchNotificationPrefs = async () => {
    try {
      const response = await fetch('/api/settings/notifications')
      if (response.ok) {
        const data = await response.json()
        setNotificationPrefs(data)
      }
    } catch (error) {
      console.error('Error fetching notification prefs:', error)
    }
  }

  const savePreferences = async () => {
    setSaving(true)
    setError(null)
  
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        setError('Please sign in to save preferences')
        return
      }
  
      const prefData = {
        user_id: user.id,
        default_cost_mode: userPreferences.default_cost_mode,
        default_tier: userPreferences.default_tier,
        default_margin_percent: userPreferences.default_margin_percent,
        default_currency: userPreferences.default_currency,
        updated_at: new Date().toISOString()
      }
  
      const { error } = await supabase
        .from('user_preferences')
        .upsert(prefData, { 
          onConflict: 'user_id',
          ignoreDuplicates: false 
        })
  
      if (error) throw error
  
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: any) {
      console.error('Error saving preferences:', err)
      setError(err.message || 'Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  // ============================================
  // SAVE HANDLERS
  // ============================================

  const saveProfile = async () => {
    if (!profile) return
    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      })

      if (response.ok) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        throw new Error('Failed to save profile')
      }
    } catch (err) {
      setError('Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const saveEmailSettings = async () => {
    if (!emailSettings) return
    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/settings/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailSettings)
      })

      if (response.ok) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        throw new Error('Failed to save email settings')
      }
    } catch (err) {
      setError('Failed to save email settings')
    } finally {
      setSaving(false)
    }
  }

  const saveNotificationPrefs = async () => {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notificationPrefs)
      })

      if (response.ok) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        throw new Error('Failed to save notification preferences')
      }
    } catch (err) {
      setError('Failed to save notification preferences')
    } finally {
      setSaving(false)
    }
  }

  // Handle avatar upload
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    console.log('Upload triggered, file:', file, 'profile:', profile)
    
    if (!file) {
      console.log('No file selected')
      return
    }
    
    if (!profile?.id) {
      console.log('No profile ID available')
      setError('Profile not loaded. Please refresh the page.')
      return
    }

    setUploadingAvatar(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('userId', profile.id)

      console.log('Uploading to /api/avatar/upload...')
      const response = await fetch('/api/avatar/upload', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()
      console.log('Upload response:', data)

      if (data.success) {
        setProfile(prev => prev ? { ...prev, avatar_url: data.url } : null)
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        setError(data.error || 'Failed to upload avatar')
      }
    } catch (err) {
      console.error('Upload error:', err)
      setError('Failed to upload avatar')
    } finally {
      setUploadingAvatar(false)
    }
  }

  // ============================================
  // RENDER TABS
  // ============================================

  const renderProfileTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Profile Information</h3>
        <p className="text-sm text-gray-500 mt-1">Update your personal information and preferences.</p>
      </div>

      {/* Avatar Section */}
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center overflow-hidden relative">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <User className="w-10 h-10 text-primary-600" />
          )}
          {uploadingAvatar && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            </div>
          )}
        </div>
        <div>
          <input
            type="file"
            id="avatar-upload"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleAvatarUpload}
            className="hidden"
          />
          <label
            htmlFor="avatar-upload"
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer ${uploadingAvatar ? 'opacity-50 pointer-events-none' : ''}`}
          >
            {uploadingAvatar ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Camera className="w-4 h-4" />
                Change Photo
              </>
            )}
          </label>
          <p className="text-xs text-gray-500 mt-1">JPG, PNG up to 2MB</p>
        </div>
      </div>

      {/* Form Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
          <input
            type="text"
            value={profile?.full_name || ''}
            onChange={(e) => setProfile(prev => prev ? { ...prev, full_name: e.target.value } : null)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            placeholder="Your full name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={profile?.email || ''}
            onChange={(e) => setProfile(prev => prev ? { ...prev, email: e.target.value } : null)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            placeholder="your@email.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            value={profile?.phone || ''}
            onChange={(e) => setProfile(prev => prev ? { ...prev, phone: e.target.value } : null)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            placeholder="+20 xxx xxx xxxx"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <input
            type="text"
            value={profile?.role || ''}
            onChange={(e) => setProfile(prev => prev ? { ...prev, role: e.target.value } : null)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            placeholder="Admin, Manager, etc."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
          <select
            value={profile?.timezone || 'Africa/Cairo'}
            onChange={(e) => setProfile(prev => prev ? { ...prev, timezone: e.target.value } : null)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
          >
            {TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
          <input
            type="text"
            value={profile?.company_name || ''}
            onChange={(e) => setProfile(prev => prev ? { ...prev, company_name: e.target.value } : null)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            placeholder="Travel2Egypt"
          />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          onClick={saveProfile}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )

  const renderEmailTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Email Settings</h3>
        <p className="text-sm text-gray-500 mt-1">Configure your email integration and preferences.</p>
      </div>

      {/* Gmail Connection Status */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              emailSettings?.gmail_connected ? 'bg-green-100' : 'bg-gray-200'
            }`}>
              <Mail className={`w-5 h-5 ${emailSettings?.gmail_connected ? 'text-green-600' : 'text-gray-500'}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Gmail Integration</p>
              <p className="text-xs text-gray-500">
                {emailSettings?.gmail_connected 
                  ? `Connected as ${emailSettings.gmail_email}`
                  : 'Not connected'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {emailSettings?.gmail_connected ? (
              <>
                <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                  <CheckCircle className="w-3 h-3" />
                  Connected
                </span>
                <button className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  Disconnect
                </button>
              </>
            ) : (
              <button className="px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors">
                Connect Gmail
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Email Signature */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email Signature</label>
        <textarea
          value={emailSettings?.signature || ''}
          onChange={(e) => setEmailSettings(prev => prev ? { ...prev, signature: e.target.value } : null)}
          rows={5}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
          placeholder="Best regards,&#10;Islam Hussein&#10;Travel2Egypt"
        />
        <p className="text-xs text-gray-500 mt-1">This signature will be added to all outgoing emails.</p>
      </div>

      {/* Auto Reply */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Auto-Reply</p>
            <p className="text-xs text-gray-500">Automatically reply to incoming emails</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={emailSettings?.auto_reply_enabled || false}
              onChange={(e) => setEmailSettings(prev => prev ? { ...prev, auto_reply_enabled: e.target.checked } : null)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#647C47]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#647C47]"></div>
          </label>
        </div>

        {emailSettings?.auto_reply_enabled && (
          <textarea
            value={emailSettings?.auto_reply_message || ''}
            onChange={(e) => setEmailSettings(prev => prev ? { ...prev, auto_reply_message: e.target.value } : null)}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            placeholder="Thank you for your email. We will get back to you within 24 hours..."
          />
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          onClick={saveEmailSettings}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )

  const renderNotificationsTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Notification Preferences</h3>
        <p className="text-sm text-gray-500 mt-1">Choose how you want to receive notifications.</p>
      </div>

      {/* Delivery Methods */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
        <h4 className="text-sm font-medium text-gray-900">Delivery Methods</h4>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-700">Email Notifications</p>
              <p className="text-xs text-gray-500">Receive notifications via email</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={notificationPrefs.email_enabled}
              onChange={(e) => setNotificationPrefs(prev => ({ ...prev, email_enabled: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#647C47]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#647C47]"></div>
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-700">In-App Notifications</p>
              <p className="text-xs text-gray-500">Show notifications in the app</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={notificationPrefs.in_app_enabled}
              onChange={(e) => setNotificationPrefs(prev => ({ ...prev, in_app_enabled: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#647C47]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#647C47]"></div>
          </label>
        </div>
      </div>

      {/* Notification Types */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-900">Task Notifications</h4>
        
        {[
          { key: 'task_assigned', label: 'Task Assigned', desc: 'When a task is assigned to you', icon: '📋' },
          { key: 'task_due_soon', label: 'Task Due Soon', desc: 'Reminder 24 hours before due date', icon: '⏰' },
          { key: 'task_overdue', label: 'Task Overdue', desc: 'When a task passes its due date', icon: '🚨' },
          { key: 'task_completed', label: 'Task Completed', desc: 'When a task you created is completed', icon: '✅' },
        ].map(item => (
          <div key={item.key} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
            <div className="flex items-center gap-3">
              <span className="text-lg">{item.icon}</span>
              <div>
                <p className="text-sm font-medium text-gray-700">{item.label}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notificationPrefs[item.key as keyof NotificationPreference] as boolean}
                onChange={(e) => setNotificationPrefs(prev => ({ ...prev, [item.key]: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#647C47]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#647C47]"></div>
            </label>
          </div>
        ))}
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          onClick={saveNotificationPrefs}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )

  const renderPreferencesTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Itinerary Preferences</h3>
        <p className="text-sm text-gray-500 mt-1">Configure default settings for itineraries and pricing.</p>
      </div>

      {/* Cost Mode Setting */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <Calculator className="w-5 h-5 text-blue-600" />
          <h4 className="text-sm font-bold text-gray-900">Cost Calculation Mode</h4>
        </div>
        
        <p className="text-xs text-gray-600 mb-4">
          Choose how costs are calculated for new itineraries. You can override this per itinerary.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {COST_MODE_OPTIONS.map((option) => {
            const Icon = option.icon
            const isSelected = userPreferences.default_cost_mode === option.value
            
            return (
              <button
                key={option.value}
                onClick={() => setUserPreferences(prev => ({ ...prev, default_cost_mode: option.value as 'auto' | 'manual' }))}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  isSelected
                    ? 'border-[#647C47] bg-[#647C47]/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-2 rounded-lg ${isSelected ? 'bg-[#647C47]/10' : 'bg-gray-100'}`}>
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-[#647C47]' : 'text-gray-500'}`} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                      {option.label}
                    </span>
                    {isSelected && (
                      <span className="px-2 py-0.5 bg-[#647C47]/10 text-[#647C47] text-xs rounded-full font-medium">
                        Default
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-500 ml-11">{option.description}</p>
              </button>
            )
          })}
        </div>

        {userPreferences.default_cost_mode === 'manual' && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Manual Mode Selected</p>
                <p className="text-xs text-amber-700 mt-1">
                  New itineraries will have editable cost fields. Auto-calculated values will be pre-filled as a starting point.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Default Tier Setting */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <Crown className="w-5 h-5 text-amber-600" />
          <h4 className="text-sm font-bold text-gray-900">Default Service Tier</h4>
        </div>
        
        <p className="text-xs text-gray-600 mb-4">
          Set the default tier for new itineraries. AI will select suppliers matching this tier.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {TIER_OPTIONS.map((tier) => {
            const isSelected = userPreferences.default_tier === tier.value
            
            return (
              <button
                key={tier.value}
                onClick={() => setUserPreferences(prev => ({ ...prev, default_tier: tier.value }))}
                className={`p-3 rounded-lg border-2 text-center transition-all ${
                  isSelected
                    ? tier.value === 'luxury'
                      ? 'border-amber-500 bg-amber-50'
                      : tier.value === 'deluxe'
                      ? 'border-purple-500 bg-purple-50'
                      : tier.value === 'standard'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-500 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-center gap-1 mb-1">
                  {tier.value === 'luxury' && <Crown className="w-4 h-4 text-amber-600" />}
                  <span className={`text-sm font-semibold ${
                    isSelected ? 'text-gray-900' : 'text-gray-700'
                  }`}>
                    {tier.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{tier.description}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Default Margin Setting */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">💰</span>
          <h4 className="text-sm font-bold text-gray-900">Default Profit Margin</h4>
        </div>
        
        <p className="text-xs text-gray-600 mb-4">
          Set the default margin percentage applied to supplier costs.
        </p>

        <div className="flex items-center gap-4">
          <input
            type="range"
            min="0"
            max="50"
            step="5"
            value={userPreferences.default_margin_percent}
            onChange={(e) => setUserPreferences(prev => ({ ...prev, default_margin_percent: parseInt(e.target.value) }))}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#647C47]"
          />
          <div className="w-20 text-center">
            <span className="text-2xl font-bold text-[#647C47]">{userPreferences.default_margin_percent}%</span>
          </div>
        </div>

        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
        </div>
      </div>

      {/* Default Currency Setting */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">💱</span>
          <h4 className="text-sm font-bold text-gray-900">Default Currency</h4>
        </div>
        
        <p className="text-xs text-gray-600 mb-4">
          Set the default currency for new itineraries and pricing.
        </p>

        <div className="flex gap-2">
          {['EUR', 'USD', 'GBP', 'EGP'].map((currency) => {
            const isSelected = userPreferences.default_currency === currency
            const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', EGP: 'E£' }

            return (
              <button
                key={currency}
                onClick={() => setUserPreferences(prev => ({ ...prev, default_currency: currency }))}
                className={`px-4 py-2 rounded-lg border-2 font-medium transition-all ${
                  isSelected
                    ? 'border-[#647C47] bg-[#647C47]/5 text-[#647C47]'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                {symbols[currency]} {currency}
              </button>
            )
          })}
        </div>
      </div>

      {/* Exchange Rates */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <h4 className="text-sm font-bold text-gray-900">Exchange Rates</h4>
          </div>
          <div className="flex items-center gap-2">
            {lastApiFetch && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Wifi className="w-3 h-3" />
                Updated {new Date(lastApiFetch).toLocaleDateString()}
              </span>
            )}
            <button
              type="button"
              onClick={refreshExchangeRates}
              disabled={refreshingRates}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#647C47] bg-[#647C47]/10 rounded-lg hover:bg-[#647C47]/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${refreshingRates ? 'animate-spin' : ''}`} />
              {refreshingRates ? 'Refreshing...' : 'Refresh from API'}
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-600 mb-4">
          Rates are fetched automatically from ExchangeRate-API. You can override with custom rates below.
        </p>

        <div className="space-y-3">
          {exchangeRates.map((rate) => {
            const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', EGP: 'E£' }
            const names: Record<string, string> = {
              EUR: 'Euro',
              USD: 'US Dollar',
              GBP: 'British Pound',
              EGP: 'Egyptian Pound'
            }
            const isApiRate = rate.is_system_rate && !rate.is_override

            return (
              <div key={rate.target_currency} className="flex items-center gap-3 bg-white p-3 rounded-lg border border-gray-100">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-medium">{symbols[rate.target_currency]}</span>
                    <span className="text-sm font-medium text-gray-900">{rate.target_currency}</span>
                    <span className="text-xs text-gray-400">({names[rate.target_currency]})</span>
                    {isApiRate ? (
                      <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">API</span>
                    ) : rate.is_override ? (
                      <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">Custom</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">1 EUR = {rate.rate.toFixed(4)} {rate.target_currency}</p>
                </div>
                <div className="w-32">
                  <input
                    type="number"
                    value={rate.rate}
                    onChange={(e) => updateExchangeRate(rate.target_currency, parseFloat(e.target.value) || 0)}
                    step="0.0001"
                    min="0"
                    aria-label={`Exchange rate for ${rate.target_currency}`}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] text-right"
                  />
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Edit rates above to create custom overrides
          </p>
          <button
            type="button"
            onClick={saveExchangeRates}
            disabled={savingRates}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
          >
            {savingRates ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {savingRates ? 'Saving...' : 'Save Custom Rates'}
          </button>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          onClick={savePreferences}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
          <Settings className="w-5 h-5 text-gray-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">Manage your account and preferences</p>
        </div>
      </div>

      {/* Success Toast */}
      {saveSuccess && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg shadow-lg animate-in slide-in-from-top">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-medium">Settings saved successfully!</span>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg shadow-lg">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm font-medium">{error}</span>
          <button onClick={() => setError(null)} className="ml-2 p-1 hover:bg-red-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content Card */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex overflow-x-auto">
            {TABS.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`
                    flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors
                    ${isActive 
                      ? 'border-[#647C47] text-[#647C47]' 
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
            </div>
          ) : (
            <>
              {activeTab === 'profile' && renderProfileTab()}
              {activeTab === 'email' && renderEmailTab()}
              {activeTab === 'notifications' && renderNotificationsTab()}
              {activeTab === 'preferences' && renderPreferencesTab()}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================
// EXPORT WITH SUSPENSE BOUNDARY
// ============================================

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
      </div>
    }>
      <SettingsContent />
    </Suspense>
  )
}