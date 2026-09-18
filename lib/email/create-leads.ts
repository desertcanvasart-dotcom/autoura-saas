// ============================================
// Turning a judged conversation into a Lead
// ============================================
// The database half of lib/email/email-leads.ts: who is worth judging, and
// what happens to a yes. Kept apart from the judging so the rules can be
// tested without a model and the model call can be tested without a database.
//
// A created lead is a client at status 'lead', source 'email', linked to the
// conversation it came from — the same row the inbox's manual "create client"
// makes, without waiting for somebody to press it. A booking later promotes
// them to Customer (migration 362).

import { judgeLead, worthJudging, leadName } from './email-leads'
import { bareAddress, type OfficeRule } from './office-addresses'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

export interface NewConversation {
  unifiedId: string
  fromEmail: string
  fromName?: string | null
  subject?: string | null
  body?: string | null
}

/** At most this many judged per sync, so a first sync of a full mailbox cannot
 *  spend the afternoon asking about three hundred old newsletters. */
export const MAX_JUDGED_PER_SYNC = 10

export async function createLeadsFromNewConversations(input: {
  db: Db
  tenantId: string
  office: OfficeRule
  conversations: readonly NewConversation[]
}): Promise<number> {
  const { db, tenantId, office, conversations } = input
  if (conversations.length === 0) return 0

  const senders = [...new Set(conversations.map(c => bareAddress(c.fromEmail)).filter(a => a.includes('@')))]
  if (senders.length === 0) return 0

  // Who we already know, and who was already told "not a lead".
  const [{ data: clientRows }, { data: dismissedRows }] = await Promise.all([
    db.from('clients').select('email').eq('tenant_id', tenantId).in('email', senders),
    db.from('email_lead_dismissals').select('sender_email').eq('tenant_id', tenantId).in('sender_email', senders),
  ])
  const knownClientEmails = new Set(
    ((clientRows ?? []) as Array<{ email: string | null }>).map(r => bareAddress(r.email)).filter(Boolean)
  )
  const dismissedEmails = new Set(
    ((dismissedRows ?? []) as Array<{ sender_email: string | null }>).map(r => bareAddress(r.sender_email)).filter(Boolean)
  )

  let created = 0
  let judged = 0
  const seen = new Set<string>()

  for (const conversation of conversations) {
    if (judged >= MAX_JUDGED_PER_SYNC) break
    const from = bareAddress(conversation.fromEmail)
    // One sender, one judgement — two conversations from the same person in a
    // single sync must not become two clients.
    if (seen.has(from)) continue
    if (!worthJudging({ fromEmail: from }, { office, knownClientEmails, dismissedEmails })) continue
    seen.add(from)
    judged++

    const judgement = await judgeLead({
      fromEmail: from,
      fromName: conversation.fromName,
      subject: conversation.subject,
      body: conversation.body,
    })
    // No answer, or "not a request": nothing is created. An invented lead is
    // work someone has to undo.
    if (!judgement?.isRequest) continue

    const name = leadName({ fromEmail: from, fromName: conversation.fromName })
    const { data: client, error } = await db
      .from('clients')
      .insert({
        tenant_id: tenantId,
        ...name,
        email: from,
        status: 'lead',
        client_source: 'email',
        notes: `Created from an email enquiry — ${judgement.reason}`.slice(0, 500),
      })
      .select('id')
      .single()
    if (error || !client?.id) continue

    // Link it to the conversation it came from, so the inbox shows the lead
    // beside the message that made it.
    await db.from('unified_conversations').update({ client_id: client.id }).eq('id', conversation.unifiedId)
    knownClientEmails.add(from)
    created++
  }

  return created
}
