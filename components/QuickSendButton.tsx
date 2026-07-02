'use client'

import { useState, useEffect } from 'react'
import { showToast } from '@/app/contexts/ToastContext'
import {
  Send,
  Mail, 
  MessageSquare, 
  FileText,
  X,
  Loader2,
  ChevronDown,
  Check
} from 'lucide-react'

// ============================================
// TYPES
// ============================================

interface Template {
  id: string
  name: string
  description: string
  category: string
  subcategory: string
  channel: 'email' | 'whatsapp' | 'both'
  subject?: string
  body: string
  placeholders: string[]
}

interface QuickSendButtonProps {
  // Context data for auto-filling
  client?: {
    id: string
    name: string
    email?: string
    phone?: string
    nationality?: string
  }
  itinerary?: {
    id: string
    title?: string
    reference?: string
    start_date?: string
    end_date?: string
    pax?: number
    total_price?: number
    currency?: string
  }
  // Optional pre-selected template category
  category?: 'customer' | 'partner' | 'internal'
  // Button styling
  variant?: 'primary' | 'secondary' | 'icon'
  className?: string
}

// ============================================
// QUICK SEND BUTTON COMPONENT
// ============================================

export function QuickSendButton({ 
  client, 
  itinerary, 
  category,
  variant = 'secondary',
  className = ''
}: QuickSendButtonProps) {
  const [showModal, setShowModal] = useState(false)

  const buttonStyles = {
    primary: 'flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4f6339] transition-colors',
    secondary: 'flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200',
    icon: 'p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors',
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`${buttonStyles[variant]} ${className}`}
        title="Send Template"
      >
        <Send className="w-4 h-4" />
        {variant !== 'icon' && <span>Send Template</span>}
      </button>

      {showModal && (
        <QuickSendModal
          client={client}
          itinerary={itinerary}
          category={category}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}

// ============================================
// QUICK SEND MODAL
// ============================================

interface QuickSendModalProps {
  client?: QuickSendButtonProps['client']
  itinerary?: QuickSendButtonProps['itinerary']
  category?: string
  onClose: () => void
}

function QuickSendModal({ client, itinerary, category, onClose }: QuickSendModalProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [channel, setChannel] = useState<'email' | 'whatsapp'>('whatsapp')
  const [filledValues, setFilledValues] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  // Fetch templates
  useEffect(() => {
    fetchTemplates()
  }, [])

  // Auto-fill values from context
  useEffect(() => {
    const values: Record<string, string> = {}
    
    if (client) {
      values['{{GuestName}}'] = client.name || ''
      values['{{ClientPhone}}'] = client.phone || ''
      values['{{ClientEmail}}'] = client.email || ''
      values['{{Nationality}}'] = client.nationality || ''
    }
    
    if (itinerary) {
      values['{{TripName}}'] = itinerary.title || ''
      values['{{BookingRef}}'] = itinerary.reference || itinerary.id?.slice(0, 8).toUpperCase() || ''
      values['{{PaxCount}}'] = itinerary.pax?.toString() || ''
      values['{{TotalPrice}}'] = itinerary.total_price?.toLocaleString() || ''
      values['{{Currency}}'] = itinerary.currency || 'USD'
      
      if (itinerary.start_date && itinerary.end_date) {
        const start = new Date(itinerary.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        const end = new Date(itinerary.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        values['{{TripDates}}'] = `${start} - ${end}`
      }
    }
    
    setFilledValues(values)
  }, [client, itinerary])

  // Update preview when template or values change
  useEffect(() => {
    if (!selectedTemplate) {
      setPreview('')
      return
    }
    
    let text = selectedTemplate.body
    Object.entries(filledValues).forEach(([key, value]) => {
      text = text.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value || key)
    })
    setPreview(text)
  }, [selectedTemplate, filledValues])

  const fetchTemplates = async () => {
    try {
      const url = category 
        ? `/api/templates?category=${category}`
        : '/api/templates'
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setTemplates(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    if (!selectedTemplate || !client) return
    
    setSending(true)
    try {
      const recipient = channel === 'email' ? client.email : client.phone
      
      if (!recipient) {
        showToast('error', `Client has no ${channel === 'email' ? 'email' : 'phone'} address`)
        setSending(false)
        return
      }

      // Fill subject placeholders
      let filledSubject = selectedTemplate.subject || ''
      Object.entries(filledValues).forEach(([key, value]) => {
        filledSubject = filledSubject.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value || key)
      })

      const response = await fetch('/api/templates/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          channel,
          clientId: client.id,
          recipient,
          subject: filledSubject,
          body: preview,
        }),
      })

      if (response.ok) {
        setSent(true)
        setTimeout(() => {
          onClose()
        }, 1500)
      } else {
        const data = await response.json()
        showToast('error', data.error || 'Failed to send message')
      }
    } catch (error) {
      console.error('Error sending:', error)
      showToast('error', 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  // Group templates by subcategory
  const groupedTemplates = templates.reduce((acc, template) => {
    const key = template.subcategory || 'other'
    if (!acc[key]) acc[key] = []
    acc[key].push(template)
    return acc
  }, {} as Record<string, Template[]>)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Quick Send Template</h2>
            {client && (
              <p className="text-sm text-gray-500">To: {client.name}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left: Template Selection */}
          <div className="w-1/3 border-r border-gray-200 overflow-y-auto">
            <div className="p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Select Template</h3>
              
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedTemplates).map(([subcategory, templates]) => (
                    <div key={subcategory}>
                      <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                        {subcategory.replace(/_/g, ' ')}
                      </h4>
                      <div className="space-y-1">
                        {templates.map((template) => (
                          <button
                            key={template.id}
                            onClick={() => {
                              setSelectedTemplate(template)
                              if (template.channel !== 'both') {
                                setChannel(template.channel)
                              }
                            }}
                            className={`w-full text-left p-2 rounded-lg text-sm transition-colors ${
                              selectedTemplate?.id === template.id
                                ? 'bg-[#647C47]/10 text-[#647C47] border border-[#647C47]/30'
                                : 'hover:bg-gray-100 text-gray-700'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {template.channel === 'email' && <Mail className="w-3.5 h-3.5" />}
                              {template.channel === 'whatsapp' && <MessageSquare className="w-3.5 h-3.5" />}
                              {template.channel === 'both' && <FileText className="w-3.5 h-3.5" />}
                              <span className="truncate">{template.name}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Preview & Send */}
          <div className="flex-1 flex flex-col">
            {selectedTemplate ? (
              <>
                {/* Channel Selector */}
                {selectedTemplate.channel === 'both' && (
                  <div className="p-4 border-b border-gray-200">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setChannel('whatsapp')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm ${
                          channel === 'whatsapp' 
                            ? 'border-green-500 bg-green-50 text-green-700' 
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <MessageSquare className="w-4 h-4" />
                        WhatsApp
                      </button>
                      <button
                        onClick={() => setChannel('email')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm ${
                          channel === 'email' 
                            ? 'border-blue-500 bg-blue-50 text-blue-700' 
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Mail className="w-4 h-4" />
                        Email
                      </button>
                    </div>
                  </div>
                )}

                {/* Preview */}
                <div className="flex-1 p-4 overflow-y-auto">
                  {selectedTemplate.subject && channel === 'email' && (
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
                      <div className="p-2 bg-gray-50 rounded text-sm">
                        {Object.entries(filledValues).reduce(
                          (s, [k, v]) => s.replace(new RegExp(k.replace(/[{}]/g, '\\$&'), 'g'), v || k), 
                          selectedTemplate.subject
                        )}
                      </div>
                    </div>
                  )}
                  
                  <label className="block text-xs font-medium text-gray-500 mb-1">Message Preview</label>
                  <div className="p-4 bg-gray-50 rounded-lg whitespace-pre-wrap text-sm h-full min-h-[200px]">
                    {preview}
                  </div>
                </div>

                {/* Send Button */}
                <div className="p-4 border-t border-gray-200 bg-gray-50">
                  {sent ? (
                    <div className="flex items-center justify-center gap-2 text-green-600">
                      <Check className="w-5 h-5" />
                      <span>Message sent successfully!</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">
                        Send to: {client?.name} 
                        {channel === 'email' && client?.email && ` (${client.email})`}
                        {channel === 'whatsapp' && client?.phone && ` (${client.phone})`}
                      </span>
                      <button
                        onClick={handleSend}
                        disabled={sending || !client}
                        className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4f6339] transition-colors disabled:opacity-50"
                      >
                        {sending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        Send {channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Select a template to preview</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default QuickSendButton