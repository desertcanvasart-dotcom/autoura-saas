'use client'

// ============================================
// DAYBUILDER - STUB COMPONENT
// ============================================
// This is a placeholder component to maintain backward compatibility.
// The DayBuilder functionality is being replaced by the enhanced
// itinerary editor in the tour template form.
//
// TODO: Remove this file and its import from TourManagerContent.tsx
// once the new itinerary editor is fully implemented.
// ============================================

import React from 'react'
import { AlertCircle } from 'lucide-react'

interface DayBuilderProps {
  templateId?: string
  variationId?: string
  onSave?: () => void
  onClose?: () => void
  isOpen?: boolean
}

export default function DayBuilder({ 
  templateId, 
  variationId, 
  onSave, 
  onClose,
  isOpen 
}: DayBuilderProps) {
  // If not open, render nothing
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center gap-3 text-amber-600 mb-4">
          <AlertCircle className="w-6 h-6" />
          <h3 className="text-lg font-semibold">Day Builder Deprecated</h3>
        </div>
        
        <p className="text-gray-600 mb-4">
          The Day Builder is being replaced with an enhanced itinerary editor. 
          Please edit the itinerary directly in the tour template form.
        </p>
        
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-amber-800">
            <strong>Template ID:</strong> {templateId || 'N/A'}<br />
            <strong>Variation ID:</strong> {variationId || 'N/A'}
          </p>
        </div>
        
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}