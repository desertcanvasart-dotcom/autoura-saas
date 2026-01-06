'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { 
  Bell, 
  Check, 
  CheckCheck, 
  Trash2, 
  ExternalLink,
  Search,
  ArrowLeft,
  MessageSquare,
  Loader2
} from 'lucide-react'

interface Notification {
  id: string
  team_member_id: string
  type: string
  title: string
  message: string
  link: string | null
  related_task_id: string | null
  is_read: boolean
  email_sent: boolean
  created_at: string
  team_member?: {
    id: string
    name: string
    email: string
  }
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')

  const fetchNotifications = async () => {
    try {
      const params = new URLSearchParams()
      params.append('limit', '100')
      if (filter === 'unread') params.append('unreadOnly', 'true')

      const response = await fetch(`/api/notifications?${params}`)
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setNotifications(data.data || [])
        }
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [filter])

  const markAsRead = async (id: string) => {
    try {
      const response = await fetch(`/api/notifications/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_read: true })
      })

      if (response.ok) {
        setNotifications(prev => 
          prev.map(n => n.id === id ? { ...n, is_read: true } : n)
        )
      }
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      const response = await fetch('/api/notifications/mark-all-read', {
        method: 'PUT'
      })

      if (response.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      }
    } catch (error) {
      console.error('Error marking all as read:', error)
    }
  }

  const deleteNotification = async (id: string) => {
    if (!confirm('Delete this notification?')) return

    try {
      const response = await fetch(`/api/notifications/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setNotifications(prev => prev.filter(n => n.id !== id))
      }
    } catch (error) {
      console.error('Error deleting notification:', error)
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'task_assigned': return '📋'
      case 'task_due_soon': return '⏰'
      case 'task_overdue': return '🚨'
      case 'task_completed': return '✅'
      case 'whatsapp_assigned': return '💬'
      case 'whatsapp_new_message': return '📱'
      case 'whatsapp_mention': return '🔔'
      case 'invoice_paid': return '💰'
      case 'booking_confirmed': return '🎉'
      case 'client_created': return '👤'
      default: return '🔔'
    }
  }

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'task_assigned': return 'bg-[#647C47]/10 border-l-[#647C47]'
      case 'task_due_soon': return 'bg-amber-50 border-l-amber-500'
      case 'task_overdue': return 'bg-red-50 border-l-red-500'
      case 'task_completed': return 'bg-green-50 border-l-green-500'
      case 'whatsapp_assigned': return 'bg-emerald-50 border-l-[#25D366]'
      case 'whatsapp_new_message': return 'bg-emerald-50 border-l-[#25D366]'
      case 'whatsapp_mention': return 'bg-emerald-50 border-l-[#25D366]'
      case 'invoice_paid': return 'bg-blue-50 border-l-blue-500'
      case 'booking_confirmed': return 'bg-purple-50 border-l-purple-500'
      case 'client_created': return 'bg-cyan-50 border-l-cyan-500'
      default: return 'bg-gray-50 border-l-gray-400'
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'task_assigned': return 'Task Assigned'
      case 'task_due_soon': return 'Due Soon'
      case 'task_overdue': return 'Overdue'
      case 'task_completed': return 'Completed'
      case 'whatsapp_assigned': return 'Chat Assigned'
      case 'whatsapp_new_message': return 'New Message'
      case 'whatsapp_mention': return 'Mentioned'
      case 'invoice_paid': return 'Payment'
      case 'booking_confirmed': return 'Booking'
      case 'client_created': return 'New Client'
      default: return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Filter notifications
  const filteredNotifications = notifications.filter(n => {
    if (typeFilter && n.type !== typeFilter) return false
    if (searchTerm && !n.title.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !n.message?.toLowerCase().includes(searchTerm.toLowerCase())) return false
    return true
  })

  const unreadCount = notifications.filter(n => !n.is_read).length
  const types = [...new Set(notifications.map(n => n.type))]

  // Group counts
  const whatsappCount = notifications.filter(n => n.type.startsWith('whatsapp_') && !n.is_read).length
  const taskCount = notifications.filter(n => n.type.startsWith('task_') && !n.is_read).length

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 text-[#647C47] animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link 
            href="/tasks"
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
            <Bell className="h-5 w-5 text-gray-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Notifications</h1>
            <p className="text-sm text-gray-500">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
            </p>
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#647C47] border border-[#647C47] rounded-lg hover:bg-[#647C47]/10 transition-colors"
          >
            <CheckCheck className="h-4 w-4" />
            Mark All Read
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search notifications..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'all' | 'unread')}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
          >
            <option value="all">All</option>
            <option value="unread">Unread Only</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
          >
            <option value="">All Types</option>
            <optgroup label="WhatsApp">
              <option value="whatsapp_assigned">💬 Chat Assigned</option>
              <option value="whatsapp_new_message">📱 New Message</option>
            </optgroup>
            <optgroup label="Tasks">
              <option value="task_assigned">📋 Task Assigned</option>
              <option value="task_due_soon">⏰ Due Soon</option>
              <option value="task_overdue">🚨 Overdue</option>
              <option value="task_completed">✅ Completed</option>
            </optgroup>
            {types.filter(t => !t.startsWith('whatsapp_') && !t.startsWith('task_')).map(type => (
              <option key={type} value={type}>{getNotificationIcon(type)} {getTypeLabel(type)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-xl font-semibold text-gray-900">{notifications.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Unread</p>
          <p className="text-xl font-semibold text-[#647C47]">{unreadCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3 text-[#25D366]" />
            <p className="text-xs text-gray-500">WhatsApp</p>
          </div>
          <p className="text-xl font-semibold text-[#25D366]">{whatsappCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Tasks</p>
          <p className="text-xl font-semibold text-gray-900">{taskCount}</p>
        </div>
      </div>

      {/* Notification List */}
      <div className="space-y-2">
        {filteredNotifications.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <Bell className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No notifications found</p>
            {(searchTerm || typeFilter) && (
              <button 
                onClick={() => { setSearchTerm(''); setTypeFilter(''); }}
                className="mt-2 text-sm text-[#647C47] hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          filteredNotifications.map(notification => (
            <div
              key={notification.id}
              className={`border-l-4 rounded-lg p-4 transition-all ${
                getNotificationColor(notification.type)
              } ${!notification.is_read ? 'shadow-sm bg-opacity-100' : 'opacity-70'}`}
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <span className="text-2xl flex-shrink-0">
                  {getNotificationIcon(notification.type)}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={`text-sm ${!notification.is_read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                        {notification.title}
                      </p>
                      <span className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded mt-1 ${
                        notification.type.startsWith('whatsapp_') 
                          ? 'bg-[#25D366]/20 text-[#128C7E]' 
                          : 'bg-white/80 text-gray-600'
                      }`}>
                        {getTypeLabel(notification.type)}
                      </span>
                    </div>
                    
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {formatDate(notification.created_at)}
                    </span>
                  </div>

                  <p className="text-sm text-gray-600 mt-2 whitespace-pre-line">
                    {notification.message}
                  </p>

                  <div className="flex items-center gap-3 mt-3">
                    {notification.link && (
                      <Link
                        href={notification.link}
                        onClick={() => !notification.is_read && markAsRead(notification.id)}
                        className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors ${
                          notification.type.startsWith('whatsapp_')
                            ? 'bg-[#25D366] hover:bg-[#128C7E]'
                            : 'bg-[#647C47] hover:bg-[#4f6238]'
                        }`}
                      >
                        {notification.type.startsWith('whatsapp_') ? 'Open Chat' : 'View'} 
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}

                    {!notification.is_read && (
                      <button
                        onClick={() => markAsRead(notification.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <Check className="h-3 w-3" />
                        Mark Read
                      </button>
                    )}

                    <button
                      onClick={() => deleteNotification(notification.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>

                    {notification.email_sent && (
                      <span className="text-[10px] text-gray-400">
                        ✉️ Email sent
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Load more hint */}
      {filteredNotifications.length >= 100 && (
        <div className="text-center py-4">
          <p className="text-sm text-gray-500">Showing latest 100 notifications</p>
        </div>
      )}
    </div>
  )
}