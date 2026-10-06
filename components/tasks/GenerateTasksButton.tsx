'use client'

// ============================================
// TASKS BUTTON — generate or sync an itinerary's operations tasks
// ============================================
// One task per service category, built from the itinerary by plain code
// (lib/tasks/itinerary-tasks.ts). The dialog opens on a dry run, so the
// operator sees which tasks will be created, updated or reopened — and which
// categories are skipped because no active department handles them — and
// picks who each department's tasks go to, before anything is written.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ClipboardList, Loader2, X } from 'lucide-react'
import { todayLocal } from '@/lib/today'
import { showToast } from '@/app/contexts/ToastContext'

/** The dry-run answer from /api/itineraries/[id]/generate-tasks. */
interface TaskPreview {
  tasks: Array<{
    action: 'create' | 'update' | 'reopen' | 'unchanged'
    new_rows: number
    to_cancel: number
    unpriced_rows: number
    service_type: string
    label: string
    service_count: number
    department: { id: string; name: string }
    due_date: string | null
  }>
  skipped: Array<{ service_type: string; label: string; service_count: number }>
  orphaned: Array<{ service_type: string; label: string; reason: 'excluded' | 'removed' }>
  other_tasks: number
}

interface Member {
  id: string
  name: string
  department_id: string | null
}

const ACTION_LABEL: Record<TaskPreview['tasks'][number]['action'], string> = {
  create: 'New',
  update: 'Update',
  reopen: 'Reopen',
  unchanged: 'No change',
}

const ACTION_STYLE: Record<TaskPreview['tasks'][number]['action'], string> = {
  create: 'bg-green-50 text-green-700 border-green-200',
  update: 'bg-blue-50 text-blue-700 border-blue-200',
  reopen: 'bg-amber-50 text-amber-800 border-amber-200',
  unchanged: 'bg-gray-50 text-gray-500 border-gray-200',
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export default function GenerateTasksButton({ itineraryId, openSignal = 0, hideTrigger = false }: {
  itineraryId: string
  /** Bump to open the dialog from elsewhere (the itinerary page's ⋯ menu). */
  openSignal?: number
  /** No button of its own: opened only by openSignal. */
  hideTrigger?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<TaskPreview | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const post = (body: Record<string, unknown>) =>
    fetch(`/api/itineraries/${itineraryId}/generate-tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, today: todayLocal() }),
    }).then(r => r.json())

  const openDialog = async () => {
    setBusy(true)
    setError(null)
    try {
      const [result, memberData] = await Promise.all([
        post({ dry_run: true }),
        fetch('/api/team-members?active=true').then(r => r.json()).catch(() => null),
      ])
      if (!result.success) {
        showToast('error', result.error || 'Could not prepare the tasks')
        return
      }
      const list: Member[] = ((memberData?.data ?? []) as Array<Record<string, unknown>>).map(m => ({
        id: String(m.id),
        name: String(m.name ?? ''),
        department_id: (m.department_id as string | null) ?? null,
      }))

      // Pre-select the first member of each department that receives a task.
      const defaults: Record<string, string> = {}
      for (const task of (result as TaskPreview).tasks) {
        const first = list.find(m => m.department_id === task.department.id)
        if (first && !defaults[task.department.id]) defaults[task.department.id] = first.id
      }

      setMembers(list)
      setAssignments(defaults)
      setPreview(result as TaskPreview)
      setOpen(true)
    } catch (err) {
      console.error('Error previewing tasks:', err)
      showToast('error', 'Could not prepare the tasks')
    } finally {
      setBusy(false)
    }
  }

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await post({ assignments })
      if (!result.success) {
        setError(result.error || 'Could not save the tasks')
        return
      }
      setOpen(false)
      showToast('success', result.message || 'Tasks updated')
    } catch (err) {
      console.error('Error generating tasks:', err)
      setError('Could not save the tasks')
    } finally {
      setBusy(false)
    }
  }

  // Departments receiving a task, each listed once for assignment.
  const receiving = preview
    ? [...new Map(preview.tasks.map(t => [t.department.id, t.department])).values()]
    : []
  const hasWork = !!preview?.tasks.some(t => t.action !== 'unchanged')

  useEffect(() => {
    if (openSignal > 0) openDialog()
    // Only a new signal opens it; openDialog is recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal])

  return (
    <>
      {!hideTrigger && <button
        onClick={openDialog}
        disabled={busy}
        className="px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
        title="Create or sync the operations tasks for this itinerary — one per kind of service"
      >
        {busy && !open ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
        Tasks
      </button>}

      {open && preview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Operations tasks</h2>
              <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Tasks for this itinerary</p>
                {preview.tasks.length === 0 ? (
                  <p className="text-sm text-gray-500">No services here need a task.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {preview.tasks.map(t => (
                      <li key={t.service_type} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className={`px-2 py-0.5 rounded border text-[11px] font-medium shrink-0 ${ACTION_STYLE[t.action]}`}>
                          {ACTION_LABEL[t.action]}
                        </span>
                        <span className="font-medium text-gray-900">{t.label}</span>
                        <span className="text-gray-400 text-xs">{plural(t.service_count, 'service')}</span>
                        {t.action !== 'create' && t.new_rows > 0 && (
                          <span className="text-xs text-blue-700">+{t.new_rows} new</span>
                        )}
                        {t.unpriced_rows > 0 && (
                          <span className="text-xs text-amber-700">{t.unpriced_rows} not priced yet</span>
                        )}
                        {t.to_cancel > 0 && (
                          <span className="text-xs text-red-700">{t.to_cancel} to cancel</span>
                        )}
                        <span className="ml-auto text-xs text-gray-500 shrink-0">{t.department.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {preview.skipped.length > 0 && (
                <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-2">
                  Not created — no active department handles:{' '}
                  {preview.skipped.map(s => `${s.label} (${s.service_count})`).join(', ')}.{' '}
                  <Link href="/settings/departments" className="text-indigo-600 underline">Set up departments</Link>
                </p>
              )}
              {preview.orphaned.length > 0 && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                  Earlier tasks no longer match anything to generate (left as they are):{' '}
                  {preview.orphaned.map(o => o.label).join(', ')}
                </p>
              )}
              {preview.other_tasks > 0 && (
                <p className="text-xs text-gray-500">
                  {plural(preview.other_tasks, 'other task')} on this itinerary (created by hand or by the old generator) will not be touched.
                </p>
              )}

              {receiving.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <p className="text-sm text-gray-500">Who should each department&apos;s new tasks go to? Tasks already assigned keep their assignee.</p>
                  {receiving.map(dept => {
                    const deptMembers = members.filter(m => m.department_id === dept.id)
                    return (
                      <div key={dept.id} className="flex items-center gap-3">
                        <label htmlFor={`assign-${dept.id}`} className="text-sm font-medium text-gray-700 w-28 shrink-0">
                          {dept.name}
                        </label>
                        <select
                          id={`assign-${dept.id}`}
                          value={assignments[dept.id] || ''}
                          onChange={e => setAssignments(prev => ({ ...prev, [dept.id]: e.target.value }))}
                          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        >
                          <option value="">Unassigned</option>
                          {deptMembers.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                          {deptMembers.length === 0 && <option disabled>No members in this department</option>}
                        </select>
                      </div>
                    )
                  })}
                </div>
              )}

              {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</p>}
            </div>

            <div className="flex gap-3 p-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={generate}
                disabled={busy || !hasWork}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
                {hasWork ? 'Save tasks' : 'Up to date'}
              </button>
            </div>
            <div className="px-4 pb-3 -mt-1 text-right">
              <Link href="/tasks" className="text-xs text-indigo-600 underline">Open the tasks page</Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
