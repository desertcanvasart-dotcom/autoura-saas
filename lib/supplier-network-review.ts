// ============================================
// The Autoura team checks network suppliers (Phase 3) — pure rules
// ============================================
// Decision §7: the Autoura team verifies a supplier (their papers) before
// any agency can find them. Verify, reject with a note the supplier sees, or
// take a verification back later (also with a note).

export type ReviewDecision = 'verify' | 'reject' | 'revoke'

export function reviewChange(
  current: string,
  decision: unknown,
  note: unknown,
): { ok: true; status: 'verified' | 'rejected'; note: string | null } | { ok: false; error: string } {
  const text = typeof note === 'string' ? note.trim().slice(0, 1000) : ''
  if (decision === 'verify') {
    if (current === 'verified') return { ok: false, error: 'Already verified' }
    if (current === 'unverified') return { ok: false, error: 'Not sent for checking yet' }
    return { ok: true, status: 'verified', note: null }
  }
  if (decision === 'reject' || decision === 'revoke') {
    if (!text) return { ok: false, error: 'Write a short note — the supplier sees it' }
    if (decision === 'reject' && current !== 'pending') return { ok: false, error: 'Only a profile being checked can be rejected' }
    if (decision === 'revoke' && current !== 'verified') return { ok: false, error: 'Only a verified profile can be taken back' }
    return { ok: true, status: 'rejected', note: text }
  }
  return { ok: false, error: 'Choose verify, reject or take back' }
}

export function reviewEmail(decision: ReviewDecision, name: string, note: string | null): { subject: string; text: string } {
  if (decision === 'verify') {
    return { subject: 'You are verified on the Autoura network', text: `Hello ${name},\n\nThe Autoura team checked your papers: you are verified. Agencies using the Autoura network can now find you (while "Let agencies find me" is on).` }
  }
  return {
    subject: decision === 'revoke' ? 'Your Autoura network verification was taken back' : 'Your Autoura network profile was not verified',
    text: `Hello ${name},\n\nThe Autoura team could not verify your profile:\n${note ?? ''}\n\nYou can fix this and send it for checking again from your Autoura page.`,
  }
}
