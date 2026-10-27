import { withActor, jsonBody } from '@/lib/publish/admin-route'
import { editDraft } from '@/lib/publish/admin'

// A person's edit of a draft: held to the same post-check as the engine.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await jsonBody(request)
  return withActor('staff', (db, actor) => editDraft(db, actor, id, body.content))
}
