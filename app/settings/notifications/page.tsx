'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { SettingsCard, SettingsRow, SaveBar, useUnsavedGuard } from '@/components/settings/SettingsUI'

// Settings › Notifications: what you are told about, and where. Your own
// preferences (/api/settings/notifications), saved with the one sticky bar.

interface Prefs {
  task_assigned: boolean
  task_due_soon: boolean
  task_overdue: boolean
  task_completed: boolean
  email_enabled: boolean
  in_app_enabled: boolean
}

const DEFAULTS: Prefs = {
  task_assigned: true,
  task_due_soon: true,
  task_overdue: true,
  task_completed: false,
  email_enabled: true,
  in_app_enabled: true,
}

const ROWS: { key: keyof Prefs; label: string; description: string }[] = [
  { key: 'email_enabled', label: 'Email', description: 'Receive notifications by email.' },
  { key: 'in_app_enabled', label: 'In the app', description: 'Show notifications under the bell.' },
  { key: 'task_assigned', label: 'Task assigned', description: 'When a task is assigned to you.' },
  { key: 'task_due_soon', label: 'Task due soon', description: 'A reminder 24 hours before the due date.' },
  { key: 'task_overdue', label: 'Task overdue', description: 'When a task passes its due date.' },
  { key: 'task_completed', label: 'Task completed', description: 'When a task you created is completed.' },
]

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors ${on ? 'bg-primary-700' : 'bg-gray-300'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  )
}

export default function NotificationsSettingsPage() {
  const [saved, setSaved] = useState<Prefs | null>(null)
  const [draft, setDraft] = useState<Prefs | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings/notifications')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const prefs = { ...DEFAULTS, ...(d && typeof d === 'object' ? d : {}) }
        setSaved(prefs)
        setDraft(prefs)
      })
      .catch(() => { setSaved(DEFAULTS); setDraft(DEFAULTS) })
  }, [])

  const changes = useMemo(
    () => (saved && draft ? ROWS.filter(r => saved[r.key] !== draft[r.key]).length : 0),
    [saved, draft],
  )
  useUnsavedGuard(changes > 0)

  if (!draft) return <div className="px-4 sm:px-6 lg:px-8 py-10"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (!res.ok) throw new Error('Could not save your notification preferences')
      setSaved(draft)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl space-y-6">
      {[ROWS.slice(0, 2), ROWS.slice(2)].map((group, i) => (
        <div key={i}>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">{i === 0 ? 'Where' : 'Tasks'}</h2>
          <SettingsCard>
            {group.map(r => (
              <SettingsRow key={r.key} label={r.label} description={r.description}>
                <div className="min-[720px]:text-right">
                  <Toggle label={r.label} on={draft[r.key]} onChange={v => setDraft(d => (d ? { ...d, [r.key]: v } : d))} />
                </div>
              </SettingsRow>
            ))}
          </SettingsCard>
        </div>
      ))}
      <SaveBar changes={changes} saving={saving} error={error} onDiscard={() => { setDraft(saved); setError(null) }} onSave={save} />
    </div>
  )
}
