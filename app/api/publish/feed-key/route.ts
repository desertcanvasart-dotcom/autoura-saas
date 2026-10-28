import { withActor } from '@/lib/publish/admin-route'
import { feedKeyOf, newFeedKeyFor } from '@/lib/publish/admin'

// The data feed's key: whether there is one (and its first letters), and
// making a new one — shown once, the old one stops at once. Managers make.
export async function GET() {
  return withActor('read', (db, actor) => feedKeyOf(db, actor))
}

export async function POST() {
  return withActor('manage', (db, actor) => newFeedKeyFor(db, actor))
}
