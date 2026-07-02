'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { 
  Bell,
  Send,
  Clock,
  CheckCircle,
  AlertTriangle,
  Pause,
  Play,
  Mail,
  Calendar,
  ChevronRight,
  RefreshCw,
  Settings,
  History,
  Eye,
  XCircle,
  ChevronLeft,
  Filter
} from 'lucide-react'
import { showToast } from '@/app/contexts/ToastContext'
import { useConfirmDialog } from '@/components/ConfirmDialog'

interface PendingReminder {
  invoice_id: string
  invoice_number: string
  client_name: string
  client_email: string
  balance_due: number
  currency: string
  due_date: string
  days_until_due: number
  reminder_type: string
  reminder_count: number
  last_reminder_sent: string | null
  reminder_paused?: boolean
}

interface ReminderHistoryItem {
  id: string
  invoice_id: string
  sent_at: string
  reminder_type: string
  recipient_email: string
  subject: string
  status: string
  error_message: string | null
  invoices?: {
    invoice_number: string
    client_name: string
    client_email: string
    total_amount: number
    balance_due: number
    currency: string
    status: string
  }
}

interface ProcessResult {
  sent: number
  failed: number
  details: Array<{
    invoice_number: string
    client_email: string
    status: string
    error?: string
  }>
}

interface HistoryStats {
  total: number
  sent: number
  failed: number
}

const REMINDER_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  before_due_7: { label: '7 Days Before', color: 'bg-blue-100 text-blue-700' },
  before_due_3: { label: '3 Days Before', color: 'bg-blue-100 text-blue-700' },
  on_due: { label: 'Due Today', color: 'bg-amber-100 text-amber-700' },
  overdue_7: { label: '7 Days Overdue', color: 'bg-orange-100 text-orange-700' },
  overdue_14: { label: '14 Days Overdue', color: 'bg-red-100 text-red-700' },
  overdue_30: { label: '30+ Days Overdue', color: 'bg-red-100 text-red-800' },
  manual: { label: 'Manual', color: 'bg-gray-100 text-gray-700' }
}

export default function PaymentRemindersPage() {
  const [pendingReminders, setPendingReminders] = useState<PendingReminder[]>([])
  const [reminderHistory, setReminderHistory] = useState<ReminderHistoryItem[]>([])
  const [historyStats, setHistoryStats] = useState<HistoryStats>({ total: 0, sent: 0, failed: 0 })
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastResult, setLastResult] = useState<ProcessResult | null>(null)
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending')
  const [historyFilter, setHistoryFilter] = useState<'all' | 'sent' | 'failed'>('all')
  const [historyPage, setHistoryPage] = useState(0)
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const dialog = useConfirmDialog()

  const fetchPendingReminders = useCallback(async () => {
    try {
      const pendingRes = await fetch('/api/invoices/reminders?preview=true')
      if (pendingRes.ok) {
        const data = await pendingRes.json()
        setPendingReminders(data.reminders || [])
      }
    } catch (error) {
      console.error('Error fetching pending reminders:', error)
    }
  }, [])

  const fetchReminderHistory = useCallback(async (reset = false) => {
    setHistoryLoading(true)
    try {
      const offset = reset ? 0 : historyPage * 50
      const status = historyFilter === 'all' ? '' : `&status=${historyFilter}`
      
      const historyRes = await fetch(`/api/reminders/history?limit=50&offset=${offset}${status}`)
      if (historyRes.ok) {
        const data = await historyRes.json()
        
        if (reset) {
          setReminderHistory(data.reminders || [])
          setHistoryPage(0)
        } else {
          setReminderHistory(prev => [...prev, ...(data.reminders || [])])
        }
        
        setHistoryStats(data.stats || { total: 0, sent: 0, failed: 0 })
        setHasMoreHistory(data.pagination?.hasMore || false)
      }
    } catch (error) {
      console.error('Error fetching reminder history:', error)
    } finally {
      setHistoryLoading(false)
    }
  }, [historyFilter, historyPage])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await fetchPendingReminders()
      setLoading(false)
    }
    loadData()
  }, [fetchPendingReminders])

  useEffect(() => {
    if (activeTab === 'history') {
      fetchReminderHistory(true)
    }
  }, [activeTab, historyFilter])

  const handleSendSingle = async (invoiceId: string) => {
    setSendingId(invoiceId)
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/reminder`, {
        method: 'POST'
      })
      
      const result = await response.json()
      
      if (result.success) {
        setPendingReminders(prev => prev.filter(r => r.invoice_id !== invoiceId))
        showToast('success', `Reminder sent successfully!`)
      } else {
        showToast('error', result.error || 'Failed to send reminder')
      }
    } catch (error) {
      console.error('Error sending reminder:', error)
      showToast('error', 'Failed to send reminder')
    } finally {
      setSendingId(null)
    }
  }

  const handleTogglePause = async (invoiceId: string, currentPaused: boolean) => {
    setTogglingId(invoiceId)
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/pause`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: !currentPaused })
      })
      
      const result = await response.json()
      
      if (result.success) {
        setPendingReminders(prev => prev.map(r => 
          r.invoice_id === invoiceId 
            ? { ...r, reminder_paused: !currentPaused }
            : r
        ))
      } else {
        showToast('error', result.error || 'Failed to toggle pause status')
      }
    } catch (error) {
      console.error('Error toggling pause:', error)
      showToast('error', 'Failed to toggle pause status')
    } finally {
      setTogglingId(null)
    }
  }

  const handleSendSelected = async () => {
    if (selectedIds.size === 0) {
      showToast('error', 'Please select invoices to send reminders')
      return
    }

    setProcessing(true)
    try {
      const response = await fetch('/api/invoices/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds: Array.from(selectedIds) })
      })

      const result = await response.json()
      setLastResult(result)

      if (result.success) {
        fetchPendingReminders()
        setSelectedIds(new Set())
      }
    } catch (error) {
      console.error('Error processing reminders:', error)
    } finally {
      setProcessing(false)
    }
  }

  const handleSendAll = async () => {
    const activeReminders = pendingReminders.filter(r => !r.reminder_paused)
    if (!(await dialog.confirm({ message: `Are you sure you want to send reminders to all ${activeReminders.length} active invoices?` }))) {
      return
    }

    setProcessing(true)
    try {
      const response = await fetch('/api/invoices/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendAll: true })
      })

      const result = await response.json()
      setLastResult(result)

      if (result.success) {
        fetchPendingReminders()
      }
    } catch (error) {
      console.error('Error processing reminders:', error)
    } finally {
      setProcessing(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const toggleSelectAll = () => {
    const activeReminders = pendingReminders.filter(r => !r.reminder_paused)
    if (selectedIds.size === activeReminders.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(activeReminders.map(r => r.invoice_id)))
    }
  }

  const loadMoreHistory = () => {
    setHistoryPage(prev => prev + 1)
    fetchReminderHistory(false)
  }

  const getCurrencySymbol = (currency: string) => {
    return { EUR: '€', USD: '$', GBP: '£' }[currency] || currency
  }

  const getReminderTypeConfig = (type: string) => {
    return REMINDER_TYPE_LABELS[type] || { label: type, color: 'bg-gray-100 text-gray-700' }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const pausedCount = pendingReminders.filter(r => r.reminder_paused).length
  const activeCount = pendingReminders.filter(r => !r.reminder_paused).length

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-lg">
            🔔
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Payment Reminders</h1>
            <p className="text-sm text-gray-500">Manage automated payment reminder emails</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchPendingReminders()
              if (activeTab === 'history') fetchReminderHistory(true)
            }}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-xs text-gray-500 mb-1">Pending</p>
          <p className="text-2xl font-semibold text-amber-600">{pendingReminders.length}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </div>
          <p className="text-xs text-gray-500 mb-1">Overdue</p>
          <p className="text-2xl font-semibold text-red-600">
            {pendingReminders.filter(r => r.days_until_due < 0).length}
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-xs text-gray-500 mb-1">Due Soon</p>
          <p className="text-2xl font-semibold text-blue-600">
            {pendingReminders.filter(r => r.days_until_due >= 0 && r.days_until_due <= 7).length}
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Pause className="h-4 w-4 text-gray-500" />
          </div>
          <p className="text-xs text-gray-500 mb-1">Paused</p>
          <p className="text-2xl font-semibold text-gray-600">{pausedCount}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
          </div>
          <p className="text-xs text-gray-500 mb-1">Selected</p>
          <p className="text-2xl font-semibold text-green-600">{selectedIds.size}</p>
        </div>
      </div>

      {/* Result Banner */}
      {lastResult && (
        <div className={`p-4 rounded-lg border ${lastResult.failed > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {lastResult.failed > 0 ? (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              ) : (
                <CheckCircle className="h-5 w-5 text-green-500" />
              )}
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {lastResult.sent} reminder{lastResult.sent !== 1 ? 's' : ''} sent
                  {lastResult.failed > 0 && `, ${lastResult.failed} failed`}
                </p>
              </div>
            </div>
            <button
              onClick={() => setLastResult(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'pending' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Bell className="h-4 w-4" />
          Pending ({pendingReminders.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'history' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <History className="h-4 w-4" />
          History ({historyStats.total})
        </button>
      </div>

      {/* Pending Tab */}
      {activeTab === 'pending' && (
        <>
          {/* Actions Bar */}
          {pendingReminders.length > 0 && (
            <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === activeCount && activeCount > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-[#647C47] focus:ring-[#647C47]"
                  />
                  <span className="text-sm text-gray-600">Select All Active</span>
                </label>
                {pausedCount > 0 && (
                  <span className="text-xs text-gray-400">
                    ({pausedCount} paused, excluded from bulk actions)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSendSelected}
                  disabled={selectedIds.size === 0 || processing}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {processing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send Selected ({selectedIds.size})
                    </>
                  )}
                </button>
                <button
                  onClick={handleSendAll}
                  disabled={processing || activeCount === 0}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Mail className="h-4 w-4" />
                  Send All Active ({activeCount})
                </button>
              </div>
            </div>
          )}

          {/* Pending List */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {pendingReminders.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
                <p className="text-gray-500">No pending reminders</p>
                <p className="text-sm text-gray-400 mt-1">All invoices are up to date</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="w-12 px-4 py-3"></th>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Invoice</th>
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Client</th>
                    <th className="text-right text-xs font-semibold text-gray-600 uppercase px-4 py-3">Balance</th>
                    <th className="text-center text-xs font-semibold text-gray-600 uppercase px-4 py-3">Due Date</th>
                    <th className="text-center text-xs font-semibold text-gray-600 uppercase px-4 py-3">Type</th>
                    <th className="text-center text-xs font-semibold text-gray-600 uppercase px-4 py-3">Sent</th>
                    <th className="text-center text-xs font-semibold text-gray-600 uppercase px-4 py-3">Status</th>
                    <th className="text-right text-xs font-semibold text-gray-600 uppercase px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pendingReminders.map((reminder) => {
                    const typeConfig = getReminderTypeConfig(reminder.reminder_type)
                    const isOverdue = reminder.days_until_due < 0
                    const isPaused = reminder.reminder_paused
                    
                    return (
                      <tr 
                        key={reminder.invoice_id} 
                        className={`hover:bg-gray-50 ${isOverdue ? 'bg-red-50/30' : ''} ${isPaused ? 'opacity-60' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(reminder.invoice_id)}
                            onChange={() => toggleSelect(reminder.invoice_id)}
                            disabled={isPaused}
                            className="w-4 h-4 rounded border-gray-300 text-[#647C47] focus:ring-[#647C47] disabled:opacity-50"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Link 
                            href={`/invoices/${reminder.invoice_id}`}
                            className="text-sm font-medium text-gray-900 hover:text-[#647C47]"
                          >
                            {reminder.invoice_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-gray-900">{reminder.client_name}</p>
                          <p className="text-xs text-gray-500">{reminder.client_email}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold text-gray-900">
                            {getCurrencySymbol(reminder.currency)}{Number(reminder.balance_due).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <p className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                            {new Date(reminder.due_date).toLocaleDateString()}
                          </p>
                          <p className={`text-xs ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                            {isOverdue 
                              ? `${Math.abs(reminder.days_until_due)} days overdue`
                              : reminder.days_until_due === 0 
                                ? 'Due today'
                                : `In ${reminder.days_until_due} days`
                            }
                          </p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${typeConfig.color}`}>
                            {typeConfig.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm text-gray-600">{reminder.reminder_count}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isPaused ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                              <Pause className="h-3 w-3" />
                              Paused
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              <Play className="h-3 w-3" />
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleTogglePause(reminder.invoice_id, !!isPaused)}
                              disabled={togglingId === reminder.invoice_id}
                              className={`p-1.5 rounded transition-colors ${
                                isPaused 
                                  ? 'text-green-500 hover:text-green-700 hover:bg-green-50' 
                                  : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'
                              } disabled:opacity-50`}
                              title={isPaused ? 'Resume Reminders' : 'Pause Reminders'}
                            >
                              {togglingId === reminder.invoice_id ? (
                                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                              ) : isPaused ? (
                                <Play className="h-4 w-4" />
                              ) : (
                                <Pause className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleSendSingle(reminder.invoice_id)}
                              disabled={sendingId === reminder.invoice_id || isPaused}
                              className="p-1.5 text-gray-400 hover:text-[#647C47] hover:bg-[#647C47]/10 rounded transition-colors disabled:opacity-50"
                              title="Send Reminder"
                            >
                              {sendingId === reminder.invoice_id ? (
                                <div className="w-4 h-4 border-2 border-[#647C47] border-t-transparent rounded-full animate-spin"></div>
                              ) : (
                                <Send className="h-4 w-4" />
                              )}
                            </button>
                            <Link
                              href={`/invoices/${reminder.invoice_id}`}
                              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                              title="View Invoice"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <>
          {/* History Stats & Filter */}
          <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-gray-600">{historyStats.sent} sent</span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm text-gray-600">{historyStats.failed} failed</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                value={historyFilter}
                onChange={(e) => setHistoryFilter(e.target.value as 'all' | 'sent' | 'failed')}
                className="text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:ring-[#647C47] focus:border-[#647C47]"
              >
                <option value="all">All Reminders</option>
                <option value="sent">Sent Only</option>
                <option value="failed">Failed Only</option>
              </select>
            </div>
          </div>

          {/* History List */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {historyLoading && reminderHistory.length === 0 ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47] mx-auto mb-3"></div>
                <p className="text-gray-500">Loading history...</p>
              </div>
            ) : reminderHistory.length === 0 ? (
              <div className="p-8 text-center">
                <History className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No reminder history yet</p>
                <p className="text-sm text-gray-400 mt-1">Sent reminders will appear here</p>
              </div>
            ) : (
              <>
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Date & Time</th>
                      <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Invoice</th>
                      <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Recipient</th>
                      <th className="text-center text-xs font-semibold text-gray-600 uppercase px-4 py-3">Type</th>
                      <th className="text-center text-xs font-semibold text-gray-600 uppercase px-4 py-3">Status</th>
                      <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Subject</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reminderHistory.map((item) => {
                      const typeConfig = getReminderTypeConfig(item.reminder_type)
                      
                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="text-sm text-gray-900">{formatDate(item.sent_at)}</p>
                          </td>
                          <td className="px-4 py-3">
                            <Link 
                              href={`/invoices/${item.invoice_id}`}
                              className="text-sm font-medium text-gray-900 hover:text-[#647C47]"
                            >
                              {item.invoices?.invoice_number || 'N/A'}
                            </Link>
                            <p className="text-xs text-gray-500">{item.invoices?.client_name}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-gray-600">{item.recipient_email}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${typeConfig.color}`}>
                              {typeConfig.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {item.status === 'sent' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                <CheckCircle className="h-3 w-3" />
                                Sent
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700" title={item.error_message || ''}>
                                <XCircle className="h-3 w-3" />
                                Failed
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-gray-600 truncate max-w-xs" title={item.subject}>
                              {item.subject}
                            </p>
                            {item.error_message && (
                              <p className="text-xs text-red-500 truncate max-w-xs" title={item.error_message}>
                                {item.error_message}
                              </p>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {/* Load More */}
                {hasMoreHistory && (
                  <div className="p-4 border-t border-gray-200 text-center">
                    <button
                      onClick={loadMoreHistory}
                      disabled={historyLoading}
                      className="px-4 py-2 text-sm font-medium text-[#647C47] hover:bg-[#647C47]/10 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {historyLoading ? 'Loading...' : 'Load More'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-800 mb-2">Automatic Reminders</h4>
        <p className="text-sm text-blue-700">
          Payment reminders are sent automatically every day at 9:00 AM based on the invoice due date:
        </p>
        <ul className="text-sm text-blue-700 mt-2 space-y-1 ml-4 list-disc">
          <li>7 days before due date</li>
          <li>3 days before due date</li>
          <li>On the due date</li>
          <li>7 days after due date (overdue)</li>
          <li>14 days after due date (second notice)</li>
          <li>30 days after due date (final notice)</li>
        </ul>
        <p className="text-sm text-blue-600 mt-3">
          <strong>Tip:</strong> Use the pause button to temporarily stop reminders for specific invoices.
        </p>
      </div>

      {/* Footer */}
      <div className="text-center pt-4">
        <p className="text-xs text-gray-400">© 2024 Autoura Operations System</p>
      </div>
    </div>
  )
}