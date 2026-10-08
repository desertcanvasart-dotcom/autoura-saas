// The product blog, for super admins: every post (drafts included), and
// writing a new one. The public pages read published posts on their own
// (lib/blog/posts.ts); this route is the only way in for the editor.

import { NextRequest, NextResponse } from 'next/server'
import { blogDb as createServiceClient } from '@/lib/blog/db'
import { requireSuperAdmin } from '@/lib/super-admin'
import { validatePostInput, SLUG_TAKEN, POST_COLUMNS } from '@/lib/blog/posts'

export async function GET() {
  const auth = await requireSuperAdmin()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  try {
    const { data, error } = await createServiceClient()
      .from('blog_posts')
      .select('id, slug, language, title, excerpt, cover_image_url, author_name, tags, status, published_at, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(500)
    if (error) throw error
    return NextResponse.json({ success: true, posts: data ?? [] })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to load posts' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  try {
    const checked = validatePostInput(await request.json().catch(() => null))
    if (!checked.ok) return NextResponse.json({ success: false, error: checked.error }, { status: 400 })
    const now = new Date().toISOString()
    const { data, error } = await createServiceClient()
      .from('blog_posts')
      .insert({
        ...checked.post,
        published_at: checked.post.status === 'published' ? now : null,
        created_by: auth.user?.id ?? null,
      })
      .select(POST_COLUMNS)
      .single()
    if (error?.code === '23505') return NextResponse.json({ success: false, error: SLUG_TAKEN }, { status: 409 })
    if (error) throw error
    return NextResponse.json({ success: true, post: data }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to save the post' }, { status: 500 })
  }
}
