'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/app/supabase'
import { useTenant } from '@/app/contexts/TenantContext'
import { X, FileText, AlertCircle, Trash2 } from 'lucide-react'

const supabase = createClient()

interface AddNoteModalProps {
  isOpen: boolean
  onClose: () => void
  clientId: string
  clientName: string
  onSuccess: () => void
  editNote?: any // Pass existing note to edit
}

export default function AddNoteModal({ 
  isOpen, 
  onClose, 
  clientId, 
  clientName,
  onSuccess,
  editNote 
}: AddNoteModalProps) {
  const { tenant } = useTenant()
  const isEditMode = !!editNote
  
  const [formData, setFormData] = useState({
    note_text: '',
    note_type: 'general',
    is_internal: false
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Populate form when editing
  useEffect(() => {
    if (editNote) {
      setFormData({
        note_text: editNote.note_text || '',
        note_type: editNote.note_type || 'general',
        is_internal: editNote.is_internal || false
      })
    } else {
      // Reset form for adding new
      setFormData({
        note_text: '',
        note_type: 'general',
        is_internal: false
      })
    }
  }, [editNote, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)

    try {
      // Validate note text
      if (!formData.note_text.trim()) {
        throw new Error('Please enter a note')
      }

      if (isEditMode) {
        // Update existing note
        const { error: updateError } = await supabase
          .from('client_notes')
          .update({
            note_text: formData.note_text,
            note_type: formData.note_type,
            is_internal: formData.is_internal
          })
          .eq('id', editNote.id)

        if (updateError) throw updateError
      } else {
        if (!tenant) {
          throw new Error('No active tenant found')
        }

        // Create new note
        const { error: insertError } = await supabase
          .from('client_notes')
          .insert({
            tenant_id: tenant.id,
            client_id: clientId,
            note_text: formData.note_text,
            note_type: formData.note_type,
            is_internal: formData.is_internal
          })

        if (insertError) throw insertError
      }

      // Reset form
      setFormData({
        note_text: '',
        note_type: 'general',
        is_internal: false
      })

      // Success
      onSuccess()
      onClose()
      
    } catch (err: any) {
      console.error('Error saving note:', err)
      setError(err.message || 'Failed to save note')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    setError(null)

    try {
      const { error: deleteError } = await supabase
        .from('client_notes')
        .delete()
        .eq('id', editNote.id)

      if (deleteError) throw deleteError

      // Success
      onSuccess()
      onClose()
      
    } catch (err: any) {
      console.error('Error deleting note:', err)
      setError(err.message || 'Failed to delete note')
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleChange = (field: string, value: string | boolean) => {
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
              {isEditMode ? 'Edit Note' : 'Add Note'}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {isEditMode ? 'Update note details' : `Add a note about ${clientName}`}
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

          {/* Note Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Note Type *
            </label>
            <select
              value={formData.note_type}
              onChange={(e) => handleChange('note_type', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="general">General Note</option>
              <option value="preference">Client Preference</option>
              <option value="complaint">Complaint</option>
              <option value="compliment">Compliment</option>
              <option value="dietary">Dietary Restriction</option>
              <option value="accessibility">Accessibility Need</option>
              <option value="travel_history">Travel History</option>
              <option value="payment">Payment Note</option>
              <option value="special_request">Special Request</option>
              <option value="internal">Internal Note</option>
            </select>
          </div>

          {/* Note Text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Note *
            </label>
            <textarea
              value={formData.note_text}
              onChange={(e) => handleChange('note_text', e.target.value)}
              rows={8}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Enter your note here..."
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              {formData.note_text.length}/2000 characters
            </p>
          </div>

          {/* Internal Note Toggle */}
          <div className="bg-gray-50 rounded-lg p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_internal}
                onChange={(e) => handleChange('is_internal', e.target.checked)}
                className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              />
              <div>
                <div className="font-medium text-gray-900">Important Note</div>
                <p className="text-sm text-gray-600 mt-1">
                  Mark this note as important for quick reference.
                </p>
              </div>
            </label>
          </div>

          {/* Quick Note Templates - Only show when adding new */}
          {!isEditMode && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Quick Templates:</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleChange('note_text', 'Client is interested in cultural experiences and local cuisine.')}
                  className="px-3 py-2 text-sm text-left bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cultural Interest
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('note_text', 'Client prefers luxury accommodations and private tours.')}
                  className="px-3 py-2 text-sm text-left bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Luxury Preference
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('note_text', 'Client has budget constraints. Focus on value options.')}
                  className="px-3 py-2 text-sm text-left bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Budget Conscious
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('note_text', 'Client is traveling with children. Family-friendly activities needed.')}
                  className="px-3 py-2 text-sm text-left bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Family Travel
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('note_text', 'Client prefers WhatsApp communication. Available 9am-6pm CET.')}
                  className="px-3 py-2 text-sm text-left bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Communication Pref
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('note_text', 'Client is a repeat customer. Excellent experience last time.')}
                  className="px-3 py-2 text-sm text-left bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Repeat Customer
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
              disabled={isSaving || isDeleting || !formData.note_text.trim()}
              className="flex-1 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium transition-colors disabled:bg-orange-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  {isEditMode ? 'Update Note' : 'Save Note'}
                </>
              )}
            </button>
          </div>
        </form>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-xl">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Note?</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete this note? This action cannot be undone.
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