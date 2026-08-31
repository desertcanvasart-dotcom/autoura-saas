import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // createAuthenticatedClient(), not the browser singleton from
    // @/app/supabase. That client does not forward the request cookies
    // server-side, so under Supabase SSR the query ran ANONYMOUSLY and RLS
    // answered 404/permission-denied — the pause toggle looked broken for
    // every signed-in user. Every neighbouring invoice route uses this.
    const supabase = await createAuthenticatedClient()

    const body = await request.json().catch(() => ({}))

    // Validate the toggle. Absent = flip the current state; present = must be
    // a real boolean, so a stray string cannot write junk into the column.
    let requestedPaused: boolean | undefined
    if (body?.paused !== undefined) {
      if (typeof body.paused !== 'boolean') {
        return NextResponse.json(
          { success: false, error: '`paused` must be a boolean' },
          { status: 400 }
        )
      }
      requestedPaused = body.paused
    }

    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('id, invoice_number, reminder_paused')
      .eq('id', id)
      .single()

    if (fetchError || !invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 })
    }

    const newPausedStatus = requestedPaused ?? !invoice.reminder_paused

    const { error: updateError } = await supabase
      .from('invoices')
      .update({ reminder_paused: newPausedStatus, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (updateError) throw updateError

    return NextResponse.json({
      success: true,
      invoice_id: id,
      invoice_number: invoice.invoice_number,
      reminder_paused: newPausedStatus,
      message: newPausedStatus ? 'Reminders paused' : 'Reminders resumed'
    })
  } catch (error: any) {
    console.error('Error toggling pause:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
