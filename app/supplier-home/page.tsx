import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-server'
import { SESSION_COOKIE } from '@/lib/supplier-accounts'
import { supplierFromToken } from '@/lib/supplier-session'
import SignOutButton from './SignOutButton'

// The signed-in supplier's home (Phase 2B). This PR: who they are and which
// agencies have approved them; the inbox of requests and jobs comes next.

export const dynamic = 'force-dynamic'

const STATUS: Record<string, string> = {
  pending: 'Waiting for the agency to confirm it is you',
  approved: 'Connected',
  rejected: 'Not connected — contact the agency',
}

export default async function SupplierHomePage() {
  const db = createAdminClient() as unknown as SupabaseClient
  const signedIn = await supplierFromToken(db, (await cookies()).get(SESSION_COOKIE)?.value)
  if (!signedIn) redirect('/supplier-login')

  const { data: links } = await db.from('supplier_account_links')
    .select('id, tenant_id, status').eq('account_id', signedIn.account.id).order('requested_at')
  const tenantIds = [...new Set((links ?? []).map(l => l.tenant_id as string))]
  const { data: tenants } = tenantIds.length ? await db.from('tenants').select('id, company_name').in('id', tenantIds) : { data: [] }
  const nameOf = (id: string) => ((tenants ?? []).find(t => t.id === id)?.company_name as string | null) ?? 'An agency'

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-5 py-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-400">Autoura for suppliers</p>
          <h1 className="text-xl font-semibold mt-1 text-white">{signedIn.account.display_name ?? 'Welcome'}</h1>
          <p className="text-sm text-gray-300 mt-1">+{signedIn.account.phone}</p>
        </div>
        <SignOutButton />
      </header>
      <div className="max-w-md mx-auto px-4 py-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Your agencies</h2>
        {(links ?? []).length === 0 ? <p className="text-sm text-gray-500">No agencies yet.</p> : (
          <ul className="space-y-2">
            {(links ?? []).map(l => (
              <li key={l.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <p className="font-medium text-gray-900">{nameOf(l.tenant_id as string)}</p>
                <p className={`text-sm ${l.status === 'approved' ? 'text-green-700' : l.status === 'rejected' ? 'text-red-700' : 'text-amber-700'}`}>{STATUS[l.status as string] ?? l.status}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
