// POST /api/whatsapp/messages/[id]/transcribe — the inbox's "Transcribe"
// button, for a voice note that came in before transcription existed or whose
// transcript failed (2026-11-07). New voice notes are transcribed by the
// webhook on arrival. A finished transcript is returned as it is — no second
// charge; `?retry=1` redoes it.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { transcribeMessage, transcriptionEnabled, VOICE_ROW_COLS, type VoiceRow } from '@/lib/whatsapp/transcribe'

export const dynamic = 'force-dynamic'

let _admin: ReturnType<typeof createClient> | null = null
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _admin
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  // It spends money on the agency's OpenAI account: staff, not viewers.
  const denied = roleDenied(auth.role, 'staff')
  if (denied) return denied
  if (!transcriptionEnabled()) {
    return NextResponse.json({ success: false, error: 'Voice transcription is not set up for this workspace.' }, { status: 503 })
  }
  const { supabase } = auth
  if (!supabase) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
  const { id } = await params

  // The caller's RLS-bound read is the permission check: a message they
  // cannot see is a 404 before anything is fetched or paid for.
  const { data: row } = await supabase.from('whatsapp_messages').select(VOICE_ROW_COLS).eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ success: false, error: 'Message not found' }, { status: 404 })

  const retry = request.nextUrl.searchParams.get('retry') === '1'
  const out = await transcribeMessage(admin() as never, row as VoiceRow, { force: retry })
  if (!out.ok) {
    const error = out.reason === 'not_voice' ? 'This message has no voice note.'
      : out.reason === 'busy' ? 'It is already being transcribed — it will appear in a moment.'
      : 'Voice transcription is not set up for this workspace.'
    return NextResponse.json({ success: false, error, transcript: out.transcript ?? null }, { status: out.reason === 'busy' ? 409 : 400 })
  }
  return NextResponse.json({ success: true, transcript: out.transcript })
}
