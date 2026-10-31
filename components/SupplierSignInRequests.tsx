'use client'

import { useCallback, useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'

// Suppliers asking to sign in as one of this agency's suppliers (Phase 2B).
// An admin confirms it is them — or not (decision §9). Until confirmed, the
// supplier sees nothing of this agency.

interface Claim {
  id: string
  supplier_id: string
  supplier_name: string
  phone: string | null
  status: 'pending' | 'approved' | 'rejected'
  requested_at: string
  /** Where their sign-in code went: the addresses on YOUR record, and how many others. */
  code_sent_to?: { yours: string[]; others: number } | null
}

/** "Code sent to a@b.com and 1 other address" — the others belong to records you can't see. */
function CodeSentTo({ sent }: { sent: Claim['code_sent_to'] }) {
  if (!sent) return <span className="block text-xs text-gray-600">We can’t tell which email their code went to.</span>
  const { yours, others } = sent
  const otherText = others > 0 ? `${others} other address${others === 1 ? '' : 'es'} not on your record` : ''
  return (
    <span className={`block text-xs ${others > 0 ? 'text-red-700' : 'text-gray-600'}`}>
      Code sent to {yours.length > 0 ? <b>{yours.join(', ')}</b> : null}
      {yours.length > 0 && others > 0 ? ' and ' : ''}{otherText}.
      {' '}Only approve if you recognise this email{others > 0 ? ' — another address got the code too, so check with the supplier first' : ''}.
    </span>
  )
}

export function useClaims(query: string) {
  const [claims, setClaims] = useState<Claim[]>([])
  const load = useCallback(async () => {
    const res = await fetch(`/api/supplier-claims?${query}`)
    const d = await res.json().catch(() => ({}))
    if (res.ok && d.success) setClaims(d.data)
  }, [query])
  useEffect(() => { void load() }, [load])
  return { claims, load }
}

export async function decideClaim(id: string, decision: 'approve' | 'reject'): Promise<string | null> {
  const res = await fetch(`/api/supplier-claims/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) })
  const d = await res.json().catch(() => ({}))
  return res.ok && d.success ? null : (d.error || 'Could not save')
}

/**
 * The waiting requests, with Confirm / Not them for admins. On Suppliers it
 * shows only when there are some; Settings › Supplier network passes
 * `emptyText` so an empty list says so.
 */
export default function SupplierSignInRequests({ isAdmin, emptyText }: { isAdmin: boolean; emptyText?: string }) {
  const { claims, load } = useClaims('status=pending')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (claims.length === 0) return emptyText ? <p className="text-sm text-gray-500">{emptyText}</p> : null

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(id); setError(null)
    const err = await decideClaim(id, decision)
    setBusy(null)
    if (err) setError(err); else void load()
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
      <p className="font-medium text-amber-900 flex items-center gap-1.5"><KeyRound className="w-4 h-4" /> Suppliers asking to sign in ({claims.length})</p>
      <p className="text-xs text-amber-800 mt-0.5">They used the phone number on your supplier record and the code sent by email. Confirm only if it is really them — they will then see your requests and jobs for them.</p>
      <ul className="mt-2 divide-y divide-amber-100">
        {claims.map(c => (
          <li key={c.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-gray-900"><b>{c.supplier_name}</b> <span className="text-gray-600">· {c.phone ?? 'phone hidden'} · {new Date(c.requested_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
              <CodeSentTo sent={c.code_sent_to} />
            </span>
            {isAdmin ? (
              <span className="flex gap-2">
                <button type="button" disabled={busy === c.id} onClick={() => decide(c.id, 'approve')} className="px-2.5 py-1 rounded-md bg-primary-600 text-white text-xs font-medium disabled:opacity-50">Confirm it’s them</button>
                <button type="button" disabled={busy === c.id} onClick={() => decide(c.id, 'reject')} className="px-2.5 py-1 rounded-md border border-gray-300 bg-white text-gray-700 text-xs disabled:opacity-50">Not them</button>
              </span>
            ) : <span className="text-xs text-gray-500">An admin confirms these</span>}
          </li>
        ))}
      </ul>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  )
}

/** On the supplier card: whether this supplier has a sign-in, and connect / disconnect for admins. */
export function SupplierSignInStatus({ supplierId, isAdmin }: { supplierId: string; isAdmin: boolean }) {
  const { claims, load } = useClaims(`supplier_id=${supplierId}`)
  const [error, setError] = useState<string | null>(null)
  if (claims.length === 0) return null
  const act = async (id: string, decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !window.confirm('Disconnect this sign-in? They will stop seeing your bookings.')) return
    setError(null)
    const err = await decideClaim(id, decision)
    if (err) setError(err); else void load()
  }
  const LABEL = { pending: 'asks to sign in', approved: 'signed in — connected', rejected: 'not connected' } as const
  return (
    <div className="mt-2 space-y-1 text-xs">
      {claims.map(c => (
        <div key={c.id} className="flex flex-wrap items-center gap-2">
          <KeyRound className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-gray-700">{c.phone ?? 'A phone'} {LABEL[c.status]}</span>
          {isAdmin && c.status !== 'approved' && <button type="button" onClick={() => act(c.id, 'approve')} className="text-green-700 hover:underline">{c.status === 'pending' ? 'Confirm it’s them' : 'Connect'}</button>}
          {isAdmin && c.status !== 'rejected' && <button type="button" onClick={() => act(c.id, 'reject')} className="text-red-700 hover:underline">{c.status === 'pending' ? 'Not them' : 'Disconnect'}</button>}
        </div>
      ))}
      {error && <p className="text-red-700">{error}</p>}
    </div>
  )
}
