'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/app/contexts/AuthContext'
import Link from 'next/link'
import { TemplateEditor } from '@/components/email/RichTextEditor'
import { 
  Mail, 
  ArrowLeft, 
  Check, 
  AlertCircle, 
  Loader2,
  Unlink,
  ExternalLink,
  Plus,
  Pencil,
  Trash2,
  FileText,
  X
} from 'lucide-react'
import { createClient } from '@/app/supabase'
import { useConfirmDialog } from '@/components/ConfirmDialog'

interface EmailTemplate {
  id: string
  name: string
  subject: string
  content: string
  category: string
}

function EmailSettingsContent() {
  const { user } = useAuth()
  const dialog = useConfirmDialog()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [gmailConnected, setGmailConnected] = useState(false)
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  
  // Signatures are managed at /settings/email-signatures — this page used to
  // carry a second UI over the same email_signatures table (older editor, no
  // HTML mode). One signature manager only.
  const [activeTab, setActiveTab] = useState<'connection' | 'templates'>('connection')
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  
  const supabase = createClient()

  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    
    if (success) {
      setMessage({ type: 'success', text: 'Gmail connected successfully!' })
    } else if (error) {
      setMessage({ type: 'error', text: `Connection failed: ${error}` })
    }
  }, [searchParams])

  useEffect(() => {
    if (user) {
      checkGmailConnection()
      fetchTemplates()
    }
  }, [user])

  const checkGmailConnection = async () => {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('gmail_tokens')
        .select('email')
        .eq('user_id', user.id)
        .single()

      if (data && !error) {
        setGmailConnected(true)
        setConnectedEmail(data.email)
      }
    } catch (err) {
      // Not connected
    } finally {
      setLoading(false)
    }
  }

  const fetchTemplates = async () => {
    if (!user) return
    try {
      const response = await fetch(`/api/email/templates?userId=${user.id}`)
      const data = await response.json()
      if (data.templates) {
        setTemplates(data.templates)
      }
    } catch (err) {
      console.error('Error fetching templates:', err)
    }
  }

  const handleConnectGmail = async () => {
    if (!user) return
    
    setConnecting(true)
    try {
      const response = await fetch('/api/gmail/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })

      const data = await response.json()
      
      if (data.authUrl) {
        window.location.href = data.authUrl
      } else {
        throw new Error(data.error || 'Failed to get auth URL')
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
      setConnecting(false)
    }
  }

  const handleDisconnectGmail = async () => {
    if (!user) return
    if (!(await dialog.confirm({ message: 'Are you sure you want to disconnect Gmail?', variant: 'danger', confirmText: 'Delete' }))) return

    try {
      const { error } = await supabase
        .from('gmail_tokens')
        .delete()
        .eq('user_id', user.id)

      if (error) throw error

      setGmailConnected(false)
      setConnectedEmail(null)
      setMessage({ type: 'success', text: 'Gmail disconnected successfully' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!user) return
    if (!(await dialog.confirm({ message: 'Delete this template?', variant: 'danger', confirmText: 'Delete' }))) return
    
    try {
      await fetch('/api/email/templates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, userId: user.id }),
      })
      fetchTemplates()
    } catch (err) {
      console.error('Error deleting template:', err)
    }
  }

  const tabs = [
    { id: 'connection', label: 'Connection', icon: Mail },
    { id: 'templates', label: 'Templates', icon: FileText },
  ]

  return (
    <div className="min-h-screen bg-gray-50/50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href="/settings/profile"
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 mb-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Settings
              </Link>
              <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Mail className="w-5 h-5 text-primary-600" />
                Email Settings
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">Manage your email connection and templates</p>
            </div>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="px-6 flex gap-6 border-t border-gray-100">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-3 border-b-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <div className="p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          
          {/* Message */}
          {message && (
            <div className={`flex items-center gap-2 p-3 rounded-lg border ${
              message.type === 'success' 
                ? 'bg-green-50 border-green-200 text-green-700' 
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {message.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span className="text-sm">{message.text}</span>
              <button onClick={() => setMessage(null)} className="ml-auto">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Connection Tab */}
          {activeTab === 'connection' && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                    <path d="M22 6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6ZM20 6L12 11L4 6H20ZM20 18H4V8L12 13L20 8V18Z" fill="#EA4335"/>
                  </svg>
                </div>
                
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-900">Gmail</h3>
                  <p className="text-xs text-gray-500 mt-0.5 mb-3">
                    Connect your Gmail account to read and send emails directly from Autoura
                  </p>

                  {loading ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Checking connection...
                    </div>
                  ) : gmailConnected ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                        <Check className="w-4 h-4 text-green-600" />
                        <span className="text-sm text-green-700">
                          Connected as <strong>{connectedEmail}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          href="/inbox"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          Open Inbox
                        </Link>
                        <button
                          onClick={handleDisconnectGmail}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                        >
                          <Unlink className="w-3.5 h-3.5" />
                          Disconnect
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handleConnectGmail}
                      disabled={connecting}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#EA4335] rounded-lg hover:bg-[#d33426] transition-colors disabled:opacity-50"
                    >
                      {connecting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <ExternalLink className="w-4 h-4" />
                          Connect Gmail
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Templates Tab */}
          {activeTab === 'templates' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Email Templates</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Create reusable email templates</p>
                </div>
                <button
                  onClick={() => { setEditingTemplate(null); setShowTemplateModal(true); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Template
                </button>
              </div>

              {templates.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                  <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-600">No templates yet</p>
                  <p className="text-xs text-gray-400 mt-1">Create templates for quotes, confirmations, and more</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {templates.map((template) => (
                    <div key={template.id} className="bg-white rounded-lg border border-gray-200 p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-medium uppercase">
                            {template.category}
                          </span>
                          <h4 className="text-sm font-medium text-gray-900 mt-1">{template.name}</h4>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setEditingTemplate(template); setShowTemplateModal(true); }}
                            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5 text-gray-500" />
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(template.id)}
                            className="p-1.5 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 truncate">Subject: {template.subject}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>


      {/* Template Modal */}
      {showTemplateModal && (
        <TemplateModal
          template={editingTemplate}
          userId={user?.id || ''}
          onClose={() => setShowTemplateModal(false)}
          onSaved={() => {
            setShowTemplateModal(false)
            fetchTemplates()
          }}
        />
      )}
    </div>
  )
}

// Template Modal - Now using RichTextEditor
function TemplateModal({
  template,
  userId,
  onClose,
  onSaved,
}: {
  template: EmailTemplate | null
  userId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(template?.name || '')
  const [subject, setSubject] = useState(template?.subject || '')
  const [content, setContent] = useState(template?.content || '')
  const [category, setCategory] = useState(template?.category || 'general')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name || !subject || !content) return
    
    setSaving(true)
    try {
      const method = template ? 'PUT' : 'POST'
      const body = template
        ? { id: template.id, userId, name, subject, content, category }
        : { userId, name, subject, content, category }

      await fetch('/api/email/templates', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      onSaved()
    } catch (err) {
      console.error('Error saving template:', err)
    } finally {
      setSaving(false)
    }
  }

  const categories = ['general', 'quote', 'confirmation', 'follow-up', 'thank-you']

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">
            {template ? 'Edit Template' : 'New Template'}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-primary-500 outline-none"
                placeholder="e.g., Quote Template"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-primary-500 outline-none bg-white"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Subject Line</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-primary-500 outline-none"
              placeholder="e.g., Your Custom Egypt Itinerary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Content</label>
            <TemplateEditor
              content={content}
              onChange={setContent}
              placeholder="Write your template content..."
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Tip: Use placeholders like {"{{client_name}}"}, {"{{dates}}"}, {"{{total}}"} for dynamic content
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name || !subject || !content}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function EmailSettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50/50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    }>
      <EmailSettingsContent />
    </Suspense>
  )
}