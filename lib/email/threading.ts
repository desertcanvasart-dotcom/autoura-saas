// ============================================
// What makes a reply a reply, for the customer
// ============================================
// Gmail's own threadId groups a conversation inside Gmail. Every other mail
// client — which is what the CUSTOMER reads — threads on the RFC headers
// In-Reply-To and References. Without them our answer arrived in their inbox
// as a new, unrelated message, and a long exchange read as a pile of
// disconnected emails.
//
// Lives here rather than in the route because a Next route file may only
// export its handlers, and because the rules are worth testing on their own.
// Ported from the sibling app (travel-ops-pro #465).

/** Header values must not carry a newline into the raw message. */
const stripHeader = (v: string): string => String(v ?? '').replace(/[\r\n]+/g, ' ').trim()

export interface ThreadingHeaders { inReplyTo?: string; references?: string }

/**
 * In-Reply-To / References for a reply in `threadId`: the Message-ID of the
 * thread's latest message, and the chain before it.
 *
 * Best-effort on purpose. If Gmail cannot say — a new thread, a revoked
 * token, an outage — the reply still sends and still threads inside Gmail by
 * threadId; it is the customer's client that loses the grouping, which is
 * strictly better than refusing to answer them.
 */
export async function replyHeaders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gmail: any,
  threadId: string
): Promise<ThreadingHeaders> {
  try {
    const thread = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'metadata',
      metadataHeaders: ['Message-ID', 'References'],
    })
    const messages = thread.data?.messages ?? []
    const last = messages[messages.length - 1]
    const header = (name: string): string =>
      last?.payload?.headers?.find((h: { name?: string; value?: string }) => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
    const messageId = header('Message-ID')
    if (!messageId) return {}
    const refs = header('References')
    return { inReplyTo: messageId, references: refs ? `${refs} ${messageId}` : messageId }
  } catch {
    return {}
  }
}

/** The header lines for a reply, in the order a mail client expects them. */
export const threadingLines = (t: ThreadingHeaders): string[] => [
  ...(t.inReplyTo ? [`In-Reply-To: ${stripHeader(t.inReplyTo)}`] : []),
  ...(t.references ? [`References: ${stripHeader(t.references)}`] : []),
]

