import { withActor, jsonBody } from '@/lib/publish/admin-route'
import { setPublished } from '@/lib/publish/admin'

// Publish or unpublish one language of a page. Managers. A tour page
// publishes only when the thin-page rule allows it (D7).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await jsonBody(request)
  return withActor('manage', (db, actor) => setPublished(db, actor, id, body.published === true))
}
