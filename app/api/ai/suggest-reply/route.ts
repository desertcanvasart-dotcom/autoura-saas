// ============================================
// POST /api/ai/suggest-reply
// Generates AI draft replies for a WhatsApp conversation.
// Persists drafts to communication_drafts so they can be edited/audited later.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '@/lib/supabase-server'
import { retrieveKnowledge, formatRetrievalContext, type RetrievedItem } from '@/lib/copilot-retrieval'

const MODEL = process.env.WHATSAPP_AI_MODEL || 'claude-sonnet-4-20250514'
const BUSINESS_NAME = process.env.BUSINESS_NAME || 'Travel2Egypt'

let _anthropic: Anthropic | null = null
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  return _anthropic
}

type Tone = 'professional' | 'friendly' | 'formal'

function toneInstructions(tone: Tone): string {
  switch (tone) {
    case 'friendly':
      return 'Warm, conversational tone. Use contractions and light enthusiasm. One or two emojis are fine when they fit naturally.'
    case 'formal':
      return 'Formal, businesslike register. No contractions, no emojis. Precise and respectful.'
    case 'professional':
    default:
      return 'Professional, helpful tone. Clear and concise. No emojis unless the customer used one.'
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase || !auth.tenant_id || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase, tenant_id, user } = auth

    const body = await request.json().catch(() => ({}))
    const whatsapp_conversation_id: string | undefined = body.whatsapp_conversation_id
    const count: number = Math.min(3, Math.max(1, Number(body.count) || 2))
    const parent_draft_id: string | null = body.parent_draft_id || null
    const user_instruction: string | null = body.instruction || null

    if (!whatsapp_conversation_id) {
      return NextResponse.json({ success: false, error: 'whatsapp_conversation_id required' }, { status: 400 })
    }

    // ---------- Load the WhatsApp conversation ----------
    const { data: waConv, error: waConvErr } = await supabase
      .from('whatsapp_conversations')
      .select('id, phone_number, client_id, client_name, tenant_id')
      .eq('id', whatsapp_conversation_id)
      .single()

    if (waConvErr || !waConv || waConv.tenant_id !== tenant_id) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 })
    }

    // ---------- Find or create the communication_threads row ----------
    let threadId: string
    const { data: existingThread } = await supabase
      .from('communication_threads')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('channel', 'whatsapp')
      .eq('whatsapp_conversation_id', whatsapp_conversation_id)
      .maybeSingle()

    if (existingThread?.id) {
      threadId = existingThread.id
    } else {
      const { data: newThread, error: newThreadErr } = await supabase
        .from('communication_threads')
        .insert({
          tenant_id,
          channel: 'whatsapp',
          whatsapp_conversation_id,
          client_id: waConv.client_id,
          client_name: waConv.client_name,
          contact_info: waConv.phone_number,
          status: 'open',
          urgency: 'normal',
          last_message_at: new Date().toISOString(),
          message_count: 0,
        })
        .select('id')
        .single()
      if (newThreadErr || !newThread) {
        return NextResponse.json({ success: false, error: 'Failed to create thread' }, { status: 500 })
      }
      threadId = newThread.id
    }

    // ---------- Pull last 20 messages for context ----------
    const { data: rawMessages } = await supabase
      .from('whatsapp_messages')
      .select('direction, message_body, message_text, sent_at, message_sid')
      .eq('conversation_id', whatsapp_conversation_id)
      .order('sent_at', { ascending: false })
      .limit(20)

    const messages = (rawMessages || [])
      .map((m: any) => ({
        direction: m.direction,
        text: (m.message_body || m.message_text || '').trim(),
        sent_at: m.sent_at,
        sid: m.message_sid,
      }))
      .filter((m: any) => m.text)
      .reverse()

    if (messages.length === 0) {
      return NextResponse.json({ success: false, error: 'No messages in this conversation yet' }, { status: 400 })
    }

    const latestInbound = [...messages].reverse().find((m) => m.direction === 'inbound')
    if (!latestInbound) {
      return NextResponse.json({ success: false, error: 'No inbound message to reply to' }, { status: 400 })
    }

    // ---------- Ensure a communication_inbox row exists for the latest inbound ----------
    let inboxId: string
    const { data: existingInbox } = await supabase
      .from('communication_inbox')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('channel', 'whatsapp')
      .eq('source_message_id', latestInbound.sid)
      .maybeSingle()

    if (existingInbox?.id) {
      inboxId = existingInbox.id
      await supabase
        .from('communication_inbox')
        .update({ status: 'draft_pending' })
        .eq('id', inboxId)
    } else {
      const { data: newInbox, error: newInboxErr } = await supabase
        .from('communication_inbox')
        .insert({
          tenant_id,
          thread_id: threadId,
          channel: 'whatsapp',
          source_message_id: latestInbound.sid || `synthetic-${Date.now()}`,
          sender_name: waConv.client_name,
          sender_contact: waConv.phone_number,
          message_body: latestInbound.text,
          message_snippet: latestInbound.text.slice(0, 140),
          status: 'draft_pending',
          received_at: latestInbound.sent_at || new Date().toISOString(),
        })
        .select('id')
        .single()
      if (newInboxErr || !newInbox) {
        return NextResponse.json({ success: false, error: 'Failed to create inbox entry' }, { status: 500 })
      }
      inboxId = newInbox.id
    }

    // ---------- Get or create copilot_settings for this user ----------
    let tone: Tone = 'professional'
    const { data: settings } = await supabase
      .from('copilot_settings')
      .select('tone')
      .eq('tenant_id', tenant_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (settings?.tone) {
      tone = settings.tone as Tone
    } else {
      await supabase
        .from('copilot_settings')
        .insert({ tenant_id, user_id: user.id, tone: 'professional' })
    }

    // ---------- Build prompt ----------
    const transcript = messages
      .map((m) => `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.text}`)
      .join('\n')

    // ---------- Semantic retrieval (tenant-scoped RAG) ----------
    let retrieved: RetrievedItem[] = []
    let retrievalContext = ''
    try {
      retrieved = await retrieveKnowledge(supabase, tenant_id, latestInbound.text, { limit: 6 })
      retrievalContext = formatRetrievalContext(retrieved)
    } catch (ragErr: any) {
      console.error('RAG retrieval failed (continuing without context):', ragErr?.message)
    }

    const systemPrompt = `You are an AI reply assistant for a travel agency named "${BUSINESS_NAME}". You help a human agent draft WhatsApp replies to customers.

TONE: ${tone}
${toneInstructions(tone)}

RULES
- Write replies from the agent's perspective ("we", "our team"), not the customer's.
- Keep replies to 2–5 short sentences unless the customer asked a complex question.
- Do NOT invent prices, dates, availability, or itinerary details the transcript doesn't provide. If specific info is needed, ask a clarifying question or promise to follow up.
- Match the customer's language (if they wrote in Arabic, reply in Arabic).
- Never sign the message (the agent will add their signature manually).
- Output valid JSON only. No markdown, no backticks.

OUTPUT SHAPE
{
  "drafts": [
    {
      "body": "reply text",
      "confidence": "high" | "medium" | "low",
      "rationale": "brief, one-line reason this reply fits"
    }
  ]
}

Generate exactly ${count} distinct draft reply option${count === 1 ? '' : 's'}. Each draft should take a slightly different angle (e.g. one direct, one that asks a clarifying question, one that offers a next step).`

    const userPromptParts: string[] = [
      `Conversation so far (most recent last):\n${transcript}`,
      `\nLatest customer message to reply to:\n"${latestInbound.text}"`,
    ]
    if (retrievalContext) {
      userPromptParts.push(`\n---\n${retrievalContext}\n---\nUse the knowledge above where it directly answers the customer. Do NOT copy past replies verbatim — use them as style and factual reference.`)
    }
    if (user_instruction) userPromptParts.push(`\nAgent guidance for this round: ${user_instruction}`)
    if (parent_draft_id) userPromptParts.push(`\nThe previous drafts were dismissed. Offer different angles this time.`)

    // ---------- Call Claude ----------
    const startedAt = Date.now()
    const anthropic = getAnthropic()

    let drafts: { body: string; confidence?: string; rationale?: string }[] = []
    let lastError: string | null = null

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const resp = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPromptParts.join('\n') }],
        })
        const first = resp.content[0]
        if (first?.type !== 'text') throw new Error('Non-text response')
        let jsonText = first.text.trim()
        jsonText = jsonText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
        const parsed = JSON.parse(jsonText)
        if (!parsed || !Array.isArray(parsed.drafts) || parsed.drafts.length === 0) {
          throw new Error('No drafts in response')
        }
        drafts = parsed.drafts.slice(0, count).filter((d: any) => typeof d?.body === 'string' && d.body.trim())
        if (drafts.length === 0) throw new Error('All drafts were empty')
        break
      } catch (err: any) {
        lastError = err?.message || String(err)
        const status = err?.status || err?.error?.status || 0
        const retryable = status === 429 || status === 529 || /overloaded|timeout/i.test(lastError || '')
        if (!retryable || attempt === 3) break
        await new Promise((r) => setTimeout(r, attempt * 1500))
      }
    }

    const generationTimeMs = Date.now() - startedAt

    if (drafts.length === 0) {
      await supabase
        .from('communication_inbox')
        .update({ status: 'new' })
        .eq('id', inboxId)
      return NextResponse.json({ success: false, error: lastError || 'AI failed to generate drafts' }, { status: 502 })
    }

    // ---------- If regenerating, mark previous siblings rejected ----------
    if (parent_draft_id) {
      await supabase
        .from('communication_drafts')
        .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq('inbox_message_id', inboxId)
        .eq('status', 'pending')
    }

    // ---------- Persist drafts ----------
    const rows = drafts.map((d) => ({
      tenant_id,
      thread_id: threadId,
      inbox_message_id: inboxId,
      parent_draft_id: parent_draft_id,
      draft_body: d.body.trim(),
      ai_model: MODEL,
      ai_confidence: d.confidence === 'high' || d.confidence === 'medium' || d.confidence === 'low' ? d.confidence : 'medium',
      ai_flags: { tone, rationale: d.rationale || null, instruction: user_instruction || null },
      context_used: {
        message_count: messages.length,
        latest_sid: latestInbound.sid || null,
        retrieved: retrieved.map((r) => ({ id: r.id, type: r.source_type, similarity: Number(r.similarity.toFixed(3)) })),
      },
      generation_time_ms: generationTimeMs,
      status: 'pending',
      send_channel: 'whatsapp',
    }))

    const { data: inserted, error: insertErr } = await supabase
      .from('communication_drafts')
      .insert(rows)
      .select('id, draft_body, ai_confidence, ai_flags, created_at')

    if (insertErr) {
      return NextResponse.json({ success: false, error: insertErr.message }, { status: 500 })
    }

    await supabase
      .from('communication_inbox')
      .update({ status: 'draft_ready' })
      .eq('id', inboxId)

    await supabase
      .from('communication_threads')
      .update({ last_draft_at: new Date().toISOString() })
      .eq('id', threadId)

    return NextResponse.json({
      success: true,
      thread_id: threadId,
      inbox_message_id: inboxId,
      tone,
      drafts: inserted,
      generation_time_ms: generationTimeMs,
      retrieved_count: retrieved.length,
      retrieved_types: retrieved.reduce((acc: Record<string, number>, r) => {
        acc[r.source_type] = (acc[r.source_type] || 0) + 1
        return acc
      }, {}),
    })
  } catch (err: any) {
    console.error('suggest-reply error:', err)
    return NextResponse.json({ success: false, error: err?.message || 'Internal error' }, { status: 500 })
  }
}
