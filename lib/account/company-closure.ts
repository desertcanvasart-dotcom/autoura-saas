// ============================================
// Closing a company: scheduled by its owner, deleted 30 days later
// ============================================
// The Terms (6.3): "Upon termination, you will have 30 days to export Your
// Data before it is deleted." Closing records the request in tenant_closures
// (migration 433) and stops the subscription renewing; the company keeps
// working — and exporting — until purge_after, and the owner can change
// their mind until then. The daily cron (app/api/cron/purge-closed-companies)
// then calls purgeCompany, which deletes in this order:
//
//   1. Stripe: the subscription is cancelled outright (no further charge).
//   2. Gmail: every member's connection for this company is revoked at Google.
//   3. Files: everything the company stored, in every bucket.
//   4. Rows: purge_tenant() — every table, one transaction.
//   5. Logins: members who belonged to no other company are deleted too
//      (super admins never).
//   6. A row in company_deletions records that it happened, and when.
//
// Files go before rows because their paths are read from the rows. A failure
// in 1-3 is recorded and the purge goes on: the promise is that the data is
// deleted, and a third party being down must not keep it here.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { isLive } from '@/lib/billing/subscription-sync'
import { isSuperAdmin } from '@/lib/super-admin-shared'
import { TRAVELLER_DOCS_BUCKET } from '@/lib/portal/traveller-documents'
import { SUPPLIER_CONTRACTS_BUCKET } from '@/lib/supplier-contracts'
import { SENT_DOCUMENTS_BUCKET } from '@/lib/storage/shareable-pdf'

type Admin = SupabaseClient<Database>

export const CLOSURE_GRACE_DAYS = 30

/** Buckets whose objects live under `<tenantId>/…`. */
const TENANT_FOLDER_BUCKETS = ['quote-pdfs', SENT_DOCUMENTS_BUCKET, 'supplier-invoices', SUPPLIER_CONTRACTS_BUCKET]

export function purgeDateFrom(now: Date): Date {
  return new Date(now.getTime() + CLOSURE_GRACE_DAYS * 24 * 60 * 60 * 1000)
}

/** The live Stripe subscription of a company, if it has one. */
async function liveSubscriptionId(admin: Admin, tenantId: string): Promise<string | null> {
  const { data } = await admin
    .from('tenant_subscriptions')
    .select('stripe_subscription_id, status')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return data?.stripe_subscription_id && isLive(data.status) ? data.stripe_subscription_id : null
}

/** Stop (or resume) renewal at period end. Best-effort: Stripe not configured
 *  or the subscription already gone is not a reason to refuse the request. */
export async function setRenewal(admin: Admin, tenantId: string, renew: boolean): Promise<string | null> {
  const id = await liveSubscriptionId(admin, tenantId)
  if (!id || !process.env.STRIPE_SECRET_KEY) return null
  try {
    const { cancelSubscription, reactivateSubscription } = await import('@/lib/stripe')
    if (renew) await reactivateSubscription(id)
    else await cancelSubscription(id, false)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

/** Every object path under `prefix` in `bucket`, walking sub-folders. */
async function listAll(admin: Admin, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = []
  const folders = [prefix]
  while (folders.length) {
    const folder = folders.pop()!
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000, offset })
      if (error) throw new Error(`${bucket}/${folder}: ${error.message}`)
      for (const entry of data ?? []) {
        const path = folder ? `${folder}/${entry.name}` : entry.name
        // A folder has no id in a Storage listing.
        if (entry.id) paths.push(path)
        else folders.push(path)
      }
      if ((data ?? []).length < 1000) break
    }
  }
  return paths
}

async function removeAll(admin: Admin, bucket: string, paths: string[]): Promise<number> {
  let removed = 0
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100)
    const { error } = await admin.storage.from(bucket).remove(batch)
    if (error) throw new Error(`${bucket}: ${error.message}`)
    removed += batch.length
  }
  return removed
}

/** Every stored path a company's rows point at, in buckets not keyed by company. */
async function pathsFromRows(admin: Admin, tenantId: string): Promise<Array<[string, string[]]>> {
  const out: Array<[string, string[]]> = []
  const { data: docs } = await admin
    .from('booking_passenger_documents')
    .select('storage_path')
    .eq('tenant_id', tenantId)
    .not('storage_path', 'is', null)
  out.push([TRAVELLER_DOCS_BUCKET, (docs ?? []).map(d => d.storage_path).filter(Boolean) as string[]])
  const { data: media } = await admin
    .from('whatsapp_messages')
    .select('media_storage_path')
    .eq('tenant_id', tenantId)
    .not('media_storage_path', 'is', null)
  out.push(['whatsapp-media', (media ?? []).map(m => m.media_storage_path).filter(Boolean) as string[]])
  return out
}

export type PurgeSummary = {
  files_removed: number
  logins_deleted: number
  gmail_revoked: number
  problems: string[]
}

/** Deletes a company for good. Throws only if the rows could not be deleted. */
export async function purgeCompany(admin: Admin, tenantId: string): Promise<PurgeSummary> {
  const summary: PurgeSummary = { files_removed: 0, logins_deleted: 0, gmail_revoked: 0, problems: [] }

  const { data: tenant } = await admin.from('tenants').select('company_name, logo_url').eq('id', tenantId).maybeSingle()
  const { data: closure } = await admin.from('tenant_closures').select('requested_by, requested_at').eq('tenant_id', tenantId).maybeSingle()
  const { data: members } = await admin.from('tenant_members').select('user_id').eq('tenant_id', tenantId)
  const memberIds = [...new Set((members ?? []).map(m => m.user_id))]

  // 1. Stripe
  const subId = await liveSubscriptionId(admin, tenantId)
  if (subId && process.env.STRIPE_SECRET_KEY) {
    try {
      const { cancelSubscription } = await import('@/lib/stripe')
      await cancelSubscription(subId, true)
    } catch (err) {
      summary.problems.push(`stripe: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // 2. Gmail
  const { revokeAndForgetMailbox } = await import('@/lib/gmail-revoke')
  for (const userId of memberIds) {
    const r = await revokeAndForgetMailbox(userId, tenantId)
    summary.gmail_revoked += r.revoked
    if (r.error) summary.problems.push(`gmail: ${r.error}`)
  }

  // 3. Files
  const targets: Array<[string, () => Promise<string[]>]> = TENANT_FOLDER_BUCKETS.map(
    b => [b, () => listAll(admin, b, tenantId)] as [string, () => Promise<string[]>],
  )
  // Logos are named `<tenantId>-<time>.<ext>` at the bucket root.
  targets.push(['tenant-logos', async () => {
    const { data } = await admin.storage.from('tenant-logos').list('', { limit: 1000, search: tenantId })
    return (data ?? []).map(f => f.name).filter(n => n.startsWith(tenantId))
  }])
  for (const [bucket, paths] of await pathsFromRows(admin, tenantId)) targets.push([bucket, async () => paths])
  for (const [bucket, list] of targets) {
    try {
      summary.files_removed += await removeAll(admin, bucket, await list())
    } catch (err) {
      summary.problems.push(`files: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // 4. Rows
  const { error: purgeError } = await admin.rpc('purge_tenant', { p_tenant_id: tenantId })
  if (purgeError) throw new Error(`purge_tenant: ${purgeError.message}`)

  // 5. Logins that belonged only to this company
  for (const userId of memberIds) {
    const { count } = await admin.from('tenant_members').select('id', { count: 'exact', head: true }).eq('user_id', userId)
    if ((count ?? 0) > 0) continue
    const { data: u } = await admin.auth.admin.getUserById(userId)
    if (!u?.user || isSuperAdmin(u.user.email ?? '')) continue
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) summary.problems.push(`login: ${error.message}`)
    else summary.logins_deleted++
  }

  // 6. The record
  await admin.from('company_deletions').insert({
    former_tenant_id: tenantId,
    company_name: tenant?.company_name ?? null,
    requested_by: closure?.requested_by ?? null,
    requested_at: closure?.requested_at ?? null,
    summary,
  })

  return summary
}
