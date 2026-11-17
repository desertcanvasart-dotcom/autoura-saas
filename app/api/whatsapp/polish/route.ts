// ============================================
// POST /api/whatsapp/polish — the operator's notes → a finished message
// ============================================
// Body: { conversation_id, notes, style }
// Returns { success, message, language, unsourced_numbers }. Sends NOTHING:
// the text goes back into the message box for the operator to read and send.
// Rules and styles: lib/whatsapp/polish-reply.ts.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { aiBudgetDenied, aiInputTooLong } from '@/lib/ai-guard'
import { createMessageWithRetry, getUserFriendlyError, isAiServiceError, replyText } from '@/lib/ai/anthropic-client'
import { whatsappModel } from '@/lib/ai/models'
import { messageWords } from '@/lib/whatsapp/transcript'
import { buildPolishPrompt, parsePolishReply, polishStyle, unsourcedNumbers, type PolishMessage } from '@/lib/whatsapp/polish-reply'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase || !auth.tenant_id || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase, tenant_id, user } = auth
    const overBudget = await aiBudgetDenied(user.id, tenant_id)
    if (overBudget) return overBudget

    const body = await request.json().catch(() => ({}))
    const conversationId = typeof body.conversation_id === 'string' ? body.conversation_id : ''
    const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
    if (!conversationId) return NextResponse.json({ success: false, error: 'conversation_id is required' }, { status: 400 })
    if (!notes) return NextResponse.json({ success: false, error: 'Type what you want to say first' }, { status: 400 })
    const tooLong = aiInputTooLong(notes, 8000)
    if (tooLong) return tooLong
    const style = polishStyle(body.style)

    const { data: conv } = await supabase
      .from('whatsapp_conversations')
      .select('id, tenant_id, client_name')
      .eq('id', conversationId)
      .maybeSingle()
    if (!conv || conv.tenant_id !== tenant_id) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 })
    }

    const { data: rows } = await supabase
      .from('whatsapp_messages')
      .select('direction, message_body, message_text, metadata, sent_at')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: false })
      .limit(12)
    const messages: PolishMessage[] = (rows ?? [])
      .map(m => ({ direction: m.direction === 'inbound' ? 'inbound' as const : 'outbound' as const, text: messageWords(m) }))
      .filter(m => m.text)
      .reverse()

    const { data: tenant } = await supabase.from('tenants').select('company_name').eq('id', tenant_id).maybeSingle()
    const businessName = (tenant as { company_name?: string } | null)?.company_name || 'the travel agency'

    const prompt = buildPolishPrompt({ businessName, style: style.key, notes, messages, customerName: conv.client_name })

    let result: ReturnType<typeof parsePolishReply> = null
    try {
      const resp = await createMessageWithRetry({
        model: whatsappModel(),
        // Room for adaptive thinking plus the message.
        max_tokens: 8000,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
      })
      result = parsePolishReply(replyText(resp))
    } catch (err) {
      if (isAiServiceError(err)) {
        const e = getUserFriendlyError(err)
        return NextResponse.json({ success: false, error: e.message }, { status: e.status })
      }
      throw err
    }
    if (!result) return NextResponse.json({ success: false, error: 'The AI gave no usable message — try again.' }, { status: 502 })

    return NextResponse.json({
      success: true,
      message: result.message,
      language: result.language,
      style: style.key,
      // A number in the message that is in neither the notes nor the chat.
      unsourced_numbers: unsourcedNumbers(result.message, [notes, ...messages.map(m => m.text)]),
    })
  } catch (err) {
    console.error('whatsapp polish error:', err)
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
