import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/super-admin'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSuperAdmin()
    if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const admin = auth.adminClient!
    const { id } = await params
    const body = await request.json()

    const allowedFields = [
      'b2c_enabled', 'b2b_enabled', 'whatsapp_integration', 'email_integration',
      'pdf_generation', 'analytics_enabled', 'max_users', 'max_quotes_per_month',
      'max_partners', 'primary_color', 'secondary_color', 'logo_url',
    ]
    const updates: Record<string, any> = {}
    for (const key of allowedFields) {
      if (body[key] !== undefined) updates[key] = body[key]
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 })
    }

    const { error } = await admin.from('tenant_features').update(updates).eq('tenant_id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
