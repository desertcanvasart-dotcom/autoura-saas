import { withActor, jsonBody } from '@/lib/publish/admin-route'
import { approvePublicRate } from '@/lib/publish/admin'

// Approve today's proposal as the tour's one public price. Managers. The
// body carries the bands the manager was shown; a moved price is refused.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await jsonBody(request)
  return withActor('manage', (db, actor) => approvePublicRate(db, actor, id, body.bands))
}
