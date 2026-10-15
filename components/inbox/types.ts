// Shared types for the inbox page and its parts.

// UPDATED: Email export interface with attachments
export interface Email {
  id: string
  threadId: string
  snippet: string
  from: string
  to: string
  subject: string
  date: string
  body: string
  isUnread: boolean
  labelIds?: string[]
  // NEW: Attachments support
  attachments?: Array<{
    id: string
    filename: string
    mimeType: string
    size: number
  }>
}

export interface Attachment {
  filename: string
  mimeType: string
  data: string
  size: number
}

export interface EmailSignature {
  id: string
  name: string
  content: string
  is_default: boolean
}

export interface EmailTemplate {
  id: string
  name: string
  subject: string
  content: string
  category: string
  channel?: string 
}

export interface GmailLabel {
  id: string
  name: string
  type: 'system' | 'user'
  color?: {
    backgroundColor: string
    textColor: string
  }
}

// NEW: Client export interface for template placeholders
export interface Client {
  id: string
  name: string
  email: string
  phone?: string
}

