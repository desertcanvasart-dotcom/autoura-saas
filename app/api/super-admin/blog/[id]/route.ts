// One blog post, for super admins: read it to edit, save it, delete it.

import { NextRequest, NextResponse } from 'next/server'
import { blogDb as createServiceClient } from '@/lib/blog/db'
import { requireSuperAdmin } from '@/lib/super-admin'
import { validatePostInput, SLUG_TAKEN, POST_COLUMNS } from '@/lib/blog/posts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Ctx = { params: Promise<{ id: string }> }

async function guard(ctx: Ctx) {
  const auth = await requireSuperAdmin()
  if (auth.error !== null) return { res: NextResponse.json({ success: false, error: auth.error }, { status: auth.status }) }
  const { id } = await ctx.params
  if (!UUID.test(id)) return { res: NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 }) }
  return { id }
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx)
  if (g.res) return g.res
  try {
    const { data, error } = await createServiceClient().from('blog_posts').select(POST_COLUMNS).eq('id', g.id).maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 })
    return NextResponse.json({ success: true, post: data })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to load the post' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const g = await guard(ctx)
  if (g.res) return g.res
  try {
    const checked = validatePostInput(await request.json().catch(() => null))
    if (!checked.ok) return NextResponse.json({ success: false, error: checked.error }, { status: 400 })
    const db = createServiceClient()
    const { data: current, error: readError } = await db.from('blog_posts').select('published_at').eq('id', g.id).maybeSingle()
    if (readError) throw readError
    if (!current) return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 })

    const now = new Date().toISOString()
    const { data, error } = await db
      .from('blog_posts')
      .update({
        ...checked.post,
        // First publish stamps the date; re-saving or unpublishing keeps it,
        // so a post republished after a fix does not jump to the top.
        published_at: current.published_at ?? (checked.post.status === 'published' ? now : null),
        updated_at: now,
      })
      .eq('id', g.id)
      .select(POST_COLUMNS)
      .single()
    if (error?.code === '23505') return NextResponse.json({ success: false, error: SLUG_TAKEN }, { status: 409 })
    if (error) throw error
    return NextResponse.json({ success: true, post: data })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to save the post' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx)
  if (g.res) return g.res
  try {
    const { error } = await createServiceClient().from('blog_posts').delete().eq('id', g.id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to delete the post' }, { status: 500 })
  }
}
