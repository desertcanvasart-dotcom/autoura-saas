// ============================================
// A fresh quote PDF, shared by a signed link
// ============================================
// Every WhatsApp quote send renders the PDF anew — the route and the AI agent
// alike. Reusing quote.pdf_url attached a link that expired after 7 days,
// showed the old prices after a re-price, or (written by generate-pdf) was a
// public URL of the private bucket nobody could open.

import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDocumentIdentity } from '@/lib/document-identity'
import { uploadShareablePdf } from '@/lib/storage/shareable-pdf'
import B2CQuotePDF from '@/components/pdf/B2CQuotePDF'
import B2BQuotePDF from '@/components/pdf/B2BQuotePDF'

export type FreshQuotePdf = { ok: true; url: string } | { ok: false; error: string }

/** Renders the quote on the tenant's letterhead, uploads it as a new file and
 *  records the link on the quote (for reference, never reused). */
export async function freshQuotePdf(
  admin: SupabaseClient,
  opts: { type: 'b2c' | 'b2b'; quote: Record<string, unknown> & { id: string }; tenantId: string }
): Promise<FreshQuotePdf> {
  const company = await loadDocumentIdentity(opts.tenantId)
  const element = opts.type === 'b2c'
    ? createElement(B2CQuotePDF, { quote: opts.quote, company } as never)
    : createElement(B2BQuotePDF, { quote: opts.quote, company } as never)
  const bytes = (await renderToBuffer(element as never)) as Buffer

  // quote-pdfs is PRIVATE (migration 004): a signed link, and a new file per
  // send so the link in an earlier message keeps showing what it sent.
  const shared = await uploadShareablePdf(admin, {
    tenantId: opts.tenantId,
    kind: 'quotes',
    fileName: `${opts.type}-${opts.quote.id}-${Date.now()}.pdf`,
    bytes,
    bucket: 'quote-pdfs',
  })
  if (!shared.ok) return { ok: false, error: shared.error }

  await admin
    .from(opts.type === 'b2c' ? 'b2c_quotes' : 'b2b_quotes')
    .update({ pdf_url: shared.url, pdf_generated_at: new Date().toISOString() })
    .eq('id', opts.quote.id)
  return { ok: true, url: shared.url }
}
