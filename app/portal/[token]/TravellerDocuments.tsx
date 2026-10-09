'use client'

// ============================================
// Traveller document uploads — portal side (C1b)
// ============================================
// One passport slot (re-upload replaces) plus up to six supporting documents.
// Files go straight to the gate-checked upload route; nothing here ever sees
// a storage path — viewing exchanges a row id for a one-minute signed URL.

import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_DOCUMENT_BYTES, REJECTION_MESSAGE } from '@/lib/portal/traveller-documents'

interface PortalDocument {
  id: string
  kind: 'passport' | 'other'
  label: string | null
  filename: string | null
  sizeBytes: number
  uploadedAt: string
}

export default function TravellerDocuments({
  token,
  passengerId,
  locked,
}: {
  token: string
  passengerId: string
  locked: boolean
}) {
  const [documents, setDocuments] = useState<PortalDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const passportInput = useRef<HTMLInputElement>(null)
  const otherInput = useRef<HTMLInputElement>(null)

  const base = `/api/portal/${token}/travellers/${passengerId}/documents`

  const load = useCallback(async () => {
    try {
      const res = await fetch(base)
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) setDocuments(data.documents)
    } finally {
      setLoading(false)
    }
  }, [base])

  useEffect(() => { load() }, [load])

  const upload = async (kind: 'passport' | 'other', file: File | undefined | null) => {
    if (!file || busy) return
    // Too large: say so here rather than send it — over the cap the upload
    // arrives cut short and could not tell the traveller why.
    if (file.size > MAX_DOCUMENT_BYTES) {
      setNotice({ ok: false, text: REJECTION_MESSAGE.too_large })
      if (passportInput.current) passportInput.current.value = ''
      if (otherInput.current) otherInput.current.value = ''
      return
    }
    setBusy(kind)
    setNotice(null)
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('kind', kind)
      const res = await fetch(base, { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setNotice({ ok: true, text: kind === 'passport' ? 'Passport uploaded.' : 'Document uploaded.' })
        await load()
      } else {
        setNotice({ ok: false, text: data.error || 'Upload failed — please try again.' })
      }
    } catch {
      setNotice({ ok: false, text: 'Upload failed — please try again.' })
    } finally {
      setBusy(null)
      if (passportInput.current) passportInput.current.value = ''
      if (otherInput.current) otherInput.current.value = ''
    }
  }

  const view = async (docId: string) => {
    // Open the tab during the click: a window opened after the fetch is a
    // popup to Safari (and others), and it was silently blocked.
    const tab = window.open('', '_blank')
    if (tab) tab.opener = null
    try {
      const res = await fetch(`${base}/${docId}`)
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success && data.url) {
        if (tab) tab.location.href = data.url
        else window.location.href = data.url
        return
      }
    } catch { /* fall through to the message */ }
    tab?.close()
    setNotice({ ok: false, text: 'Could not open the document — please try again.' })
  }

  const remove = async (docId: string) => {
    if (busy) return
    setBusy(docId)
    setNotice(null)
    try {
      const res = await fetch(`${base}/${docId}`, { method: 'DELETE' })
      if (res.ok) {
        await load()
      } else {
        // A form locked since the page loaded (409), or a server error: the
        // document stays, and the traveller is told why.
        const data = await res.json().catch(() => ({}))
        setNotice({ ok: false, text: data.error || 'Could not remove the document — please try again.' })
      }
    } catch {
      setNotice({ ok: false, text: 'Could not remove the document — please try again.' })
    } finally {
      setBusy(null)
    }
  }

  const passport = documents.find(d => d.kind === 'passport')
  const others = documents.filter(d => d.kind === 'other')

  if (loading) return null

  return (
    <div className="border-t border-gray-100 pt-3 mt-1 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-600">Passport scan</p>
          {passport ? (
            <button type="button" onClick={() => view(passport.id)} className="text-xs text-[#647C47] hover:underline truncate">
              {passport.filename || 'View uploaded passport'}
            </button>
          ) : (
            <p className="text-[11px] text-gray-400">Not uploaded yet — a photo or PDF of the photo page.</p>
          )}
        </div>
        {!locked && (
          <label className="shrink-0 px-2.5 py-1 text-xs font-medium text-[#647C47] border border-[#647C47]/40 rounded-md hover:bg-[#647C47]/5 cursor-pointer">
            {busy === 'passport' ? 'Uploading…' : passport ? 'Replace' : 'Upload'}
            <input
              ref={passportInput}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
              className="hidden"
              disabled={busy !== null}
              onChange={e => upload('passport', e.target.files?.[0])}
            />
          </label>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-gray-600">Supporting documents</p>
          {!locked && others.length < 6 && (
            <label className="shrink-0 px-2.5 py-1 text-xs font-medium text-[#647C47] border border-[#647C47]/40 rounded-md hover:bg-[#647C47]/5 cursor-pointer">
              {busy === 'other' ? 'Uploading…' : 'Add'}
              <input
                ref={otherInput}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
                className="hidden"
                disabled={busy !== null}
                onChange={e => upload('other', e.target.files?.[0])}
              />
            </label>
          )}
        </div>
        {others.length === 0 ? (
          <p className="text-[11px] text-gray-400 mt-1">Visa pages, insurance certificates — anything your agency asked for.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {others.map(d => (
              <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                <button type="button" onClick={() => view(d.id)} className="text-[#647C47] hover:underline truncate">
                  {d.filename || 'Document'}
                </button>
                {!locked && (
                  <button
                    type="button"
                    onClick={() => remove(d.id)}
                    disabled={busy !== null}
                    className="text-gray-400 hover:text-red-600 shrink-0"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[10px] text-gray-400">
        Documents are stored privately and deleted automatically after your trip ends.
      </p>
      {notice && <p className={`text-xs ${notice.ok ? 'text-green-700' : 'text-red-600'}`}>{notice.text}</p>}
    </div>
  )
}
