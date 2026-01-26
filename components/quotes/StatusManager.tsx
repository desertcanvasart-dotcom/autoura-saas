'use client'

import { useState } from 'react'
import { Clock, Eye, Send, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react'

interface StatusManagerProps {
  quoteId: string
  quoteType: 'b2c' | 'b2b'
  currentStatus: string
  onStatusChange: () => void
}

const STATUS_CONFIG: Record<string, {
  label: string
  color: string
  bg: string
  border: string
  icon: any
  description: string
}> = {
  draft: {
    label: 'Draft',
    color: 'text-gray-700',
    bg: 'bg-gray-100',
    border: 'border-gray-300',
    icon: Clock,
    description: 'Quote is being prepared'
  },
  sent: {
    label: 'Sent',
    color: 'text-blue-700',
    bg: 'bg-blue-100',
    border: 'border-blue-300',
    icon: Send,
    description: 'Quote has been sent to client/partner'
  },
  viewed: {
    label: 'Viewed',
    color: 'text-purple-700',
    bg: 'bg-purple-100',
    border: 'border-purple-300',
    icon: Eye,
    description: 'Client/partner has viewed the quote (B2C only)'
  },
  accepted: {
    label: 'Accepted',
    color: 'text-green-700',
    bg: 'bg-green-100',
    border: 'border-green-300',
    icon: CheckCircle,
    description: 'Quote accepted - ready to proceed'
  },
  rejected: {
    label: 'Rejected',
    color: 'text-red-700',
    bg: 'bg-red-100',
    border: 'border-red-300',
    icon: XCircle,
    description: 'Quote was declined'
  },
  expired: {
    label: 'Expired',
    color: 'text-orange-700',
    bg: 'bg-orange-100',
    border: 'border-orange-300',
    icon: AlertCircle,
    description: 'Quote validity period has passed'
  }
}

// B2C has all statuses, B2B excludes 'viewed'
const B2C_STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired']
const B2B_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired']

export default function StatusManager({
  quoteId,
  quoteType,
  currentStatus,
  onStatusChange
}: StatusManagerProps) {
  const [isChanging, setIsChanging] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const availableStatuses = quoteType === 'b2c' ? B2C_STATUSES : B2B_STATUSES
  const config = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.draft
  const Icon = config.icon

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === currentStatus) {
      setShowDropdown(false)
      return
    }

    // Confirmation for critical status changes
    const criticalStatuses = ['accepted', 'rejected', 'expired']
    if (criticalStatuses.includes(newStatus)) {
      const statusLabel = STATUS_CONFIG[newStatus].label
      const confirmed = confirm(
        `Are you sure you want to mark this quote as ${statusLabel}?\n\n` +
        `This will update the quote status to "${statusLabel}".`
      )
      if (!confirmed) {
        setShowDropdown(false)
        return
      }
    }

    try {
      setIsChanging(true)
      setError(null)
      setShowDropdown(false)

      const response = await fetch(`/api/quotes/${quoteType}/${quoteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: newStatus,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update status')
      }

      // Notify parent component to refresh
      onStatusChange()

    } catch (err: any) {
      setError(err.message)
      setTimeout(() => setError(null), 5000)
    } finally {
      setIsChanging(false)
    }
  }

  return (
    <div className="relative">
      {/* Current Status Badge */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={isChanging}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
          ${config.bg} ${config.color} ${config.border} border-2
          hover:opacity-80 transition-opacity
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
      >
        {isChanging ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Icon className="w-4 h-4" />
        )}
        <span>{config.label}</span>
        <svg
          className={`w-4 h-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {showDropdown && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowDropdown(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-20 overflow-hidden">
            <div className="p-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 py-1 mb-1">
                Change Status
              </div>
              {availableStatuses.map((status) => {
                const statusConfig = STATUS_CONFIG[status]
                const StatusIcon = statusConfig.icon
                const isCurrent = status === currentStatus

                return (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    disabled={isCurrent}
                    className={`
                      w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left
                      transition-colors
                      ${isCurrent
                        ? 'bg-gray-50 cursor-default'
                        : 'hover:bg-gray-50 cursor-pointer'
                      }
                      disabled:opacity-50
                    `}
                  >
                    <div className={`mt-0.5 ${statusConfig.color}`}>
                      <StatusIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {statusConfig.label}
                        </span>
                        {isCurrent && (
                          <span className="text-xs text-gray-500">(Current)</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {statusConfig.description}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Error Message */}
      {error && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-red-50 border border-red-200 rounded-lg p-3 z-20">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-red-800">Failed to update status</p>
              <p className="text-xs text-red-600 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
