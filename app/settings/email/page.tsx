'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/app/contexts/AuthContext'
import { useTenant } from '@/app/contexts/TenantContext'
import { useRole } from '@/hooks/useRole'
import Link from 'next/link'
import SendingDomainCard from '@/components/settings/SendingDomainCard'
import UrlTabs, { type UrlTab } from '@/components/nav/UrlTabs'
import SignaturesView from './_views/SignaturesView'
import dynamic from 'next/dynamic'
import { 
  Mail, 
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

// The tiptap editor is only used inside the template modal, so it is fetched
// when the modal opens rather than in this page's first load.
const TemplateEditor = dynamic(
  () => import('@/components/email/RichTextEditor').then(m => m.TemplateEditor),
  { ssr: false, loading: () => <div className="min-h-[200px] rounded-lg border border-gray-200 bg-gray-50 animate-pulse" /> },
)

interface EmailTemplate {
  id: string
  name: string
  subject: string
  content: string
  category: string
}

function EmailSettingsContent({ section }: { section: 'connection' | 'templates' }) {
  const { user } = useAuth()
  const { tenant } = useTenant()
  const { isAdmin } = useRole()
  const dialog = useConfirmDialog()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [gmailConnected, setGmailConnected] = useState(false)
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const loadOfficeAddresses = async () => {
    try {
      const res = await fetch('/api/admin/tenant/settings')
      const data = await res.json()
      if (data.success) setOfficeAddresses((data.settings?.office_email_addresses ?? []).join('\n'))
    } catch {}
  }

  const saveOfficeAddresses = async () => {
    setSavingOffice(true)
    try {
      const entries = officeAddresses.split('\n').map(v => v.trim()).filter(Boolean)
      const res = await fetch('/api/admin/tenant/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ office_email_addresses: entries }),
      })
      const data = await res.json()
      setMessage(
        data.success
          ? { type: 'success', text: 'Saved. Mail from these addresses now counts as ours.' }
          : { type: 'error', text: data.error || 'Could not save the addresses' }
      )
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Could not save the addresses' })
    } finally {
      setSavingOffice(false)
    }
  }
  
  // Signatures are their own tab (_views/SignaturesView) — this component
  // used to carry a second UI over the same email_signatures table (older
  // editor, no HTML mode). One signature manager only.
  // Addresses that count as the office writing, beyond the connected mailbox
  // and its own domain. One per line, or a whole domain.
  const [officeAddresses, setOfficeAddresses] = useState('')
  const [savingOffice, setSavingOffice] = useState(false)
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  
  const supabase = createClient()

  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    
    if (success) {
      setMessage({ type: 'success', text: 'Gmail connected successfully!' })
    } else if (error === 'missing_scopes') {
      // Google's consent screen lets each permission be unticked; the
      // callback refuses such a connection (documents audit, round 12).
      setMessage({
        type: 'error',
        text: 'Gmail was not connected: some permissions were left unticked on the Google consent screen. Connect again and tick every box (read, send and manage email).',
      })
    } else if (error === 'no_company') {
      setMessage({ type: 'error', text: 'Gmail was not connected: you are not an active member of the company you were working in. Switch to your company and connect again.' })
    } else if (error === 'session_mismatch') {
      setMessage({ type: 'error', text: 'Gmail was not connected: the Google sign-in was finished by a different account than the one that started it. Sign in to Autoura as yourself and click Connect again — never use a Connect link someone else sent you.' })
    } else if (error) {
      setMessage({ type: 'error', text: `Connection failed: ${error}` })
    }
  }, [searchParams])

  useEffect(() => {
    if (user) {
      checkGmailConnection()
      fetchTemplates()
      loadOfficeAddresses()
    }
  }, [user, tenant?.id])

  const checkGmailConnection = async () => {
    if (!user) return
    try {
      // This person's mailbox in the company being worked in (migration 415).
      if (!tenant?.id) return
      const { data, error } = await supabase
        .from('gmail_tokens')
        .select('email')
        .eq('user_id', user.id)
        .eq('tenant_id', tenant.id)
        .maybeSingle()

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
      // Only this company's mailbox: the same person's mailbox in another
      // company stays connected.
      if (!tenant?.id) return
      // Server-side, so the access is also revoked at Google (not just
      // forgotten here).
      const res = await fetch('/api/gmail/connect', { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Could not disconnect Gmail')
      }

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
      const res = await fetch('/api/email/templates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) setMessage({ type: 'error', text: data.error || 'Could not delete the template' })
      fetchTemplates()
    } catch (err) {
      console.error('Error deleting template:', err)
      setMessage({ type: 'error', text: 'Could not delete the template' })
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl">
      <div className="pt-2">
        <div className="max-w-3xl space-y-4">
          
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
          {section === 'connection' && (
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

              {/* The office's other addresses (migration 367) */}
              {/* Company-wide, so admins only (the API is too); everyone connects their own Gmail above. */}
              {isAdmin && (
              <div className="bg-white rounded-lg border border-gray-200 p-4 mt-4">
                <h3 className="text-sm font-semibold text-gray-900">Our other email addresses</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Replies sent from the connected mailbox, or from any address on its domain, are
                  already recognised as ours. Add anything else your office answers from — a
                  colleague&rsquo;s address on another domain, or a partner office. One per line; a
                  whole domain works too.
                </p>
                <textarea
                  value={officeAddresses}
                  onChange={(e) => setOfficeAddresses(e.target.value)}
                  rows={4}
                  placeholder={'hello@another-domain.com\npartner-office.com'}
                  className="mt-2 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 font-mono"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={saveOfficeAddresses}
                    disabled={savingOffice}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
                  >
                    {savingOffice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Save addresses
                  </button>
                  <span className="text-xs text-gray-500">
                    Used to tell our reply from a customer&rsquo;s message.
                  </span>
                </div>
              </div>
              )}
            </div>
          )}

          {/* Templates Tab */}
          {section === 'templates' && (
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
                          <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-medium uppercase">
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

          <SendingDomainCard canManage={isAdmin} />
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
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!name || !subject || !content) return
    setSaveError(null)
    
    setSaving(true)
    try {
      const method = template ? 'PUT' : 'POST'
      const body = template
        ? { id: template.id, userId, name, subject, content, category }
        : { userId, name, subject, content, category }

      const res = await fetch('/api/email/templates', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setSaveError(data.error || 'Could not save the template')
        return
      }
      onSaved()
    } catch (err) {
      console.error('Error saving template:', err)
      setSaveError('Could not save the template')
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
            <p className="text-xs text-gray-400 mt-1">
              Tip: Use placeholders like {"{{client_name}}"}, {"{{dates}}"}, {"{{total}}"} for dynamic content
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          {saveError && <p className="mr-auto text-sm text-red-600">{saveError}</p>}
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

// Email & signature: the Gmail connection, signatures and templates, each a
// tab held in ?tab= (the old /settings/email-signatures redirects here).
const TABS: UrlTab[] = [
  { key: 'connection', label: 'Connection', roles: ['admin', 'manager', 'member'], render: () => <EmailSettingsContent section="connection" /> },
  { key: 'signatures', label: 'Signatures', roles: ['admin', 'manager', 'member'], render: () => <SignaturesView /> },
  { key: 'templates', label: 'Templates', roles: ['admin', 'manager', 'member'], render: () => <EmailSettingsContent section="templates" /> },
]

export default function EmailSettingsPage() {
  return (
    <Suspense fallback={
      <div className="px-4 sm:px-6 lg:px-8 py-12 max-w-5xl flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    }>
      <UrlTabs tabs={TABS} label="Email & signature" />
    </Suspense>
  )
}
