'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/app/supabase'
import { X, MessageSquare, AlertCircle, Trash2 } from 'lucide-react'

const supabase = createClient()

interface LogCommunicationModalProps {
  isOpen: boolean
  onClose: () => void
  clientId: string
  clientName: string
  onSuccess: () => void
  editCommunication?: any // Pass existing communication to edit
}

export default function LogCommunicationModal({ 
  isOpen, 
  onClose, 
  clientId, 
  clientName,
  onSuccess,
  editCommunication 
}: LogCommunicationModalProps) {
  const isEditMode = !!editCommunication
  
  const [formData, setFormData] = useState({
    communication_type: 'whatsapp',
    direction: 'outbound',
    subject: '',
    content: '',
    communication_date: new Date().toISOString().split('T')[0],
    communication_time: new Date().toTimeString().slice(0, 5),
    status: 'completed'
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Populate form when editing
  useEffect(() => {
    if (editCommunication) {
      const commDate = new Date(editCommunication.communication_date)
      setFormData({
        communication_type: editCommunication.communication_type || 'whatsapp',
        direction: editCommunication.direction || 'outbound',
        subject: editCommunication.subject || '',
        content: editCommunication.content || '',
        communication_date: commDate.toISOString().split('T')[0],
        communication_time: commDate.toTimeString().slice(0, 5),
        status: editCommunication.status || 'completed'
      })
    } else {
      // Reset form for adding new
      setFormData({
        communication_type: 'whatsapp',
        direction: 'outbound',
        subject: '',
        content: '',
        communication_date: new Date().toISOString().split('T')[0],
        communication_time: new Date().toTimeString().slice(0, 5),
        status: 'completed'
      })
    }
  }, [editCommunication, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)

    try {
      // Validate required fields
      if (!formData.content.trim()) {
        throw new Error('Please enter communication details')
      }

      // Combine date and time
      const communicationDateTime = `${formData.communication_date}T${formData.communication_time}:00`

      if (isEditMode) {
        // Update existing communication
        const { error: updateError } = await supabase
          .from('communication_history')
          .update({
            communication_type: formData.communication_type,
            direction: formData.direction,
            subject: formData.subject || null,
            content: formData.content,
            communication_date: communicationDateTime,
            status: formData.status
          })
          .eq('id', editCommunication.id)

        if (updateError) throw updateError
      } else {
        // Create new communication
        const { error: insertError } = await supabase
          .from('communication_history')
          .insert({
            client_id: clientId,
            communication_type: formData.communication_type,
            direction: formData.direction,
            subject: formData.subject || null,
            content: formData.content,
            communication_date: communicationDateTime,
            status: formData.status
          })

        if (insertError) throw insertError
      }

      // Reset form
      setFormData({
        communication_type: 'whatsapp',
        direction: 'outbound',
        subject: '',
        content: '',
        communication_date: new Date().toISOString().split('T')[0],
        communication_time: new Date().toTimeString().slice(0, 5),
        status: 'completed'
      })

      // Success
      onSuccess()
      onClose()
      
    } catch (err: any) {
      console.error('Error saving communication:', err)
      setError(err.message || 'Failed to save communication')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    setError(null)

    try {
      const { error: deleteError } = await supabase
        .from('communication_history')
        .delete()
        .eq('id', editCommunication.id)

      if (deleteError) throw deleteError

      // Success
      onSuccess()
      onClose()
      
    } catch (err: any) {
      console.error('Error deleting communication:', err)
      setError(err.message || 'Failed to delete communication')
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {isEditMode ? 'Edit Communication' : 'Log Communication'}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {isEditMode ? 'Update communication details' : `Record communication with ${clientName}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Error</p>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          )}

          {/* Communication Type & Direction */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Communication Type *
              </label>
              <select
                value={formData.communication_type}
                onChange={(e) => handleChange('communication_type', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="phone">Phone Call</option>
                <option value="meeting">Meeting</option>
                <option value="video_call">Video Call</option>
                <option value="sms">SMS</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Direction *
              </label>
              <select
                value={formData.direction}
                onChange={(e) => handleChange('direction', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="outbound">Outbound (We contacted them)</option>
                <option value="inbound">Inbound (They contacted us)</option>
              </select>
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date *
              </label>
              <input
                type="date"
                value={formData.communication_date}
                onChange={(e) => handleChange('communication_date', e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time *
              </label>
              <input
                type="time"
                value={formData.communication_time}
                onChange={(e) => handleChange('communication_time', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subject (Optional)
            </label>
            <input
              type="text"
              value={formData.subject}
              onChange={(e) => handleChange('subject', e.target.value)}
              placeholder="e.g., Quote follow-up, Payment confirmation, Itinerary changes"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Details *
            </label>
            <textarea
              value={formData.content}
              onChange={(e) => handleChange('content', e.target.value)}
              rows={6}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Describe what was discussed, decisions made, next steps, etc."
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              {formData.content.length}/1000 characters
            </p>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status *
            </label>
            <select
              value={formData.status}
              onChange={(e) => handleChange('status', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="completed">Completed</option>
              <option value="pending">Pending Response</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </div>

          {/* Quick Templates - Only show when adding new */}
          {!isEditMode && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Quick Templates:</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleChange('content', 'Called client to follow up on quote. Client is interested and will confirm by end of week.')}
                  className="px-3 py-2 text-sm text-left bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Quote Follow-up Call
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('content', 'Sent detailed itinerary via WhatsApp. Client confirmed receipt and is reviewing with family.')}
                  className="px-3 py-2 text-sm text-left bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Itinerary Sent
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('content', 'Payment received and confirmed. Sent booking confirmation email with all details.')}
                  className="px-3 py-2 text-sm text-left bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Payment Received
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('content', 'Client requested changes to accommodation. Updated itinerary and sent revised quote.')}
                  className="px-3 py-2 text-sm text-left bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Itinerary Changes
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
            {isEditMode && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-3 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 font-medium transition-colors flex items-center gap-2"
                disabled={isSaving || isDeleting}
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              disabled={isSaving || isDeleting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || isDeleting || !formData.content.trim()}
              className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors disabled:bg-green-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <MessageSquare className="w-4 h-4" />
                  {isEditMode ? 'Update Communication' : 'Log Communication'}
                </>
              )}
            </button>
          </div>
        </form>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-xl">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Communication?</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete this communication record? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-300"
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}