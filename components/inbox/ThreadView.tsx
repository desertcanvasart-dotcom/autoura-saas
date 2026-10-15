'use client'

import { useState } from 'react'
import { ChevronDown, Reply, ReplyAll, Forward } from 'lucide-react'
import AttachmentList from '@/components/AttachmentList'
import ClientLinkButton from '@/components/ClientLinkButton'
import type { Email } from './types'
import type { ComposeMode } from './ComposeModal'

function nameOf(header: string): string {
  const m = header.match(/^\s*"?([^"<]*?)"?\s*</)
  return (m?.[1] || header.replace(/<.*>/, '')).trim() || header
}

function addressOf(header: string): string {
  return (header.match(/<([^>]+)>/)?.[1] || header).trim()
}

/**
 * A whole Gmail conversation, oldest first — what opening an email shows.
 *
 * Earlier messages are folded to one line (sender, snippet, date) and open
 * on a click; the newest one, and any unread one, start open. Each message
 * carries its own Reply / Reply all / Forward, so answering an earlier
 * message in the thread answers that one.
 */
export default function ThreadView({
  messages,
  userId,
  isOwn,
  renderBody,
  onCompose,
}: {
  messages: Email[]
  userId: string
  isOwn: (email: Email) => boolean
  /** Sanitises and formats a message body for display. */
  renderBody: (html: string) => string
  onCompose: (mode: ComposeMode, message: Email) => void
}) {
  const lastId = messages[messages.length - 1]?.id
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(messages.filter(m => m.id === lastId || m.isUnread).map(m => m.id))
  )
  const toggle = (id: string) =>
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="space-y-3" data-testid="thread-view">
      {messages.length > 1 && (
        <p className="text-xs text-gray-500">{messages.length} messages in this conversation</p>
      )}
      {messages.map(m => {
        const expanded = open.has(m.id)
        const mine = isOwn(m)
        return (
          <article key={m.id} className="border border-gray-200 rounded-lg bg-white thread-message">
            <button
              type="button"
              onClick={() => toggle(m.id)}
              className="w-full flex items-start gap-3 px-4 py-3 text-left"
              aria-expanded={expanded}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm text-gray-900 ${m.isUnread ? 'font-semibold' : 'font-medium'}`}>
                    {mine ? 'Me' : nameOf(m.from)}
                  </span>
                  {!mine && <span className="text-xs text-gray-500 truncate">{addressOf(m.from)}</span>}
                </div>
                {expanded ? (
                  <p className="text-xs text-gray-500 truncate">
                    To: {m.to}
                    {m.cc ? ` · Cc: ${m.cc}` : ''}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 truncate">{m.snippet}</p>
                )}
              </div>
              <span className="text-xs text-gray-500 flex-shrink-0">{new Date(m.date).toLocaleString()}</span>
              <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>

            {expanded && (
              <div className="px-4 pb-4">
                {!mine && (
                  <div className="mb-3">
                    <ClientLinkButton
                      userId={userId}
                      messageId={m.id}
                      threadId={m.threadId}
                      fromEmail={addressOf(m.from)}
                      fromName={nameOf(m.from)}
                      subject={m.subject}
                      snippet={m.snippet}
                      sentAt={m.date}
                    />
                  </div>
                )}
                <div className="email-body-content" dangerouslySetInnerHTML={{ __html: renderBody(m.body) }} />
                {m.attachments && m.attachments.length > 0 && (
                  <AttachmentList attachments={m.attachments} messageId={m.id} userId={userId} />
                )}
                <div className="flex items-center gap-2 mt-4 print-hide">
                  <button type="button" onClick={() => onCompose('reply', m)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <Reply className="w-3.5 h-3.5" /> Reply
                  </button>
                  <button type="button" onClick={() => onCompose('replyAll', m)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <ReplyAll className="w-3.5 h-3.5" /> Reply all
                  </button>
                  <button type="button" onClick={() => onCompose('forward', m)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <Forward className="w-3.5 h-3.5" /> Forward
                  </button>
                </div>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
