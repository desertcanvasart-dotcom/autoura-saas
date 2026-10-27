import { withActor } from '@/lib/publish/admin-route'
import { setMainDomain } from '@/lib/publish/admin'

// Make a ready domain the website's main address. Managers.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withActor('manage', (db, actor) => setMainDomain(db, actor, id))
}
