'use client'

import { useState, useRef } from 'react'
import { FileText, Upload, Download, Loader2, AlertCircle, X, Plus, Eye } from 'lucide-react'

interface InputPanelProps {
  onParse: (text: string) => Promise<void>
  onLoadItinerary: (id: string) => Promise<void>
  isParsing: boolean
}

const MAX_FILE_SIZE = 32 * 1024 * 1024 // 32MB
const ACCEPTED_TYPES = [
  'application/pdf',
  'image/png', 'image/jpeg', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
]
const ACCEPTED_EXTS = '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt'

export default function InputPanel({ onParse, onLoadItinerary, isParsing }: InputPanelProps) {
  const [showPasteModal, setShowPasteModal] = useState(false)
  const [text, setText] = useState('')
  const [itineraryId, setItineraryId] = useState('')
  const [error, setError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handlePaste = async () => {
    if (!text.trim()) return
    setError('')
    setShowPasteModal(false)
    try {
      await onParse(text)
    } catch (err: any) {
      setError(err.message || 'Parse failed')
    }
  }

  const handleFileUpload = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      setError('File too large (max 32MB)')
      return
    }
    if (!ACCEPTED_TYPES.includes(file.type) && !file.name.endsWith('.txt') && !file.name.endsWith('.doc')) {
      setError('Unsupported file type. Use PDF, PNG, JPEG, WebP, DOCX, or TXT.')
      return
    }

    setError('')
    setIsUploading(true)

    try {
      if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        const fileText = await file.text()
        setText(fileText)
        setShowPasteModal(true)
        setIsUploading(false)
        return
      }

      const reader = new FileReader()
      reader.onloadend = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1]
          const res = await fetch('/api/ai/parse-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: base64, filename: file.name, mimeType: file.type }),
          })
          const data = await res.json()
          if (data.success && data.text) {
            setText(data.text)
            setShowPasteModal(true)
          } else {
            setError(data.error || 'Could not extract text from file')
          }
        } catch (err: any) {
          setError(err.message || 'File processing failed')
        } finally {
          setIsUploading(false)
        }
      }
      reader.readAsDataURL(file)
    } catch (err: any) {
      setError(err.message || 'Upload failed')
      setIsUploading(false)
    }
  }

  const handleLoad = async () => {
    if (!itineraryId.trim()) return
    setError('')
    try {
      await onLoadItinerary(itineraryId.trim())
    } catch (err: any) {
      setError(err.message || 'Failed to load itinerary')
    }
  }

  return (
    <>
      {/* Error bar */}
      {error && (
        <div className="mb-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5 border border-red-200">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* 3-column input panel */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-gray-200">
          {/* Column 1: Paste Text */}
          <div className="p-4 flex flex-col items-center">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Paste Text</span>
            <button
              onClick={() => setShowPasteModal(true)}
              disabled={isParsing}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              Paste Text
            </button>
          </div>

          {/* Column 2: Upload File */}
          <div className="p-4 flex flex-col items-center">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Upload File</span>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing || isUploading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg border border-gray-300 border-dashed transition-colors disabled:opacity-50"
            >
              {isUploading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Extracting...</>
              ) : (
                <><Upload className="w-4 h-4" /> PDF, Image, DOCX</>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTS}
              onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              className="hidden"
            />
          </div>

          {/* Column 3: Load / Build */}
          <div className="p-4 flex flex-col items-center">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Load / Build</span>
            <div className="w-full flex items-center gap-2">
              <input
                type="text"
                value={itineraryId}
                onChange={e => setItineraryId(e.target.value)}
                placeholder="Itinerary ID..."
                className="flex-1 text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-[#647C47] outline-none"
              />
              <button
                onClick={handleLoad}
                disabled={!itineraryId.trim() || isParsing}
                className="p-2.5 bg-[#647C47]/10 text-[#647C47] rounded-lg hover:bg-[#647C47]/20 disabled:opacity-40 transition-colors"
                title="Load itinerary"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => {/* Add day handled by parent */}}
                className="p-2.5 border border-dashed border-gray-300 text-gray-400 rounded-lg hover:border-gray-400 hover:text-gray-500 transition-colors"
                title="Build from scratch"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Paste text modal overlay */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-800">Paste Itinerary Text</h3>
              <button onClick={() => setShowPasteModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Paste your WhatsApp message, email, or itinerary text here..."
                rows={10}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:border-[#647C47] focus:ring-1 focus:ring-[#647C47] outline-none resize-y"
                autoFocus
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-gray-400">{text.length} characters</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPasteModal(false)}
                    className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePaste}
                    disabled={!text.trim() || isParsing}
                    className="btn-primary text-sm px-5 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2"
                  >
                    {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                    {isParsing ? 'Parsing...' : 'Parse & Review'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
