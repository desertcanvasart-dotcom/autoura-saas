import { withActor, jsonBody } from '@/lib/publish/admin-route'
import { setSiteLive } from '@/lib/publish/admin'

// Make the website public ({ live: true }) or take it back to draft. Managers.
export async function POST(request: Request) {
  const body = await jsonBody(request)
  return withActor('manage', (db, actor) => setSiteLive(db, actor, body.live === true))
}
