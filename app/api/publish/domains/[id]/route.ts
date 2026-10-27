import { withActor } from '@/lib/publish/admin-route'
import { removeDomain } from '@/lib/publish/admin'

// Disconnect a domain from the website. Managers.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withActor('manage', (db, actor) => removeDomain(db, actor, id))
}
