'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { todayLocal } from '@/lib/today'
import Link from 'next/link'
import { 
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  CheckCircle,
  Circle,
  Clock,
  AlertTriangle,
  AlertCircle,
  Calendar,
  User,
  Filter,
  Play,
  Link as LinkIcon,
  FileText,
  Users as UsersIcon,
  Receipt,
  MapPin,
  Loader2,
  LayoutGrid,
  List,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Archive,
  ArchiveRestore,
  Eye,
  EyeOff
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'

interface TeamMember {
  id: string
  name: string
  role: string
  email?: string
}

interface Client {
  id: string
  name: string
  email?: string
  company?: string
}

interface Itinerary {
  id: string
  itinerary_code: string
  client_name: string
  trip_name?: string
  start_date?: string
}

interface Task {
  id: string
  title: string
  description: string
  due_date: string
  priority: string
  status: string
  assigned_to: string
  linked_type: string
  linked_id: string
  notes: string
  created_at: string
  updated_at: string
  completed_at: string
  archived: boolean
  archived_at?: string
  assigned_member?: TeamMember
  linked_name?: string
}

interface Summary {
  total: number
  todo: number
  in_progress: number
  done: number
  overdue: number
  due_today: number
  high_priority: number
  archived: number
}

const PRIORITIES = [
  { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-100 text-blue-600', dot: 'bg-blue-400' },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-600', dot: 'bg-orange-400' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-600', dot: 'bg-red-500' }
]

const STATUSES = [
  { value: 'todo', label: 'To Do', icon: Circle, color: 'text-gray-500' },
  { value: 'in_progress', label: 'In Progress', icon: Play, color: 'text-blue-500' },
  { value: 'done', label: 'Done', icon: CheckCircle, color: 'text-green-500' }
]

const LINKED_TYPES = [
  { value: 'itinerary', label: 'Itinerary', icon: MapPin, path: '/itineraries' },
  { value: 'client', label: 'Client', icon: UsersIcon, path: '/clients' },
  { value: 'invoice', label: 'Invoice', icon: FileText, path: '/invoices' },
  { value: 'expense', label: 'Expense', icon: Receipt, path: '/expenses' }
]

type ViewMode = 'kanban' | 'table' | 'list'
type SortField = 'title' | 'status' | 'priority' | 'due_date' | 'assigned_to'
type SortDirection = 'asc' | 'desc'

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 }
const STATUS_ORDER = { todo: 0, in_progress: 1, done: 2 }

export default function TasksPage() {
  const dialog = useConfirmDialog()
  const [tasks, setTasks] = useState<Task[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [itineraries, setItineraries] = useState<Itinerary[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [dueDateFilter, setDueDateFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    due_date: '',
    priority: 'medium',
    assigned_to: '',
    linked_type: '',
    linked_id: '',
    notes: ''
  })
  const [saving, setSaving] = useState(false)

  // View mode, pagination, sorting
  const [viewMode, setViewMode] = useState<ViewMode>('kanban')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)
  const [sortField, setSortField] = useState<SortField>('due_date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Archive state
  const [showArchived, setShowArchived] = useState(false)
  const [archiving, setArchiving] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      if (priorityFilter) params.append('priority', priorityFilter)
      if (assigneeFilter) params.append('assignedTo', assigneeFilter)
      if (dueDateFilter) params.append('dueDate', dueDateFilter)
      params.append('includeArchived', showArchived ? 'true' : 'false')

      const response = await fetch(`/api/tasks?${params}`)
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setTasks(result.data)
          setSummary(result.summary)
        }
      }
    } catch (error) {
      console.error('Error fetching tasks:', error)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, priorityFilter, assigneeFilter, dueDateFilter, showArchived])

  const fetchTeamMembers = async () => {
    try {
      const response = await fetch('/api/team-members?active=true')
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setTeamMembers(result.data)
        }
      }
    } catch (error) {
      console.error('Error fetching team members:', error)
    }
  }

  const fetchClients = async () => {
    try {
      const response = await fetch('/api/clients')
      if (response.ok) {
        const result = await response.json()
        const data = result.clients || result.data || (Array.isArray(result) ? result : [])
        setClients(data)
      }
    } catch (error) {
      console.error('Error fetching clients:', error)
    }
  }

  const fetchItineraries = async () => {
    try {
      const response = await fetch('/api/itineraries')
      if (response.ok) {
        const result = await response.json()
        const data = result.success ? result.data : (Array.isArray(result) ? result : [])
        setItineraries(data)
      }
    } catch (error) {
      console.error('Error fetching itineraries:', error)
    }
  }

  useEffect(() => {
    fetchTasks()
    fetchTeamMembers()
  }, [fetchTasks])

  useEffect(() => {
    if (showModal) {
      if (clients.length === 0) fetchClients()
      if (itineraries.length === 0) fetchItineraries()
    }
  }, [showModal, clients.length, itineraries.length])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter, priorityFilter, assigneeFilter, dueDateFilter, itemsPerPage, showArchived])

  const createTaskNotification = async (taskId: string, taskTitle: string, assigneeId: string, isNewTask: boolean) => {
    try {
      const assignee = teamMembers.find(m => m.id === assigneeId)
      if (!assignee) return

      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_member_id: assigneeId,
          type: 'task_assigned',
          title: isNewTask ? `New task assigned: ${taskTitle}` : `Task reassigned: ${taskTitle}`,
          message: `You have been assigned to the task "${taskTitle}". ${formData.due_date ? `Due: ${new Date(formData.due_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}` : 'No due date set.'}`,
          link: '/tasks',
          related_task_id: taskId,
          send_email: true
        })
      })
    } catch (error) {
      console.error('Error creating notification:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const previousAssignee = editingTask?.assigned_to

    try {
      const url = editingTask 
        ? `/api/tasks/${editingTask.id}`
        : '/api/tasks'
      
      const response = await fetch(url, {
        method: editingTask ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          assigned_to: formData.assigned_to || null,
          linked_type: formData.linked_type || null,
          linked_id: formData.linked_id || null
        })
      })

      if (response.ok) {
        const result = await response.json()
        const taskId = result.data?.id || editingTask?.id

        if (formData.assigned_to && taskId) {
          const isNewAssignment = !editingTask || previousAssignee !== formData.assigned_to
          if (isNewAssignment) {
            await createTaskNotification(taskId, formData.title, formData.assigned_to, !editingTask)
          }
        }

        setShowModal(false)
        setEditingTask(null)
        resetForm()
        fetchTasks()
      }
    } catch (error) {
      console.error('Error saving task:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (task: Task, newStatus: string) => {
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      if (response.ok) {
        fetchTasks()
      }
    } catch (error) {
      console.error('Error updating task status:', error)
    }
  }

  const handleArchive = async (task: Task) => {
    setArchiving(task.id)
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          archived: !task.archived,
          archived_at: task.archived ? null : new Date().toISOString()
        })
      })
      if (response.ok) {
        fetchTasks()
      }
    } catch (error) {
      console.error('Error archiving task:', error)
    } finally {
      setArchiving(null)
    }
  }

  const handleBulkArchiveDone = async () => {
    const doneTasks = tasks.filter(t => t.status === 'done' && !t.archived)
    if (doneTasks.length === 0) return
    
    if (!(await dialog.confirm({ message: `Archive ${doneTasks.length} completed task${doneTasks.length > 1 ? 's' : ''}?` }))) return

    setArchiving('bulk')
    try {
      await Promise.all(doneTasks.map(task => 
        fetch(`/api/tasks/${task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            archived: true,
            archived_at: new Date().toISOString()
          })
        })
      ))
      fetchTasks()
    } catch (error) {
      console.error('Error bulk archiving:', error)
    } finally {
      setArchiving(null)
    }
  }

  const handleEdit = (task: Task) => {
    setEditingTask(task)
    setFormData({
      title: task.title || '',
      description: task.description || '',
      due_date: task.due_date || '',
      priority: task.priority || 'medium',
      assigned_to: task.assigned_to || '',
      linked_type: task.linked_type || '',
      linked_id: task.linked_id || '',
      notes: task.notes || ''
    })
    setShowModal(true)
  }

  const handleDelete = async (task: Task) => {
    if (!(await dialog.confirm({ message: `Delete task "${task.title}"?`, variant: 'danger', confirmText: 'Delete' }))) return

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        fetchTasks()
      }
    } catch (error) {
      console.error('Error deleting task:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      due_date: '',
      priority: 'medium',
      assigned_to: '',
      linked_type: '',
      linked_id: '',
      notes: ''
    })
  }

  const openAddModal = () => {
    setEditingTask(null)
    resetForm()
    setShowModal(true)
  }

  const getPriorityConfig = (priority: string) => {
    return PRIORITIES.find(p => p.value === priority) || PRIORITIES[1]
  }

  const getStatusConfig = (status: string) => {
    return STATUSES.find(s => s.value === status) || STATUSES[0]
  }

  const getLinkedTypeConfig = (type: string) => {
    return LINKED_TYPES.find(t => t.value === type)
  }

  const isOverdue = (task: Task) => {
    if (task.status === 'done' || !task.due_date) return false
    return new Date(task.due_date) < new Date(new Date().toDateString())
  }

  const isDueToday = (task: Task) => {
    if (!task.due_date) return false
    const today = todayLocal()
    return task.due_date === today
  }

  const clearFilters = () => {
    setStatusFilter('')
    setPriorityFilter('')
    setAssigneeFilter('')
    setDueDateFilter('')
  }

  const hasActiveFilters = statusFilter || priorityFilter || assigneeFilter || dueDateFilter

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesSearch = task.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           task.description?.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesArchive = showArchived ? true : !task.archived
      return matchesSearch && matchesArchive
    })
  }, [tasks, searchTerm, showArchived])

  // Sort tasks
  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case 'title':
          comparison = (a.title || '').localeCompare(b.title || '')
          break
        case 'status':
          comparison = (STATUS_ORDER[a.status as keyof typeof STATUS_ORDER] ?? 99) - 
                       (STATUS_ORDER[b.status as keyof typeof STATUS_ORDER] ?? 99)
          break
        case 'priority':
          comparison = (PRIORITY_ORDER[a.priority as keyof typeof PRIORITY_ORDER] ?? 99) - 
                       (PRIORITY_ORDER[b.priority as keyof typeof PRIORITY_ORDER] ?? 99)
          break
        case 'due_date':
          if (!a.due_date && !b.due_date) comparison = 0
          else if (!a.due_date) comparison = 1
          else if (!b.due_date) comparison = -1
          else comparison = new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
          break
        case 'assigned_to':
          const nameA = a.assigned_member?.name || ''
          const nameB = b.assigned_member?.name || ''
          comparison = nameA.localeCompare(nameB)
          break
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [filteredTasks, sortField, sortDirection])

  // Pagination
  const totalPages = Math.ceil(sortedTasks.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedTasks = sortedTasks.slice(startIndex, endIndex)

  // Tasks by status for kanban
  const tasksByStatus = useMemo(() => ({
    todo: filteredTasks.filter(t => t.status === 'todo' && !t.archived),
    in_progress: filteredTasks.filter(t => t.status === 'in_progress' && !t.archived),
    done: filteredTasks.filter(t => t.status === 'done' && !t.archived)
  }), [filteredTasks])

  const archivedTasks = filteredTasks.filter(t => t.archived)
  const archivableDoneCount = tasks.filter(t => t.status === 'done' && !t.archived).length

  const getLinkedItemName = (type: string, id: string) => {
    if (type === 'client') {
      const client = clients.find(c => c.id === id)
      return client ? client.name : id
    }
    if (type === 'itinerary') {
      const itinerary = itineraries.find(i => i.id === id)
      return itinerary ? `${itinerary.itinerary_code} - ${itinerary.client_name}` : id
    }
    return id
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-gray-400" />
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-3 w-3 text-[#647C47]" />
      : <ArrowDown className="h-3 w-3 text-[#647C47]" />
  }

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
            ✅
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Tasks</h1>
            <p className="text-sm text-gray-500">Manage operational tasks and assignments</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded ${viewMode === 'kanban' ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              title="Kanban View"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              title="Table View"
            >
              <TableIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              title="List View"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Task
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Total</p>
            <p className="text-xl font-semibold text-gray-900">{summary.total}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Circle className="h-3 w-3 text-gray-400" />
              <p className="text-xs text-gray-500">To Do</p>
            </div>
            <p className="text-xl font-semibold text-gray-600">{summary.todo}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Play className="h-3 w-3 text-blue-500" />
              <p className="text-xs text-gray-500">In Progress</p>
            </div>
            <p className="text-xl font-semibold text-blue-600">{summary.in_progress}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              <p className="text-xs text-gray-500">Done</p>
            </div>
            <p className="text-xl font-semibold text-green-600">{summary.done}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertCircle className="h-3 w-3 text-red-500" />
              <p className="text-xs text-gray-500">Overdue</p>
            </div>
            <p className="text-xl font-semibold text-red-600">{summary.overdue}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="h-3 w-3 text-amber-500" />
              <p className="text-xs text-gray-500">Due Today</p>
            </div>
            <p className="text-xl font-semibold text-amber-600">{summary.due_today}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="h-3 w-3 text-orange-500" />
              <p className="text-xs text-gray-500">High Priority</p>
            </div>
            <p className="text-xl font-semibold text-orange-600">{summary.high_priority}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Archive className="h-3 w-3 text-gray-400" />
              <p className="text-xs text-gray-500">Archived</p>
            </div>
            <p className="text-xl font-semibold text-gray-400">{summary.archived || 0}</p>
          </div>
        </div>
      )}

      {/* Filters Row */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47]"
          />
        </div>

        {/* Quick Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setDueDateFilter(dueDateFilter === 'overdue' ? '' : 'overdue')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              dueDateFilter === 'overdue' 
                ? 'bg-red-100 text-red-700 border border-red-200' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Overdue
          </button>
          <button
            onClick={() => setDueDateFilter(dueDateFilter === 'today' ? '' : 'today')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              dueDateFilter === 'today' 
                ? 'bg-amber-100 text-amber-700 border border-amber-200' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Due Today
          </button>
          <button
            onClick={() => setDueDateFilter(dueDateFilter === 'week' ? '' : 'week')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              dueDateFilter === 'week' 
                ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            This Week
          </button>

          <div className="w-px h-5 bg-gray-200 mx-1" />

          {/* Archive Toggle */}
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              showArchived 
                ? 'bg-gray-700 text-white' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {showArchived ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {showArchived ? 'Showing Archived' : 'Show Archived'}
          </button>

          {/* Bulk Archive Done */}
          {archivableDoneCount > 0 && (
            <button
              onClick={handleBulkArchiveDone}
              disabled={archiving === 'bulk'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {archiving === 'bulk' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Archive className="h-3 w-3" />
              )}
              Archive Done ({archivableDoneCount})
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border rounded-lg transition-colors ${
            hasActiveFilters 
              ? 'border-[#647C47] text-[#647C47] bg-[#647C47]/5' 
              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-[#647C47]"></span>}
        </button>

        {hasActiveFilters && (
          <button onClick={clearFilters} className="text-sm text-gray-500 hover:text-gray-700">
            Clear
          </button>
        )}
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
              >
                <option value="">All Statuses</option>
                {STATUSES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Priority</label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
              >
                <option value="">All Priorities</option>
                {PRIORITIES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Assigned To</label>
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
              >
                <option value="">All Members</option>
                {teamMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Due Date</label>
              <select
                value={dueDateFilter}
                onChange={(e) => setDueDateFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
              >
                <option value="">All Dates</option>
                <option value="overdue">Overdue</option>
                <option value="today">Due Today</option>
                <option value="week">This Week</option>
                <option value="upcoming">Upcoming</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {STATUSES.map(status => {
            const StatusIcon = status.icon
            const statusTasks = tasksByStatus[status.value as keyof typeof tasksByStatus] || []
            
            return (
              <div key={status.value} className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <StatusIcon className={`h-4 w-4 ${status.color}`} />
                    <h3 className="text-sm font-semibold text-gray-900">{status.label}</h3>
                    <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-600 rounded-full">
                      {statusTasks.length}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 max-h-[calc(100vh-420px)] overflow-y-auto">
                  {statusTasks.length === 0 ? (
                    <div className="p-4 bg-white border border-dashed border-gray-200 rounded-lg text-center">
                      <p className="text-xs text-gray-400">No tasks</p>
                    </div>
                  ) : (
                    statusTasks.map(task => {
                      const priorityConfig = getPriorityConfig(task.priority)
                      const linkedConfig = getLinkedTypeConfig(task.linked_type)
                      const taskIsOverdue = isOverdue(task)
                      const taskIsDueToday = isDueToday(task)

                      return (
                        <div 
                          key={task.id} 
                          className={`bg-white border rounded-lg p-3 hover:shadow-sm transition-shadow ${
                            taskIsOverdue ? 'border-red-200 bg-red-50/50' : 'border-gray-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h4 className="text-sm font-medium text-gray-900 flex-1">{task.title}</h4>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleArchive(task)}
                                disabled={archiving === task.id}
                                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                                title="Archive"
                              >
                                {archiving === task.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Archive className="h-3 w-3" />
                                )}
                              </button>
                              <button
                                onClick={() => handleEdit(task)}
                                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => handleDelete(task)}
                                className="p-1 text-gray-400 hover:text-red-600 rounded"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>

                          {task.description && (
                            <p className="text-xs text-gray-500 mb-2 line-clamp-2">{task.description}</p>
                          )}

                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${priorityConfig.color}`}>
                              {priorityConfig.label}
                            </span>
                            
                            {task.due_date && (
                              <span className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded ${
                                taskIsOverdue 
                                  ? 'bg-red-100 text-red-600' 
                                  : taskIsDueToday 
                                    ? 'bg-amber-100 text-amber-600'
                                    : 'bg-gray-100 text-gray-600'
                              }`}>
                                <Calendar className="h-3 w-3" />
                                {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {task.assigned_member && (
                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                  <User className="h-3 w-3" />
                                  <span>{task.assigned_member.name}</span>
                                </div>
                              )}
                            </div>

                            {linkedConfig && task.linked_id && (
                              <Link
                                href={`${linkedConfig.path}/${task.linked_id}`}
                                className="flex items-center gap-1 text-xs text-[#647C47] hover:underline"
                              >
                                <LinkIcon className="h-3 w-3" />
                                {linkedConfig.label}
                              </Link>
                            )}
                          </div>

                          {/* Quick Status Change */}
                          {status.value !== 'done' && (
                            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100">
                              {status.value === 'todo' && (
                                <button
                                  onClick={() => handleStatusChange(task, 'in_progress')}
                                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                >
                                  <Play className="h-3 w-3" />
                                  Start
                                </button>
                              )}
                              <button
                                onClick={() => handleStatusChange(task, 'done')}
                                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50 rounded transition-colors"
                              >
                                <CheckCircle className="h-3 w-3" />
                                Complete
                              </button>
                            </div>
                          )}

                          {status.value === 'done' && (
                            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100">
                              <button
                                onClick={() => handleStatusChange(task, 'todo')}
                                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors"
                              >
                                <Circle className="h-3 w-3" />
                                Reopen
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('title')}
                  >
                    <div className="flex items-center gap-1">
                      Title
                      <SortIcon field="title" />
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center gap-1">
                      Status
                      <SortIcon field="status" />
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('priority')}
                  >
                    <div className="flex items-center gap-1">
                      Priority
                      <SortIcon field="priority" />
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('due_date')}
                  >
                    <div className="flex items-center gap-1">
                      Due Date
                      <SortIcon field="due_date" />
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('assigned_to')}
                  >
                    <div className="flex items-center gap-1">
                      Assigned To
                      <SortIcon field="assigned_to" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Linked To
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedTasks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                      No tasks found
                    </td>
                  </tr>
                ) : (
                  paginatedTasks.map(task => {
                    const priorityConfig = getPriorityConfig(task.priority)
                    const statusConfig = getStatusConfig(task.status)
                    const linkedConfig = getLinkedTypeConfig(task.linked_type)
                    const taskIsOverdue = isOverdue(task)
                    const StatusIcon = statusConfig.icon

                    return (
                      <tr 
                        key={task.id} 
                        className={`hover:bg-gray-50 ${task.archived ? 'opacity-50 bg-gray-50' : ''} ${taskIsOverdue ? 'bg-red-50/50' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {task.archived && <Archive className="h-3 w-3 text-gray-400" />}
                            <span className="text-sm font-medium text-gray-900">{task.title}</span>
                          </div>
                          {task.description && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{task.description}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className={`inline-flex items-center gap-1.5 text-xs font-medium ${statusConfig.color}`}>
                            <StatusIcon className="h-3 w-3" />
                            {statusConfig.label}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${priorityConfig.color}`}>
                            {priorityConfig.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {task.due_date ? (
                            <span className={`text-xs ${taskIsOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                              {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">No date</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {task.assigned_member ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-6 h-6 bg-[#647C47]/10 text-[#647C47] rounded-full flex items-center justify-center text-xs font-medium">
                                {task.assigned_member.name.charAt(0)}
                              </div>
                              <span className="text-xs text-gray-600">{task.assigned_member.name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {linkedConfig && task.linked_id ? (
                            <Link
                              href={`${linkedConfig.path}/${task.linked_id}`}
                              className="flex items-center gap-1 text-xs text-[#647C47] hover:underline"
                            >
                              <LinkIcon className="h-3 w-3" />
                              {linkedConfig.label}
                            </Link>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {!task.archived && task.status !== 'done' && (
                              <button
                                onClick={() => handleStatusChange(task, 'done')}
                                className="p-1.5 text-gray-400 hover:text-green-600 rounded hover:bg-green-50"
                                title="Mark Complete"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleArchive(task)}
                              disabled={archiving === task.id}
                              className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                              title={task.archived ? 'Unarchive' : 'Archive'}
                            >
                              {archiving === task.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : task.archived ? (
                                <ArchiveRestore className="h-4 w-4" />
                              ) : (
                                <Archive className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleEdit(task)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                              title="Edit"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(task)}
                              className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Show</span>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                className="px-2 py-1 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#647C47]"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-sm text-gray-600">per page</span>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {sortedTasks.length > 0 ? `${startIndex + 1}-${Math.min(endIndex, sortedTasks.length)} of ${sortedTasks.length}` : '0 results'}
              </span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-3 py-1 text-sm font-medium text-gray-700">
                  {currentPage} / {totalPages || 1}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {paginatedTasks.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
              <p className="text-sm text-gray-500">No tasks found</p>
            </div>
          ) : (
            <>
              {paginatedTasks.map(task => {
                const priorityConfig = getPriorityConfig(task.priority)
                const statusConfig = getStatusConfig(task.status)
                const linkedConfig = getLinkedTypeConfig(task.linked_type)
                const taskIsOverdue = isOverdue(task)
                const StatusIcon = statusConfig.icon

                return (
                  <div 
                    key={task.id}
                    className={`bg-white border rounded-lg p-3 hover:shadow-sm transition-shadow ${
                      task.archived ? 'opacity-50 border-gray-200' : taskIsOverdue ? 'border-red-200 bg-red-50/30' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Status Icon */}
                      <button
                        onClick={() => !task.archived && handleStatusChange(task, task.status === 'done' ? 'todo' : 'done')}
                        disabled={task.archived}
                        className={`flex-shrink-0 ${task.archived ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <StatusIcon className={`h-5 w-5 ${statusConfig.color}`} />
                      </button>

                      {/* Title & Description */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {task.archived && <Archive className="h-3 w-3 text-gray-400" />}
                          <h4 className={`text-sm font-medium ${task.status === 'done' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                            {task.title}
                          </h4>
                        </div>
                        {task.description && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{task.description}</p>
                        )}
                      </div>

                      {/* Meta Info */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${priorityConfig.color}`}>
                          {priorityConfig.label}
                        </span>

                        {task.due_date && (
                          <span className={`flex items-center gap-1 text-xs ${taskIsOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                            <Calendar className="h-3 w-3" />
                            {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}

                        {task.assigned_member && (
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <User className="h-3 w-3" />
                            {task.assigned_member.name}
                          </div>
                        )}

                        {linkedConfig && task.linked_id && (
                          <Link
                            href={`${linkedConfig.path}/${task.linked_id}`}
                            className="flex items-center gap-1 text-xs text-[#647C47] hover:underline"
                          >
                            <LinkIcon className="h-3 w-3" />
                            {linkedConfig.label}
                          </Link>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleArchive(task)}
                          disabled={archiving === task.id}
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                          title={task.archived ? 'Unarchive' : 'Archive'}
                        >
                          {archiving === task.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : task.archived ? (
                            <ArchiveRestore className="h-4 w-4" />
                          ) : (
                            <Archive className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleEdit(task)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(task)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Pagination for List View */}
              <div className="flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Show</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                    className="px-2 py-1 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="text-sm text-gray-600">per page</span>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600">
                    {sortedTasks.length > 0 ? `${startIndex + 1}-${Math.min(endIndex, sortedTasks.length)} of ${sortedTasks.length}` : '0 results'}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="px-3 py-1 text-sm font-medium text-gray-700">
                      {currentPage} / {totalPages || 1}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages || totalPages === 0}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages || totalPages === 0}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Archived Tasks Section (shown only in kanban when showArchived is true) */}
      {viewMode === 'kanban' && showArchived && archivedTasks.length > 0 && (
        <div className="bg-gray-100 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Archive className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Archived</h3>
            <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-600 rounded-full">
              {archivedTasks.length}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {archivedTasks.map(task => {
              const priorityConfig = getPriorityConfig(task.priority)
              
              return (
                <div 
                  key={task.id} 
                  className="bg-white/70 border border-gray-200 rounded-lg p-3 opacity-60 hover:opacity-100 transition-opacity"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="text-sm font-medium text-gray-700 flex-1 line-through">{task.title}</h4>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleArchive(task)}
                        disabled={archiving === task.id}
                        className="p-1 text-gray-400 hover:text-[#647C47] rounded"
                        title="Unarchive"
                      >
                        {archiving === task.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <ArchiveRestore className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(task)}
                        className="p-1 text-gray-400 hover:text-red-600 rounded"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className={`px-1.5 py-0.5 rounded ${priorityConfig.color}`}>
                      {priorityConfig.label}
                    </span>
                    {task.archived_at && (
                      <span>Archived {new Date(task.archived_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingTask ? 'Edit Task' : 'Add Task'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  placeholder="Task title"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  rows={2}
                  placeholder="Task description..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                  >
                    {PRIORITIES.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assign To
                  <span className="text-xs text-gray-400 font-normal ml-2">(will receive email notification)</span>
                </label>
                <select
                  value={formData.assigned_to}
                  onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                >
                  <option value="">Unassigned</option>
                  {teamMembers.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.email ? `(${m.email})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Link To Section */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">Link To</label>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <select
                      value={formData.linked_type}
                      onChange={(e) => setFormData({ ...formData, linked_type: e.target.value, linked_id: '' })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                    >
                      <option value="">None</option>
                      {LINKED_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  {formData.linked_type === 'client' && (
                    <div>
                      <select
                        value={formData.linked_id}
                        onChange={(e) => setFormData({ ...formData, linked_id: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                      >
                        <option value="">Select client...</option>
                        {clients.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.company ? `(${c.company})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {formData.linked_type === 'itinerary' && (
                    <div>
                      <select
                        value={formData.linked_id}
                        onChange={(e) => setFormData({ ...formData, linked_id: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                      >
                        <option value="">Select itinerary...</option>
                        {itineraries.map(i => (
                          <option key={i.id} value={i.id}>
                            {i.itinerary_code} - {i.client_name}
                            {i.start_date ? ` (${new Date(i.start_date).toLocaleDateString()})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {(formData.linked_type === 'invoice' || formData.linked_type === 'expense') && (
                    <div>
                      <input
                        type="text"
                        value={formData.linked_id}
                        onChange={(e) => setFormData({ ...formData, linked_id: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                        placeholder={`Enter ${formData.linked_type} ID`}
                      />
                    </div>
                  )}
                </div>

                {formData.linked_type && formData.linked_id && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 text-sm">
                      {formData.linked_type === 'client' && <UsersIcon className="h-4 w-4 text-gray-400" />}
                      {formData.linked_type === 'itinerary' && <MapPin className="h-4 w-4 text-gray-400" />}
                      {formData.linked_type === 'invoice' && <FileText className="h-4 w-4 text-gray-400" />}
                      {formData.linked_type === 'expense' && <Receipt className="h-4 w-4 text-gray-400" />}
                      <span className="text-gray-600">
                        Linked to: <strong>{getLinkedItemName(formData.linked_type, formData.linked_id)}</strong>
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  rows={2}
                  placeholder="Additional notes..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving ? 'Saving...' : editingTask ? 'Update' : 'Add Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center pt-4">
        <p className="text-xs text-gray-400">© {new Date().getFullYear()} Autoura Operations System</p>
      </div>
    </div>
  )
}