// ============================================
// API: WHATSAPP BLOCKED NUMBERS (migration 465)
// ============================================
// GET    /api/whatsapp/blocked   — the company's blocked numbers (everyone)
// POST   /api/whatsapp/blocked   — block { phone_number, reason? } (manager+)
// DELETE /api/whatsapp/blocked   — unblock { phone_number } (manager+)
//
// A blocked number's messages are not stored, notified, made leads or
// auto-answered (app/api/whatsapp/webhook, lib/whatsapp-blocked.ts). This
// blocks inside Autoura only — the sender's WhatsApp still delivers.
// The number travels in the body, never the URL (it would sit in logs).
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { checkBlockNumber } from '@/lib/whatsapp-blocked'

const COLUMNS = 'id, phone_number, reason, blocked_by, blocked_message_count, last_blocked_at, created_at'

// The authenticated client's shape for this one table — kept structural so
// the route builds whether or not the generated types know the table yet.
interface BlockedTable {
  select(columns: string): {
    eq(column: string, value: string): {
      order(column: string, opts: { ascending: boolean }): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }>
      }
    }
  }
  insert(row: Record<string, unknown>): {
    select(columns: string): { single(): PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> }
  }
  delete(): {
    eq(column: string, value: string): {
      eq(column: string, value: string): {
        select(columns: string): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
      }
    }
  }
}

function table(supabase: unknown): BlockedTable {
  return (supabase as { from(t: string): BlockedTable }).from('whatsapp_blocked_numbers')
}

async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? body : {}
  } catch {
    return {}
  }
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })

  const { data, error } = await table(auth.supabase)
    .select(COLUMNS)
    .eq('tenant_id', auth.tenant_id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, blocked: data ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'manage')
  if (denied) return denied

  const body = await readBody(request)
  const checked = checkBlockNumber(body.phone_number)
  if (!checked.ok) return NextResponse.json({ success: false, error: checked.error }, { status: 400 })
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 500) : null

  // Already blocked: answer with the existing block — blocking twice is not an error.
  const existing = await table(auth.supabase)
    .select(COLUMNS)
    .eq('tenant_id', auth.tenant_id)
    .eq('phone_number', checked.number)
    .maybeSingle()
  if (existing.error) return NextResponse.json({ success: false, error: existing.error.message }, { status: 500 })
  if (existing.data) return NextResponse.json({ success: true, blocked: existing.data })

  const { data, error } = await table(auth.supabase)
    .insert({ tenant_id: auth.tenant_id, phone_number: checked.number, reason, blocked_by: auth.user.id })
    .select(COLUMNS)
    .single()
  if (error) {
    // A second click that raced the first.
    if (error.code === '23505') return NextResponse.json({ success: true })
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, blocked: data }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  const denied = roleDenied(auth.role, 'manage')
  if (denied) return denied

  const body = await readBody(request)
  const checked = checkBlockNumber(body.phone_number)
  if (!checked.ok) return NextResponse.json({ success: false, error: checked.error }, { status: 400 })

  const { data, error } = await table(auth.supabase)
    .delete()
    .eq('tenant_id', auth.tenant_id)
    .eq('phone_number', checked.number)
    .select('id')
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  if (!data || data.length === 0) {
    return NextResponse.json({ success: false, error: 'That number is not blocked.' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
