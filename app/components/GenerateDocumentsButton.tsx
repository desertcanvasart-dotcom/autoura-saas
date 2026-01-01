'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, ChevronDown, Loader2, Check, AlertCircle } from 'lucide-react'

interface GenerateDocumentsButtonProps {
  itineraryId: string
  itineraryCode: string
}

const DOCUMENT_TYPES = [
  { value: 'all', label: 'Generate All', icon: '📄' },
  { value: 'hotel_voucher', label: 'Hotel Vouchers', icon: '🏨' },
  { value: 'transport_voucher', label: 'Transport Vouchers', icon: '🚗' },
  { value: 'guide_assignment', label: 'Guide Assignments', icon: '👨‍🏫' },
  { value: 'service_order', label: 'Service Orders (Meals & Entrance)', icon: '📋' },
  { value: 'cruise_voucher', label: 'Cruise Vouchers', icon: '🚢' },
]

export default function GenerateDocumentsButton({ itineraryId, itineraryCode }: GenerateDocumentsButtonProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Clear result after 5 seconds
  useEffect(() => {
    if (result) {
      const timer = setTimeout(() => setResult(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [result])

  const generateDocuments = async (documentType: string) => {
    setGenerating(true)
    setIsOpen(false)
    setResult(null)

    try {
      const body: any = {}
      
      // If specific type selected, pass it
      if (documentType !== 'all') {
        body.documentTypes = [documentType]
      }

      const response = await fetch(`/api/itineraries/${itineraryId}/generate-documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate documents')
      }

      setResult({
        success: true,
        message: data.message || `Generated ${data.documents?.length || 0} document(s)`
      })

      // Navigate to documents page for this itinerary
      setTimeout(() => {
        router.push(`/documents/supplier?itineraryId=${itineraryId}`)
      }, 1500)

    } catch (error: any) {
      console.error('Error generating documents:', error)
      setResult({
        success: false,
        message: error.message || 'Failed to generate documents'
      })
    } finally {
      setGenerating(false)
    }
  }

  const viewDocuments = () => {
    router.push(`/documents/supplier?itineraryId=${itineraryId}`)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Main Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={generating}
        className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
          generating
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {generating ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            <span>Generating...</span>
          </>
        ) : (
          <>
            <FileText size={16} />
            <span>Documents</span>
            <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && !generating && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          {/* View Documents Option */}
          <button
            onClick={viewDocuments}
            className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 border-b border-gray-100"
          >
            <span>👁️</span>
            <span>View Documents</span>
          </button>

          {/* Divider with label */}
          <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50">
            Generate New
          </div>

          {/* Generation Options */}
          {DOCUMENT_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => generateDocuments(type.value)}
              className={`w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-3 ${
                type.value === 'all' 
                  ? 'text-blue-700 font-medium bg-blue-50 hover:bg-blue-100' 
                  : 'text-gray-700'
              }`}
            >
              <span>{type.icon}</span>
              <span>{type.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Result Toast */}
      {result && (
        <div 
          className={`absolute right-0 mt-2 w-64 p-3 rounded-lg shadow-lg border flex items-start gap-2 z-50 ${
            result.success 
              ? 'bg-green-50 border-green-200' 
              : 'bg-red-50 border-red-200'
          }`}
        >
          {result.success ? (
            <Check size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
          )}
          <span className={`text-sm ${result.success ? 'text-green-700' : 'text-red-700'}`}>
            {result.message}
          </span>
        </div>
      )}
    </div>
  )
}