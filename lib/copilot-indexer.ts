// ============================================
// Copilot knowledge indexer — pairs outbound agent replies with their
// preceding inbound customer question, embeds the pair, and stores it.
// Called fire-and-forget after WhatsApp messages are persisted.
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { embedText, EMBEDDING_MODEL, toPgVector } from './embeddings'

interface IndexWhatsAppReplyArgs {
  supabase: SupabaseClient          // Must have row-level access to this tenant
  tenantId: string
  conversationId: string
  outboundMessageId: string         // whatsapp_messages.id for the outbound reply
  outboundText: string
  outboundSentAt: string | null
  clientId?: string | null
  isAiGenerated?: boolean           // Skip auto-indexing AI replies by default
}

/**
 * Find the most recent inbound message before `outboundSentAt`, then index
 * the pair as a `whatsapp_pair` knowledge entry. Idempotent via the UNIQUE
 * (tenant_id, source_whatsapp_message_id) constraint on copilot_knowledge.
 *
 * Returns null on any error (caller should not fail the parent request).
 */
export async function indexWhatsAppReply(args: IndexWhatsAppReplyArgs): Promise<string | null> {
  const {
    supabase, tenantId, conversationId,
    outboundMessageId, outboundText, outboundSentAt,
    clientId = null, isAiGenerated = false,
  } = args

  try {
    if (!outboundText || outboundText.trim().length < 4) return null
    // Don't index AI-generated replies as exemplars — they contaminate the signal.
    if (isAiGenerated) return null

    // Find the most recent inbound message in this conversation before the reply.
    const beforeCutoff = outboundSentAt || new Date().toISOString()
    const { data: inbound } = await supabase
      .from('whatsapp_messages')
      .select('message_body, message_text, sent_at')
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound')
      .lt('sent_at', beforeCutoff)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const inboundText = (inbound?.message_body || inbound?.message_text || '').trim()
    if (!inboundText) return null

    const embedding = await embedText(inboundText)

    const { data, error } = await supabase
      .from('copilot_knowledge')
      .insert({
        tenant_id: tenantId,
        source_type: 'whatsapp_pair',
        source_whatsapp_message_id: outboundMessageId,
        title: null,
        query_text: inboundText,
        answer_text: outboundText.trim(),
        metadata: {
          conversation_id: conversationId,
          client_id: clientId,
          paired_at: outboundSentAt,
        },
        embedding: toPgVector(embedding) as any,
        embedding_model: EMBEDDING_MODEL,
      })
      .select('id')
      .single()

    if (error) {
      // Duplicate (23505) is fine — already indexed
      if (error.code !== '23505') {
        console.error('indexWhatsAppReply insert error:', error.message)
      }
      return null
    }
    return data?.id ?? null
  } catch (err: any) {
    console.error('indexWhatsAppReply failed:', err?.message || err)
    return null
  }
}

// ============================================
// Email reply indexer
// ============================================
interface IndexEmailReplyArgs {
  supabase: SupabaseClient
  tenantId: string
  conversationId: string              // unified_conversations.id (canonical)
  outboundMessageId: string           // email_messages.id for the reply row
  outboundSourceMessageId?: string | null // Gmail message_id (for audit)
  outboundSubject?: string | null
  outboundBody: string                // plain-text body of the reply
  outboundSentAt: string | null
  clientId?: string | null
}

/**
 * Find the most recent inbound email in the conversation before `outboundSentAt`,
 * pair it with the reply, embed the pair, and store in copilot_knowledge.
 */
export async function indexEmailReply(args: IndexEmailReplyArgs): Promise<string | null> {
  const {
    supabase, tenantId, conversationId,
    outboundMessageId, outboundSourceMessageId = null,
    outboundSubject = null, outboundBody, outboundSentAt,
    clientId = null,
  } = args

  try {
    const outboundText = (outboundBody || '').trim()
    if (outboundText.length < 20) return null // too short to be useful

    const before = outboundSentAt || new Date().toISOString()
    const { data: inbound } = await supabase
      .from('email_messages')
      .select('subject, body_text, snippet, from_email, sent_at')
      .eq('unified_conversation_id', conversationId)
      .eq('direction', 'inbound')
      .lt('sent_at', before)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const inboundBody = (inbound?.body_text || inbound?.snippet || '').trim()
    if (!inboundBody) return null

    // Embed the INBOUND email (question) as the retrieval key. Prepend subject
    // so tonal/contextual cues are captured.
    const queryText = inbound?.subject
      ? `${inbound.subject}\n\n${inboundBody}`
      : inboundBody

    const embedding = await embedText(queryText)

    const answerText = outboundSubject
      ? `Subject: ${outboundSubject}\n\n${outboundText}`
      : outboundText

    const { data, error } = await supabase
      .from('copilot_knowledge')
      .insert({
        tenant_id: tenantId,
        source_type: 'whatsapp_pair', // reused turn-pair semantics for consistency
        title: null,
        query_text: queryText,
        answer_text: answerText,
        metadata: {
          channel: 'email',
          unified_conversation_id: conversationId,
          email_message_id: outboundMessageId,
          gmail_message_id: outboundSourceMessageId,
          client_id: clientId,
          paired_at: outboundSentAt,
          subject: outboundSubject,
        },
        embedding: toPgVector(embedding) as any,
        embedding_model: EMBEDDING_MODEL,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code !== '23505') {
        console.error('indexEmailReply insert error:', error.message)
      }
      return null
    }
    return data?.id ?? null
  } catch (err: any) {
    console.error('indexEmailReply failed:', err?.message || err)
    return null
  }
}
