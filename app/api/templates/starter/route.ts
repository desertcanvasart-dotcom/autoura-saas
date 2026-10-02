import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import type { TablesInsert } from '@/types/database.types'
import { STARTER_CUSTOMER_TEMPLATES } from '@/lib/templates/starter-customer-templates'
import { getPlaceholders } from '@/lib/template-placeholders'

// POST - Add the starter customer templates (lib/templates/starter-customer-templates)
// to the caller's own company. Safe to repeat: a starter whose name is already
// among the company's active templates is skipped, never duplicated or
// overwritten — an agency that edited "Booking confirmed" keeps its version.
// A deleted one (is_active = false) can be loaded again.
export async function POST() {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }

    const { data: existing, error: readError } = await supabase
      .from('message_templates')
      .select('name')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
    if (readError) {
      console.error('Starter templates: could not read existing templates:', readError.message)
      return NextResponse.json({ success: false, error: 'Could not read your templates' }, { status: 500 })
    }

    const taken = new Set((existing ?? []).map(r => (r.name || '').trim().toLowerCase()))
    const rows: TablesInsert<'message_templates'>[] = STARTER_CUSTOMER_TEMPLATES
      .filter(s => !taken.has(s.name.toLowerCase()))
      .map(s => ({
        tenant_id,
        name: s.name,
        description: s.description,
        category: s.category,
        subcategory: s.subcategory,
        channel: s.channel,
        subject: s.subject,
        body: s.body,
        // Same shape POST /api/templates stores: the {{tokens}} as written.
        placeholders: getPlaceholders(`${s.subject ?? ''}\n${s.body}`).map(k => `{{${k}}}`),
        is_active: true,
        language: 'en',
        parent_template_id: null,
        version: 1,
      }))

    if (rows.length === 0) {
      return NextResponse.json({ success: true, created: 0, skipped: STARTER_CUSTOMER_TEMPLATES.length })
    }

    const { error: insertError } = await supabase.from('message_templates').insert(rows)
    if (insertError) {
      console.error('Starter templates: insert failed:', insertError.message)
      return NextResponse.json({ success: false, error: 'Could not add the starter templates' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      created: rows.length,
      skipped: STARTER_CUSTOMER_TEMPLATES.length - rows.length,
    })
  } catch (error) {
    console.error('Starter templates POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
