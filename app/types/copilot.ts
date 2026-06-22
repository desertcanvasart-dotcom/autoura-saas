// Shared types for the Communication Copilot review surface.

export type CopilotChannel = 'whatsapp' | 'email'
export type CopilotTone = 'professional' | 'friendly' | 'formal'
export type ThreadStatus = 'open' | 'waiting' | 'resolved' | 'archived'
export type ThreadUrgency = 'low' | 'normal' | 'high' | 'urgent'
export type InboxStatus = 'new' | 'draft_pending' | 'draft_ready' | 'responded' | 'skipped'
export type DraftStatus = 'pending' | 'approved' | 'rejected' | 'sent' | 'expired'
export type AIConfidence = 'high' | 'medium' | 'low' | null

export interface CopilotInboxMessage {
  id: string
  thread_id: string
  channel: CopilotChannel
  sender_name: string | null
  sender_contact: string
  message_body: string
  message_snippet: string | null
  subject: string | null
  status: InboxStatus
  received_at: string
}

export interface CopilotDraft {
  id: string
  thread_id: string
  inbox_message_id: string
  parent_draft_id: string | null
  draft_body: string
  edited_body: string | null
  was_edited: boolean
  operator_notes: string | null
  ai_model: string | null
  ai_confidence: AIConfidence
  ai_flags: Record<string, any>
  generation_time_ms: number | null
  status: DraftStatus
  reviewed_at: string | null
  sent_at: string | null
  send_error: string | null
  created_at: string
}

export interface CopilotThreadSummary {
  id: string
  channel: CopilotChannel
  client_id: string | null
  client_name: string | null
  contact_info: string
  subject: string | null
  status: ThreadStatus
  urgency: ThreadUrgency
  last_message_at: string | null
  last_draft_at: string | null
  // review-queue extras
  latest_inbox_snippet: string | null
  latest_inbox_status: InboxStatus | null
  pending_draft_count: number
}

export interface CopilotContextClient {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  nationality: string | null
  language: string | null
  vip: boolean
}

export interface CopilotContextItinerary {
  reference: string | null
  trip_name: string | null
  start_date: string | null
  end_date: string | null
  status: string | null
  total: number | null
  currency: string | null
}

export interface CopilotContextInvoice {
  number: string | null
  total: number | null
  status: string | null
  due_date: string | null
}

export interface CopilotContextPayment {
  amount: number | null
  currency: string | null
  status: string | null
  date: string | null
}

export interface CopilotContext {
  client: CopilotContextClient | null
  itineraries: CopilotContextItinerary[]
  invoices: CopilotContextInvoice[]
  payments: CopilotContextPayment[]
}

export interface CopilotThreadDetail {
  thread: CopilotThreadSummary
  inbox: CopilotInboxMessage[]
  drafts: CopilotDraft[]
  context: CopilotContext
}
