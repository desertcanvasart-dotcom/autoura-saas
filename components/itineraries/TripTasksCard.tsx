'use client'

// This trip's operations tasks, on its page: one per kind of service
// (lib/tasks/itinerary-tasks), each with who has it, when it is due and how
// much of its checklist is booked. "Create tasks" / "Sync tasks" opens the
// same dialog the old header's Tasks button did.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import GenerateTasksButton from '@/components/tasks/GenerateTasksButton'
import { ChecklistSummary } from '@/components/tasks/TaskChecklist'
import type { ChecklistItem } from '@/lib/tasks/itinerary-tasks'

interface TripTask {
  id: string
  title: string
  status: string
  due_date: string | null
  checklist?: ChecklistItem[] | null
  assigned_member?: { name?: string | null } | null
}

const STATUS: Record<string, { label: string; className: string }> = {
  todo: { label: 'To do', className: 'bg-gray-100 text-gray-700' },
  in_progress: { label: 'In progress', className: 'bg-blue-50 text-blue-700' },
  done: { label: 'Done', className: 'bg-green-50 text-green-700' },
}

const shortDate = (d: string) =>
  new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export default function TripTasksCard({ itineraryId, openSignal = 0, today }: {
  itineraryId: string
  /** Bump to open the create / sync dialog (the header's ⋯ menu). */
  openSignal?: number
  /** YYYY-MM-DD, for "overdue". */
  today: string
}) {
  const [tasks, setTasks] = useState<TripTask[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [signal, setSignal] = useState(0)

  const load = useCallback(() => {
    fetch(`/api/tasks?itineraryId=${encodeURIComponent(itineraryId)}`)
      .then(r => r.json())
      .then(json => {
        if (json?.success && Array.isArray(json.data)) { setTasks(json.data); setFailed(false) }
        else setFailed(true)
      })
      .catch(() => setFailed(true))
  }, [itineraryId])

  useEffect(() => { load() }, [load])

  // The ⋯ menu's signal and this card's own button open the one dialog.
  useEffect(() => { if (openSignal > 0) setSignal(n => n + 1) }, [openSignal])

  const open = (tasks ?? []).filter(t => t.status !== 'done')

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <ClipboardList className="w-3.5 h-3.5" /> Tasks
          {tasks && tasks.length > 0 && <span className="text-gray-400">· {open.length} open</span>}
        </p>
        <button type="button" onClick={() => setSignal(n => n + 1)} className="text-xs text-primary-600 hover:underline">
          {tasks && tasks.length > 0 ? 'Sync tasks' : 'Create tasks'}
        </button>
      </div>

      {tasks === null && !failed && <p className="text-xs text-gray-400">Loading…</p>}
      {failed && <p className="text-xs text-gray-500">Could not load the tasks.</p>}
      {tasks && tasks.length === 0 && (
        <p className="text-xs text-gray-500">No tasks yet. Create them to send each kind of service to its department.</p>
      )}

      {tasks && tasks.length > 0 && (
        <ul className="space-y-2.5">
          {tasks.map(t => {
            const st = STATUS[t.status] ?? { label: t.status, className: 'bg-gray-100 text-gray-700' }
            const overdue = !!t.due_date && t.status !== 'done' && t.due_date.slice(0, 10) < today
            return (
              <li key={t.id} className="text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-gray-900">{t.title}</span>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded ${st.className}`}>{st.label}</span>
                </div>
                <p className="text-gray-500 mt-0.5">
                  {t.assigned_member?.name || 'Unassigned'}
                  {t.due_date && (
                    <span className={overdue ? 'text-red-600 font-medium' : ''}> · due {shortDate(t.due_date)}{overdue ? ' (overdue)' : ''}</span>
                  )}
                </p>
                {Array.isArray(t.checklist) && t.checklist.length > 0 && (
                  <div className="mt-1"><ChecklistSummary items={t.checklist} /></div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Link href="/tasks" className="mt-3 inline-block text-xs text-primary-600 hover:underline">Open the task board</Link>
      <GenerateTasksButton itineraryId={itineraryId} openSignal={signal} hideTrigger onSaved={load} />
    </div>
  )
}
