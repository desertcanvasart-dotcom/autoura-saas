'use client'

import { useState, useRef } from 'react'
import { Plus, FileText, Upload, Loader2, Trash2, X, File, Image, FileSpreadsheet } from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'

// ============================================
// FILE UPLOAD CONSTANTS
// ============================================

const ACCEPTED_EXTENSIONS = '.pdf,.png,.jpg,.jpeg,.webp,.docx'
const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const MAX_FILE_SIZE = 32 * 1024 * 1024 // 32MB

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1]) // Extract base64 part after data URI prefix
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function getFileIcon(type: string) {
  if (type === 'application/pdf') return <File className="w-4 h-4 text-red-500" />
  if (type.startsWith('image/')) return <Image className="w-4 h-4 text-blue-500" />
  return <FileSpreadsheet className="w-4 h-4 text-purple-500" />
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ============================================
// COMPONENT
// ============================================

interface InputPanelProps {
  onParseDays: (text: string) => Promise<void>
  onAddDay: () => void
  onLoadItinerary: (itineraryId: string) => Promise<void>
  onClearAll?: () => void
  isParsing: boolean
  hasDays?: boolean
}

export default function InputPanel({ onParseDays, onAddDay, onLoadItinerary, onClearAll, isParsing, hasDays }: InputPanelProps) {
  const [text, setText] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [itineraryId, setItineraryId] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<{ name: string; type: string; size: number; data: string } | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { confirm } = useConfirmDialog()

  // --- File Validation & Selection ---
  const handleFileSelect = async (files: FileList) => {
    setUploadError(null)
    const file = files[0] // Single file for pricing grid
    if (!file) return

    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      setUploadError('Unsupported file type. Use PDF, PNG, JPEG, WebP, or DOCX.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError(`File too large (${formatFileSize(file.size)}). Maximum is ${formatFileSize(MAX_FILE_SIZE)}.`)
      return
    }

    try {
      const base64 = await fileToBase64(file)
      setUploadedFile({ name: file.name, type: file.type, size: file.size, data: base64 })
    } catch {
      setUploadError('Failed to read file. Please try again.')
    }
  }

  // --- Drag & Drop ---
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files)
  }
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = () => setIsDragging(false)

  // --- Extract from file then parse ---
  const handleFileUpload = async () => {
    if (!uploadedFile) return
    setIsExtracting(true)
    setUploadError(null)

    try {
      // Step 1: Extract text from file via AI vision
      const extractRes = await fetch('/api/ai/parse-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: [{ name: uploadedFile.name, type: uploadedFile.type, data: uploadedFile.data, size: uploadedFile.size }],
        })
      })

      const contentType = extractRes.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        setUploadError('Server error during extraction. Please try again.')
        return
      }

      const extractData = await extractRes.json()
      if (!extractData.success) {
        setUploadError(extractData.error || 'Failed to extract text from file.')
        return
      }

      // Step 2: Feed extracted text into the existing parse pipeline
      const rawText = extractData.data?.raw_itinerary || ''
      if (!rawText.trim()) {
        setUploadError('No itinerary text found in the file.')
        return
      }

      setUploadedFile(null)
      setIsExtracting(false)

      // This triggers the "Building your itinerary..." loading state
      await onParseDays(rawText)
    } catch (err: any) {
      console.error('File upload error:', err)
      setUploadError(err.message || 'Failed to process file.')
    } finally {
      setIsExtracting(false)
    }
  }

  const isWorking = isParsing || isExtracting

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-4 overflow-hidden">
      {/* New Quote banner — shown when existing itinerary is loaded */}
      {hasDays && onClearAll && (
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
          <span className="text-sm text-amber-700">An existing itinerary is loaded. Start fresh?</span>
          <button
            type="button"
            onClick={async () => {
              const ok = await confirm({
                title: 'Start New Quote',
                message: 'This will clear all days and reset the pricing grid. Any unsaved changes will be lost.',
                confirmText: 'New Quote',
                cancelText: 'Cancel',
                variant: 'warning',
              })
              if (ok) onClearAll()
            }}
            className="flex items-center gap-1.5 px-3 py-1 text-sm font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Quote
          </button>
        </div>
      )}

      {/* Action Bar — three modes */}
      <div className="flex items-stretch divide-x divide-gray-200">

        {/* Mode 1: Paste Text */}
        <div className="flex-1 px-4 py-2.5">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Paste Text</div>
          <button
            type="button"
            onClick={() => { setShowPaste(!showPaste); setUploadedFile(null); setUploadError(null) }}
            disabled={isWorking}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors w-full justify-center ${
              showPaste
                ? 'bg-blue-100 text-blue-700 border border-blue-300'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            } disabled:opacity-50`}
          >
            <FileText className="w-4 h-4" />
            Paste Text
          </button>
        </div>

        {/* Mode 2: Upload File */}
        <div className="flex-1 px-4 py-2.5">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Upload File</div>
          <div
            className={`relative flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              isDragging
                ? 'bg-green-100 text-green-700 border-2 border-green-400 border-dashed'
                : uploadedFile
                  ? 'bg-green-50 text-green-700 border border-green-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
            } ${isWorking ? 'opacity-50 pointer-events-none' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !isWorking && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFileSelect(e.target.files)
                e.target.value = ''
              }}
            />
            {uploadedFile ? (
              <>
                {getFileIcon(uploadedFile.type)}
                <span className="truncate max-w-[120px]">{uploadedFile.name}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setUploadedFile(null); setUploadError(null) }}
                  className="p-0.5 hover:bg-green-200 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                {isDragging ? 'Drop here' : 'PDF, Image, DOCX'}
              </>
            )}
          </div>
        </div>

        {/* Mode 3: Load / Build */}
        <div className="flex-1 px-4 py-2.5">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Load / Build</div>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={itineraryId}
              onChange={(e) => setItineraryId(e.target.value)}
              placeholder="Itinerary ID..."
              className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-purple-200 transition-all"
            />
            <button
              type="button"
              onClick={() => itineraryId && onLoadItinerary(itineraryId)}
              disabled={!itineraryId || isWorking}
              className="flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onAddDay}
              disabled={isWorking}
              className="flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium border-2 border-dashed border-gray-300 text-gray-600 rounded-lg hover:border-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
            </button>
            {hasDays && onClearAll && (
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Clear All Days',
                    message: 'This will remove all days and reset the pricing grid. This cannot be undone.',
                    confirmText: 'Clear All',
                    cancelText: 'Cancel',
                    variant: 'danger',
                  })
                  if (ok) onClearAll()
                }}
                disabled={isWorking}
                className="flex items-center px-2 py-1.5 text-sm font-medium text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                title="Clear all days"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Upload action bar — shown when file is selected */}
      {uploadedFile && (
        <div className="border-t border-gray-200 px-4 py-3 bg-green-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            {getFileIcon(uploadedFile.type)}
            <span className="font-medium">{uploadedFile.name}</span>
            <span className="text-gray-400">({formatFileSize(uploadedFile.size)})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setUploadedFile(null); setUploadError(null) }}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleFileUpload}
              disabled={isExtracting}
              className="flex items-center gap-2 px-4 py-1.5 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {isExtracting ? 'Extracting from file...' : 'Extract & Generate Quote'}
            </button>
          </div>
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <div className="border-t border-red-200 px-4 py-2 bg-red-50 flex items-center justify-between">
          <span className="text-sm text-red-600">{uploadError}</span>
          <button type="button" onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Paste Area — expands below the bar */}
      {showPaste && (
        <div className="border-t border-gray-200 px-4 py-3 bg-blue-50/30">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg resize-y focus:ring-2 focus:ring-blue-300 bg-white"
            placeholder={'Paste WhatsApp conversation, email text, or itinerary description here...\n\nThe AI will parse it into days with services.'}
            autoFocus
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={async () => {
                if (text.trim()) {
                  await onParseDays(text)
                  setText('')
                  setShowPaste(false)
                }
              }}
              disabled={isParsing || !text.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {isParsing ? 'Parsing...' : 'Parse & Generate Quote'}
            </button>
            <button
              type="button"
              onClick={() => { setShowPaste(false); setText('') }}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
