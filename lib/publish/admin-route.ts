// ============================================
// Publish admin routes — sign in, check the role, answer plainly
// ============================================
// Every /api/publish/* route (not /internal) goes through here: the caller
// is signed in to a company, holds the role the action needs (writers draft
// and edit; managers add pages, approve, reject and publish — PLAN §4), and a
// broken rule comes back as its own message and status, not a 500.

import { NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { roleDenied, type RoleLevel } from '@/lib/api-role-gate'
import { PublishError, type Actor } from './admin'

type Db = ReturnType<typeof createAdminClient>

export async function withActor(level: RoleLevel | 'read', run: (db: Db, actor: Actor) => Promise<unknown>): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  if (level !== 'read') {
    const denied = roleDenied(auth.role, level)
    if (denied) return denied
  }
  const meta = (auth.user?.user_metadata ?? {}) as { full_name?: unknown; name?: unknown }
  const name = [meta.full_name, meta.name, auth.user?.email].find((v): v is string => typeof v === 'string' && v.trim() !== '') ?? 'A team member'
  try {
    const data = await run(createAdminClient(), { tenantId: auth.tenant_id, userId: auth.user!.id, name })
    return NextResponse.json({ success: true, data })
  } catch (e) {
    if (e instanceof PublishError) return NextResponse.json({ success: false, error: e.message }, { status: e.status })
    console.error('[publish admin]', e)
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Something went wrong' }, { status: 500 })
  }
}

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const b = await request.json()
    return b && typeof b === 'object' ? b as Record<string, unknown> : {}
  } catch {
    return {}
  }
}
