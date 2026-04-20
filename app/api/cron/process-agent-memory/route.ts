// ============================================================
// app/api/cron/process-agent-memory/route.ts
//
// Railway Cron Job — Agent Memory Feedback Loop
// Schedule: every night at 02:00 UTC
//
// In railway.toml, add:
//   [[cron]]
//   schedule = "0 2 * * *"
//   command = "curl -X POST https://your-domain.com/api/cron/process-agent-memory -H 'x-cron-secret: $CRON_SECRET'"
//
// What it does:
//   1. Finds agent_runs from the last 24 hours (status=success)
//      that haven't been processed for memory yet
//   2. Calls processRunForMemory() for each
//   3. Purges expired memories
//   4. Returns a summary
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processRunForMemory } from '@/lib/agent-memory'

// Lazy-init admin client (same pattern as other cron routes)
let _supabaseAdmin: ReturnType<typeof createClient> | null = null

function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

export async function POST(request: NextRequest) {
  // Verify cron secret — same pattern as your existing cron routes
  const cronSecret = request.headers.get('x-cron-secret')
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const supabaseAdmin = getSupabaseAdmin()

  console.log('🧠 Agent memory cron: starting...')

  // --------------------------------------------------------
  // STEP 1: Find unprocessed successful runs from last 24h
  // We track processed runs by a simple flag — agent_runs
  // that have itinerary_id set and were successful.
  // We process runs that are >5 minutes old (itinerary fully created)
  // and <25 hours old (fresh data only).
  // --------------------------------------------------------

  const cutoffTime = new Date(Date.now() - 5 * 60 * 1000).toISOString()    // 5 min ago
  const windowStart = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() // 25h ago

  const { data: runsToProcess, error: fetchError } = await supabaseAdmin
    .from('agent_runs')
    .select('id, tenant_id, itinerary_id, agent_type')
    .eq('status', 'success')
    .eq('agent_type', 'itinerary')
    .not('itinerary_id', 'is', null)
    .gte('created_at', windowStart)
    .lte('created_at', cutoffTime)
    .limit(100)

  if (fetchError) {
    console.error('🧠 Memory cron: failed to fetch runs:', fetchError)
    return NextResponse.json(
      { success: false, error: fetchError.message },
      { status: 500 }
    )
  }

  console.log(`🧠 Memory cron: found ${runsToProcess?.length || 0} runs to process`)

  // --------------------------------------------------------
  // STEP 2: Process each run for memory extraction
  // --------------------------------------------------------

  let totalMemoriesWritten = 0
  let runsProcessed = 0
  let runsFailed = 0

  for (const run of runsToProcess || []) {
    try {
      const result = await processRunForMemory({
        supabaseAdmin,
        tenant_id: run.tenant_id,
        itinerary_id: run.itinerary_id,
      })

      totalMemoriesWritten += result.memories_written
      runsProcessed++

      console.log(
        `🧠 Processed run ${run.id}: ${result.memories_written} memories written`
      )
    } catch (err) {
      console.error(`🧠 Failed to process run ${run.id}:`, err)
      runsFailed++
    }
  }

  // --------------------------------------------------------
  // STEP 3: Purge expired memories
  // --------------------------------------------------------

  let memoriesPurged = 0
  try {
    const { data: purgeResult } = await supabaseAdmin.rpc(
      'purge_expired_agent_memories'
    )
    memoriesPurged = purgeResult || 0
    console.log(`🧠 Purged ${memoriesPurged} expired memories`)
  } catch (err) {
    console.error('🧠 Memory purge failed:', err)
  }

  const duration = Date.now() - startTime

  const summary = {
    success: true,
    runs_found: runsToProcess?.length || 0,
    runs_processed: runsProcessed,
    runs_failed: runsFailed,
    memories_written: totalMemoriesWritten,
    memories_purged: memoriesPurged,
    duration_ms: duration,
  }

  console.log('🧠 Agent memory cron complete:', summary)

  return NextResponse.json(summary)
}
