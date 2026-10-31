'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, AlertTriangle, Zap } from 'lucide-react'
import { SaveBar, useUnsavedGuard } from '@/components/settings/SettingsUI'

interface Features {
  copilot_pregenerate_enabled: boolean
  whatsapp_ai_enabled: boolean
}

const KEYS: (keyof Features)[] = ['copilot_pregenerate_enabled', 'whatsapp_ai_enabled']

export default function CopilotSettingsPage() {
  // saved = what the server holds; draft = the toggles as shown. The sticky
  // bar saves only the flags that differ, in one PATCH.
  const [saved, setSaved] = useState<Features | null>(null)
  const [draft, setDraft] = useState<Features | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/copilot/tenant-settings')
      const data = await res.json()
      if (data.success) {
        setSaved(data.features)
        setDraft(data.features)
        setRole(data.role)
      } else {
        setError(data.error || 'Failed to load')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const changes = useMemo(
    () => (saved && draft ? KEYS.filter(k => saved[k] !== draft[k]).length : 0),
    [saved, draft],
  )
  useUnsavedGuard(changes > 0)

  const save = async () => {
    if (!saved || !draft) return
    setSaving(true)
    setError(null)
    const patch: Partial<Features> = {}
    for (const k of KEYS) if (saved[k] !== draft[k]) patch[k] = draft[k]
    try {
      const res = await fetch('/api/copilot/tenant-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || 'Save failed')
      } else {
        setSaved(data.features)
        setDraft(data.features)
      }
    } catch {
      setError('Save failed')
    } finally {
      setSaving(false)
    }
  }

  // An owner is an admin here, as the API already treats them (it allows owner and admin); the page made owners read-only.
  const isAdmin = role === 'admin' || role === 'owner'

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl">
      <p className="mb-6 text-sm text-gray-500">
        {isAdmin ? 'Admin only — changes affect the whole tenant.' : 'View only — ask an admin to change these.'}
      </p>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : !draft ? (
        <div className="text-sm text-red-600">{error || 'Failed to load settings'}</div>
      ) : (
        <div className="space-y-4">
          <SettingRow
            icon={<Zap className="w-5 h-5 text-primary-600" />}
            title="Proactive draft pre-generation"
            description="When a new WhatsApp or email message arrives, the copilot drafts replies in the background so they are ready when the agent opens the thread. Drafts still require human review before sending — this is NOT auto-reply."
            value={draft.copilot_pregenerate_enabled}
            disabled={!isAdmin || saving}
            onChange={(v) => setDraft(d => (d ? { ...d, copilot_pregenerate_enabled: v } : d))}
          />

          <SettingRow
            icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
            title="WhatsApp AI auto-reply"
            description="DANGEROUS. When on, the bot will automatically respond to customer WhatsApp messages without human review. Keep OFF unless you have explicitly decided to let the AI reply on its own."
            value={draft.whatsapp_ai_enabled}
            disabled={!isAdmin || saving}
            onChange={(v) => setDraft(d => (d ? { ...d, whatsapp_ai_enabled: v } : d))}
            danger
          />

          {isAdmin && (
            <SaveBar changes={changes} saving={saving} error={error} onDiscard={() => { setDraft(saved); setError(null) }} onSave={save} />
          )}
          {!isAdmin && error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
        </div>
      )}
    </div>
  )
}

function SettingRow({
  icon, title, description, value, onChange, disabled, danger,
}: {
  icon: React.ReactNode
  title: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
  disabled: boolean
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
          <div className={`w-10 h-5 rounded-full transition-colors ${value ? (danger ? 'bg-red-600' : 'bg-primary-600') : 'bg-gray-300'} peer-focus:ring-2 peer-focus:ring-primary-400/40`}>
            <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform translate-y-0.5 ${value ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
          </div>
        </label>
      </div>
    </div>
  )
}
