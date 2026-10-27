import { withActor, jsonBody } from '@/lib/publish/admin-route'
import { embedSettingsOf, saveEmbedSettings } from '@/lib/publish/admin'

// Tours on the agency's own website: its embed key and the websites the
// blocks may appear on. Everyone on the team may look; managers change them.
export async function GET() {
  return withActor('read', (db, actor) => embedSettingsOf(db, actor))
}

export async function PUT(request: Request) {
  const body = await jsonBody(request)
  return withActor('manage', (db, actor) => saveEmbedSettings(db, actor, { origins: body.origins, newKey: body.newKey }))
}
