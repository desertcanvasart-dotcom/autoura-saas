'use client'

import { useState } from 'react'
import { Send, MessageCircle, Check, AlertCircle } from 'lucide-react'

interface WhatsAppButtonProps {
  itineraryId?: string
  type: 'quote' | 'status' | 'guide' | 'contract'
  status?: 'confirmed' | 'cancelled' | 'pending_payment' | 'paid' | 'completed'
  clientPhone?: string
  clientName?: string
  guideId?: string
  contractPdfUrl?: string
  /** type 'contract': what the operator set on the contract page, so the
   *  client receives that contract rather than the defaults. */
  contractEdits?: Record<string, unknown>
  onSuccess?: () => void
  className?: string
  /** 'quiet': a small outlined button that sits in a row with others (the
   *  itinerary page's Messages tab). Default: the solid green button. */
  variant?: 'solid' | 'quiet'
}

export default function WhatsAppButton({
  itineraryId,
  type,
  status,
  clientPhone,
  clientName,
  guideId,
  contractPdfUrl,
  contractEdits,
  onSuccess,
  className = '',
  variant = 'solid'
}: WhatsAppButtonProps) {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSend = async () => {
    try {
      setLoading(true)
      setError(null)

      let endpoint = ''
      let body: any = {}

      switch (type) {
        case 'quote':
          endpoint = '/api/whatsapp/send-quote'
          body = { itineraryId, clientPhone, clientName }
          break
        case 'status':
          endpoint = '/api/whatsapp/send-status'
          body = { itineraryId, status }
          break
        case 'guide':
          endpoint = '/api/whatsapp/notify-guide'
          body = { itineraryId, guideId }
          break
        case 'contract':
          endpoint = '/api/whatsapp/send-contract'
          body = { itineraryId, contractPdfUrl, contract: contractEdits }
          break
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to send message')
      }


      setSent(true)

      setTimeout(() => setSent(false), 3000)

      if (onSuccess) {
        onSuccess()
      }

    } catch (err: any) {
      console.error('❌ Error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getButtonText = () => {
    if (loading) {
      if (type === 'quote') return 'Sending Quote...'
      if (type === 'guide') return 'Notifying Guide...'
      if (type === 'contract') return 'Sending Contract...'
      if (status === 'confirmed') return 'Sending Confirmation...'
      if (status === 'pending_payment') return 'Sending Reminder...'
      if (status === 'paid') return 'Sending Confirmation...'
      return 'Sending...'
    }

    if (sent) return 'Sent!'

    if (type === 'quote') return 'Send Quote via WhatsApp'
    if (type === 'guide') return 'Notify Guide via WhatsApp'
    if (type === 'contract') return 'Send Contract via WhatsApp'

    if (type === 'status') {
      switch (status) {
        case 'confirmed':
          return 'Send Confirmation'
        case 'pending_payment':
          return 'Payment Reminder'
        case 'paid':
          return 'Payment Received'
        case 'cancelled':
          return 'Send Cancellation'
        case 'completed':
          return 'Send Thank You'
        default:
          return 'Send Update via WhatsApp'
      }
    }

    return 'Send via WhatsApp'
  }

  const getIcon = () => {
    if (loading) return <MessageCircle className="w-4 h-4 animate-pulse" />
    if (sent) return <Check className="w-4 h-4" />
    return <Send className="w-4 h-4" />
  }

  const getButtonColor = () => {
    if (sent) return 'bg-green-600 hover:bg-green-700'
    if (error) return 'bg-red-600 hover:bg-red-700'
    return 'bg-[#25D366] hover:bg-[#20BD5A]'
  }

  if (variant === 'quiet') {
    return (
      <span className="inline-flex flex-col gap-1">
        <button
          type="button"
          onClick={handleSend}
          disabled={loading || sent}
          className={`px-3 py-1.5 border rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
            sent ? 'border-green-300 bg-green-50 text-green-700' : error ? 'border-red-300 bg-white text-red-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          } ${className}`}
        >
          {getIcon()}
          {getButtonText()}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </span>
    )
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleSend}
        disabled={loading || sent}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg
          text-white font-medium
          transition-all duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          shadow-sm hover:shadow-md
          ${getButtonColor()}
          ${className}
        `}
      >
        {getIcon()}
        {getButtonText()}
      </button>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
