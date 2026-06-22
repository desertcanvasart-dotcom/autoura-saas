'use client'

import { useState, useEffect, useCallback } from 'react'
import { ConciergeBell, RefreshCw } from 'lucide-react'
import CopilotThreadList from '@/components/copilot/CopilotThreadList'
import CopilotReviewPanel from '@/components/copilot/CopilotReviewPanel'
import type { CopilotThreadSummary, CopilotThreadDetail, CopilotTone } from '@/app/types/copilot'

const TONES: CopilotTone[] = ['professional', 'friendly', 'formal']

export default function CopilotPage() {
  const [threads, setThreads] = useState<CopilotThreadSummary[]>([])
  const [threadsLoading, setThreadsLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CopilotThreadDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [tone, setTone] = useState<CopilotTone>('professional')

  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch('/api/copilot/threads')
      const data = await res.json()
      if (data.success) setThreads(data.threads)
    } catch (e) { console.error(e) } finally { setThreadsLoading(false) }
  }, [])

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/copilot/threads/${id}`)
      const data = await res.json()
      if (data.success) setDetail({ thread: data.thread, inbox: data.inbox, drafts: data.drafts, context: data.context })
    } catch (e) { console.error(e) } finally { setDetailLoading(false) }
  }, [])

  useEffect(() => { fetchThreads() }, [fetchThreads])

  useEffect(() => {
    fetch('/api/copilot/settings').then(r => r.json()).then(d => {
      if (d?.settings?.tone) setTone(d.settings.tone)
    }).catch(() => {})
  }, [])

  const select = (id: string) => { setSelectedId(id); fetchDetail(id) }

  const refresh = useCallback(async () => {
    await fetchThreads()
    if (selectedId) await fetchDetail(selectedId)
  }, [fetchThreads, fetchDetail, selectedId])

  const changeTone = async (next: CopilotTone) => {
    setTone(next)
    try {
      await fetch('/api/copilot/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tone: next }),
      })
    } catch (e) { console.error(e) }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-1rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#647C47]/10 rounded-lg flex items-center justify-center">
            <ConciergeBell className="h-5 w-5 text-[#647C47]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Copilot</h1>
            <p className="text-xs text-gray-500">Review and send AI-drafted replies</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-500 flex items-center gap-1.5">
            Tone
            <select
              value={tone}
              onChange={e => changeTone(e.target.value as CopilotTone)}
              className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            >
              {TONES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <button onClick={refresh} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Two-pane */}
      <div className="flex-1 flex min-h-0">
        <div className="w-80 border-r border-gray-200 overflow-y-auto shrink-0">
          <CopilotThreadList threads={threads} selectedId={selectedId} onSelect={select} loading={threadsLoading} />
        </div>
        <CopilotReviewPanel detail={detail} loading={detailLoading} onChanged={refresh} />
      </div>
    </div>
  )
}
