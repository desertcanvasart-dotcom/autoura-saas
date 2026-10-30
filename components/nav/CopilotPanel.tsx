'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Maximize2, Sparkles } from 'lucide-react'
import CopilotThreadList from '@/components/copilot/CopilotThreadList'
import type { CopilotThreadSummary } from '@/app/types/copilot'

// The Copilot from the top bar: the threads waiting for review, in a panel
// over whatever page is open. A thread opens on the full Copilot page, which
// the "expand" button also reaches.
export default function CopilotPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [threads, setThreads] = useState<CopilotThreadSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    fetch('/api/copilot/threads')
      .then(r => r.json())
      .then(d => { if (alive && d?.success) setThreads(d.threads) })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const openFull = (threadId?: string) => {
    onClose()
    router.push(threadId ? `/copilot?thread=${encodeURIComponent(threadId)}` : '/copilot')
  }

  return (
    <div className="fixed inset-0 z-[55]" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/20" aria-hidden />
      <aside
        role="dialog"
        aria-label="Copilot"
        onMouseDown={e => e.stopPropagation()}
        className="absolute top-0 right-0 h-full w-full sm:w-[420px] bg-white border-l border-gray-200 shadow-xl flex flex-col"
      >
        <div className="flex items-center gap-2 h-14 px-4 border-b border-gray-200 shrink-0">
          <Sparkles size={18} strokeWidth={1.7} className="text-primary-700" aria-hidden />
          <h2 className="text-[15px] font-semibold text-gray-900">Copilot</h2>
          <span className="text-xs text-gray-500">Drafts waiting for review</span>
          <button
            type="button"
            onClick={() => openFull()}
            className="ml-auto p-2 rounded-md text-gray-500 hover:bg-gray-100"
            title="Expand to full page"
            aria-label="Expand to full page"
          >
            <Maximize2 size={16} strokeWidth={1.7} />
          </button>
          <button type="button" onClick={onClose} className="p-2 rounded-md text-gray-500 hover:bg-gray-100" aria-label="Close">
            <X size={16} strokeWidth={1.7} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <CopilotThreadList threads={threads} selectedId={null} onSelect={id => openFull(id)} loading={loading} />
        </div>
      </aside>
    </div>
  )
}
