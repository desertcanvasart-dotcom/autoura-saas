'use client'
// Settings → WhatsApp: the company's approved follow-up templates, one per
// language (lib/whatsapp-templates.ts). The inbox sends one when a client has
// not written for 24 hours, the only message WhatsApp then allows.
// Everyone sees them; owners and admins add or remove.
import { useEffect, useState } from 'react'
import { Clock, Loader2 } from 'lucide-react'
import { useRole } from '@/hooks/useRole'
import { showToast } from '@/app/contexts/ToastContext'
import { FOLLOW_UP_LANGUAGES, FOLLOW_UP_LANGUAGE_NAMES, type FollowUpLanguage } from '@/lib/whatsapp-templates'

interface Row { language: FollowUpLanguage; contentSid: string | null; body: string | null; approval: string | null }

export default function FollowUpTemplatesCard() {
  const { canAccess } = useRole()
  const canEdit = canAccess(['admin'])
  const [rows, setRows] = useState<Row[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<FollowUpLanguage | null>(null)

  const load = () =>
    fetch('/api/settings/whatsapp-templates')
      .then(r => r.json())
      .then(j => { if (j?.success) setRows(j.data.templates) })
      .catch(() => setRows([]))
  useEffect(() => { load() }, [])

  const save = async (language: FollowUpLanguage, contentSid: string) => {
    setBusy(language)
    const r = await fetch('/api/settings/whatsapp-templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language, contentSid }),
    })
    const j = await r.json().catch(() => null)
    setBusy(null)
    if (!r.ok || !j?.success) { showToast('error', j?.error || 'Could not save'); return }
    showToast('success', contentSid ? `${FOLLOW_UP_LANGUAGE_NAMES[language]} follow-up saved` : `${FOLLOW_UP_LANGUAGE_NAMES[language]} follow-up removed`)
    setDrafts(d => ({ ...d, [language]: '' }))
    load()
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-900">Follow-up templates</h2>
      </div>
      <p className="text-xs text-gray-600 mb-4">
        WhatsApp lets you type freely only within 24 hours of the client&rsquo;s last message. After that, only an
        approved template is delivered. Create the template in Twilio (Content Template Builder) and submit it to
        WhatsApp; once it is approved, paste its ID (starts with HX) here. The inbox then offers
        &ldquo;Send follow-up&rdquo; when a client&rsquo;s 24 hours have passed.
      </p>
      {!rows ? (
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {FOLLOW_UP_LANGUAGES.map(language => {
            const row = rows.find(r => r.language === language)
            return (
              <div key={language} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-20 text-sm font-medium text-gray-800">{FOLLOW_UP_LANGUAGE_NAMES[language]}</span>
                  {row?.contentSid ? (
                    <>
                      <code className="text-xs text-gray-600">{row.contentSid}</code>
                      <span className={`text-xs font-medium ${row.approval === 'approved' ? 'text-green-700' : 'text-amber-700'}`}>
                        {row.approval === 'approved' ? 'Approved by WhatsApp' : `WhatsApp status: ${row.approval}`}
                      </span>
                      {canEdit && (
                        <button type="button" onClick={() => save(language, '')} disabled={busy !== null} className="ml-auto text-xs text-red-600 hover:underline disabled:opacity-50">
                          Remove
                        </button>
                      )}
                    </>
                  ) : canEdit ? (
                    <>
                      <input
                        value={drafts[language] ?? ''}
                        onChange={e => setDrafts(d => ({ ...d, [language]: e.target.value }))}
                        placeholder="HX…"
                        aria-label={`${FOLLOW_UP_LANGUAGE_NAMES[language]} template ID`}
                        className="flex-1 min-w-[12rem] px-3 py-1.5 text-sm border border-gray-200 rounded-lg font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => save(language, (drafts[language] ?? '').trim())}
                        disabled={busy !== null || !(drafts[language] ?? '').trim()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                      >
                        {busy === language && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-gray-500">Not set up</span>
                  )}
                </div>
                {row?.body && <p className="mt-1.5 ml-[5.5rem] text-xs text-gray-600 whitespace-pre-line">{row.body}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
