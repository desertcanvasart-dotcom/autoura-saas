import { withActor, jsonBody } from '@/lib/publish/admin-route'
import { lookOf, saveLook } from '@/lib/publish/admin'

// The website's look — theme, colours, fonts. Everyone on the team may look;
// managers change it (brand studio, redesign 2026-10-27).
export async function GET() {
  return withActor('read', (db, actor) => lookOf(db, actor))
}

export async function PUT(request: Request) {
  const body = await jsonBody(request)
  return withActor('manage', (db, actor) => saveLook(db, actor, { archetype: body.archetype, palette: body.palette, fontPair: body.fontPair, website: body.website }))
}
