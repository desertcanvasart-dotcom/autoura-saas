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

    // Counted, not read: the stats read every row (capped by PostgREST at
    // 1000), and "has more" compared against the UNFILTERED total, so Failed
    // Only kept offering Load More with nothing left.
    const countOf = async (only?: string) => {
      let q = supabase.from('invoice_reminders').select('id', { count: 'exact', head: true })
      if (only) q = q.eq('status', only)
      const { count } = await q
      return count || 0
    }
    const [allCount, sentCount, failedCount] = await Promise.all([countOf(), countOf('sent'), countOf('failed')])
    const totalCount = status && status !== 'all' ? (status === 'sent' ? sentCount : status === 'failed' ? failedCount : await countOf(status)) : allCount

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
        total: allCount,
        sent: sentCount,
        failed: failedCount
      }
    })
  } catch (error: any) {
    console.error('Error fetching reminder history:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
