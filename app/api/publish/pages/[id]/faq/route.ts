import { withActor, jsonBody } from '@/lib/publish/admin-route'
import { savePageFaq } from '@/lib/publish/admin'

// The page's questions and answers in one language. Managers.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await jsonBody(request)
  return withActor('manage', (db, actor) => savePageFaq(db, actor, id, body.language, body.items))
}
