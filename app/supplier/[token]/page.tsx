import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidSupplierPageToken } from '@/lib/supplier-portal'
import { loadSupplierAgency } from '@/lib/supplier-page-data'
import SupplierAgencyView from '@/components/supplier/SupplierAgencyView'

// A supplier's own page from one agency (migration 449): no login, the token
// is the credential (middleware opens /supplier; this page 404s anything that
// does not resolve to an unrevoked link). What it shows is shared with the
// signed-in inbox (lib/supplier-page-data, components/supplier/SupplierAgencyView).

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your bookings', robots: { index: false } }

export default async function SupplierPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isValidSupplierPageToken(token)) notFound()

  const db = createAdminClient() as unknown as SupabaseClient
  const { data: link } = await db
    .from('supplier_portal_links')
    .select('id, tenant_id, supplier_id')
    .eq('token', token)
    .is('revoked_at', null)
    .maybeSingle()
  if (!link) notFound()

  const data = await loadSupplierAgency(db, link.tenant_id, link.supplier_id, new Date().toISOString().slice(0, 10))
  if (!data) notFound()

  void db.from('supplier_portal_links').update({ last_opened_at: new Date().toISOString() }).eq('id', link.id)
    .then(({ error }) => { if (error) console.error('[supplier page] opened stamp:', error.message) })

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-5 py-6">
        <p className="text-xs uppercase tracking-widest text-gray-400">Bookings from {data.operatorName}</p>
        <h1 className="text-xl font-semibold mt-1 text-white">{data.supplierName}</h1>
        <p className="text-sm text-gray-300 mt-1">Answer with one tap — no login. Keep this link: it is the same every time.</p>
      </header>
      <div className="max-w-md mx-auto px-4 py-6">
        <SupplierAgencyView
          data={data}
          answerUrl={lineId => `/api/supplier-page/${token}/lines/${lineId}`}
          daysOffUrl={`/api/supplier-page/${token}/days-off`}
        />
        <p className="mt-8 text-xs text-gray-500">Work with several agencies on Autoura? <a href="/supplier-login" className="underline">Sign in</a> to see them all in one place.</p>
      </div>
    </main>
  )
}
