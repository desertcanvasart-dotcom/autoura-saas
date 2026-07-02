// app/api/cruises/[id]/route.ts

import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { id } = await params
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('nile_cruises')
      .select('*')
      .eq('id', id)
      // Tenant rows plus legacy/global rows created before tenant scoping
      .or(`tenant_id.eq.${authResult.tenant_id},tenant_id.is.null`)
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error fetching cruise:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch cruise' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { id } = await params
    const supabase = createAdminClient()
    const body = await request.json()

    const { data, error } = await supabase
      .from('nile_cruises')
      .update({
        ...body,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error updating cruise:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update cruise' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { id } = await params
    const supabase = createAdminClient()

    const { error } = await supabase
      .from('nile_cruises')
      .delete()
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting cruise:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete cruise' },
      { status: 500 }
    )
  }
}
