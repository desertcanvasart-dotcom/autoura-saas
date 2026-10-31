import { NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { buildSiteExport, NoSiteToExport } from '@/lib/publish/export'
import { loadPagePayload } from '@/lib/publish/site-data'

// ============================================
// Download the whole website as one zip (step 12, PLAN §14). Managers.
// ============================================
// Answers the zip itself, not the JSON every other /api/publish route
// answers — the browser saves it.

export const maxDuration = 300

export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'manage')
  if (denied) return denied

  const db = createAdminClient()
  const get = async (url: string) => {
    try {
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
      return res.ok ? res : null
    } catch {
      return null
    }
  }
  try {
    const { zip, filename } = await buildSiteExport(db as never, auth.tenant_id, {
      page: input => loadPagePayload(db as never, { ...input, preview: false }),
      fetchText: async url => (await get(url))?.text() ?? null,
      fetchBytes: async url => { const r = await get(url); return r ? new Uint8Array(await r.arrayBuffer()) : null },
      media: async path => {
        const { data } = await db.storage.from('publish-media').download(path)
        return data ? new Uint8Array(await data.arrayBuffer()) : null
      },
      now: () => new Date(),
    })
    return new Response(zip as unknown as BodyInit, {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    })
  } catch (e) {
    if (e instanceof NoSiteToExport) return NextResponse.json({ success: false, error: e.message }, { status: 404 })
    console.error('[publish export]', e)
    return NextResponse.json({ success: false, error: 'The export failed' }, { status: 500 })
  }
}
