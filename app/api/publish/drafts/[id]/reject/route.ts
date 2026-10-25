import { withActor, jsonBody } from '@/lib/publish/admin-route'
import { rejectDraft } from '@/lib/publish/admin'

// Reject a draft with a note; the note is the next draft's instruction. Managers.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await jsonBody(request)
  return withActor('manage', (db, actor) => rejectDraft(db, actor, id, typeof body.note === 'string' ? body.note : ''))
}
