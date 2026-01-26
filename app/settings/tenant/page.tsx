'use client'

import { useState, useEffect, useRef } from 'react'
import { useTenant } from '@/app/contexts/TenantContext'
import { createClient } from '@/app/supabase'
import Link from 'next/link'
import {
  Building2,
  Save,
  AlertCircle,
  CheckCircle2,
  Palette,
  ArrowLeft,
  Upload,
  X,
  Image as ImageIcon,
  Loader2,
  Settings as SettingsIcon,
  Users,
  FileText,
  Building,
} from 'lucide-react'
import Image from 'next/image'

const supabase = createClient()

export default function TenantSettingsPage() {
  const { tenant, tenantMember, features, isAdmin, loading, refetchTenant } = useTenant()

  // Tenant basic info state
  const [companyName, setCompanyName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [businessType, setBusinessType] = useState<'b2c_only' | 'b2b_only' | 'b2c_and_b2b'>('b2c_and_b2b')

  // Feature toggles state
  const [b2cEnabled, setB2cEnabled] = useState(true)
  const [b2bEnabled, setB2bEnabled] = useState(true)
  const [whatsappIntegration, setWhatsappIntegration] = useState(true)
  const [emailIntegration, setEmailIntegration] = useState(true)
  const [pdfGeneration, setPdfGeneration] = useState(true)
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true)

  // Limits state
  const [maxUsers, setMaxUsers] = useState(10)
  const [maxQuotesPerMonth, setMaxQuotesPerMonth] = useState(1000)
  const [maxPartners, setMaxPartners] = useState(100)

  // Branding state
  const [primaryColor, setPrimaryColor] = useState('#647C47')
  const [secondaryColor, setSecondaryColor] = useState('#10B981')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // UI state
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Load tenant and features data
  useEffect(() => {
    if (tenant) {
      setCompanyName(tenant.company_name)
      setContactEmail(tenant.contact_email || '')
      setLogoUrl(tenant.logo_url || null)
      setLogoPreview(tenant.logo_url || null)
    }

    if (features) {
      setB2cEnabled(features.b2c_enabled)
      setB2bEnabled(features.b2b_enabled)
      setWhatsappIntegration(features.whatsapp_integration)
      setEmailIntegration(features.email_integration)
      setPdfGeneration(features.pdf_generation)
      setAnalyticsEnabled(features.analytics_enabled)
      setMaxUsers(features.max_users)
      setMaxQuotesPerMonth(features.max_quotes_per_month)
      setMaxPartners(features.max_partners)
      setPrimaryColor(features.primary_color)
      setSecondaryColor(features.secondary_color)

      // Derive business type from feature flags (controlled by pricing tier)
      if (features.b2c_enabled && features.b2b_enabled) {
        setBusinessType('b2c_and_b2b')
      } else if (features.b2c_enabled && !features.b2b_enabled) {
        setBusinessType('b2c_only')
      } else if (!features.b2c_enabled && features.b2b_enabled) {
        setBusinessType('b2b_only')
      }

    }
  }, [tenant, features])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please select an image file' })
      return
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image must be less than 2MB' })
      return
    }

    setLogoFile(file)

    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setLogoPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveLogo = () => {
    setLogoFile(null)
    setLogoPreview(null)
    setLogoUrl(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile || !tenant) return logoUrl

    setUploading(true)
    try {
      const fileExt = logoFile.name.split('.').pop()
      const fileName = `${tenant.id}-${Date.now()}.${fileExt}`

      const { data, error } = await supabase.storage
        .from('tenant-logos')
        .upload(fileName, logoFile, {
          cacheControl: '3600',
          upsert: false
        })

      if (error) throw error

      const { data: { publicUrl } } = supabase.storage
        .from('tenant-logos')
        .getPublicUrl(fileName)

      return publicUrl
    } catch (error) {
      console.error('Error uploading logo:', error)
      setMessage({ type: 'error', text: 'Failed to upload logo' })
      return logoUrl
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!tenant || !features || !isAdmin) return

    setSaving(true)
    setMessage(null)

    try {
      // Upload logo if a new one was selected
      let finalLogoUrl = logoUrl
      if (logoFile) {
        finalLogoUrl = await uploadLogo()
      }

      // Update tenant basic info
      const { error: tenantError } = await supabase
        .from('tenants')
        .update({
          company_name: companyName,
          contact_email: contactEmail,
          logo_url: finalLogoUrl,
        })
        .eq('id', tenant.id)

      if (tenantError) throw tenantError

      // Update tenant branding only (features and limits are controlled by pricing tier)
      const { error: featuresError } = await supabase
        .from('tenant_features')
        .update({
          primary_color: primaryColor,
          secondary_color: secondaryColor,
        })
        .eq('tenant_id', tenant.id)

      if (featuresError) throw featuresError

      // Refetch tenant data
      await refetchTenant()

      setMessage({ type: 'success', text: 'Settings saved successfully!' })
    } catch (error: any) {
      console.error('Error saving settings:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  // Show loading state while fetching tenant data
  if (loading || !tenant || !features) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <h1 className="text-lg font-semibold text-gray-900">Organization Settings</h1>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-[#647C47] animate-spin" />
        </div>
      </div>
    )
  }

  // Only show access denied AFTER we've confirmed the user's role is loaded
  if (tenantMember && !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <h1 className="text-lg font-semibold text-gray-900">Organization Settings</h1>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-yellow-900">Access Denied</h3>
              <p className="text-xs text-yellow-700 mt-0.5">
                Only owners and admins can access tenant settings.
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 mb-2"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to Settings
          </Link>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#647C47]/10 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-[#647C47]" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Organization Settings</h1>
                <p className="text-xs text-gray-500">Manage your company profile and branding</p>
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || uploading || !companyName}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#647C47] text-white text-xs font-medium rounded-lg hover:bg-[#4f613a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Uploading...
                </>
              ) : saving ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-3 h-3" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {/* Message */}
        {message && (
          <div
            className={`rounded-lg p-3 flex items-start gap-2 ${
              message.type === 'success'
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <p
              className={`text-xs ${
                message.type === 'success' ? 'text-green-800' : 'text-red-800'
              }`}
            >
              {message.text}
            </p>
          </div>
        )}

        {/* Basic Information */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Building className="w-4 h-4 text-gray-600" />
            <h2 className="text-sm font-semibold text-gray-900">Basic Information</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Company Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                placeholder="Your Company Name"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Contact Email
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                placeholder="contact@company.com"
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Business Type
              <span className="ml-1.5 text-[10px] text-gray-400 font-normal">(Set by pricing tier)</span>
            </label>
            <select
              value={businessType}
              disabled
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
            >
              <option value="b2c_only">B2C Only</option>
              <option value="b2b_only">B2B Only</option>
              <option value="b2c_and_b2b">B2C and B2B</option>
            </select>
          </div>
        </div>

        {/* Features & Limits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Features */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <SettingsIcon className="w-4 h-4 text-gray-600" />
                <h2 className="text-sm font-semibold text-gray-900">Features</h2>
              </div>
              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Plan controlled</span>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-not-allowed opacity-60">
                <input
                  type="checkbox"
                  checked={b2cEnabled}
                  disabled
                  className="w-3.5 h-3.5 text-[#647C47] border-gray-300 rounded cursor-not-allowed"
                />
                <span className="text-xs text-gray-700">B2C Quotes</span>
              </label>

              <label className="flex items-center gap-2 cursor-not-allowed opacity-60">
                <input
                  type="checkbox"
                  checked={b2bEnabled}
                  disabled
                  className="w-3.5 h-3.5 text-[#647C47] border-gray-300 rounded cursor-not-allowed"
                />
                <span className="text-xs text-gray-700">B2B Quotes</span>
              </label>

              <label className="flex items-center gap-2 cursor-not-allowed opacity-60">
                <input
                  type="checkbox"
                  checked={whatsappIntegration}
                  disabled
                  className="w-3.5 h-3.5 text-[#647C47] border-gray-300 rounded cursor-not-allowed"
                />
                <span className="text-xs text-gray-700">WhatsApp Integration</span>
              </label>

              <label className="flex items-center gap-2 cursor-not-allowed opacity-60">
                <input
                  type="checkbox"
                  checked={emailIntegration}
                  disabled
                  className="w-3.5 h-3.5 text-[#647C47] border-gray-300 rounded cursor-not-allowed"
                />
                <span className="text-xs text-gray-700">Email Integration</span>
              </label>

              <label className="flex items-center gap-2 cursor-not-allowed opacity-60">
                <input
                  type="checkbox"
                  checked={pdfGeneration}
                  disabled
                  className="w-3.5 h-3.5 text-[#647C47] border-gray-300 rounded cursor-not-allowed"
                />
                <span className="text-xs text-gray-700">PDF Generation</span>
              </label>

              <label className="flex items-center gap-2 cursor-not-allowed opacity-60">
                <input
                  type="checkbox"
                  checked={analyticsEnabled}
                  disabled
                  className="w-3.5 h-3.5 text-[#647C47] border-gray-300 rounded cursor-not-allowed"
                />
                <span className="text-xs text-gray-700">Analytics</span>
              </label>
            </div>
          </div>

          {/* Limits */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-600" />
                <h2 className="text-sm font-semibold text-gray-900">Limits</h2>
              </div>
              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Plan controlled</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-xs text-gray-600">Max Users</span>
                <span className="text-xs font-medium text-gray-900">{maxUsers >= 9999 ? 'Unlimited' : maxUsers}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-xs text-gray-600">Quotes/Month</span>
                <span className="text-xs font-medium text-gray-900">{maxQuotesPerMonth >= 9999 ? 'Unlimited' : maxQuotesPerMonth.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-gray-600">Max Partners</span>
                <span className="text-xs font-medium text-gray-900">{maxPartners >= 9999 ? 'Unlimited' : maxPartners}</span>
              </div>
            </div>

            <Link
              href="/settings/billing/plans"
              className="mt-3 inline-flex items-center gap-1 text-xs text-[#647C47] hover:text-[#4f613a] font-medium"
            >
              <FileText className="w-3 h-3" />
              Upgrade plan for higher limits
            </Link>
          </div>
        </div>

        {/* Branding */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Palette className="w-4 h-4 text-gray-600" />
            <h2 className="text-sm font-semibold text-gray-900">Branding</h2>
          </div>

          {/* Logo Upload */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Company Logo
            </label>
            <p className="text-[10px] text-gray-400 mb-2">
              Recommended: Square image (500x500px), PNG or SVG. Max 2MB
            </p>

            {!logoPreview ? (
              <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <ImageIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Upload className="w-3 h-3" />
                  Upload Logo
                </button>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="relative w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                    <Image
                      src={logoPreview}
                      alt="Logo preview"
                      fill
                      className="object-contain p-1.5"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">
                      {logoFile?.name || 'Current logo'}
                    </p>
                    {logoFile && (
                      <p className="text-[10px] text-gray-500">
                        {(logoFile.size / 1024).toFixed(1)} KB
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="inline-flex items-center gap-1 mt-1 text-xs text-red-600 hover:text-red-700 font-medium"
                    >
                      <X className="w-3 h-3" />
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Primary Color
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-10 h-8 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] font-mono"
                  placeholder="#647C47"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Secondary Color
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="w-10 h-8 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] font-mono"
                  placeholder="#10B981"
                />
              </div>
            </div>
          </div>

          {/* Color Preview */}
          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-2">Preview</p>
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg shadow-sm"
                style={{ backgroundColor: primaryColor }}
              />
              <div
                className="w-8 h-8 rounded-lg shadow-sm"
                style={{ backgroundColor: secondaryColor }}
              />
              <div className="ml-2 text-xs text-gray-600">
                Primary & Secondary colors
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
