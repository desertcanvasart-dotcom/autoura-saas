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
  Activity,
} from 'lucide-react'
import Image from 'next/image'
import { SUPPORTED_CURRENCIES } from '@/lib/currency'

const supabase = createClient()

export default function TenantSettingsPage() {
  const { tenant, tenantMember, features, isAdmin, loading, refetchTenant } = useTenant()

  // Tenant basic info state
  const [companyName, setCompanyName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [workspaceMode, setWorkspaceMode] = useState<'b2c' | 'b2b' | 'both'>('both')

  // Feature toggles state
  const [whatsappIntegration, setWhatsappIntegration] = useState(true)
  const [emailIntegration, setEmailIntegration] = useState(true)
  const [pdfGeneration, setPdfGeneration] = useState(true)
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true)

  // Branding state
  const [primaryColor, setPrimaryColor] = useState('#647C47')
  const [secondaryColor, setSecondaryColor] = useState('#10B981')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Team Activity (tenant_features.activity_summary_enabled) state.
  // Interactive, unlike the plan-controlled Features card: an admin opts the
  // workspace in after attesting the team has been informed.
  const [activityEnabled, setActivityEnabled] = useState(false)
  const [activityEnableRequested, setActivityEnableRequested] = useState(false)
  const [activityInformedConfirmed, setActivityInformedConfirmed] = useState(false)
  const [activitySaving, setActivitySaving] = useState(false)

  // UI state
  // Kept as a STRING so the field can be genuinely empty. '' means "no house
  // rate set" and saves as NULL, which lib/pricing/resolve-margin.ts treats as
  // "fall through to the platform constant". A number state would force 0 —
  // and 0 is a real house rate (an at-cost agency), not an absence.
  const [defaultMargin, setDefaultMargin] = useState('')
  // The org's deposit rule (mig 325): blank = the defaults (30% / 7 days).
  const [depositPercent, setDepositPercent] = useState('')
  const [depositDueDays, setDepositDueDays] = useState('')
  // Run currency (C3.4): '' = EUR default. Reinterprets stored rate amounts;
  // the field warns about that.
  const [ratesCurrency, setRatesCurrency] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Load tenant and features data
  useEffect(() => {
    if (tenant) {
      setCompanyName(tenant.company_name)
      setContactEmail(tenant.contact_email || '')
      setLogoUrl(tenant.logo_url || null)
      setLogoPreview(tenant.logo_url || null)
      setPrimaryColor(tenant.primary_color || '#647C47')
      setSecondaryColor(tenant.secondary_color || '#2d3b2d')
      // `?? ''` not `|| ''`: a stored 0 must show as 0, not as blank.
      setDefaultMargin(
        tenant.default_margin_percent === null || tenant.default_margin_percent === undefined
          ? ''
          : String(tenant.default_margin_percent)
      )
      const t = tenant as { deposit_percent?: number | null; deposit_due_days?: number | null }
      setDepositPercent(t.deposit_percent === null || t.deposit_percent === undefined ? '' : String(t.deposit_percent))
      setDepositDueDays(t.deposit_due_days === null || t.deposit_due_days === undefined ? '' : String(t.deposit_due_days))
      // Workspace visibility is a tenant preference, free on every tier —
      // no longer derived from feature flags, which read like entitlements.
      setWorkspaceMode(tenant.workspace_mode ?? 'both')
      setRatesCurrency((tenant as { rates_currency?: string | null }).rates_currency || '')
    }

    if (features) {
      setWhatsappIntegration(features.whatsapp_integration)
      setEmailIntegration(features.email_integration)
      setPdfGeneration(features.pdf_generation)
      setAnalyticsEnabled(features.analytics_enabled)
      // column lands with migration 267; types regen follows
      setActivityEnabled((features as any)?.activity_summary_enabled === true)
    }
  }, [tenant, features])

  const saveActivitySummary = async (enabled: boolean) => {
    setActivitySaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/settings/activity-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          enabled ? { enabled: true, confirmed_informed: true } : { enabled: false }
        ),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update setting')
      }
      setActivityEnabled(data.enabled === true)
      setActivityEnableRequested(false)
      setActivityInformedConfirmed(false)
      setMessage({
        type: 'success',
        text: enabled
          ? `Enabled — ${data.notified} team members notified in-app`
          : 'Activity summaries disabled.',
      })
      await refetchTenant()
    } catch (error: any) {
      console.error('Error updating activity summaries:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to update setting' })
    } finally {
      setActivitySaving(false)
    }
  }

  const handleActivityToggle = (checked: boolean) => {
    if (checked) {
      // Enabling needs the informed-team confirmation first — reveal it.
      setActivityEnableRequested(true)
    } else if (activityEnabled) {
      // Disabling needs no confirmation.
      saveActivitySummary(false)
    } else {
      // The admin backed out of an unconfirmed enable.
      setActivityEnableRequested(false)
      setActivityInformedConfirmed(false)
    }
  }

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

      // Identity AND branding live on tenants — one table, one write.
      // (Colors used to go to tenant_features while the PDF generators read
      // tenants.primary_color, so every document rendered the default blue
      // no matter what was picked here. Migration 255 consolidated this.)
      const { error: tenantError } = await supabase
        .from('tenants')
        .update({
          company_name: companyName,
          contact_email: contactEmail,
          logo_url: finalLogoUrl,
          workspace_mode: workspaceMode,
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          // Empty field -> NULL -> the resolver falls through to the platform
          // constant. Storing 0 here would silently make every quote at-cost.
          default_margin_percent: defaultMargin.trim() === '' ? null : Number(defaultMargin),
          // Blank -> NULL -> resolveDepositRule falls back to the defaults.
          deposit_percent: depositPercent.trim() === '' ? null : Number(depositPercent),
          deposit_due_days: depositDueDays.trim() === '' ? null : Number(depositDueDays),
          ...(ratesCurrency || (tenant as { rates_currency?: string | null }).rates_currency
            ? { rates_currency: ratesCurrency || null }
            : {}),
        })
        .eq('id', tenant.id)

      if (tenantError) throw tenantError

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

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                House Margin %
                <span className="ml-1.5 text-[10px] text-gray-400 font-normal">(Applies to anyone without a personal margin)</span>
              </label>
              <input
                type="number"
                min="0"
                max="200"
                step="0.5"
                value={defaultMargin}
                onChange={(e) => setDefaultMargin(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                placeholder="Not set — uses 25%"
              />
              <p className="mt-1 text-[10px] text-gray-400">
                Leave blank to use the platform default. A colleague who clears their own
                margin falls back to this.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Deposit %
                <span className="ml-1.5 text-[10px] text-gray-400 font-normal">(New bookings)</span>
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={depositPercent}
                onChange={(e) => setDepositPercent(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                placeholder="Not set — uses 30%"
              />
              <p className="mt-1 text-[10px] text-gray-400">
                Applied when a confirmed itinerary creates its booking.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Deposit due within (days)
              </label>
              <input
                type="number"
                min="0"
                max="365"
                step="1"
                value={depositDueDays}
                onChange={(e) => setDepositDueDays(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                placeholder="Not set — uses 7"
              />
              <p className="mt-1 text-[10px] text-gray-400">
                Days from booking creation until the deposit deadline.
              </p>
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Workspaces
              <span className="ml-1.5 text-[10px] text-gray-400 font-normal">(Your choice &mdash; included on every plan)</span>
            </label>
            <select
              value={workspaceMode}
              onChange={(e) => setWorkspaceMode(e.target.value as 'b2c' | 'b2b' | 'both')}
              disabled={!isAdmin}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="both">Direct clients and partners (B2C + B2B)</option>
              <option value="b2c">Direct clients only (B2C)</option>
              <option value="b2b">Partners only (B2B)</option>
            </select>
            <p className="mt-1.5 text-[11px] text-gray-500">
              Hiding a workspace only tidies the sidebar. Every record stays reachable by link,
              in search and in reports.
            </p>
          </div>

          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Rates currency
            </label>
            <select
              value={ratesCurrency}
              onChange={(e) => setRatesCurrency(e.target.value)}
              disabled={!isAdmin}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="">EUR (default)</option>
              {SUPPORTED_CURRENCIES.filter(c => c !== 'EUR').map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-gray-500">
              The currency all your stored rates are read in and pricing runs in. Individual
              rates entered in another currency (the per-rate selector) are converted into
              this one automatically. Changing this does NOT convert existing numbers — it
              reinterprets them, so set it before entering rates.
            </p>
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

            <p className="text-xs text-gray-600">
              Your seat, quote and partner limits come from your plan, alongside
              how much of each you have used this period.
            </p>
            <Link
              href="/settings/billing/usage"
              className="mt-3 inline-flex items-center gap-1 text-xs text-[#647C47] hover:text-[#4f613a] font-medium"
            >
              <FileText className="w-3 h-3" />
              View limits and usage
            </Link>

            <Link
              href="/settings/billing/plans"
              className="mt-3 inline-flex items-center gap-1 text-xs text-[#647C47] hover:text-[#4f613a] font-medium"
            >
              <FileText className="w-3 h-3" />
              Upgrade plan for higher limits
            </Link>
          </div>
        </div>

        {/* Team Activity */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-600" />
              <h2 className="text-sm font-semibold text-gray-900">Team Activity</h2>
            </div>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                activityEnabled ? 'text-green-700 bg-green-50' : 'text-gray-400 bg-gray-100'
              }`}
            >
              {activityEnabled ? 'On' : 'Off'}
            </span>
          </div>

          <p className="text-xs text-gray-600 mb-3">
            Activity Summaries show admins and managers each team member&apos;s last login,
            last seen, approximate focused time, and work counts. Every member can always
            see their own summary.
          </p>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={activityEnabled || activityEnableRequested}
              onChange={(e) => handleActivityToggle(e.target.checked)}
              disabled={activitySaving}
              className="w-3.5 h-3.5 text-[#647C47] border-gray-300 rounded focus:ring-[#647C47]"
            />
            <span className="text-xs text-gray-700">
              {activitySaving && !activityEnableRequested
                ? 'Updating...'
                : 'Enable Activity Summaries'}
            </span>
          </label>

          {!activityEnabled && activityEnableRequested && (
            <div className="mt-3 pl-5 space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activityInformedConfirmed}
                  onChange={(e) => setActivityInformedConfirmed(e.target.checked)}
                  className="mt-0.5 w-3.5 h-3.5 text-[#647C47] border-gray-300 rounded focus:ring-[#647C47]"
                />
                <span className="text-xs text-gray-700">
                  My team has been informed that activity summaries will be visible
                </span>
              </label>
              <button
                type="button"
                onClick={() => saveActivitySummary(true)}
                disabled={!activityInformedConfirmed || activitySaving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#647C47] text-white text-xs font-medium rounded-lg hover:bg-[#4f613a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {activitySaving ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Enabling...
                  </>
                ) : (
                  'Enable'
                )}
              </button>
            </div>
          )}

          <p className="mt-3 text-[11px] text-gray-400">
            Activity reflects work inside Autoura only. Phone calls, meetings, and off-app
            work are not captured.
          </p>
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
