// app/api/expenses/route.ts
// ============================================
// AUTOURA - EXPENSES API
// ============================================
// Manages business expenses
// Multi-tenancy: Enforces tenant isolation via RLS
// Security: Requires authentication for all operations
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

/**
 * GET /api/expenses
 * List expenses for authenticated user's tenant
 * Query params: status, category, supplierType, itineraryId, startDate, endDate
 * RLS policies automatically filter by tenant_id
 */
export async function GET(request: NextRequest) {
  try {
    // Use authenticated client - RLS automatically filters by tenant
    const supabase = await createAuthenticatedClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const category = searchParams.get('category')
    const supplierType = searchParams.get('supplierType')
    const itineraryId = searchParams.get('itineraryId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    let query = supabase
      .from('expenses')
      .select('*')
      .order('expense_date', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    if (category) {
      query = query.eq('category', category)
    }

    if (supplierType) {
      query = query.eq('supplier_type', supplierType)
    }

    if (itineraryId) {
      query = query.eq('itinerary_id', itineraryId)
    }

    if (startDate) {
      query = query.gte('expense_date', startDate)
    }

    if (endDate) {
      query = query.lte('expense_date', endDate)
    }

    const { data, error } = await query

    if (error) {
      console.error('❌ Error fetching expenses:', error)
      return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('❌ Error in expenses GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/expenses
 * Create a new expense record
 * Requires authentication and validates tenant ownership
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    const body = await request.json()

    // Validate required fields
    if (!body.category || !body.amount || !body.expense_date) {
      return NextResponse.json(
        { error: 'Category, amount, and expense date are required' },
        { status: 400 }
      )
    }

    // If itinerary_id provided, verify it belongs to this tenant
    if (body.itinerary_id) {
      const { data: itinerary, error: itineraryError } = await supabase
        .from('itineraries')
        .select('id, tenant_id')
        .eq('id', body.itinerary_id)
        .single()

      if (itineraryError || !itinerary) {
        return NextResponse.json(
          { error: 'Itinerary not found or access denied' },
          { status: 404 }
        )
      }

      if (itinerary.tenant_id !== tenant_id) {
        return NextResponse.json(
          { error: 'Cannot create expense for itinerary from another tenant' },
          { status: 403 }
        )
      }
    }

    // Generate expense number
    const { data: seqData, error: seqError } = await supabase
      .rpc('nextval', { seq_name: 'expense_number_seq' })

    let expenseNumber = `EXP-${new Date().getFullYear()}-001`

    if (!seqError && seqData) {
      expenseNumber = `EXP-${new Date().getFullYear()}-${String(seqData).padStart(3, '0')}`
    } else {
      // Fallback: count expenses in THIS TENANT only (RLS filters automatically)
      const { count } = await supabase
        .from('expenses')
        .select('*', { count: 'exact', head: true })

      expenseNumber = `EXP-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(3, '0')}`
    }

    const newExpense = {
      tenant_id, // ✅ Explicit tenant_id
      expense_number: expenseNumber,
      itinerary_id: body.itinerary_id || null,
      supplier_id: body.supplier_id || null,
      category: body.category,
      description: body.description || null,
      amount: body.amount,
      currency: body.currency || 'EUR',
      expense_date: body.expense_date,
      supplier_name: body.supplier_name || null,
      supplier_type: body.supplier_type || null,
      receipt_url: body.receipt_url || null,
      receipt_filename: body.receipt_filename || null,
      status: body.status || 'pending',
      payment_method: body.payment_method || null,
      payment_date: body.payment_date || null,
      payment_reference: body.payment_reference || null,
      notes: body.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('expenses')
      .insert([newExpense])
      .select()
      .single()

    if (error) {
      console.error('❌ Error creating expense:', error)
      return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('❌ Error in expenses POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
