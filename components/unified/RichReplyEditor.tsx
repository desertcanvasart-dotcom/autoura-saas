'use client'

import { useEffect, useRef } from 'react'
import { Bold, Italic, Underline, Link as LinkIcon, List, ListOrdered, Undo2, Redo2 } from 'lucide-react'

interface Props {
  html: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
}

/**
 * Lightweight HTML editor using contentEditable + document.execCommand.
 * Deliberately minimal — covers bold/italic/underline/link/lists, plus
 * pasted HTML from Gmail/Word (browsers handle cleanup).
 */
export default function RichReplyEditor({ html, onChange, placeholder, minHeight = 160 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const lastExternalHtml = useRef<string>('')

  // Sync incoming `html` prop (e.g. when an AI draft is accepted) without
  // stomping the user's in-progress edits.
  useEffect(() => {
    if (!ref.current) return
    if (html !== lastExternalHtml.current && html !== ref.current.innerHTML) {
      ref.current.innerHTML = html
      lastExternalHtml.current = html
    }
  }, [html])

  const cmd = (command: string, value?: string) => {
    // Keep selection inside the editor before running the command
    ref.current?.focus()
    // Deprecated but still universally supported and dead-simple
    document.execCommand(command, false, value)
    if (ref.current) onChange(ref.current.innerHTML)
  }

  const insertLink = () => {
    const url = window.prompt('Enter URL')
    if (!url) return
    const href = url.startsWith('http') ? url : `https://${url}`
    cmd('createLink', href)
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-100 bg-gray-50">
        <ToolbarButton onClick={() => cmd('bold')}        title="Bold"><Bold className="w-3.5 h-3.5" /></ToolbarButton>
        <ToolbarButton onClick={() => cmd('italic')}      title="Italic"><Italic className="w-3.5 h-3.5" /></ToolbarButton>
        <ToolbarButton onClick={() => cmd('underline')}   title="Underline"><Underline className="w-3.5 h-3.5" /></ToolbarButton>
        <span className="w-px h-4 bg-gray-200 mx-1" />
        <ToolbarButton onClick={insertLink}               title="Link"><LinkIcon className="w-3.5 h-3.5" /></ToolbarButton>
        <ToolbarButton onClick={() => cmd('insertUnorderedList')} title="Bulleted list"><List className="w-3.5 h-3.5" /></ToolbarButton>
        <ToolbarButton onClick={() => cmd('insertOrderedList')}   title="Numbered list"><ListOrdered className="w-3.5 h-3.5" /></ToolbarButton>
        <span className="w-px h-4 bg-gray-200 mx-1" />
        <ToolbarButton onClick={() => cmd('undo')} title="Undo"><Undo2 className="w-3.5 h-3.5" /></ToolbarButton>
        <ToolbarButton onClick={() => cmd('redo')} title="Redo"><Redo2 className="w-3.5 h-3.5" /></ToolbarButton>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        onBlur={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        className="px-3 py-2 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-[#647C47]/30 rounded-b-lg empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 [&_ul]:list-disc [&_ul]:ml-5 [&_ol]:list-decimal [&_ol]:ml-5 [&_a]:text-[#647C47] [&_a]:underline"
        style={{ minHeight }}
      />
    </div>
  )
}

function ToolbarButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}  // don't steal focus from editor
      onClick={onClick}
      title={title}
      className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-white rounded"
    >
      {children}
    </button>
  )
}

/**
 * Convert plain text (with `\n\n` paragraph breaks) into HTML suitable for
 * inserting into the editor. Used when an AI draft (which is plain text) is
 * accepted.
 */
export function plainTextToHtml(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  return paragraphs
    .map((p) => `<p>${escape(p).replace(/\n/g, '<br/>')}</p>`)
    .join('')
}

/**
 * Strip HTML to plain text (for email_messages.body_text + RAG indexing).
 * Deliberately minimal — runs server and client, no deps.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/li>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
