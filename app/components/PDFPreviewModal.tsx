'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Download, Printer, Mail, Loader2, Maximize2, Minimize2, List, DollarSign } from 'lucide-react'

interface PDFPreviewModalProps {
  /** The PDF as a Blob (from jsPDF.output('blob') or new Blob([uint8Array])) */
  pdfBlob: Blob | null
  /** Suggested filename for download */
  filename?: string
  /** Whether the modal is open */
  isOpen: boolean
  /** Close callback */
  onClose: () => void
  /** Optional: Download callback (if you want custom download behavior) */
  onDownload?: () => void
  /** Optional: Print callback */
  onPrint?: () => void
  /** Optional: Send via email callback */
  onSendEmail?: () => void
  /** Optional: Title shown in the modal header */
  title?: string
  /** Optional: Whether pricing breakdown is currently shown */
  showBreakdown?: boolean
  /** Optional: Callback to toggle pricing breakdown on/off */
  onToggleBreakdown?: (show: boolean) => void
}

export default function PDFPreviewModal({
  pdfBlob,
  filename = 'document.pdf',
  isOpen,
  onClose,
  onDownload,
  onPrint,
  onSendEmail,
  title = 'PDF Preview',
  showBreakdown,
  onToggleBreakdown,
}: PDFPreviewModalProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [loading, setLoading] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Create object URL when blob changes
  useEffect(() => {
    if (pdfBlob && isOpen) {
      const url = URL.createObjectURL(pdfBlob)
      setPdfUrl(url)
      setLoading(true)

      return () => {
        URL.revokeObjectURL(url)
        setPdfUrl(null)
      }
    }
  }, [pdfBlob, isOpen])

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false)
        } else {
          onClose()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, isFullscreen, onClose])

  const handleDownload = () => {
    if (onDownload) {
      onDownload()
      return
    }

    // Default download behavior
    if (pdfUrl) {
      const a = document.createElement('a')
      a.href = pdfUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }

  const handlePrint = () => {
    if (onPrint) {
      onPrint()
      return
    }

    // Default print behavior
    if (pdfUrl) {
      const printWindow = window.open(pdfUrl, '_blank')
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print()
        }
      }
    }
  }

  const handleIframeLoad = () => {
    setLoading(false)
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`bg-white rounded-xl shadow-2xl flex flex-col transition-all duration-200 ${
          isFullscreen
            ? 'w-full h-full rounded-none'
            : 'w-[90vw] max-w-5xl h-[90vh] mx-4'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-xl shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
            <span className="text-xs text-gray-400 truncate max-w-[200px]">{filename}</span>
          </div>

          <div className="flex items-center gap-1">
            {/* Action buttons */}
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              title="Download PDF"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              title="Print"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print</span>
            </button>

            {onSendEmail && (
              <button
                onClick={onSendEmail}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#647C47] hover:bg-[#4f6238] rounded-lg transition-colors"
                title="Send via Email"
              >
                <Mail className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Email</span>
              </button>
            )}

            {onToggleBreakdown && (
              <>
                <div className="w-px h-5 bg-gray-300 mx-1" />
                <button
                  onClick={() => onToggleBreakdown(!showBreakdown)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    showBreakdown
                      ? 'text-[#647C47] bg-[#647C47]/10 hover:bg-[#647C47]/20'
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                  }`}
                  title={showBreakdown ? 'Show total only' : 'Show breakdown'}
                >
                  {showBreakdown ? <List className="w-3.5 h-3.5" /> : <DollarSign className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{showBreakdown ? 'Detailed' : 'Total Only'}</span>
                </button>
              </>
            )}

            <div className="w-px h-5 bg-gray-300 mx-1" />

            {/* Fullscreen toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* PDF Viewer */}
        <div className="flex-1 relative bg-gray-100 overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
                <span className="text-sm text-gray-500">Loading preview...</span>
              </div>
            </div>
          )}

          {pdfUrl && (
            <iframe
              ref={iframeRef}
              src={`${pdfUrl}#toolbar=1&navpanes=0`}
              className="w-full h-full border-0"
              title="PDF Preview"
              onLoad={handleIframeLoad}
            />
          )}

          {!pdfUrl && !loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm text-gray-400">No PDF to preview</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
