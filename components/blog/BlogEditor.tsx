'use client'

// The blog post body editor: the formatting a post needs (headings, lists,
// quotes, code, links, pictures) and nothing an email editor carries (fonts,
// colours, alignment) — the public page styles the post, not the writer.
// The HTML it produces is sanitised again on save (lib/blog/sanitize.ts).

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect, useRef, useState } from 'react'
import {
  Bold, Italic, Heading2, Heading3, List, ListOrdered, Quote, Code2,
  Link as LinkIcon, ImagePlus, Undo, Redo, Loader2,
} from 'lucide-react'
import { uploadBlogImage } from '@/lib/blog/upload-client'

function ToolbarButton({ onClick, active, disabled, title, children }: {
  onClick: () => void; active?: boolean; disabled?: boolean; title: string; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`p-1.5 rounded-md transition-colors disabled:opacity-40 ${active ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100'}`}
    >
      {children}
    </button>
  )
}

export default function BlogEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true },
      }),
      Image,
      Placeholder.configure({ placeholder: 'Write the post…' }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: 'blog-prose min-h-[320px] px-4 py-3 focus:outline-none' },
    },
  })

  // A post loaded after mount (the edit page fetches it) replaces the content.
  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value, { emitUpdate: false })
  }, [editor, value])

  const setLink = (ed: Editor) => {
    const previous = ed.getAttributes('link').href as string | undefined
    const url = window.prompt('Link address (leave empty to remove the link)', previous ?? 'https://')
    if (url === null) return
    if (url.trim() === '' ) { ed.chain().focus().unsetLink().run(); return }
    ed.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }

  const addImage = async (file: File | undefined) => {
    if (!file || !editor) return
    setUploading(true); setError(null)
    try {
      const src = await uploadBlogImage(file)
      editor.chain().focus().setImage({ src, alt: file.name.replace(/\.[^.]+$/, '') }).run()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload the image')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="border border-gray-300 rounded-lg bg-white" data-testid="blog-editor">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 px-2 py-1.5">
        {editor && (
          <>
            <ToolbarButton title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="w-4 h-4" /></ToolbarButton>
            <ToolbarButton title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="w-4 h-4" /></ToolbarButton>
            <span className="w-px h-5 bg-gray-200 mx-1" />
            <ToolbarButton title="Heading" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="w-4 h-4" /></ToolbarButton>
            <ToolbarButton title="Subheading" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="w-4 h-4" /></ToolbarButton>
            <ToolbarButton title="Bulleted list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="w-4 h-4" /></ToolbarButton>
            <ToolbarButton title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="w-4 h-4" /></ToolbarButton>
            <ToolbarButton title="Quote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="w-4 h-4" /></ToolbarButton>
            <ToolbarButton title="Code block" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code2 className="w-4 h-4" /></ToolbarButton>
            <span className="w-px h-5 bg-gray-200 mx-1" />
            <ToolbarButton title="Link" active={editor.isActive('link')} onClick={() => setLink(editor)}><LinkIcon className="w-4 h-4" /></ToolbarButton>
            <ToolbarButton title="Insert an image" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
            </ToolbarButton>
            <span className="w-px h-5 bg-gray-200 mx-1" />
            <ToolbarButton title="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo className="w-4 h-4" /></ToolbarButton>
            <ToolbarButton title="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Redo className="w-4 h-4" /></ToolbarButton>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={e => addImage(e.target.files?.[0])} />
      </div>
      <EditorContent editor={editor} />
      {error && <p className="px-4 pb-3 text-sm text-red-600">{error}</p>}
    </div>
  )
}
