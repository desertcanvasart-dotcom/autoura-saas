// ============================================
// POST /api/day-blocks/import — the block sheet, previewed or applied
// ============================================
// Body: { csv: string, apply?: boolean }
//   apply false (default) — what the sheet would add and change, and the rows
//                           it cannot read; nothing is written.
//   apply true            — the same plan, written. Rows with problems are
//                           never written; blocks the sheet omits are kept.

import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import { requireAuth } from '@/lib/supabase-server'
import { blocksFromSheet } from '@/lib/day-blocks/blocks'
import { planImport, type StoredBlock } from '@/lib/day-blocks/import-plan'
import { BLOCK_COLS, BLOCK_WRITE_DENIED, BLOCK_WRITE_ROLES } from '@/lib/day-blocks/access'
import type { Json } from '@/types/database.types'

export const dynamic = 'force-dynamic'

const MAX_CSV = 2_000_000

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase, tenant_id, role } = auth
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    if (!BLOCK_WRITE_ROLES.includes(role || '')) return NextResponse.json({ success: false, error: BLOCK_WRITE_DENIED }, { status: 403 })

    const body = await request.json().catch(() => ({})) as { csv?: unknown; apply?: unknown }
    const csv = typeof body.csv === 'string' ? body.csv : ''
    if (!csv.trim()) return NextResponse.json({ success: false, error: 'The file is empty.' }, { status: 400 })
    if (csv.length > MAX_CSV) return NextResponse.json({ success: false, error: 'The file is too large.' }, { status: 400 })

    const parsed = Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ''), { header: true, skipEmptyLines: 'greedy' })
    const sheet = blocksFromSheet(parsed.data)

    const { data: storedRows, error: readError } = await supabase.from('day_blocks').select(BLOCK_COLS).eq('tenant_id', tenant_id)
    if (readError) throw readError
    const plan = planImport(sheet.blocks, (storedRows ?? []) as unknown as StoredBlock[])

    const summary = {
      added: plan.added.map(b => b.code),
      updated: plan.updated.map(u => ({ code: u.block.code, changed: u.changed })),
      unchanged: plan.unchanged,
      problems: sheet.problems,
    }
    if (body.apply !== true) return NextResponse.json({ success: true, data: { ...summary, applied: false } })

    const now = new Date().toISOString()
    const rows = [...plan.added, ...plan.updated.map(u => u.block)].map(b => ({
      ...b,
      meals: b.meals as unknown as Json,
      // The tenant is the caller's own — never the sheet's.
      tenant_id,
      updated_at: now,
    }))
    if (rows.length > 0) {
      const { error } = await supabase.from('day_blocks').upsert(rows, { onConflict: 'tenant_id,code' })
      if (error) throw error
    }
    return NextResponse.json({ success: true, data: { ...summary, applied: true } })
  } catch (error) {
    console.error('POST day-blocks/import error:', error)
    return NextResponse.json({ success: false, error: 'Failed to import the day blocks' }, { status: 500 })
  }
}
