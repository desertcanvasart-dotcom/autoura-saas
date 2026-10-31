import { withActor, jsonBody } from '@/lib/publish/admin-route'
import { findReviewPlaces, reviewsOf, saveReviews, PublishError } from '@/lib/publish/admin'
import { checkSharedRateLimit } from '@/lib/rate-limit-shared'

// The agency's Google reviews: which business, whether they show (managers
// change), and finding the business on Google (POST { query }). Each search
// is a billed Google call, so a company has an hourly ceiling
// (publishPlaceSearchCompany).
export async function GET() {
  return withActor('read', (db, actor) => reviewsOf(db, actor))
}

export async function POST(request: Request) {
  const body = await jsonBody(request)
  return withActor('manage', async (db, actor) => {
    const limit = await checkSharedRateLimit(`publish-place-search:${actor.tenantId}`, 'publishPlaceSearchCompany')
    if (!limit.success) throw new PublishError('Your company has searched Google many times this hour — try again later.', 429)
    return findReviewPlaces(db, actor, body.query)
  })
}

export async function PUT(request: Request) {
  const body = await jsonBody(request)
  return withActor('manage', (db, actor) => saveReviews(db, actor, { placeId: body.placeId ?? null, show: body.show }))
}
