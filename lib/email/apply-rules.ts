// ============================================
// Applying mail rules to emails in one mailbox
// ============================================
// The Gmail half of lib/email/mail-rules.ts: folder names become this
// mailbox's label ids (created when missing), and emails sharing a plan are
// changed together, 1,000 per Gmail call.

import type { gmail_v1 } from 'googleapis'
import { planFor, messageText, type MailRule, type RulePlan } from './mail-rules'

/** This mailbox's label id for each folder name, creating the missing ones. */
export async function folderLabelIds(gmail: gmail_v1.Gmail, names: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (names.length === 0) return out
  const { data } = await gmail.users.labels.list({ userId: 'me' })
  const byName = new Map((data.labels ?? []).filter(l => l.name && l.id).map(l => [l.name!.toLowerCase(), l.id!]))
  for (const name of names) {
    const found = byName.get(name.toLowerCase())
    if (found) { out.set(name, found); continue }
    const { data: created } = await gmail.users.labels.create({
      userId: 'me',
      requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
    })
    if (created.id) { out.set(name, created.id); byName.set(name.toLowerCase(), created.id) }
  }
  return out
}

/** Apply one plan to these emails: how many changed, and the labels added. */
export async function applyPlan(
  gmail: gmail_v1.Gmail, ids: string[], plan: RulePlan,
): Promise<{ count: number; addLabelIds: string[] }> {
  if (ids.length === 0) return { count: 0, addLabelIds: [] }
  const folders = await folderLabelIds(gmail, plan.folders)
  const addLabelIds = [...plan.addLabelIds, ...plan.folders.map(f => folders.get(f)).filter((x): x is string => Boolean(x))]
  for (let i = 0; i < ids.length; i += 1000) {
    await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: { ids: ids.slice(i, i + 1000), addLabelIds, removeLabelIds: plan.removeLabelIds },
    })
  }
  return { count: ids.length, addLabelIds }
}

function header(m: gmail_v1.Schema$Message, name: string): string {
  return m.payload?.headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
}

/**
 * Run the company's rules on newly arrived mail (the sync). Only Inbox
 * arrivals are considered — a reply we sent is not filtered. Returns the
 * emails changed and the ids now in Spam or Trash, which the sync then
 * leaves out of the conversations. The messages' labelIds are updated in
 * place, so what the sync stores (read / starred) matches Gmail.
 */
export async function applyRulesToNewMail(
  gmail: gmail_v1.Gmail,
  rules: MailRule[],
  messages: gmail_v1.Schema$Message[],
): Promise<{ applied: number; removedIds: Set<string> }> {
  const removedIds = new Set<string>()
  const live = rules.filter(r => r.enabled)
  if (live.length === 0) return { applied: 0, removedIds }

  const groups = new Map<string, { plan: RulePlan; msgs: gmail_v1.Schema$Message[] }>()
  for (const m of messages) {
    if (!m.id || !(m.labelIds ?? []).includes('INBOX')) continue
    const plan = planFor(live, {
      from: header(m, 'From'),
      to: header(m, 'To'),
      cc: header(m, 'Cc'),
      subject: header(m, 'Subject'),
      text: messageText(m.payload, m.snippet ?? ''),
    })
    if (!plan) continue
    const key = JSON.stringify(plan)
    if (!groups.has(key)) groups.set(key, { plan, msgs: [] })
    groups.get(key)!.msgs.push(m)
  }

  let applied = 0
  for (const { plan, msgs } of groups.values()) {
    const done = await applyPlan(gmail, msgs.map(m => m.id!), plan)
    applied += done.count
    for (const m of msgs) {
      const labels = new Set(m.labelIds ?? [])
      for (const l of done.addLabelIds) labels.add(l)
      for (const l of plan.removeLabelIds) labels.delete(l)
      m.labelIds = [...labels]
      if (plan.removed) removedIds.add(m.id!)
    }
  }
  return { applied, removedIds }
}
