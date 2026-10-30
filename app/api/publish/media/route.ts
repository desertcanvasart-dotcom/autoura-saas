import { NextResponse } from 'next/server'
import { withActor } from '@/lib/publish/admin-route'
import { uploadPublishMedia } from '@/lib/publish/admin'

// Upload a website photo (the About page's team photo and people). Managers;
// the file goes into the company's own folder of the public website bucket.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'Choose a photo to upload.' }, { status: 400 })
  const bytes = await file.arrayBuffer()
  return withActor('manage', (db, actor) => uploadPublishMedia(db, actor, { type: file.type, size: file.size, bytes }))
}
