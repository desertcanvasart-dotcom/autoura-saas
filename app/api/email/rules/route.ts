import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { roleDenied, roleAllows } from '@/lib/api-role-gate'
import { normaliseRule } from '@/lib/email/mail-rules'

// ============================================
// Mail rules — the company's list (migration 422)
// ============================================
// GET   everyone in the company sees the rules (and whether they may edit)
// POST  managers and admins add one

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

const COLUMNS = 'id, name, enabled, conditions, actions, created_at, updated_at'

export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const { data, error } = await (auth.supabase as unknown as Db)
    .from('email_rules')
    .select(COLUMNS)
    .eq('tenant_id', auth.tenant_id)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rules: data ?? [], canEdit: roleAllows(auth.role, 'manage') })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'manage')
  if (denied) return denied

  const rule = normaliseRule(await request.json().catch(() => ({})))
  if (!rule.ok) return NextResponse.json({ error: rule.error }, { status: 400 })

  const { data, error } = await (createAdminClient() as unknown as Db)
    .from('email_rules')
    .insert({
      tenant_id: auth.tenant_id,
      name: rule.name,
      enabled: true,
      conditions: rule.conditions,
      actions: rule.actions,
      created_by: auth.user!.id,
      updated_by: auth.user!.id,
    })
    .select(COLUMNS)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rule: data })
}
