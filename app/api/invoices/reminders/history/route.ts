import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'

// GET: Fetch all reminder history across all invoices
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const invoiceId = searchParams.get('invoiceId')
    const status = searchParams.get('status') // 'sent', 'failed', 'all'

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

    if (invoiceId) {
      query = query.eq('invoice_id', invoiceId)
    }

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data: reminders, error, count } = await query

    if (error) throw error

    // Get total count
    let countQuery = supabase
      .from('invoice_reminders')
      .select('id', { count: 'exact', head: true })

    if (invoiceId) {
      countQuery = countQuery.eq('invoice_id', invoiceId)
    }
    if (status && status !== 'all') {
      countQuery = countQuery.eq('status', status)
    }

    const { count: totalCount } = await countQuery

    // Get stats
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
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}