import { withActor, jsonBody } from '@/lib/publish/admin-route'
import { addDomain, claimFreeAddress, domainsOf } from '@/lib/publish/admin'

// The website's addresses (step 11). Everyone may look; managers add —
// either the agency's own domain ({ hostname }) or a free address on ours
// ({ freeLabel }).
export async function GET() {
  return withActor('read', (db, actor) => domainsOf(db, actor))
}

export async function POST(request: Request) {
  const body = await jsonBody(request)
  return withActor('manage', (db, actor) => body.freeLabel !== undefined
    ? claimFreeAddress(db, actor, body.freeLabel)
    : addDomain(db, actor, body.hostname))
}
