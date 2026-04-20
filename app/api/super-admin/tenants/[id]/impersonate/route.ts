import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, IMPERSONATE_COOKIE } from '@/lib/super-admin'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSuperAdmin()
    if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const admin = auth.adminClient!
    const { id } = await params

    // Verify tenant exists
    const { data: tenant, error } = await admin.from('tenants').select('id, company_name').eq('id', id).single()
    if (error || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 })
    }

    // Set impersonation cookie
    const response = NextResponse.json({
      success: true,
      tenantId: id,
      tenantName: tenant.company_name,
      redirectUrl: '/dashboard',
    })

    response.cookies.set(IMPERSONATE_COOKIE, id, {
      path: '/',
      httpOnly: false, // Needs to be readable by client for the banner
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 4, // 4 hours
    })

    return response
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
