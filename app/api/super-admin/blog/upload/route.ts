// An image for the blog — a post's cover, or a picture in its text — for
// super admins. Stored in the public `blog-images` bucket (created on first
// use, like the avatars bucket) under a fresh random key, never upserted over
// another file. Returns the public URL the editor puts in the post.

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { blogDb as createServiceClient } from '@/lib/blog/db'
import { requireSuperAdmin } from '@/lib/super-admin'

const BUCKET = 'blog-images'
const MAX_BYTES = 5 * 1024 * 1024
// No SVG: an SVG is a document that can carry script, and these are public URLs.
const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  try {
    const file = (await request.formData()).get('file')
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'Choose an image to upload' }, { status: 400 })
    const ext = TYPES[file.type]
    if (!ext) return NextResponse.json({ success: false, error: 'Images must be PNG, JPEG, WebP or GIF' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ success: false, error: 'Images must be under 5MB' }, { status: 400 })

    const storage = createServiceClient().storage
    const path = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`
    const bytes = Buffer.from(await file.arrayBuffer())
    let { error } = await storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false })
    if (error && /bucket not found/i.test(error.message)) {
      const { error: createError } = await storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_BYTES,
        allowedMimeTypes: Object.keys(TYPES),
      })
      if (createError && !/already exists/i.test(createError.message)) throw createError
      ;({ error } = await storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false }))
    }
    if (error) throw error

    const { data } = storage.from(BUCKET).getPublicUrl(path)
    return NextResponse.json({ success: true, url: data.publicUrl })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to upload the image' }, { status: 500 })
  }
}
