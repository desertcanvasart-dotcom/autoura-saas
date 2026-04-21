'use client'

import { useEffect, useState } from 'react'
import { Loader2, Sparkles, AlertTriangle, Zap } from 'lucide-react'

interface Features {
  copilot_pregenerate_enabled: boolean
  whatsapp_ai_enabled: boolean
}

export default function CopilotSettingsPage() {
  const [features, setFeatures] = useState<Features | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/copilot/tenant-settings')
      const data = await res.json()
      if (data.success) {
        setFeatures(data.features)
        setRole(data.role)
      } else {
        setError(data.error || 'Failed to load')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const setFlag = async (key: keyof Features, value: boolean) => {
    if (!features) return
    setSaving(key)
    setError(null)
    setFeatures({ ...features, [key]: value }) // optimistic
    const res = await fetch('/api/copilot/tenant-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      setError(data.error || 'Save failed')
      load()
    } else {
      setFeatures(data.features)
    }
    setSaving(null)
  }

  const isAdmin = role === 'admin'

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-purple-600" />
          <h1 className="text-2xl font-semibold text-gray-900">Copilot Settings</h1>
        </div>
        <p className="text-sm text-gray-500">
          Workspace-level copilot behavior. {isAdmin ? 'Admin only — changes affect the whole tenant.' : 'View only — ask an admin to change these.'}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : !features ? (
        <div className="text-sm text-red-600">{error || 'Failed to load settings'}</div>
      ) : (
        <div className="space-y-4">
          <SettingRow
            icon={<Zap className="w-5 h-5 text-purple-600" />}
            title="Proactive draft pre-generation"
            description="When a new WhatsApp or email message arrives, the copilot drafts replies in the background so they are ready when the agent opens the thread. Drafts still require human review before sending — this is NOT auto-reply."
            value={features.copilot_pregenerate_enabled}
            disabled={!isAdmin || saving === 'copilot_pregenerate_enabled'}
            onChange={(v) => setFlag('copilot_pregenerate_enabled', v)}
            saving={saving === 'copilot_pregenerate_enabled'}
          />

          <SettingRow
            icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
            title="WhatsApp AI auto-reply"
            description="DANGEROUS. When on, the bot will automatically respond to customer WhatsApp messages without human review. Keep OFF unless you have explicitly decided to let the AI reply on its own."
            value={features.whatsapp_ai_enabled}
            disabled={!isAdmin || saving === 'whatsapp_ai_enabled'}
            onChange={(v) => setFlag('whatsapp_ai_enabled', v)}
            saving={saving === 'whatsapp_ai_enabled'}
            danger
          />

          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
        </div>
      )}
    </div>
  )
}

function SettingRow({
  icon, title, description, value, onChange, disabled, saving, danger,
}: {
  icon: React.ReactNode
  title: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
  disabled: boolean
  saving: boolean
  danger?: boolean
}) {
  return (
    <div className={`border rounded-lg p-4 flex items-start gap-4 ${danger && value ? 'border-red-300 bg-red-50/40' : 'border-gray-200 bg-white'}`}>
      <div className="flex-shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-gray-900 mb-0.5">{title}</h3>
        <p className={`text-xs leading-relaxed ${danger ? 'text-red-700' : 'text-gray-500'}`}>{description}</p>
      </div>
      <div className="flex-shrink-0">
        <label className={`relative inline-flex items-center cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
          <input
            type="checkbox"
            checked={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="sr-only peer"
          />
          <div className={`w-10 h-5 rounded-full transition-colors ${value ? (danger ? 'bg-red-600' : 'bg-purple-600') : 'bg-gray-300'} peer-focus:ring-2 peer-focus:ring-purple-400/40`}>
            <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform translate-y-0.5 ${value ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
          </div>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 ml-2" />}
        </label>
      </div>
    </div>
  )
}
