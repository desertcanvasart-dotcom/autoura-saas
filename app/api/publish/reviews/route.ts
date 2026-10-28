import { withActor, jsonBody } from '@/lib/publish/admin-route'
import { findReviewPlaces, reviewsOf, saveReviews } from '@/lib/publish/admin'

// The agency's Google reviews: which business, whether they show (managers
// change), and finding the business on Google (POST { query }).
export async function GET() {
  return withActor('read', (db, actor) => reviewsOf(db, actor))
}

export async function POST(request: Request) {
  const body = await jsonBody(request)
  return withActor('manage', (db, actor) => findReviewPlaces(db, actor, body.query))
}

export async function PUT(request: Request) {
  const body = await jsonBody(request)
  return withActor('manage', (db, actor) => saveReviews(db, actor, { placeId: body.placeId ?? null, show: body.show }))
}
