// Super-admin support inbox — every tenant's conversations, newest activity
// first, with enough context to triage without opening each one.

import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/super-admin'

export async function GET() {
  try {
    const auth = await requireSuperAdmin()
    if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const admin = auth.adminClient!

    const { data: conversations, error } = await admin
      .from('support_conversations')
      .select('id, tenant_id, status, created_at, last_message_at, tenant:tenants(company_name, contact_email)')
      .order('last_message_at', { ascending: false })
      .limit(100)
    if (error) throw error

    // Last message per conversation (preview + who spoke last → "needs reply").
    const ids = (conversations || []).map((c: { id: string }) => c.id)
    const previews: Record<string, { body: string; sender_type: string; created_at: string }> = {}
    if (ids.length > 0) {
      const { data: msgs } = await admin
        .from('support_messages')
        .select('conversation_id, body, sender_type, created_at')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false })
        .limit(300)
      for (const m of msgs || []) {
        if (!previews[m.conversation_id]) {
          previews[m.conversation_id] = { body: m.body, sender_type: m.sender_type, created_at: m.created_at }
        }
      }
    }

    return NextResponse.json({
      success: true,
      conversations: (conversations || []).map((c: Record<string, unknown>) => ({
        ...c,
        lastMessage: previews[c.id as string] || null,
      })),
    })
  } catch (error) {
    console.error('Super-admin support list error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
