'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, Loader2, Plus, Trash2, Pencil, Play, Filter } from 'lucide-react'
import type { RuleActions, RuleConditions } from '@/lib/email/mail-rules'

interface Rule {
  id: string
  name: string
  enabled: boolean
  conditions: RuleConditions
  actions: RuleActions
}

const EMPTY_ACTIONS: RuleActions = {}

function describeActions(a: RuleActions): string {
  const parts = [
    a.folder && `file in “${a.folder}”`,
    a.skipInbox && 'skip the Inbox',
    a.markRead && 'mark read',
    a.star && 'star',
    a.spam && 'send to Spam',
    a.delete && 'delete',
  ].filter(Boolean)
  return parts.join(', ')
}

function describeConds(c: RuleConditions): string {
  return [
    c.from && `from “${c.from}”`,
    c.to && `to “${c.to}”`,
    c.subject && `subject has “${c.subject}”`,
    c.words && `has the words “${c.words}”`,
  ].filter(Boolean).join(' and ')
}

/**
 * Mail rules ("filters") for the company. Everyone sees them; managers and
 * admins add, change, switch off, delete, and apply a rule to what is already
 * in their Inbox. Rules run on new mail at every sync (every 10 minutes).
 */
export default function RulesPanel({
  folders,
  prefill,
  onClose,
  onChanged,
}: {
  /** The mailbox's folder names, offered for "file it in". */
  folders: string[]
  /** "Filter emails like this": a new rule started from an email. */
  prefill?: RuleConditions | null
  onClose: () => void
  /** A rule was applied (folders may have been created). */
  onChanged?: () => void
}) {
  const [rules, setRules] = useState<Rule[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // The rule being written: a new one (id null) or an existing one.
  const [editing, setEditing] = useState<{ id: string | null; name: string; conditions: RuleConditions; actions: RuleActions } | null>(
    prefill ? { id: null, name: '', conditions: prefill, actions: EMPTY_ACTIONS } : null
  )
  const [applyAfterSave, setApplyAfterSave] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/email/rules')
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not load the rules')
      setRules(d.rules || [])
      setCanEdit(Boolean(d.canEdit))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the rules')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const call = async (key: string, url: string, method: string, body?: unknown) => {
    setBusy(key)
    setError(null)
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Something went wrong')
      return d
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      return null
    } finally {
      setBusy(null)
    }
  }

  const applyNow = async (rule: { id: string; name: string }) => {
    const d = await call(`run:${rule.id}`, `/api/email/rules/${rule.id}/run`, 'POST')
    if (d) {
      setInfo(`“${rule.name}” applied to ${d.applied} email${d.applied === 1 ? '' : 's'} in your Inbox${d.truncated ? ' (the first 5,000)' : ''}.`)
      onChanged?.()
    }
  }

  const save = async () => {
    if (!editing) return
    const body = { name: editing.name, conditions: editing.conditions, actions: editing.actions }
    const d = editing.id
      ? await call('save', `/api/email/rules/${editing.id}`, 'PATCH', body)
      : await call('save', '/api/email/rules', 'POST', body)
    if (!d) return
    setEditing(null)
    await load()
    setInfo(editing.id ? 'Rule saved.' : 'Rule added — it runs on new mail from now on.')
    if (applyAfterSave && d.rule) await applyNow(d.rule)
    setApplyAfterSave(false)
  }

  const setCond = (k: keyof RuleConditions, v: string) =>
    setEditing(e => (e ? { ...e, conditions: { ...e.conditions, [k]: v } } : e))
  const setAct = (k: keyof RuleActions, v: boolean | string) =>
    setEditing(e => {
      if (!e) return e
      const actions = { ...e.actions, [k]: v }
      // Spam and Delete exclude each other.
      if (k === 'spam' && v) actions.delete = false
      if (k === 'delete' && v) actions.spam = false
      return { ...e, actions }
    })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-label="Mail rules">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Filter className="w-4 h-4" /> Mail rules</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label="Close"><X className="w-4 h-4 text-gray-500" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <p className="text-xs text-gray-500">
            Rules run on new mail in every connected mailbox of the company at each sync (every 10 minutes).
            {!canEdit && !loading && ' Only managers and admins can change them.'}
          </p>
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">{error}</div>}
          {info && <div role="status" className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-xs">{info}</div>}

          {editing && canEdit && (
            <div className="border border-primary-200 bg-primary-50/40 rounded-lg p-4 space-y-3" data-testid="rule-editor">
              <p className="text-xs font-semibold text-gray-700">{editing.id ? 'Edit rule' : 'New rule'}</p>
              <p className="text-xs text-gray-500">When an email…</p>
              <div className="grid grid-cols-2 gap-2">
                {([['from', 'is from'], ['to', 'is to'], ['subject', 'has the subject'], ['words', 'has the words']] as const).map(([k, label]) => (
                  <label key={k} className="text-xs text-gray-600">
                    {label}
                    <input
                      value={editing.conditions[k] ?? ''}
                      onChange={e => setCond(k, e.target.value)}
                      aria-label={`Condition ${k}`}
                      className="mt-0.5 w-full h-8 px-2 text-sm border border-gray-200 rounded bg-white"
                    />
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500">…then</p>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm">
                  <span className="w-36 text-gray-700">File it in folder</span>
                  <input
                    list="rule-folders"
                    value={editing.actions.folder ?? ''}
                    onChange={e => setAct('folder', e.target.value)}
                    placeholder="(none) — or type a new folder"
                    aria-label="Action folder"
                    className="flex-1 h-8 px-2 text-sm border border-gray-200 rounded bg-white"
                  />
                  <datalist id="rule-folders">{folders.map(f => <option key={f} value={f} />)}</datalist>
                </label>
                {([['skipInbox', 'Skip the Inbox (archive it)'], ['markRead', 'Mark it read'], ['star', 'Star it'], ['spam', 'Send it to Spam'], ['delete', 'Delete it']] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={Boolean(editing.actions[k])} onChange={e => setAct(k, e.target.checked)} aria-label={`Action ${k}`} />
                    {label}
                  </label>
                ))}
              </div>
              <label className="block text-xs text-gray-600">
                Name (optional)
                <input
                  value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                  aria-label="Rule name"
                  className="mt-0.5 w-full h-8 px-2 text-sm border border-gray-200 rounded bg-white"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input type="checkbox" checked={applyAfterSave} onChange={e => setApplyAfterSave(e.target.checked)} aria-label="Also apply to Inbox" />
                Also apply it to matching emails already in my Inbox
              </label>
              <div className="flex justify-end gap-2">
                <button onClick={() => { setEditing(null); setApplyAfterSave(false) }} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded">Cancel</button>
                <button onClick={save} disabled={busy === 'save'} className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-50">
                  {busy === 'save' ? 'Saving…' : 'Save rule'}
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
          ) : rules.length === 0 && !editing ? (
            <p className="text-sm text-gray-500">No rules yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg" data-testid="rules-list">
              {rules.map(r => (
                <li key={r.id} className="flex items-start gap-3 p-3">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    disabled={!canEdit || busy !== null}
                    onChange={async e => {
                      const d = await call(`toggle:${r.id}`, `/api/email/rules/${r.id}`, 'PATCH', { enabled: e.target.checked })
                      if (d) setRules(prev => prev.map(x => (x.id === r.id ? d.rule : x)))
                    }}
                    title={r.enabled ? 'On — switch off' : 'Off — switch on'}
                    aria-label={`Rule ${r.name} on`}
                    className="mt-1"
                  />
                  <div className={`flex-1 min-w-0 ${r.enabled ? '' : 'opacity-50'}`}>
                    <p className="text-sm font-medium text-gray-900">{r.name}</p>
                    <p className="text-xs text-gray-500">When {describeConds(r.conditions)} → {describeActions(r.actions)}</p>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => applyNow(r)} disabled={busy !== null} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-50" title="Apply to matching emails already in my Inbox">
                        {busy === `run:${r.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 text-gray-500" />}
                      </button>
                      <button onClick={() => setEditing({ id: r.id, name: r.name, conditions: r.conditions, actions: r.actions })} className="p-1.5 hover:bg-gray-100 rounded" title="Edit">
                        <Pencil className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm(`Delete the rule “${r.name}”? Emails it already filed stay where they are.`)) return
                          if (await call(`del:${r.id}`, `/api/email/rules/${r.id}`, 'DELETE')) setRules(prev => prev.filter(x => x.id !== r.id))
                        }}
                        className="p-1.5 hover:bg-gray-100 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {canEdit && !editing && (
          <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <button
              onClick={() => setEditing({ id: null, name: '', conditions: {}, actions: EMPTY_ACTIONS })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded hover:bg-primary-700"
            >
              <Plus className="w-4 h-4" /> New rule
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
