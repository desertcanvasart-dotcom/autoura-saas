// ============================================
// API Route: /api/resources/hotel-staff/[id]/route.ts
// ============================================
// Single hotel staff operations: GET, PUT, DELETE
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

// GET - Get single hotel staff
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient()
    const { id } = await params

    const { data, error } = await supabase
      .from('hotel_staff')
      .select(`
        *,
        hotel:hotel_contacts(id, name, city)
      `)
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'Hotel staff not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data
    })

  } catch (error) {
    console.error('Error in hotel staff GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Update hotel staff
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient()
    const { id } = await params
    const body = await request.json()

    const updateData: any = {}
    
    if (body.name !== undefined) updateData.name = body.name
    if (body.role !== undefined) updateData.role = body.role
    if (body.hotel_id !== undefined) updateData.hotel_id = body.hotel_id
    if (body.phone !== undefined) updateData.phone = body.phone
    if (body.whatsapp !== undefined) updateData.whatsapp = body.whatsapp
    if (body.email !== undefined) updateData.email = body.email
    if (body.languages !== undefined) updateData.languages = body.languages
    if (body.shift_times !== undefined) updateData.shift_times = body.shift_times
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    const { data, error } = await supabase
      .from('hotel_staff')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        hotel:hotel_contacts(id, name, city)
      `)
      .single()

    if (error) {
      console.error('Error updating hotel staff:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update hotel staff' },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Hotel staff not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Hotel staff updated successfully'
    })

  } catch (error) {
    console.error('Error in hotel staff PUT:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete hotel staff
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient()
    const { id } = await params

    const { error } = await supabase
      .from('hotel_staff')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting hotel staff:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to delete hotel staff' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Hotel staff deleted successfully'
    })

  } catch (error) {
    console.error('Error in hotel staff DELETE:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}