// ============================================
// GET /api/account/export?scope=company|me — download a data export (zip)
// ============================================
// scope=company: every row the company owns (owners and admins; the Terms'
//   6.3 promise, kept open through the 30 days after closing).
// scope=me: the signed-in person's own account data (anyone signed in).
// What goes in, and what is left out, is lib/account/data-export.ts.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient, createAuthenticatedClient } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { checkSharedRateLimit } from '@/lib/rate-limit-shared'
import { rateLimitResponse } from '@/lib/rate-limit'
import {
  buildExportZip,
  collectCompanyData,
  collectPersonalData,
  COMPANY_README,
  PERSONAL_README,
} from '@/lib/account/data-export'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function fileName(label: string): string {
  const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'export'
  return `autoura-${safe}-${new Date().toISOString().slice(0, 10)}.zip`
}

function zipResponse(bytes: Uint8Array, name: string): NextResponse {
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get('scope') === 'me' ? 'me' : 'company'
  try {
    if (scope === 'me') {
      const { data: { user } } = await (await createAuthenticatedClient()).auth.getUser()
      if (!user) return NextResponse.json({ success: false, error: 'Not signed in' }, { status: 401 })
      const limited = await checkSharedRateLimit(user.id, 'dataExport')
      if (!limited.success) return rateLimitResponse(limited)
      const tables = await collectPersonalData(createAdminClient(), user)
      return zipResponse(await buildExportZip(tables, PERSONAL_README), fileName('my-data'))
    }

    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const denied = roleDenied(auth.role, 'admin')
    if (denied) return denied
    const limited = await checkSharedRateLimit(auth.tenant_id, 'dataExport')
    if (!limited.success) return rateLimitResponse(limited)

    const admin = createAdminClient()
    const tables = await collectCompanyData(admin, auth.tenant_id)
    const name = String(tables.get('tenants')?.[0]?.company_name ?? 'company')
    return zipResponse(await buildExportZip(tables, COMPANY_README), fileName(name))
  } catch (err) {
    console.error('[account/export]', err)
    return NextResponse.json({ success: false, error: 'The export could not be built. Please try again.' }, { status: 500 })
  }
}
