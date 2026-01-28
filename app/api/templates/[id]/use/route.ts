import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// POST - Track template usage
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Require authentication - RLS will enforce tenant boundaries
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    // Increment usage count
    const { error } = await supabase.rpc('increment_template_usage', { template_id: id })

    // Fallback if RPC doesn't exist
    if (error) {
      // Fetch current usage count
      const { data: template } = await supabase
        .from('message_templates')
        .select('usage_count')
        .eq('id', id)
        .single()

      await supabase
        .from('message_templates')
        .update({
          usage_count: (template?.usage_count || 0) + 1,
          last_used_at: new Date().toISOString()
        })
        .eq('id', id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Template use tracking error:', error)
    return NextResponse.json({ success: true }) // Don't fail on tracking error
  }
}