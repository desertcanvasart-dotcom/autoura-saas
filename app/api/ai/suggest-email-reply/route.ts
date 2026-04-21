// ============================================
// POST /api/ai/suggest-email-reply
// Generates 1-3 AI draft email replies for a given email_conversations.id.
// Mirrors /api/ai/suggest-reply for WhatsApp but emits structured drafts
// with both subject and body fields.
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
      return 'Warm and personal. Use the client\'s first name if known. Short paragraphs.'
    case 'formal':
      return 'Formal business register. No contractions. Complete sentences, precise language.'
    case 'professional':
    default:
      return 'Professional and helpful. Clear, structured, and concise. Short paragraphs.'
  }
}

function truncateText(s: string | null | undefined, max: number): string {
  if (!s) return ''
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase || !auth.tenant_id || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase, tenant_id, user } = auth

    const body = await request.json().catch(() => ({}))
    const email_conversation_id: string | undefined = body.email_conversation_id
    const count: number = Math.min(3, Math.max(1, Number(body.count) || 2))
    const parent_draft_id: string | null = body.parent_draft_id || null
    const user_instruction: string | null = body.instruction || null

    if (!email_conversation_id) {
      return NextResponse.json({ success: false, error: 'email_conversation_id required' }, { status: 400 })
    }

    // ---------- Load the email conversation ----------
    const { data: conv, error: convErr } = await supabase
      .from('email_conversations')
      .select('id, thread_id, tenant_id, client_id, client_email, client_name, subject')
      .eq('id', email_conversation_id)
      .single()

    if (convErr || !conv || conv.tenant_id !== tenant_id) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 })
    }

    // ---------- Pull last 10 messages for context ----------
    const { data: rawMessages } = await supabase
      .from('email_messages')
      .select('message_id, direction, from_address, to_addresses, subject, body_text, snippet, sent_at')
      .eq('conversation_id', email_conversation_id)
      .order('sent_at', { ascending: false })
      .limit(10)

    const messages = (rawMessages || [])
      .map((m: any) => ({
        message_id: m.message_id,
        direction: m.direction,
        from: m.from_address,
        subject: m.subject || '',
        text: (m.body_text || m.snippet || '').trim(),
        sent_at: m.sent_at,
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

    // ---------- Find or create communication_threads row ----------
    let threadId: string
    const { data: existingThread } = await supabase
      .from('communication_threads')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('channel', 'email')
      .eq('email_conversation_id', email_conversation_id)
      .maybeSingle()

    if (existingThread?.id) {
      threadId = existingThread.id
    } else {
      const { data: newThread, error: newThreadErr } = await supabase
        .from('communication_threads')
        .insert({
          tenant_id,
          channel: 'email',
          email_conversation_id,
          client_id: conv.client_id,
          client_name: conv.client_name,
          contact_info: conv.client_email || 'unknown',
          subject: conv.subject,
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

    // ---------- Ensure communication_inbox row for latest inbound ----------
    let inboxId: string
    const { data: existingInbox } = await supabase
      .from('communication_inbox')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('channel', 'email')
      .eq('source_message_id', latestInbound.message_id)
      .maybeSingle()

    if (existingInbox?.id) {
      inboxId = existingInbox.id
      await supabase.from('communication_inbox').update({ status: 'draft_pending' }).eq('id', inboxId)
    } else {
      const snippet = latestInbound.text.length > 140 ? latestInbound.text.slice(0, 137) + '...' : latestInbound.text
      const { data: newInbox, error: newInboxErr } = await supabase
        .from('communication_inbox')
        .insert({
          tenant_id,
          thread_id: threadId,
          channel: 'email',
          source_message_id: latestInbound.message_id,
          sender_name: conv.client_name,
          sender_contact: latestInbound.from || conv.client_email,
          message_body: latestInbound.text,
          message_snippet: snippet,
          subject: latestInbound.subject,
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

    // ---------- Tone (per-user copilot_settings) ----------
    let tone: Tone = 'professional'
    const { data: settings } = await supabase
      .from('copilot_settings')
      .select('tone')
      .eq('tenant_id', tenant_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (settings?.tone) tone = settings.tone as Tone
    else await supabase.from('copilot_settings').insert({ tenant_id, user_id: user.id, tone: 'professional' })

    // ---------- Semantic retrieval ----------
    const ragQuery = latestInbound.subject ? `${latestInbound.subject}\n\n${latestInbound.text}` : latestInbound.text
    let retrieved: RetrievedItem[] = []
    let retrievalContext = ''
    try {
      retrieved = await retrieveKnowledge(supabase, tenant_id, ragQuery, { limit: 6 })
      retrievalContext = formatRetrievalContext(retrieved)
    } catch (err: any) {
      console.error('Email RAG retrieval failed:', err?.message)
    }

    // ---------- Build transcript for prompt ----------
    const transcript = messages
      .map((m) => {
        const who = m.direction === 'inbound' ? `Customer (${m.from})` : 'Agent'
        const subj = m.subject ? ` — "${m.subject}"` : ''
        return `${who}${subj}:\n${truncateText(m.text, 800)}`
      })
      .join('\n\n---\n\n')

    const replySubjectHint = latestInbound.subject?.toLowerCase().startsWith('re:')
      ? latestInbound.subject
      : `Re: ${latestInbound.subject || conv.subject || ''}`.trim()

    const systemPrompt = `You are an AI reply assistant for a travel agency named "${BUSINESS_NAME}". You help a human agent draft email replies to customers.

TONE: ${tone}
${toneInstructions(tone)}

RULES
- Write each reply from the agent's perspective ("we", "our team"), not the customer's.
- Emails run 2–5 short paragraphs. Use greeting + body + closing. No signature — the agent adds theirs.
- Do NOT invent prices, dates, availability, or itinerary details the transcript doesn't provide. If specific info is needed, ask a clarifying question or promise to follow up.
- Match the customer's language (if they wrote in Arabic, reply in Arabic).
- Keep subject aligned with the thread subject. Default to "${replySubjectHint}" unless the topic clearly shifted.
- Output valid JSON only. No markdown, no backticks.

OUTPUT SHAPE
{
  "drafts": [
    {
      "subject": "Re: ...",
      "body": "reply body with paragraph breaks as \\n\\n",
      "confidence": "high" | "medium" | "low",
      "rationale": "one-line reason this reply fits"
    }
  ]
}

Generate exactly ${count} distinct draft option${count === 1 ? '' : 's'}. Each draft should take a slightly different angle (e.g. one direct answer, one that asks a clarifying question, one that offers a next step).`

    const userPromptParts: string[] = [
      `Thread subject: "${conv.subject || '(none)'}"`,
      `\nConversation so far (oldest to newest):\n${transcript}`,
      `\nLatest customer email to reply to (from ${latestInbound.from}):\nSubject: ${latestInbound.subject || '(none)'}\n${latestInbound.text}`,
    ]
    if (retrievalContext) {
      userPromptParts.push(`\n---\n${retrievalContext}\n---\nUse the knowledge above where it directly answers the customer. Do NOT copy past replies verbatim — use them as style and factual reference.`)
    }
    if (user_instruction) userPromptParts.push(`\nAgent guidance for this round: ${user_instruction}`)
    if (parent_draft_id) userPromptParts.push(`\nThe previous drafts were dismissed. Offer different angles this time.`)

    // ---------- Call Claude ----------
    const startedAt = Date.now()
    const anthropic = getAnthropic()

    let drafts: { body: string; subject: string; confidence?: string; rationale?: string }[] = []
    let lastError: string | null = null

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const resp = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 3072,
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
        drafts = parsed.drafts
          .slice(0, count)
          .filter((d: any) => typeof d?.body === 'string' && d.body.trim())
          .map((d: any) => ({
            body: d.body.trim(),
            subject: typeof d.subject === 'string' && d.subject.trim() ? d.subject.trim() : replySubjectHint,
            confidence: d.confidence,
            rationale: d.rationale,
          }))
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
      await supabase.from('communication_inbox').update({ status: 'new' }).eq('id', inboxId)
      return NextResponse.json({ success: false, error: lastError || 'AI failed to generate drafts' }, { status: 502 })
    }

    // If regenerating, reject previous siblings
    if (parent_draft_id) {
      await supabase
        .from('communication_drafts')
        .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq('inbox_message_id', inboxId)
        .eq('status', 'pending')
    }

    // Persist drafts
    const rows = drafts.map((d) => ({
      tenant_id,
      thread_id: threadId,
      inbox_message_id: inboxId,
      parent_draft_id,
      draft_body: d.body,
      ai_model: MODEL,
      ai_confidence: d.confidence === 'high' || d.confidence === 'medium' || d.confidence === 'low' ? d.confidence : 'medium',
      ai_flags: {
        tone,
        subject: d.subject,
        rationale: d.rationale || null,
        instruction: user_instruction || null,
      },
      context_used: {
        message_count: messages.length,
        latest_message_id: latestInbound.message_id,
        retrieved: retrieved.map((r) => ({ id: r.id, type: r.source_type, similarity: Number(r.similarity.toFixed(3)) })),
      },
      generation_time_ms: generationTimeMs,
      status: 'pending',
      send_channel: 'email',
    }))

    const { data: inserted, error: insertErr } = await supabase
      .from('communication_drafts')
      .insert(rows)
      .select('id, draft_body, ai_confidence, ai_flags, created_at')

    if (insertErr) {
      return NextResponse.json({ success: false, error: insertErr.message }, { status: 500 })
    }

    await supabase.from('communication_inbox').update({ status: 'draft_ready' }).eq('id', inboxId)
    await supabase.from('communication_threads').update({ last_draft_at: new Date().toISOString() }).eq('id', threadId)

    return NextResponse.json({
      success: true,
      thread_id: threadId,
      inbox_message_id: inboxId,
      tone,
      drafts: inserted,
      generation_time_ms: generationTimeMs,
      retrieved_count: retrieved.length,
    })
  } catch (err: any) {
    console.error('suggest-email-reply error:', err)
    return NextResponse.json({ success: false, error: err?.message || 'Internal error' }, { status: 500 })
  }
}
