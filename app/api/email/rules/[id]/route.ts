import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { normaliseRule } from '@/lib/email/mail-rules'

// PATCH   /api/email/rules/[id] — change a rule, or switch it on/off
// DELETE  /api/email/rules/[id]
// Managers and admins only; always within the caller's own company.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

const COLUMNS = 'id, name, enabled, conditions, actions, created_at, updated_at'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'manage')
  if (denied) return denied
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const patch: Record<string, unknown> = { updated_by: auth.user!.id, updated_at: new Date().toISOString() }
  if (body.conditions !== undefined || body.actions !== undefined || body.name !== undefined) {
    const rule = normaliseRule(body)
    if (!rule.ok) return NextResponse.json({ error: rule.error }, { status: 400 })
    Object.assign(patch, { name: rule.name, conditions: rule.conditions, actions: rule.actions })
  }
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled

  const { data, error } = await (createAdminClient() as unknown as Db)
    .from('email_rules')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', auth.tenant_id)
    .select(COLUMNS)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
  return NextResponse.json({ rule: data[0] })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'manage')
  if (denied) return denied
  const { id } = await params
  const { data, error } = await (createAdminClient() as unknown as Db)
    .from('email_rules')
    .delete()
    .eq('id', id)
    .eq('tenant_id', auth.tenant_id)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
