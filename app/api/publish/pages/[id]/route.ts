import { NextRequest } from 'next/server'
import { withActor } from '@/lib/publish/admin-route'
import { pageDetail } from '@/lib/publish/admin'

// One page in one language: its facts, the approved text that still shows
// (and what is withheld as out of date), drafts and published versions.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const language = request.nextUrl.searchParams.get('lang') ?? 'en'
  return withActor('read', (db, actor) => pageDetail(db, actor, id, language))
}
