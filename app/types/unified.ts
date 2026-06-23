// Shared types for the unified inbox (our single-table unified_conversations
// model + the unified_messages timeline view).

export type UnifiedChannel = 'whatsapp' | 'email'
export type UnifiedConversationStatus = 'active' | 'archived' | 'blocked'

export interface UnifiedAssignedAgent {
  id: string
  name: string | null
  email: string | null
}

export interface UnifiedConversation {
  id: string
  tenant_id: string
  client_id: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  whatsapp_conversation_id: string | null
  total_messages: number
  unread_messages: number
  last_message_at: string | null
  last_message_preview: string | null
  last_message_channel: UnifiedChannel | null
  assigned_team_member_id: string | null
  assigned_at: string | null
  status: UnifiedConversationStatus
  is_starred: boolean
  tags: string[] | null
  created_at?: string
  updated_at?: string
  // joined
  client?: { id: string; full_name: string | null; email: string | null; phone: string | null } | null
  assigned_to?: UnifiedAssignedAgent | null
}

export interface UnifiedMessage {
  id: string
  conversation_id: string
  channel: UnifiedChannel
  direction: 'inbound' | 'outbound'
  body: string
  sent_at: string
  sender_name?: string | null
  subject?: string | null
}

export interface UnifiedConversationFilters {
  status?: UnifiedConversationStatus | 'all'
  channel?: UnifiedChannel | 'all'
  search?: string
  assigned_to?: string | 'me' | 'unassigned'
  starred?: boolean
}

export interface ClientConversationSummary {
  total_conversations: number
  total_unread: number
  starred_count: number
  by_channel: Record<UnifiedChannel, number>
  last_activity_at: string | null
}

export interface ClientConversationsResponse {
  success: boolean
  client: {
    id: string
    full_name: string | null
    email: string | null
    phone: string | null
  } & Record<string, unknown>
  conversations: UnifiedConversation[]
  summary: ClientConversationSummary
}
