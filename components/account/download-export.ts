/** Fetches an export zip and saves it; returns an error message, or null. */
export async function downloadExport(scope: 'company' | 'me'): Promise<string | null> {
  try {
    const res = await fetch(`/api/account/export?scope=${scope}`)
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null
      return body?.error || (res.status === 429 ? 'Too many exports — try again in an hour.' : 'The export failed. Please try again.')
    }
    const blob = await res.blob()
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'autoura-export.zip'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return null
  } catch {
    return 'The export failed. Check your connection and try again.'
  }
}
