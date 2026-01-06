// ============================================
// API Route: /api/guides/[id]
// ============================================
// Handles single guide operations
// GET: Get guide details
// PUT: Update guide
// DELETE: Delete guide
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient()
    const { id } = await params
    
    const { data: guide, error } = await supabase
      .from('guides')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error || !guide) {
      return NextResponse.json(
        { success: false, error: 'Guide not found' },
        { status: 404 }
      )
    }
    
    // Get associated bookings
    const { data: bookings } = await supabase
      .from('itineraries')
      .select('id, itinerary_code, client_name, start_date, end_date, total_cost')
      .eq('assigned_guide_id', id)
      .order('start_date', { ascending: true })
    
    return NextResponse.json({
      success: true,
      data: {
        ...guide,
        bookings: bookings || [],
      },
    })
    
  } catch (error) {
    console.error('Error in guide GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient()
    const { id } = await params
    const body = await request.json()
    
    console.log('🔵 Updating guide:', { id, body }) // Debug log
    
    // Prepare update data (only include provided fields)
    const updateData: any = {}
    
    if (body.name !== undefined) updateData.name = body.name
    if (body.email !== undefined) updateData.email = body.email
    if (body.phone !== undefined) updateData.phone = body.phone
    if (body.languages !== undefined) updateData.languages = body.languages
    if (body.specialties !== undefined) updateData.specialties = body.specialties
    if (body.certification_number !== undefined) updateData.certification_number = body.certification_number
    
    // ⭐ FIX: Convert empty string to null for date fields
    if (body.license_expiry !== undefined) {
      updateData.license_expiry = body.license_expiry === '' ? null : body.license_expiry
    }
    
    if (body.is_active !== undefined) updateData.is_active = body.is_active
    if (body.max_group_size !== undefined) updateData.max_group_size = body.max_group_size
    if (body.hourly_rate !== undefined) updateData.hourly_rate = body.hourly_rate
    if (body.daily_rate !== undefined) updateData.daily_rate = body.daily_rate
    if (body.emergency_contact_name !== undefined) updateData.emergency_contact_name = body.emergency_contact_name
    if (body.emergency_contact_phone !== undefined) updateData.emergency_contact_phone = body.emergency_contact_phone
    if (body.address !== undefined) updateData.address = body.address
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.profile_photo_url !== undefined) updateData.profile_photo_url = body.profile_photo_url
    
    console.log('🔵 Update data prepared:', updateData) // Debug log
    
    // Update in database
    const { data, error } = await supabase
      .from('guides')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      console.error('❌ Supabase error updating guide:', error)
      
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'A guide with this email already exists' },
          { status: 409 }
        )
      }
      
      return NextResponse.json(
        { success: false, error: 'Failed to update guide', details: error.message },
        { status: 500 }
      )
    }
    
    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Guide not found' },
        { status: 404 }
      )
    }
    
    console.log('✅ Guide updated successfully:', data.id) // Debug log
    
    return NextResponse.json({
      success: true,
      data: data,
      message: 'Guide updated successfully',
    })
    
  } catch (error) {
    console.error('❌ Error in guide PUT:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient()
    const { id } = await params
    
    // Check if guide has any assigned bookings
    const { data: bookings, error: bookingsError } = await supabase
      .from('itineraries')
      .select('id')
      .eq('assigned_guide_id', id)
      .limit(1)
    
    if (bookingsError) {
      return NextResponse.json(
        { success: false, error: 'Failed to check guide assignments' },
        { status: 500 }
      )
    }
    
    // If guide has bookings, don't allow deletion (or unassign first)
    if (bookings && bookings.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Cannot delete guide with assigned bookings. Please unassign bookings first or set guide to inactive.' 
        },
        { status: 409 }
      )
    }
    
    // Delete guide
    const { error } = await supabase
      .from('guides')
      .delete()
      .eq('id', id)
    
    if (error) {
      console.error('Error deleting guide:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to delete guide' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: 'Guide deleted successfully',
    })
    
  } catch (error) {
    console.error('Error in guide DELETE:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}