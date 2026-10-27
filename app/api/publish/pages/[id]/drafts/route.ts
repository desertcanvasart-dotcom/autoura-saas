import { withActor, jsonBody } from '@/lib/publish/admin-route'
import { draftWithEngine, PublishError } from '@/lib/publish/admin'

export const maxDuration = 120

const KINDS = ['overview', 'highlights', 'days', 'seo', 'labels'] as const

// Ask the content engine for a draft of one part of the page. Writers.
// The draft lands for review — nothing is published by this.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await jsonBody(request)
  return withActor('staff', (db, actor) => {
    const kind = KINDS.find(k => k === body.kind) ?? null
    if (!kind) throw new PublishError(`Say which part: one of ${KINDS.join(', ')}.`, 400)
    if (typeof body.language !== 'string') throw new PublishError('Say which language.', 400)
    return draftWithEngine(db, actor, id, {
      language: body.language, kind,
      instruction: typeof body.instruction === 'string' ? body.instruction.slice(0, 1000) : null,
    })
  })
}
