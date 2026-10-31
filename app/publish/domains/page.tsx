'use client'
// ============================================
// Publish — the website's address (step 11)
// ============================================
// Operator, 2026-10-28: agencies connect their own domain (tours.agency.com)
// or take a free address on ours; "Railway now, Cloudflare later" behind one
// interface (lib/publish/domains). The agency adds the DNS records shown here;
// the sync job keeps checking, and "Check now" asks at once. The main address
// is the one search engines see — the others redirect to it. The website goes
// public only with a ready main address. Managers change; everyone may look.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Globe2, RefreshCw, Trash2, Star, Copy, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import { useRole } from '@/hooks/useRole'
import { showToast } from '@/app/contexts/ToastContext'

interface Domain { id: string; hostname: string; kind: string; status: string; lastError: string | null; lastCheckedAt: string | null; connected: boolean }
interface Data { site: { status: string }; domains: Domain[]; freeBase: string | null; providerReady: boolean }
interface DnsRecord { type: string; name: string; value: string; purpose: string; ok: boolean }

const STATUS: Record<string, { label: string; tone: string; Icon: typeof Clock }> = {
  pending_dns: { label: 'Waiting for your DNS', tone: 'bg-amber-50 text-amber-800 border-amber-200', Icon: Clock },
  verifying: { label: 'DNS found — getting the security certificate', tone: 'bg-blue-50 text-blue-700 border-blue-200', Icon: Clock },
  active: { label: 'Ready', tone: 'bg-green-50 text-green-700 border-green-200', Icon: CheckCircle2 },
  failed: { label: 'Needs attention', tone: 'bg-red-50 text-red-700 border-red-200', Icon: AlertTriangle },
}
const KIND: Record<string, string> = { primary: 'Main address', alias_redirect: 'Redirects to the main address', test: 'Test address (not public)' }

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  const j = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }))
  if (!j.success) throw new Error(j.error || 'Something went wrong')
  return j.data
}

function Records({ records }: { records: DnsRecord[] }) {
  if (records.length === 0) return null
  return (
    <div className="mt-3 overflow-x-auto">
      <p className="text-xs text-gray-600 mb-1">Add these at the company that manages your domain (GoDaddy, Namecheap, Cloudflare…):</p>
      <table className="w-full text-xs border border-gray-200 rounded">
        <thead className="bg-gray-50 text-gray-500"><tr><th className="text-left px-2 py-1">Type</th><th className="text-left px-2 py-1">Name</th><th className="text-left px-2 py-1">Value</th><th className="px-2 py-1">Seen</th></tr></thead>
        <tbody>
          {records.map(r => (
            <tr key={`${r.type}-${r.name}-${r.value}`} className="border-t border-gray-100">
              <td className="px-2 py-1 font-mono">{r.type}</td>
              <td className="px-2 py-1 font-mono break-all">{r.name}</td>
              <td className="px-2 py-1 font-mono break-all">
                {r.value}
                <button type="button" className="ml-1 align-middle text-gray-500" aria-label="Copy the value" onClick={() => navigator.clipboard.writeText(r.value).then(() => showToast('success', 'Copied'))}><Copy className="inline h-3 w-3" /></button>
              </td>
              <td className="px-2 py-1 text-center">{r.ok ? '✓' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-gray-500">DNS changes can take from a few minutes to a few hours. We keep checking; you can also press “Check now”.</p>
    </div>
  )
}

export default function PublishDomainsPage() {
  const { isAdmin, isManager } = useRole()
  const canManage = isAdmin || isManager
  const [data, setData] = useState<Data | null>(null)
  const [records, setRecords] = useState<Record<string, DnsRecord[]>>({})
  const [hostname, setHostname] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setData(await call('/api/publish/domains')) } catch (e) { showToast('error', e instanceof Error ? e.message : 'Could not load') }
  }, [])
  useEffect(() => { load() }, [load])

  async function run(what: string, f: () => Promise<unknown>, ok: string) {
    setBusy(what)
    try {
      const r = await f() as { warning?: string | null; records?: DnsRecord[]; id?: string } | undefined
      if (r?.records && r.id) setRecords(prev => ({ ...prev, [r.id!]: r.records! }))
      showToast(r?.warning ? 'warning' : 'success', r?.warning ?? ok)
      await load()
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  if (!data) return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]" /></div>
  const live = data.site.status === 'live'
  const mainReady = data.domains.some(d => d.kind === 'primary' && d.status === 'active')

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <Link href="/publish" className="inline-flex items-center gap-1 text-sm text-[#647C47]"><ArrowLeft className="h-4 w-4" />Website</Link>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[#647C47]/10 rounded-lg flex items-center justify-center"><Globe2 className="h-5 w-5 text-[#647C47]" /></div>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Your website&apos;s address</h1>
          <p className="text-sm text-gray-500">Connect your own domain, such as tours.youragency.com, or take a free address. Secure (https) automatically.</p>
        </div>
      </div>

      <section className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <p className="font-medium text-gray-900">{live ? 'Your website is public' : 'Your website is not public yet'}</p>
          <p className="text-gray-500">{live ? 'Visitors and search engines can find it at its main address.' : mainReady ? 'Your main address is ready — make it public when you are.' : 'It needs a ready main address first.'}</p>
        </div>
        {canManage && (
          <button type="button" disabled={busy !== null || (!live && !mainReady)}
            onClick={() => run('live', () => call('/api/publish/site/live', { method: 'POST', body: JSON.stringify({ live: !live }) }), live ? 'Back to draft' : 'Your website is public')}
            className={`text-sm px-3 py-1.5 rounded-md disabled:opacity-40 ${live ? 'border border-gray-300' : 'bg-[#647C47] text-white'}`}>
            {live ? 'Take it back to draft' : 'Make the website public'}
          </button>
        )}
      </section>

      <section className="bg-white border border-gray-200 rounded-lg">
        <h2 className="font-medium text-gray-900 px-4 pt-4">Addresses</h2>
        {data.domains.length === 0 ? <p className="px-4 py-3 text-sm text-gray-500">None yet.</p> : (
          <ul className="divide-y divide-gray-100">
            {data.domains.map(d => {
              const s = STATUS[d.status] ?? STATUS.pending_dns
              return (
                <li key={d.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm text-gray-900">{d.hostname}</p>
                      <p className="text-xs text-gray-500">{KIND[d.kind] ?? d.kind}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded border ${s.tone}`}><s.Icon className="h-3.5 w-3.5" />{s.label}</span>
                      {d.connected && d.status !== 'active' && (
                        <button type="button" disabled={busy !== null} onClick={() => run(`check-${d.id}`, () => call(`/api/publish/domains/${d.id}/check`, { method: 'POST' }), 'Checked')}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-300"><RefreshCw className="h-3.5 w-3.5" />{busy === `check-${d.id}` ? 'Checking…' : 'Check now'}</button>
                      )}
                      {canManage && d.kind === 'alias_redirect' && d.status === 'active' && (
                        <button type="button" disabled={busy !== null} onClick={() => run(`main-${d.id}`, () => call(`/api/publish/domains/${d.id}/main`, { method: 'POST' }), 'Now the main address')}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-300"><Star className="h-3.5 w-3.5" />Make main address</button>
                      )}
                      {canManage && d.kind !== 'test' && (
                        <button type="button" disabled={busy !== null} onClick={() => confirm(`Disconnect ${d.hostname}?`) && run(`rm-${d.id}`, () => call(`/api/publish/domains/${d.id}`, { method: 'DELETE' }), 'Disconnected')}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-300 text-red-700"><Trash2 className="h-3.5 w-3.5" />Remove</button>
                      )}
                    </div>
                  </div>
                  {d.lastError && d.status !== 'active' && <p className="mt-1 text-xs text-red-700">{d.lastError}</p>}
                  {records[d.id] && d.status !== 'active' && <Records records={records[d.id]} />}
                  {!records[d.id] && d.connected && d.status !== 'active' && <p className="mt-1 text-xs text-gray-500">Press “Check now” to see the DNS records to add.</p>}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {canManage && (
        <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h2 className="font-medium text-gray-900">Connect your own domain</h2>
          {data.providerReady ? (
            <>
              <p className="text-sm text-gray-600">We suggest a subdomain such as <span className="font-mono">tours.youragency.com</span>, so your main website stays as it is.</p>
              <div className="flex flex-wrap gap-2">
                <input value={hostname} onChange={e => setHostname(e.target.value)} placeholder="tours.youragency.com" className="text-sm border border-gray-300 rounded-md px-3 py-2 w-72 font-mono" />
                <button type="button" disabled={busy !== null || !hostname.trim()} onClick={() => run('add', () => call('/api/publish/domains', { method: 'POST', body: JSON.stringify({ hostname }) }), 'Added — now add the DNS records shown').then(() => setHostname(''))}
                  className="text-sm px-3 py-2 rounded-md bg-[#647C47] text-white disabled:opacity-40">{busy === 'add' ? 'Connecting…' : 'Connect'}</button>
              </div>
            </>
          ) : <p className="text-sm text-gray-500">Not switched on yet for your company — contact Autoura.</p>}
        </section>
      )}

      {canManage && data.freeBase && (
        <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h2 className="font-medium text-gray-900">Or a free address</h2>
          <p className="text-sm text-gray-600">Ready at once — nothing to set up.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input value={label} onChange={e => setLabel(e.target.value.toLowerCase())} placeholder="youragency" className="text-sm border border-gray-300 rounded-md px-3 py-2 w-48 font-mono" />
            <span className="text-sm font-mono text-gray-600">.{data.freeBase}</span>
            <button type="button" disabled={busy !== null || label.trim().length < 3} onClick={() => run('free', () => call('/api/publish/domains', { method: 'POST', body: JSON.stringify({ freeLabel: label }) }), 'Your free address is ready').then(() => setLabel(''))}
              className="text-sm px-3 py-2 rounded-md border border-[#647C47] text-[#647C47] disabled:opacity-40">Take this address</button>
          </div>
        </section>
      )}
    </div>
  )
}
