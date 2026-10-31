'use client'
import CompanyDataCard from '@/components/account/CompanyDataCard'

import { TIMEZONES } from '@/lib/timezones'
import { useState, useEffect, useRef } from 'react'
import { useTenant } from '@/app/contexts/TenantContext'
import { createClient } from '@/app/supabase'
import Link from 'next/link'
import {
  Save,
  AlertCircle,
  CheckCircle2,
  Palette,
  Upload,
  X,
  Image as ImageIcon,
  Loader2,

  Users,
  FileText,
  Building,
  Activity,
} from 'lucide-react'
import Image from 'next/image'
import { SUPPORTED_CURRENCIES } from '@/lib/currency'
import { identityFromTenant } from '@/lib/company-identity'
import { DocumentFooter } from '@/components/documents/Letterhead'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { LOGO_ACCEPT, logoFileProblem } from '@/lib/logo-file'

const supabase = createClient()

const LETTERHEAD_LABELS: Record<string, string> = {
  tagline: 'Tagline', company_phone: 'Phone', company_website: 'Website', company_address: 'Address',
  license_number: 'Tourism license no.', tax_number: 'Tax / registration no.', document_footer_text: 'Footer note',
}

/** PostgREST / Postgres saying one of `columns` does not exist on the table. */
function isMissingColumnError(err: { code?: string; message?: string }, columns: string[]): boolean {
  const msg = err.message || ''
  if (err.code !== 'PGRST204' && err.code !== '42703' && !/schema cache|does not exist/i.test(msg)) return false
  return columns.some(c => msg.includes(c))
}

export default function TenantSettingsPage() {
  const dialog = useConfirmDialog()
  const { tenant, tenantMember, features, isAdmin, loading, refetchTenant } = useTenant()

  // Tenant basic info state
  const [companyName, setCompanyName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  // Document letterhead & footer (migration 394; phone/website/tagline are
  // older columns that had no field here). Blank = the line is omitted.
  const [tagline, setTagline] = useState('')
  const [companyPhone, setCompanyPhone] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [companyAddress, setCompanyAddress] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')
  const [taxNumber, setTaxNumber] = useState('')
  const [footerText, setFooterText] = useState('')


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
  // The minimum margin (mig 399), same measure as the house margin. '' = none:
  // no below-minimum warning on itineraries.
  const [minMargin, setMinMargin] = useState('')
  // The org's deposit rule (mig 325): blank = the defaults (30% / 7 days).
  const [depositPercent, setDepositPercent] = useState('')
  const [depositDueDays, setDepositDueDays] = useState('')
  // What travel contracts name (mig 403): '' = no country / the operator's
  // own country's law (lib/contract-terms.ts).
  const [operatingCountry, setOperatingCountry] = useState('')
  const [companyTimezone, setCompanyTimezone] = useState('')
  const [governingLaw, setGoverningLaw] = useState('')
  // Run currency (C3.4): '' = EUR default. Reinterprets stored rate amounts;
  // the field warns about that.
  const [ratesCurrency, setRatesCurrency] = useState('')
  // The company's own currency: invoices, commissions, P&L and the default
  // for new quotes. Only onboarding could set it, so a skipped onboarding or
  // a currency it did not list left the company in EUR for good.
  const [agencyCurrency, setAgencyCurrency] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Load tenant and features data
  useEffect(() => {
    if (tenant) {
      setCompanyName(tenant.company_name)
      setContactEmail(tenant.contact_email || '')
      setTagline(tenant.tagline || '')
      setCompanyPhone(tenant.company_phone || '')
      setCompanyWebsite(tenant.company_website || '')
      setCompanyAddress(tenant.company_address || '')
      setLicenseNumber(tenant.license_number || '')
      setTaxNumber(tenant.tax_number || '')
      setFooterText(tenant.document_footer_text || '')
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
      const mm = tenant.min_margin_percent
      setMinMargin(mm === null || mm === undefined ? '' : String(mm))
      const t = tenant as { deposit_percent?: number | null; deposit_due_days?: number | null }
      setDepositPercent(t.deposit_percent === null || t.deposit_percent === undefined ? '' : String(t.deposit_percent))
      setDepositDueDays(t.deposit_due_days === null || t.deposit_due_days === undefined ? '' : String(t.deposit_due_days))
      setRatesCurrency((tenant as { rates_currency?: string | null }).rates_currency || '')
      setAgencyCurrency(tenant.default_currency || '')
      setOperatingCountry(tenant.operating_country || '')
      setCompanyTimezone(tenant.timezone || '')
      setGoverningLaw(tenant.contract_governing_law || '')
    }

    if (features) {
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

    // PNG or JPEG, at most 2MB (lib/logo-file.ts).
    const problem = logoFileProblem(file)
    if (problem) {
      setMessage({ type: 'error', text: problem })
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
      // null = the upload failed; the save stops and says so (it carried
      // on and replaced this message with "Settings saved successfully!").
      return null
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!tenant || !features || !isAdmin) return

    setMessage(null)

    // Checked here: this page writes the row directly, and the boxes' min and
    // max were never enforced — a -5% house margin or a 999% deposit saved.
    const num = (v: string) => (v.trim() === '' ? null : Number(v))
    const pct = (v: string) => { const n = num(v); return n === null || (Number.isFinite(n) && n >= 0 && n <= 100) }
    const problems: string[] = []
    if (!pct(defaultMargin)) problems.push('House margin is a percentage from 0 to 100')
    if (!pct(minMargin)) problems.push('Minimum margin is a percentage from 0 to 100')
    const house = num(defaultMargin), floor = num(minMargin)
    if (house !== null && floor !== null && floor > house) problems.push('The minimum margin cannot be above the markup (Settings › Pricing defaults)')
    if (!pct(depositPercent)) problems.push('Deposit is a percentage from 0 to 100')
    const due = num(depositDueDays)
    if (due !== null && !(Number.isInteger(due) && due >= 0 && due <= 365)) problems.push('Deposit due days is a whole number from 0 to 365')
    for (const [label, c] of [['Primary colour', primaryColor], ['Secondary colour', secondaryColor]] as const) {
      if (c && !/^#[0-9a-fA-F]{6}$/.test(c)) problems.push(`${label} must be a hex colour like #647C47`)
    }
    if (problems.length) {
      setMessage({ type: 'error', text: problems.join('. ') + '.' })
      return
    }
    // The rates currency reinterprets every stored rate: confirm it.
    const storedRates = (tenant as { rates_currency?: string | null }).rates_currency || ''
    if ((ratesCurrency || '') !== storedRates) {
      const ok = await dialog.confirm({
        title: 'Change the rates currency?',
        message: `Every stored rate will be read as ${ratesCurrency || 'EUR'} instead of ${storedRates || 'EUR'}. The amounts are not converted. Continue?`,
        variant: 'warning',
        confirmText: 'Change it',
      })
      if (!ok) return
    }

    setSaving(true)
    try {
      // Upload logo if a new one was selected
      let finalLogoUrl = logoUrl
      if (logoFile) {
        const uploaded = await uploadLogo()
        if (!uploaded) {
          setMessage({ type: 'error', text: 'The logo could not be uploaded, so nothing was saved. Try a smaller PNG or JPG.' })
          return
        }
        finalLogoUrl = uploaded
      }

      // Identity AND branding live on tenants — one table, one write.
      // (Colors used to go to tenant_features while the PDF generators read
      // tenants.primary_color, so every document rendered the default blue
      // no matter what was picked here. Migration 255 consolidated this.)
      const letterhead = {
        // Blank -> NULL -> the document omits the line.
        tagline: tagline.trim() || null,
        company_phone: companyPhone.trim() || null,
        company_website: companyWebsite.trim() || null,
        company_address: companyAddress.trim() || null,
        license_number: licenseNumber.trim() || null,
        tax_number: taxNumber.trim() || null,
        document_footer_text: footerText.trim() || null,
      }
      const core = {
        company_name: companyName,
        contact_email: contactEmail,
        logo_url: finalLogoUrl,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        // Empty field -> NULL -> the resolver falls through to the platform
        // constant. Storing 0 here would silently make every quote at-cost.
        // Blank -> NULL -> resolveDepositRule falls back to the defaults.
        deposit_percent: depositPercent.trim() === '' ? null : Number(depositPercent),
        deposit_due_days: depositDueDays.trim() === '' ? null : Number(depositDueDays),
        // Blank -> NULL -> UTC (lib/tenant-today).
        timezone: companyTimezone || null,
        ...(ratesCurrency || (tenant as { rates_currency?: string | null }).rates_currency
          ? { rates_currency: ratesCurrency || null }
          : {}),
        // Migration 281 keeps tenants.currency in step.
        ...(agencyCurrency ? { default_currency: agencyCurrency } : {}),
      }

      // .select() returns the row as stored: an update that RLS blocks or
      // that matched nothing comes back EMPTY with no error, and used to be
      // reported as "saved" — the form then reloaded the old values and the
      // edit looked lost.
      let { data: saved, error: tenantError } = await supabase
        .from('tenants')
        .update({ ...core, ...letterhead })
        .eq('id', tenant.id)
        .select('id, tagline, company_phone, company_website, company_address, license_number, tax_number, document_footer_text')

      // The document-letterhead columns arrive with migration 394. Where the
      // database does not have them yet, the whole write failed and nothing
      // saved; save the rest and say exactly what is missing.
      let letterheadMissing = false
      if (tenantError && isMissingColumnError(tenantError, Object.keys(letterhead))) {
        letterheadMissing = true
        ;({ data: saved, error: tenantError } = await supabase
          .from('tenants')
          .update(core)
          .eq('id', tenant.id)
          .select('id'))
      }

      if (tenantError) throw tenantError
      if (!saved || saved.length === 0) {
        throw new Error('Nothing was saved — your account may not have permission to change the organization. Ask the owner, or sign out and in again.')
      }

      // The minimum margin arrives with migration 399. Saved on its own, and
      // only when it changed, so a database without the column still saves
      // everything else — and says what it could not keep.
      let minMarginMissing = false
      const minValue = minMargin.trim() === '' ? null : Number(minMargin)
      const storedMin = tenant.min_margin_percent ?? null
      if (minValue !== (storedMin === null ? null : Number(storedMin))) {
        const { error: minError } = await supabase
          .from('tenants')
          .update({ min_margin_percent: minValue })
          .eq('id', tenant.id)
        if (minError && isMissingColumnError(minError, ['min_margin_percent'])) minMarginMissing = true
        else if (minError) throw minError
      }

      // The contract's country and law arrive with migration 403: saved on
      // their own, only when changed, like the minimum margin above.
      let contractTermsMissing = false
      const contractTerms = {
        operating_country: operatingCountry.trim() || null,
        contract_governing_law: governingLaw.trim() || null,
      }
      if (
        contractTerms.operating_country !== (tenant.operating_country ?? null) ||
        contractTerms.contract_governing_law !== (tenant.contract_governing_law ?? null)
      ) {
        const { error: termsError } = await supabase
          .from('tenants')
          .update(contractTerms)
          .eq('id', tenant.id)
        if (termsError && isMissingColumnError(termsError, Object.keys(contractTerms))) contractTermsMissing = true
        else if (termsError) throw termsError
      }

      // What we asked for vs what the database kept, field by field.
      const stored = saved[0] as Record<string, unknown>
      const notKept = letterheadMissing ? [] : Object.entries(letterhead)
        .filter(([k, v]) => (stored[k] ?? null) !== v)
        .map(([k]) => LETTERHEAD_LABELS[k] || k)

      // Refetch tenant data
      await refetchTenant()

      if (contractTermsMissing) {
        setMessage({
          type: 'error',
          text: 'Saved — except the contract country and governing law: the database has not been updated for them yet. Run the database migration (npm run migrate), then save again.',
        })
        return
      }
      if (minMarginMissing) {
        setMessage({
          type: 'error',
          text: 'Saved — except the minimum margin: the database has not been updated for it yet. Run the database migration (npm run migrate), then save again.',
        })
        return
      }
      if (letterheadMissing) {
        setMessage({
          type: 'error',
          text: 'Saved — except the document header & footer fields (tagline, phone, website, address, licence, tax, footer note): the database has not been updated for them yet. Run the database migration (npm run migrate), then save again.',
        })
        return
      }
      if (notKept.length > 0) {
        setMessage({ type: 'error', text: `Saved, but these fields were not kept by the database: ${notKept.join(', ')}.` })
        return
      }
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
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-[#647C47] animate-spin" />
        </div>
      </div>
    )
  }

  // Only show access denied AFTER we've confirmed the user's role is loaded
  if (tenantMember && !isAdmin) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl">
        <div>
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
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl">
      {/* Toolbar */}
      <div className="flex items-center justify-end mb-4">
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

      <div className="space-y-4">
        {/* Where this agency books suppliers from lives in Settings › Supplier network. */}
        <p className="text-sm text-gray-600">
          Where you book suppliers from — your own list, the Autoura network, or both — is in{' '}
          <Link href="/settings/supplier-network" className="text-primary-700 underline">Settings › Supplier network</Link>.
        </p>

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

            {/* The markup is set once, in Settings › Pricing defaults (456). */}
            <div>
              <p className="block text-xs font-medium text-gray-700 mb-1">Markup on supplier cost</p>
              <p className="px-3 py-1.5 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg">
                {defaultMargin.trim() === '' ? 'Not set — uses 25%' : `${defaultMargin}%`}
              </p>
              <p className="mt-1 text-[10px] text-gray-400">
                Set in <Link href="/settings/pricing" className="underline">Settings › Pricing defaults</Link>.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Minimum Margin %
                <span className="ml-1.5 text-[10px] text-gray-400 font-normal">(Warn below this)</span>
              </label>
              <input
                type="number"
                min="0"
                max="200"
                step="0.5"
                value={minMargin}
                onChange={(e) => setMinMargin(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                placeholder="Not set — no warning"
              />
              <p className="mt-1 text-[10px] text-gray-400">
                On cost, like the markup. An itinerary whose quoted margin, or profit so far,
                is below this shows it under Needs attention. A trip losing money is always shown.
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

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Company timezone
              </label>
              <select
                value={companyTimezone}
                onChange={(e) => setCompanyTimezone(e.target.value)}
                disabled={!isAdmin}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-white disabled:bg-gray-50"
              >
                <option value="">Not set (UTC)</option>
                {TIMEZONES.filter(tz => tz.value !== 'UTC').map(tz => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
                {companyTimezone && !TIMEZONES.some(tz => tz.value === companyTimezone) && (
                  <option value={companyTimezone}>{companyTimezone}</option>
                )}
              </select>
              <p className="mt-1 text-[10px] text-gray-400">
                What &ldquo;today&rdquo; means for due dates, reminders and emails sent by the system.
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Country you operate in
                <span className="ml-1.5 text-[10px] text-gray-400 font-normal">(Contracts)</span>
              </label>
              <input
                type="text"
                maxLength={100}
                value={operatingCountry}
                onChange={(e) => setOperatingCountry(e.target.value)}
                disabled={!isAdmin}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] disabled:bg-gray-50"
                placeholder="e.g. Egypt"
              />
              <p className="mt-1 text-[10px] text-gray-400">
                Contracts say the balance is paid on arrival here, and that clients need visas for travel here.
                Blank: no country is named.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Governing law
                <span className="ml-1.5 text-[10px] text-gray-400 font-normal">(Contracts)</span>
              </label>
              <input
                type="text"
                maxLength={255}
                value={governingLaw}
                onChange={(e) => setGoverningLaw(e.target.value)}
                disabled={!isAdmin}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] disabled:bg-gray-50"
                placeholder="e.g. Egyptian law"
              />
              <p className="mt-1 text-[10px] text-gray-400">
                Disputes go to arbitration under this law. Blank: the law of the country you are registered in.
              </p>
            </div>
          </div>

          <div className="mt-3">
            <label htmlFor="agency-currency" className="block text-xs font-medium text-gray-700 mb-1">
              Agency currency
            </label>
            <select
              id="agency-currency"
              value={agencyCurrency}
              onChange={(e) => setAgencyCurrency(e.target.value)}
              disabled={!isAdmin}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] disabled:bg-gray-50 disabled:text-gray-500"
            >
              {!agencyCurrency && <option value="">Choose…</option>}
              {SUPPORTED_CURRENCIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-gray-500">
              Your company&apos;s own currency: invoices, commissions, the P&amp;L and new quotes
              start in it. Documents already issued keep their currency.
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

        {/* Limits */}
        <div className="grid grid-cols-1 gap-4">
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
              Recommended: Square image (500x500px), PNG or JPEG. Max 2MB
            </p>

            {!logoPreview ? (
              <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={LOGO_ACCEPT}
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

        {/* Document header & footer */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-gray-600" />
            <h2 className="text-sm font-semibold text-gray-900">Document header &amp; footer</h2>
          </div>
          <p className="text-[11px] text-gray-500 mb-3">
            Printed on the documents you send suppliers (vouchers, service orders). The header shows your logo, company name and tagline; the footer shows the details below. Leave a field blank to leave it off.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {([
              ['Tagline', tagline, setTagline, 'e.g. Tailor-made journeys across Egypt'],
              ['Phone', companyPhone, setCompanyPhone, '+20 2 1234 5678'],
              ['Website', companyWebsite, setCompanyWebsite, 'www.yourcompany.com'],
              ['Tourism license no.', licenseNumber, setLicenseNumber, 'e.g. 1234'],
              ['Tax / registration no.', taxNumber, setTaxNumber, 'e.g. 123-456-789'],
            ] as const).map(([label, value, set, placeholder]) => (
              <div key={label}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                  placeholder={placeholder}
                />
              </div>
            ))}
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
              <textarea
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                rows={2}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                placeholder="Street, city, country"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Footer note
                <span className="ml-1.5 text-[10px] text-gray-400 font-normal">(bank details, a legal note — printed at the bottom of every page)</span>
              </label>
              <textarea
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                rows={2}
                maxLength={400}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                placeholder="e.g. Bank: CIB · IBAN EG00 0000 0000 0000 0000 0000 000"
              />
            </div>
          </div>

          {/* Live preview of exactly what the footer will print */}
          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-2">Footer preview</p>
            <DocumentFooter
              company={identityFromTenant({
                company_name: companyName, contact_email: contactEmail, company_phone: companyPhone,
                company_website: companyWebsite, company_address: companyAddress, license_number: licenseNumber,
                tax_number: taxNumber, document_footer_text: footerText, primary_color: primaryColor,
              })}
            />
          </div>
        </div>

        {tenant && (
          <div className="mt-4">
            <CompanyDataCard companyName={tenant.company_name} role={tenantMember?.role} />
          </div>
        )}
      </div>
    </div>
  )
}
