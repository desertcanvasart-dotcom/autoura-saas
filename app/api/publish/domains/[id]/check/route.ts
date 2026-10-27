import { withActor } from '@/lib/publish/admin-route'
import { checkDomain } from '@/lib/publish/admin'

// How far a domain has got (DNS, certificate) — and the records to add. Staff.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withActor('staff', (db, actor) => checkDomain(db, actor, id))
}
