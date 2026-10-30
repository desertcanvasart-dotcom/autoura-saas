import { revalidateTag } from 'next/cache'
import { handleRevalidateRequest, revalidateSecrets } from '@/lib/publish/sync/revalidate'
import { SIGNATURE_HEADER } from '@/lib/concierge-webhook-auth'
import { forgetHosts } from '../../../lib/internal-api'

// ============================================
// The sync worker → "these pages changed"
// ============================================
// Signed by the GetAutoura app's publish-sync worker
// (lib/publish/sync/revalidate.ts). Each tag expires at once — the next
// visitor gets the new price, not a stale page while it rebuilds.

export async function POST(request: Request) {
  const result = await handleRevalidateRequest({
    rawBody: await request.text(),
    signatureHeader: request.headers.get(SIGNATURE_HEADER),
    secrets: revalidateSecrets(),
    revalidateTag: tag => revalidateTag(tag, { expire: 0 }),
  })
  // A company change (site tag) may be a domain or redirect change too.
  if (result.status === 200) forgetHosts()
  return Response.json(result.body, { status: result.status })
}
