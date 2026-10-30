import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-server'
import { SESSION_COOKIE } from '@/lib/supplier-accounts'
import { supplierFromToken } from '@/lib/supplier-session'
import { loadSupplierAgency } from '@/lib/supplier-page-data'
import SupplierAgencyView from '@/components/supplier/SupplierAgencyView'
import SignOutButton from './SignOutButton'
import NetworkJoin from './NetworkJoin'

// The signed-in supplier's inbox (Phase 2B): every agency that CONFIRMED the
// sign-in, side by side, each with its own requests, jobs, days off and what
// it owes — never mixed. Agencies still deciding are listed, with nothing of
// theirs shown.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your bookings', robots: { index: false } }

const WAITING: Record<string, string> = {
  pending: 'Waiting for the agency to confirm it is you',
  rejected: 'Not connected — contact the agency',
}

export default async function SupplierHomePage() {
  const db = createAdminClient() as unknown as SupabaseClient
  const signedIn = await supplierFromToken(db, (await cookies()).get(SESSION_COOKIE)?.value)
  if (!signedIn) redirect('/supplier-login')

  const { data: links } = await db.from('supplier_account_links')
    .select('id, tenant_id, supplier_id, status').eq('account_id', signedIn.account.id).order('requested_at')
  const all = links ?? []
  const today = new Date().toISOString().slice(0, 10)
  const approved = all.filter(l => l.status === 'approved')
  const agencies = (await Promise.all(approved.map(async l => ({
    link: l,
    data: await loadSupplierAgency(db, l.tenant_id as string, l.supplier_id as string, today),
  })))).filter((a): a is { link: typeof a.link; data: NonNullable<typeof a.data> } => a.data !== null)

  const waiting = all.filter(l => l.status !== 'approved')
  const waitingIds = [...new Set(waiting.map(l => l.tenant_id as string))]
  const { data: waitingTenants } = waitingIds.length ? await db.from('tenants').select('id, company_name').in('id', waitingIds) : { data: [] }
  const nameOf = (id: string) => ((waitingTenants ?? []).find(t => t.id === id)?.company_name as string | null) ?? 'An agency'
  const toAnswer = agencies.reduce((n, a) => n + a.data.sections.requests.length, 0)

  // The supplier has now seen these requests: the office's line says "seen …"
  // (it read only the links before — 2026-10-30 end-to-end test).
  const shown = agencies.flatMap(a => a.data.sections.requests.map(l => l.id))
  if (shown.length) {
    void db.from('service_booking_links').update({ last_opened_at: new Date().toISOString() })
      .in('service_booking_id', shown).is('revoked_at', null)
      .then(({ error }) => { if (error) console.error('[supplier inbox] seen stamp:', error.message) })
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-5 py-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-400">Autoura for suppliers</p>
          <h1 className="text-xl font-semibold mt-1 text-white">{signedIn.account.display_name ?? 'Your bookings'}</h1>
          <p className="text-sm text-gray-300 mt-1">
            +{signedIn.account.phone}
            {agencies.length > 0 && ` · ${toAnswer === 0 ? 'nothing to answer' : `${toAnswer} to answer`}`}
          </p>
        </div>
        <SignOutButton />
      </header>
      <div className="max-w-md mx-auto px-4 py-6 space-y-10">
        {agencies.length > 1 && (
          <nav className="flex flex-wrap gap-2 text-sm">
            {agencies.map(a => (
              <a key={a.link.id} href={`#agency-${a.link.id}`} className="rounded-full border border-gray-300 bg-white px-3 py-1 text-gray-800">
                {a.data.operatorName}{a.data.sections.requests.length ? ` (${a.data.sections.requests.length})` : ''}
              </a>
            ))}
          </nav>
        )}
        {agencies.map(a => (
          <section key={a.link.id} id={`agency-${a.link.id}`} className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">{a.data.operatorName}</h2>
            <SupplierAgencyView
              data={a.data}
              answerUrl={lineId => `/api/supplier-account/lines/${lineId}`}
              daysOffUrl="/api/supplier-account/days-off"
              daysOffBody={{ link_id: a.link.id }}
            />
          </section>
        ))}
        {agencies.length === 0 && waiting.length === 0 && <p className="text-sm text-gray-500">No agencies yet.</p>}
        <NetworkJoin />
        {waiting.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Other agencies</h2>
            <ul className="space-y-2">
              {waiting.map(l => (
                <li key={l.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                  <p className="font-medium text-gray-900">{nameOf(l.tenant_id as string)}</p>
                  <p className={`text-sm ${l.status === 'rejected' ? 'text-red-700' : 'text-amber-700'}`}>{WAITING[l.status as string] ?? l.status}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}
