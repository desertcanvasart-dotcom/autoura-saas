// ============================================
// Sending a quote from its page (email or WhatsApp)
// ============================================
// The send routes refuse a quote with services still at no price (422 with
// `gaps`), as the PDF download does. The page asks the operator, and sends
// it anyway only if they say so — rather than a dead-end error telling them
// to add `allow_incomplete=true` to a request they cannot see.

/** What the send routes answer. */
export interface SendResult {
  success?: boolean
  error?: string
  email?: string
  phone?: string
  warning?: string
  gaps?: unknown[]
}

export async function postQuoteSend(
  url: string,
  confirmIncomplete: (message: string) => Promise<boolean>
): Promise<{ cancelled: true } | { cancelled: false; response: Response; data: SendResult }> {
  const post = (body: Record<string, unknown>) =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  let response = await post({})
  let data: SendResult = await response.json().catch(() => ({}))
  if (response.status === 422 && Array.isArray(data.gaps) && data.gaps.length > 0) {
    if (!(await confirmIncomplete(`${data.error} Send it anyway?`))) return { cancelled: true }
    response = await post({ allow_incomplete: true })
    data = await response.json().catch(() => ({}))
  }
  return { cancelled: false, response, data }
}
