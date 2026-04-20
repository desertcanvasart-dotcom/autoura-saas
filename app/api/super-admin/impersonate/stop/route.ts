import { NextResponse } from 'next/server'
import { requireSuperAdmin, IMPERSONATE_COOKIE } from '@/lib/super-admin'

export async function POST() {
  try {
    const auth = await requireSuperAdmin()
    if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })

    const response = NextResponse.json({ success: true, redirectUrl: '/super-admin' })
    response.cookies.set(IMPERSONATE_COOKIE, '', { path: '/', maxAge: 0 })
    return response
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
