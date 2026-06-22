'use client'

import { MessageSquare, Mail, Clock } from 'lucide-react'
import type { CopilotThreadSummary } from '@/app/types/copilot'

const URGENCY: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-amber-500',
  normal: 'bg-gray-300',
  low: 'bg-gray-200',
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export default function CopilotThreadList({
  threads, selectedId, onSelect, loading,
}: {
  threads: CopilotThreadSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading: boolean
}) {
  if (loading) {
    return <div className="p-6 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#647C47]" /></div>
  }
  if (threads.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-gray-400">
        <MessageSquare className="h-8 w-8 mx-auto mb-2 text-gray-300" />
        No threads awaiting review.
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-100">
      {threads.map(t => {
        const active = t.id === selectedId
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`w-full text-left px-3 py-3 hover:bg-gray-50 transition-colors ${active ? 'bg-[#647C47]/5 border-l-2 border-[#647C47]' : 'border-l-2 border-transparent'}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-1.5 h-1.5 rounded-full ${URGENCY[t.urgency] || URGENCY.normal}`} title={t.urgency} />
              {t.channel === 'whatsapp'
                ? <MessageSquare className="h-3.5 w-3.5 text-green-600 shrink-0" />
                : <Mail className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
              <span className="text-sm font-medium text-gray-900 truncate flex-1">
                {t.client_name || t.contact_info}
              </span>
              <span className="text-[10px] text-gray-400 flex items-center gap-0.5 shrink-0">
                <Clock className="h-2.5 w-2.5" />{timeAgo(t.last_draft_at || t.last_message_at)}
              </span>
            </div>
            {t.subject && <p className="text-xs text-gray-500 truncate mb-0.5">{t.subject}</p>}
            <p className="text-xs text-gray-400 truncate">{t.latest_inbox_snippet || '—'}</p>
            {t.pending_draft_count > 0 && (
              <span className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[#647C47]/10 text-[#647C47]">
                {t.pending_draft_count} draft{t.pending_draft_count > 1 ? 's' : ''} to review
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
