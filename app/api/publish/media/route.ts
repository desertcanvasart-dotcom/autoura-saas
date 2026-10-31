import { withActor } from '@/lib/publish/admin-route'
import { MEDIA_MAX_BYTES, PublishError, uploadPublishMedia } from '@/lib/publish/admin'

/** Room for the multipart wrapping around the photo itself. */
const FORM_OVERHEAD_BYTES = 64 * 1024

// Upload a website photo (the About page's team photo and people). Managers;
// the file goes into the company's own folder of the public website bucket.
// The caller is signed in and allowed before the body is read, and a body
// that says it is too big is refused without reading it.
export async function POST(request: Request) {
  return withActor('manage', async (db, actor) => {
    const declared = Number(request.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > MEDIA_MAX_BYTES + FORM_OVERHEAD_BYTES) throw new PublishError('Photos must be under 10 MB.', 413)
    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) throw new PublishError('Choose a photo to upload.', 400)
    const bytes = await file.arrayBuffer()
    return uploadPublishMedia(db, actor, { type: file.type, size: file.size, bytes })
  })
}
