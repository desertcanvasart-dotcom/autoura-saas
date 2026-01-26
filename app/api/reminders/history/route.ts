import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createAuthenticatedClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const status = searchParams.get('status')

    // Query with RLS - automatically filters by tenant
    let query = supabase
      .from('invoice_reminders')
      .select(`
        *,
        invoices:invoice_id (
          invoice_number,
          client_name,
          client_email,
          total_amount,
          balance_due,
          currency,
          status
        )
      `)
      .order('sent_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data: reminders, error } = await query
    if (error) throw error

    const { count: totalCount } = await supabase
      .from('invoice_reminders')
      .select('id', { count: 'exact', head: true })

    const { data: stats } = await supabase
      .from('invoice_reminders')
      .select('status')

      const sentCount = stats?.filter((r: any) => r.status === 'sent').length || 0
      const failedCount = stats?.filter((r: any) => r.status === 'failed').length || 0

    return NextResponse.json({
      success: true,
      reminders: reminders || [],
      pagination: {
        total: totalCount || 0,
        limit,
        offset,
        hasMore: (offset + limit) < (totalCount || 0)
      },
      stats: {
        total: stats?.length || 0,
        sent: sentCount,
        failed: failedCount
      }
    })
  } catch (error: any) {
    console.error('Error fetching reminder history:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
