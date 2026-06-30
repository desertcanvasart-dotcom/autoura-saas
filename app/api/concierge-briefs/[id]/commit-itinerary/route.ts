import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { promoteBriefToThread } from '@/lib/concierge/promote-brief-to-thread'
import { commitBriefToItinerary } from '@/lib/concierge/commit-brief-to-itinerary'

// ============================================
// CONCIERGE BRIEF → ITINERARY (operator action)
// File: app/api/concierge-briefs/[id]/commit-itinerary/route.ts
//
// GET  — returns the itinerary already committed from this brief (or null),
//        so the drawer can render "Create itinerary" vs "View itinerary".
// POST — idempotently creates the itinerary: ensures the brief has a Copilot
//        thread (promotes if missing), then commits thread → itinerary.
//
// Both are tenant-scoped via requireAuth() (RLS-scoped client + tenant_id).
// ============================================

// Resolve the thread linked to a brief; promote (create it) if missing.
async function resolveThreadId(
  briefId: string,
  tenantId: string,
  supabase: any
): Promise<string> {
  const { data: existing } = await supabase
    .from('communication_threads')
    .select('id')
    .eq('brief_id', briefId)
    .maybeSingle()
  if (existing?.id) return existing.id as string

  const promotion = await promoteBriefToThread(briefId, tenantId, supabase)
  return promotion.threadId
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requireAuth()
    if (authResult.error || !authResult.supabase) {
      return NextResponse.json(
        { success: false, error: authResult.error || 'Authentication failed' },
        { status: authResult.status || 401 }
      )
    }
    const { supabase } = authResult

    // The committed itinerary (if any) is reachable via the brief's thread.
    const { data: thread } = await supabase
      .from('communication_threads')
      .select('id')
      .eq('brief_id', id)
      .maybeSingle()

    if (!thread?.id) {
      return NextResponse.json({ success: true, data: { itinerary: null } })
    }

    const { data: itinerary } = await supabase
      .from('itineraries')
      .select('id, itinerary_code, trip_name, status')
      .eq('thread_id', thread.id)
      .maybeSingle()

    return NextResponse.json({ success: true, data: { itinerary: itinerary ?? null } })
  } catch (error) {
    console.error('Error in commit-itinerary GET:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requireAuth()
    if (authResult.error || !authResult.supabase) {
      return NextResponse.json(
        { success: false, error: authResult.error || 'Authentication failed' },
        { status: authResult.status || 401 }
      )
    }
    const { supabase, tenant_id: tenantId } = authResult
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'No tenant context.' },
        { status: 403 }
      )
    }

    // Verify the brief exists (RLS-scoped) before doing any writes.
    const { data: brief, error: briefErr } = await supabase
      .from('concierge_briefs')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (briefErr || !brief) {
      return NextResponse.json({ success: false, error: 'Brief not found' }, { status: 404 })
    }

    const threadId = await resolveThreadId(id, tenantId, supabase)
    const result = await commitBriefToItinerary(threadId, tenantId, supabase)

    return NextResponse.json(
      { success: true, data: result },
      { status: result.wasNewItinerary ? 201 : 200 }
    )
  } catch (error: any) {
    console.error('Error in commit-itinerary POST:', error?.message)
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to create itinerary from brief' },
      { status: 500 }
    )
  }
}
