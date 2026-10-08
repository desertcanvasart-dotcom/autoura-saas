// Browser side of the blog image upload (app/api/super-admin/blog/upload).

/** Uploads an image and resolves to its public URL (throws with a message on failure). */
export async function uploadBlogImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/super-admin/blog/upload', { method: 'POST', body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) throw new Error(data.error || 'Upload failed')
  return data.url as string
}
