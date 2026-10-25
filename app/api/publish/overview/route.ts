import { withActor } from '@/lib/publish/admin-route'
import { overview } from '@/lib/publish/admin'

// The company's website at a glance: site, sync health, domains, pages and
// the tours that have no page yet. Everyone on the team may look.
export async function GET() {
  return withActor('read', (db, actor) => overview(db, actor.tenantId))
}
