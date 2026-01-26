import { createClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Authenticate and get tenant context
  const authResult = await requireAuth()
  if (authResult.error) return authResult.response

  const { supabase } = authResult
  const { id } = await params

  try {
    const { data, error } = await supabase
      .from('supplier_documents')
      .select(`
        *,
        itinerary:itineraries(id, itinerary_code, trip_name, client_name)
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching document:', error)
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Authenticate and get tenant context
  const authResult = await requireAuth()
  if (authResult.error) return authResult.response

  const { supabase } = authResult
  const { id } = await params

  try {
    const body = await request.json()
    console.log('Updating document:', id, body)

    // Remove fields that shouldn't be updated directly
    const { itinerary, supplier, created_at, tenant_id, ...updateData } = body
    
    // Auto-set timestamps based on status changes
    if (updateData.status === 'sent' && !updateData.sent_at) {
      updateData.sent_at = new Date().toISOString()
    }
    if (updateData.status === 'confirmed' && !updateData.confirmed_at) {
      updateData.confirmed_at = new Date().toISOString()
    }
    if (updateData.status === 'completed' && !updateData.completed_at) {
      updateData.completed_at = new Date().toISOString()
    }
    
    // Set updated_at
    updateData.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('supplier_documents')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating document:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    console.log('Document updated successfully:', data)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in PUT:', error)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Authenticate and get tenant context
  const authResult = await requireAuth()
  if (authResult.error) return authResult.response

  const { supabase } = authResult
  const { id } = await params

  try {
    const { error } = await supabase
      .from('supplier_documents')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting document:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}