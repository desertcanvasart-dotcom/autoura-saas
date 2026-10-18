// ============================================
// After a supplier voucher goes out: mark it sent, on the server
// ============================================
// The email route sent the voucher and the page then marked it sent with a
// second request of its own. The send routes now record it themselves, once
// the message has actually gone. Pass the caller's RLS-scoped client: it
// reaches only the tenant's own vouchers.
//
// Sending again records the latest send. It never moves a voucher backwards:
// one already confirmed or completed keeps that status.

type Db = {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

const ADVANCES_TO_SENT = ['draft', 'sent']

export async function markSupplierDocumentSent(
  db: Db,
  args: { documentId: string; now?: Date }
): Promise<{ error: string | null }> {
  const at = (args.now ?? new Date()).toISOString()
  const { data: row, error: readError } = await db
    .from('supplier_documents')
    .select('status')
    .eq('id', args.documentId)
    .maybeSingle()
  if (readError || !row) return { error: readError?.message ?? 'Document not found' }

  const update: Record<string, unknown> = { sent_at: at, updated_at: at }
  if (ADVANCES_TO_SENT.includes(row.status ?? 'draft')) update.status = 'sent'

  const { error } = await db.from('supplier_documents').update(update).eq('id', args.documentId)
  return { error: error?.message ?? null }
}
