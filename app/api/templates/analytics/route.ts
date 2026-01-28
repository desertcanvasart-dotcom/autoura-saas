import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

/**
 * GET /api/templates/analytics
 * Get template usage analytics for the current tenant
 */
export async function GET() {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    // Get top templates by usage
    const { data: topTemplates } = await supabase
      .from('message_templates')
      .select('id, name, channel, usage_count, last_used_at')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .order('usage_count', { ascending: false })
      .limit(5)

    // Get total templates count
    const { count: totalTemplates } = await supabase
      .from('message_templates')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)

    // Get templates by channel
    const { data: allTemplates } = await supabase
      .from('message_templates')
      .select('channel')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)

    const channelCounts = {
      email: 0,
      whatsapp: 0,
      sms: 0,
      both: 0
    }

    allTemplates?.forEach(t => {
      if (t.channel in channelCounts) {
        channelCounts[t.channel as keyof typeof channelCounts]++
      }
    })

    // Get recent send logs
    const { data: recentSends } = await supabase
      .from('template_send_log')
      .select(`
        id,
        channel,
        status,
        created_at,
        template:message_templates(name)
      `)
      .eq('tenant_id', tenant_id)
      .order('created_at', { ascending: false })
      .limit(10)

    // Get send statistics for the last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: sendStats } = await supabase
      .from('template_send_log')
      .select('status, channel')
      .eq('tenant_id', tenant_id)
      .gte('created_at', thirtyDaysAgo.toISOString())

    const stats = {
      totalSent: 0,
      successful: 0,
      failed: 0,
      byChannel: {
        email: 0,
        whatsapp: 0,
        sms: 0
      }
    }

    sendStats?.forEach(s => {
      stats.totalSent++
      if (s.status === 'sent') stats.successful++
      if (s.status === 'failed') stats.failed++
      if (s.channel in stats.byChannel) {
        stats.byChannel[s.channel as keyof typeof stats.byChannel]++
      }
    })

    // Get scheduled sends count
    const { count: pendingScheduled } = await supabase
      .from('scheduled_sends')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .eq('status', 'pending')

    return NextResponse.json({
      success: true,
      data: {
        overview: {
          totalTemplates: totalTemplates || 0,
          totalSentLast30Days: stats.totalSent,
          successRate: stats.totalSent > 0
            ? Math.round((stats.successful / stats.totalSent) * 100)
            : 0,
          pendingScheduled: pendingScheduled || 0
        },
        topTemplates: topTemplates || [],
        channelDistribution: channelCounts,
        sendStats: stats,
        recentSends: recentSends || []
      }
    })
  } catch (error) {
    console.error('Template analytics error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
