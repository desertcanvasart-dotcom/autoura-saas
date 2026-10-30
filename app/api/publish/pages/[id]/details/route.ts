import { withActor, jsonBody } from '@/lib/publish/admin-route'
import { saveTourDetails } from '@/lib/publish/admin'

// The tour facts the website shows that no other screen records: meeting
// point, guide languages, a day tour's hours and its stops. Managers.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await jsonBody(request)
  return withActor('manage', (db, actor) => saveTourDetails(db, actor, id, body))
}
