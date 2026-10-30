import { withActor, jsonBody } from '@/lib/publish/admin-route'
import { createTourPage, PublishError } from '@/lib/publish/admin'

// Add a tour's page (one per language of the site, unpublished). Managers.
export async function POST(request: Request) {
  const body = await jsonBody(request)
  return withActor('manage', (db, actor) => {
    if (typeof body.tourTemplateId !== 'string') throw new PublishError('Say which tour: tourTemplateId.', 400)
    return createTourPage(db, actor, body.tourTemplateId)
  })
}
