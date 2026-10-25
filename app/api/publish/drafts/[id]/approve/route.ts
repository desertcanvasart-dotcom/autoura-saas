import { withActor } from '@/lib/publish/admin-route'
import { approveDraft } from '@/lib/publish/admin'

// Approve a draft: it becomes a new published version of the page's text.
// Managers. Re-checks the text, and refuses text written about facts that
// have since changed.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withActor('manage', (db, actor) => approveDraft(db, actor, id))
}
