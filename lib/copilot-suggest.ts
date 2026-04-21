// ============================================
// Copilot suggest — shared logic for generating draft replies.
// Used by:
//   - POST /api/ai/suggest-reply           (WhatsApp, user-initiated)
//   - POST /api/ai/suggest-email-reply     (Email, user-initiated)
//   - WhatsApp webhook                     (pre-generation on inbound)
//   - Email sync                           (pre-generation on inbound)
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { retrieveKnowledge, formatRetrievalContext, type RetrievedItem } from './copilot-retrieval'

const MODEL = process.env.WHATSAPP_AI_MODEL || 'claude-sonnet-4-20250514'
const BUSINESS_NAME = process.env.BUSINESS_NAME || 'Travel2Egypt'

let _anthropic: Anthropic | null = null
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  return _anthropic
}

export type Tone = 'professional' | 'friendly' | 'formal'
export type Channel = 'whatsapp' | 'email'

function toneInstructions(tone: Tone, channel: Channel): string {
  if (channel === 'email') {
    switch (tone) {
      case 'friendly': return 'Warm and personal. Use the client\'s first name if known. Short paragraphs.'
      case 'formal':   return 'Formal business register. No contractions. Complete sentences, precise language.'
      default:         return 'Professional and helpful. Clear, structured, and concise. Short paragraphs.'
    }
  }
  // WhatsApp
  switch (tone) {
    case 'friendly': return 'Warm, conversational tone. Use contractions and light enthusiasm. One or two emojis are fine when they fit naturally.'
    case 'formal':   return 'Formal, businesslike register. No contractions, no emojis. Precise and respectful.'
    default:         return 'Professional, helpful tone. Clear and concise. No emojis unless the customer used one.'
  }
}

function truncate(s: string, max: number): string {
  if (!s) return ''
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

interface SuggestContext {
  // What we send to Claude
  transcript: string
  latestInboundText: string
  latestInboundSubject?: string | null
  threadSubject?: string | null

  // Routing
  threadId: string
  inboxId: string
  messages: { direction: 'inbound' | 'outbound'; text: string }[]
}

export interface SuggestResult {
  success: boolean
  error?: string
  thread_id?: string
  inbox_message_id?: string
  tone?: Tone
  drafts?: Array<{
    id: string
    draft_body: string
    ai_confidence: 'high' | 'medium' | 'low' | null
    ai_flags: Record<string, any>
    created_at: string
  }>
  generation_time_ms?: number
  retrieved_count?: number
}

// ============================================
// Public entry point
// ============================================
interface SuggestArgs {
  supabase: SupabaseClient
  tenantId: string
  channel: Channel
  whatsappConversationId?: string
  // The canonical customer-scoped conversation id (unified_conversations.id).
  // For backwards compat, callers may still pass emailConversationId (deprecated alias).
  unifiedConversationId?: string
  emailConversationId?: string
  reviewerUserId?: string | null    // null on pre-generation (no user context)
  count?: number
  parentDraftId?: string | null
  instruction?: string | null
  // Skip regeneration if pending drafts already exist for latest inbound.
  // True by default so webhook/sync doesn't create duplicate drafts when
  // the user also clicks Suggest Reply manually.
  skipIfPendingExists?: boolean
}

export async function generateDraftReplies(args: SuggestArgs): Promise<SuggestResult> {
  const {
    supabase, tenantId, channel,
    whatsappConversationId,
    reviewerUserId = null,
    count = 2,
    parentDraftId = null,
    instruction = null,
    skipIfPendingExists = false,
  } = args
  const unifiedConversationId = args.unifiedConversationId ?? args.emailConversationId

  if (channel === 'whatsapp' && !whatsappConversationId) {
    return { success: false, error: 'whatsappConversationId required for WhatsApp channel' }
  }
  if (channel === 'email' && !unifiedConversationId) {
    return { success: false, error: 'unifiedConversationId required for email channel' }
  }

  const ctx = channel === 'whatsapp'
    ? await loadWhatsAppContext(supabase, tenantId, whatsappConversationId!)
    : await loadEmailContext(supabase, tenantId, unifiedConversationId!)

  if (!ctx.ok) return { success: false, error: ctx.error }

  // Short-circuit if pending drafts already exist for this inbox entry.
  if (skipIfPendingExists) {
    const { data: existingDrafts } = await supabase
      .from('communication_drafts')
      .select('id')
      .eq('inbox_message_id', ctx.inboxId)
      .eq('status', 'pending')
      .limit(1)
    if (existingDrafts && existingDrafts.length > 0) {
      return { success: true, thread_id: ctx.threadId, inbox_message_id: ctx.inboxId, drafts: [] }
    }
  }

  // Resolve tone: per-user if we have a reviewer, else tenant default ('professional')
  let tone: Tone = 'professional'
  if (reviewerUserId) {
    const { data: settings } = await supabase
      .from('copilot_settings')
      .select('tone')
      .eq('tenant_id', tenantId)
      .eq('user_id', reviewerUserId)
      .maybeSingle()
    if (settings?.tone) tone = settings.tone as Tone
    else {
      await supabase
        .from('copilot_settings')
        .insert({ tenant_id: tenantId, user_id: reviewerUserId, tone: 'professional' })
        .then(() => {}, () => {})
    }
  }

  // Semantic retrieval
  const ragQuery = ctx.latestInboundSubject
    ? `${ctx.latestInboundSubject}\n\n${ctx.latestInboundText}`
    : ctx.latestInboundText
  let retrieved: RetrievedItem[] = []
  let retrievalContext = ''
  try {
    retrieved = await retrieveKnowledge(supabase, tenantId, ragQuery, { limit: 6 })
    retrievalContext = formatRetrievalContext(retrieved)
  } catch (err: any) {
    console.error('Copilot RAG retrieval failed:', err?.message)
  }

  // Build prompts
  const { systemPrompt, userPromptParts } = buildPrompt({
    channel, tone, ctx, retrievalContext, count, parentDraftId, instruction,
  })

  // Call Claude
  const startedAt = Date.now()
  const anthropic = getAnthropic()
  let rawDrafts: any[] = []
  let lastError: string | null = null

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: channel === 'email' ? 3072 : 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPromptParts.join('\n') }],
      })
      const first = resp.content[0]
      if (first?.type !== 'text') throw new Error('Non-text response')
      let jsonText = first.text.trim()
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
      const parsed = JSON.parse(jsonText)
      if (!parsed || !Array.isArray(parsed.drafts) || parsed.drafts.length === 0) throw new Error('No drafts in response')
      rawDrafts = parsed.drafts.slice(0, count)
      if (rawDrafts.length === 0) throw new Error('All drafts were empty')
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

  if (rawDrafts.length === 0) {
    await supabase.from('communication_inbox').update({ status: 'new' }).eq('id', ctx.inboxId)
    return { success: false, error: lastError || 'AI failed to generate drafts' }
  }

  // Normalize drafts
  const replySubjectHint = channel === 'email'
    ? (ctx.latestInboundSubject && ctx.latestInboundSubject.toLowerCase().startsWith('re:')
        ? ctx.latestInboundSubject
        : `Re: ${ctx.latestInboundSubject || ctx.threadSubject || ''}`.trim())
    : null

  const normalized = rawDrafts
    .filter((d: any) => typeof d?.body === 'string' && d.body.trim())
    .map((d: any) => ({
      body: d.body.trim(),
      subject: channel === 'email' && typeof d.subject === 'string' && d.subject.trim()
        ? d.subject.trim()
        : replySubjectHint,
      confidence: (d.confidence === 'high' || d.confidence === 'medium' || d.confidence === 'low' ? d.confidence : 'medium') as 'high' | 'medium' | 'low',
      rationale: d.rationale || null,
    }))

  if (normalized.length === 0) {
    return { success: false, error: 'AI output had no valid drafts' }
  }

  // If regenerating, reject previous pending siblings
  if (parentDraftId) {
    await supabase
      .from('communication_drafts')
      .update({
        status: 'rejected',
        reviewed_by: reviewerUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('inbox_message_id', ctx.inboxId)
      .eq('status', 'pending')
  }

  // Persist drafts
  const rows = normalized.map((d) => ({
    tenant_id: tenantId,
    thread_id: ctx.threadId,
    inbox_message_id: ctx.inboxId,
    parent_draft_id: parentDraftId,
    draft_body: d.body,
    ai_model: MODEL,
    ai_confidence: d.confidence,
    ai_flags: {
      tone,
      subject: channel === 'email' ? d.subject : null,
      rationale: d.rationale,
      instruction,
      pregenerated: reviewerUserId === null,
    },
    context_used: {
      message_count: ctx.messages.length,
      retrieved: retrieved.map((r) => ({ id: r.id, type: r.source_type, similarity: Number(r.similarity.toFixed(3)) })),
    },
    generation_time_ms: generationTimeMs,
    status: 'pending',
    send_channel: channel,
  }))

  const { data: inserted, error: insertErr } = await supabase
    .from('communication_drafts')
    .insert(rows)
    .select('id, draft_body, ai_confidence, ai_flags, created_at')

  if (insertErr) return { success: false, error: insertErr.message }

  await supabase.from('communication_inbox').update({ status: 'draft_ready' }).eq('id', ctx.inboxId)
  await supabase.from('communication_threads').update({ last_draft_at: new Date().toISOString() }).eq('id', ctx.threadId)

  return {
    success: true,
    thread_id: ctx.threadId,
    inbox_message_id: ctx.inboxId,
    tone,
    drafts: (inserted || []) as any,
    generation_time_ms: generationTimeMs,
    retrieved_count: retrieved.length,
  }
}

// ============================================
// Channel-specific context loaders
// ============================================
type LoadedContext =
  | { ok: true; threadId: string; inboxId: string; messages: { direction: 'inbound' | 'outbound'; text: string }[]; transcript: string; latestInboundText: string; latestInboundSubject?: string | null; threadSubject?: string | null }
  | { ok: false; error: string }

async function loadWhatsAppContext(
  supabase: SupabaseClient, tenantId: string, whatsappConversationId: string
): Promise<LoadedContext> {
  const { data: waConv } = await supabase
    .from('whatsapp_conversations')
    .select('id, phone_number, client_id, client_name, tenant_id')
    .eq('id', whatsappConversationId)
    .single()
  if (!waConv || waConv.tenant_id !== tenantId) return { ok: false, error: 'Conversation not found' }

  // Thread
  let threadId: string
  const { data: existingThread } = await supabase
    .from('communication_threads')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('channel', 'whatsapp')
    .eq('whatsapp_conversation_id', whatsappConversationId)
    .maybeSingle()

  if (existingThread?.id) {
    threadId = existingThread.id
  } else {
    const { data: newThread } = await supabase
      .from('communication_threads')
      .insert({
        tenant_id: tenantId, channel: 'whatsapp', whatsapp_conversation_id: whatsappConversationId,
        client_id: waConv.client_id, client_name: waConv.client_name,
        contact_info: waConv.phone_number, status: 'open', urgency: 'normal',
        last_message_at: new Date().toISOString(), message_count: 0,
      })
      .select('id').single()
    if (!newThread) return { ok: false, error: 'Failed to create thread' }
    threadId = newThread.id
  }

  // Messages
  const { data: rawMessages } = await supabase
    .from('whatsapp_messages')
    .select('direction, message_body, message_text, sent_at, message_sid')
    .eq('conversation_id', whatsappConversationId)
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

  if (messages.length === 0) return { ok: false, error: 'No messages yet' }
  const latestInbound = [...messages].reverse().find((m) => m.direction === 'inbound')
  if (!latestInbound) return { ok: false, error: 'No inbound message to reply to' }

  // Inbox
  let inboxId: string
  const { data: existingInbox } = await supabase
    .from('communication_inbox')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('channel', 'whatsapp')
    .eq('source_message_id', latestInbound.sid)
    .maybeSingle()

  if (existingInbox?.id) {
    inboxId = existingInbox.id
    await supabase.from('communication_inbox').update({ status: 'draft_pending' }).eq('id', inboxId)
  } else {
    const snippet = latestInbound.text.length > 140 ? latestInbound.text.slice(0, 137) + '...' : latestInbound.text
    const { data: newInbox } = await supabase
      .from('communication_inbox')
      .insert({
        tenant_id: tenantId, thread_id: threadId, channel: 'whatsapp',
        source_message_id: latestInbound.sid || `synthetic-${Date.now()}`,
        sender_name: waConv.client_name, sender_contact: waConv.phone_number,
        message_body: latestInbound.text, message_snippet: snippet,
        status: 'draft_pending', received_at: latestInbound.sent_at || new Date().toISOString(),
      })
      .select('id').single()
    if (!newInbox) return { ok: false, error: 'Failed to create inbox entry' }
    inboxId = newInbox.id
  }

  const transcript = messages
    .map((m) => `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.text}`)
    .join('\n')

  return {
    ok: true,
    threadId,
    inboxId,
    messages: messages.map((m) => ({ direction: m.direction, text: m.text })),
    transcript,
    latestInboundText: latestInbound.text,
  }
}

async function loadEmailContext(
  supabase: SupabaseClient, tenantId: string, unifiedConversationId: string
): Promise<LoadedContext> {
  const { data: conv } = await supabase
    .from('unified_conversations')
    .select('id, tenant_id, client_id, contact_name, contact_email')
    .eq('id', unifiedConversationId)
    .single()
  if (!conv || conv.tenant_id !== tenantId) return { ok: false, error: 'Conversation not found' }

  const { data: rawMessages } = await supabase
    .from('email_messages')
    .select('gmail_message_id, gmail_thread_id, direction, from_email, subject, body_text, snippet, sent_at')
    .eq('unified_conversation_id', unifiedConversationId)
    .order('sent_at', { ascending: false })
    .limit(10)

  const messages = (rawMessages || [])
    .map((m: any) => ({
      message_id: m.gmail_message_id,
      direction: m.direction,
      from: m.from_email,
      subject: m.subject || '',
      text: (m.body_text || m.snippet || '').trim(),
      sent_at: m.sent_at,
    }))
    .filter((m: any) => m.text)
    .reverse()

  if (messages.length === 0) return { ok: false, error: 'No messages yet' }
  const latestInbound = [...messages].reverse().find((m) => m.direction === 'inbound')
  if (!latestInbound) return { ok: false, error: 'No inbound message to reply to' }

  // Most recent thread subject comes from the latest message; unified_conversations
  // doesn't store one.
  const threadSubject = [...messages].reverse().find((m) => m.subject)?.subject || null

  // Thread (communication_threads)
  let threadId: string
  const { data: existingThread } = await supabase
    .from('communication_threads')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('channel', 'email')
    .eq('unified_conversation_id', unifiedConversationId)
    .maybeSingle()

  if (existingThread?.id) {
    threadId = existingThread.id
  } else {
    const { data: newThread } = await supabase
      .from('communication_threads')
      .insert({
        tenant_id: tenantId,
        channel: 'email',
        unified_conversation_id: unifiedConversationId,
        client_id: conv.client_id,
        client_name: conv.contact_name,
        contact_info: conv.contact_email || 'unknown',
        subject: threadSubject,
        status: 'open',
        urgency: 'normal',
        last_message_at: new Date().toISOString(),
        message_count: 0,
      })
      .select('id').single()
    if (!newThread) return { ok: false, error: 'Failed to create thread' }
    threadId = newThread.id
  }

  // Inbox
  let inboxId: string
  const { data: existingInbox } = await supabase
    .from('communication_inbox')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('channel', 'email')
    .eq('source_message_id', latestInbound.message_id)
    .maybeSingle()

  if (existingInbox?.id) {
    inboxId = existingInbox.id
    await supabase.from('communication_inbox').update({ status: 'draft_pending' }).eq('id', inboxId)
  } else {
    const snippet = latestInbound.text.length > 140 ? latestInbound.text.slice(0, 137) + '...' : latestInbound.text
    const { data: newInbox } = await supabase
      .from('communication_inbox')
      .insert({
        tenant_id: tenantId, thread_id: threadId, channel: 'email',
        source_message_id: latestInbound.message_id,
        sender_name: conv.contact_name,
        sender_contact: latestInbound.from || conv.contact_email,
        message_body: latestInbound.text, message_snippet: snippet,
        subject: latestInbound.subject, status: 'draft_pending',
        received_at: latestInbound.sent_at || new Date().toISOString(),
      })
      .select('id').single()
    if (!newInbox) return { ok: false, error: 'Failed to create inbox entry' }
    inboxId = newInbox.id
  }

  const transcript = messages
    .map((m) => {
      const who = m.direction === 'inbound' ? `Customer (${m.from})` : 'Agent'
      const subj = m.subject ? ` — "${m.subject}"` : ''
      return `${who}${subj}:\n${truncate(m.text, 800)}`
    })
    .join('\n\n---\n\n')

  return {
    ok: true,
    threadId,
    inboxId,
    messages: messages.map((m) => ({ direction: m.direction, text: m.text })),
    transcript,
    latestInboundText: latestInbound.text,
    latestInboundSubject: latestInbound.subject,
    threadSubject,
  }
}

// ============================================
// Prompt builder
// ============================================
function buildPrompt(args: {
  channel: Channel
  tone: Tone
  ctx: LoadedContext & { ok: true }
  retrievalContext: string
  count: number
  parentDraftId: string | null
  instruction: string | null
}): { systemPrompt: string; userPromptParts: string[] } {
  const { channel, tone, ctx, retrievalContext, count, parentDraftId, instruction } = args

  if (channel === 'whatsapp') {
    const systemPrompt = `You are an AI reply assistant for a travel agency named "${BUSINESS_NAME}". You help a human agent draft WhatsApp replies to customers.

TONE: ${tone}
${toneInstructions(tone, 'whatsapp')}

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
    { "body": "reply text", "confidence": "high" | "medium" | "low", "rationale": "brief, one-line reason this reply fits" }
  ]
}

Generate exactly ${count} distinct draft reply option${count === 1 ? '' : 's'}. Each draft should take a slightly different angle (e.g. one direct, one that asks a clarifying question, one that offers a next step).`

    const userPromptParts: string[] = [
      `Conversation so far (most recent last):\n${ctx.transcript}`,
      `\nLatest customer message to reply to:\n"${ctx.latestInboundText}"`,
    ]
    if (retrievalContext) userPromptParts.push(`\n---\n${retrievalContext}\n---\nUse the knowledge above where it directly answers the customer. Do NOT copy past replies verbatim — use them as style and factual reference.`)
    if (instruction) userPromptParts.push(`\nAgent guidance for this round: ${instruction}`)
    if (parentDraftId) userPromptParts.push(`\nThe previous drafts were dismissed. Offer different angles this time.`)

    return { systemPrompt, userPromptParts }
  }

  // Email
  const replySubjectHint = ctx.latestInboundSubject && ctx.latestInboundSubject.toLowerCase().startsWith('re:')
    ? ctx.latestInboundSubject
    : `Re: ${ctx.latestInboundSubject || ctx.threadSubject || ''}`.trim()

  const systemPrompt = `You are an AI reply assistant for a travel agency named "${BUSINESS_NAME}". You help a human agent draft email replies to customers.

TONE: ${tone}
${toneInstructions(tone, 'email')}

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
    { "subject": "Re: ...", "body": "reply body with paragraph breaks as \\n\\n", "confidence": "high" | "medium" | "low", "rationale": "one-line reason this reply fits" }
  ]
}

Generate exactly ${count} distinct draft option${count === 1 ? '' : 's'}. Each draft should take a slightly different angle (e.g. one direct answer, one that asks a clarifying question, one that offers a next step).`

  const userPromptParts: string[] = [
    `Thread subject: "${ctx.threadSubject || '(none)'}"`,
    `\nConversation so far (oldest to newest):\n${ctx.transcript}`,
    `\nLatest customer email to reply to:\nSubject: ${ctx.latestInboundSubject || '(none)'}\n${ctx.latestInboundText}`,
  ]
  if (retrievalContext) userPromptParts.push(`\n---\n${retrievalContext}\n---\nUse the knowledge above where it directly answers the customer. Do NOT copy past replies verbatim — use them as style and factual reference.`)
  if (instruction) userPromptParts.push(`\nAgent guidance for this round: ${instruction}`)
  if (parentDraftId) userPromptParts.push(`\nThe previous drafts were dismissed. Offer different angles this time.`)

  return { systemPrompt, userPromptParts }
}
