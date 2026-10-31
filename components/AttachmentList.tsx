// components/AttachmentList.tsx
'use client'

import { useState } from 'react'
import {
  Paperclip,
  Download,
  File,
  FileText,
  Image,
  FileSpreadsheet,
  Archive,
  Music,
  Video,
  Code,
  Loader2,
  AlertCircle
} from 'lucide-react'

interface Attachment {
  id: string
  filename: string
  mimeType: string
  size: number
}

interface AttachmentListProps {
  attachments: Attachment[]
  messageId: string
  userId: string
  className?: string
}

export default function AttachmentList({ 
  attachments, 
  messageId, 
  userId, 
  className = '' 
}: AttachmentListProps) {
  const [downloading, setDownloading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleDownload = async (attachment: Attachment) => {
    setDownloading(attachment.id)
    setError(null)
    
    try {
      const response = await fetch(
        `/api/gmail/attachments?userId=${userId}&messageId=${messageId}&attachmentId=${attachment.id}&filename=${encodeURIComponent(attachment.filename)}`
      )
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Download failed')
      }
      
      // Get the blob and create download link
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = attachment.filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
    } catch (err: any) {
      console.error('Download error:', err)
      setError(err.message || 'Failed to download attachment')
    } finally {
      setDownloading(null)
    }
  }

  const getFileIcon = (mimeType: string, filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    
    // Images
    if (mimeType.startsWith('image/')) {
      return <Image className="w-4 h-4 text-blue-500" />
    }
    
    // PDFs
    if (mimeType === 'application/pdf' || ext === 'pdf') {
      return <FileText className="w-4 h-4 text-red-500" />
    }
    
    // Word docs
    if (mimeType.includes('word') || ['doc', 'docx'].includes(ext)) {
      return <FileText className="w-4 h-4 text-blue-600" />
    }
    
    // Spreadsheets
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || ['xls', 'xlsx', 'csv'].includes(ext)) {
      return <FileSpreadsheet className="w-4 h-4 text-green-600" />
    }
    
    // Archives
    if (mimeType.includes('zip') || mimeType.includes('rar') || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return <Archive className="w-4 h-4 text-amber-600" />
    }
    
    // Audio
    if (mimeType.startsWith('audio/')) {
      return <Music className="w-4 h-4 text-primary-500" />
    }
    
    // Video
    if (mimeType.startsWith('video/')) {
      return <Video className="w-4 h-4 text-primary-500" />
    }
    
    // Code
    if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'xml', 'py', 'java'].includes(ext)) {
      return <Code className="w-4 h-4 text-gray-600" />
    }
    
    // Default
    return <File className="w-4 h-4 text-gray-500" />
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  if (!attachments || attachments.length === 0) return null

  return (
    <div className={`border-t border-gray-100 pt-4 mt-4 ${className}`}>
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
        <Paperclip className="w-3.5 h-3.5" />
        <span className="font-medium">{attachments.length} attachment{attachments.length > 1 ? 's' : ''}</span>
      </div>
      
      {error && (
        <div className="flex items-center gap-2 p-2 mb-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}
      
      <div className="flex flex-wrap gap-2">
        {attachments.map((attachment) => (
          <button
            key={attachment.id}
            onClick={() => handleDownload(attachment)}
            disabled={downloading === attachment.id}
            className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors group disabled:opacity-50 disabled:cursor-wait"
          >
            {downloading === attachment.id ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            ) : (
              getFileIcon(attachment.mimeType, attachment.filename)
            )}
            
            <div className="text-left">
              <div className="text-xs font-medium text-gray-700 max-w-[180px] truncate">
                {attachment.filename}
              </div>
              <div className="text-[10px] text-gray-400">
                {formatFileSize(attachment.size)}
              </div>
            </div>
            
            <Download className="w-3.5 h-3.5 text-gray-400 group-hover:text-primary-600 ml-1" />
          </button>
        ))}
      </div>
    </div>
  )
}

// Compact indicator for email list
export function AttachmentIndicator({ count }: { count: number }) {
  if (count === 0) return null
  
  return (
    <div className="flex items-center gap-1 text-gray-400" title={`${count} attachment${count > 1 ? 's' : ''}`}>
      <Paperclip className="w-3 h-3" />
      {count > 1 && <span className="text-[10px]">{count}</span>}
    </div>
  )
}