// app/api/expenses/route.ts
// ============================================
// AUTOURA - EXPENSES API
// ============================================
// Manages business expenses
// Multi-tenancy: Enforces tenant isolation via RLS
// Security: Requires authentication for all operations
// ============================================

import { gateRole, roleDenied } from '@/lib/api-role-gate'
import { fetchAllPages } from '@/lib/db/fetch-all-pages'
import { checkExpenseFields } from '@/lib/expenses/expense-fields'
import { EXPENSE_STATUSES, expenseStatusUpdate } from '@/lib/expense-status'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'
import { nextDocumentNumber, insertWithUniqueRetry } from '@/lib/document-numbering'

/**
 * GET /api/expenses
 * List expenses for authenticated user's tenant
 * Query params: status, category, supplierType, itineraryId, startDate, endDate
 * RLS policies automatically filter by tenant_id
 */
export async function GET(request: NextRequest) {
  // Viewers read nothing here and change nothing; deletes and the
  // finance-only areas are for managers and admins (lib/api-role-gate).
  const roleGate = await gateRole('staff')
  if (roleGate) return roleGate

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

    // Every matching expense, a page at a time — one read stopped at 1000
    // rows and the totals on the page were worked out from the cut list.
    const { data, error } = await fetchAllPages<Record<string, unknown>>((from, to) => {
      let query = supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false })
        .order('id', { ascending: true })
      if (status) query = query.eq('status', status)
      if (category) query = query.eq('category', category)
      if (supplierType) query = query.eq('supplier_type', supplierType)
      if (itineraryId) query = query.eq('itinerary_id', itineraryId)
      if (startDate) query = query.gte('expense_date', startDate)
      if (endDate) query = query.lte('expense_date', endDate)
      return query.range(from, to)
    })

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
  // Viewers read nothing here and change nothing; deletes and the
  // finance-only areas are for managers and admins (lib/api-role-gate).
  const roleGate = await gateRole('staff')
  if (roleGate) return roleGate

  try {
    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { error: authResult.error },
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
    const body = await request.json()

    // Validate required fields
    if (!body.category || body.amount === undefined || body.amount === '' || !body.expense_date) {
      return NextResponse.json(
        { error: 'Category, amount, and expense date are required' },
        { status: 400 }
      )
    }
    const checked: Record<string, unknown> = {
      amount: body.amount,
      currency: body.currency || null,
      expense_date: body.expense_date,
      payment_date: body.payment_date || null,
      receipt_url: typeof body.receipt_url === 'string' && body.receipt_url.trim() ? body.receipt_url.trim() : null,
    }
    const bad = checkExpenseFields(checked)
    if (bad) return NextResponse.json({ error: bad }, { status: 400 })

    // A new expense may start approved or paid — a manager's call — and
    // goes through the same status rule as an edit, so "Paid" gets its
    // payment date (it was stored with none, and Payables missed it).
    const statusUpdate = expenseStatusUpdate(body.status || 'pending', body.payment_date || undefined)
    if (!statusUpdate) {
      return NextResponse.json({ error: `status must be one of: ${EXPENSE_STATUSES.join(', ')}` }, { status: 400 })
    }
    if (statusUpdate.status !== 'pending' && roleDenied(authResult.role, 'manage')) {
      return roleDenied(authResult.role, 'manage')!
    }
    // The agency's currency when none is picked (it was always EUR).
    let currency = checked.currency as string | null
    if (!currency) {
      const { data: t } = await supabase.from('tenants').select('default_currency').eq('id', tenant_id).maybeSingle()
      currency = (t as { default_currency?: string | null } | null)?.default_currency || 'EUR'
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

    // A picked supplier must be one of this agency's (RLS scopes the read).
    if (body.supplier_id) {
      const { data: supplier } = await supabase
        .from('suppliers')
        .select('id')
        .eq('id', body.supplier_id)
        .maybeSingle()
      if (!supplier) {
        return NextResponse.json({ error: 'Supplier not found or access denied' }, { status: 404 })
      }
    }

    // Expense number generation goes through nextDocumentNumber + the INSERT
    // is wrapped in insertWithUniqueRetry so a 23505 violation from the new
    // UNIQUE constraint regenerates the number rather than crashing.
    const baseExpense = {
      tenant_id, // ✅ Explicit tenant_id
      itinerary_id: body.itinerary_id || null,
      supplier_id: body.supplier_id || null,
      category: body.category,
      description: body.description || null,
      amount: checked.amount as number,
      currency,
      expense_date: body.expense_date,
      supplier_name: body.supplier_name || null,
      supplier_type: body.supplier_type || null,
      receipt_url: checked.receipt_url as string | null,
      receipt_filename: body.receipt_filename || null,
      payment_method: body.payment_method || null,
      ...statusUpdate,
      payment_reference: body.payment_reference || null,
      notes: body.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await insertWithUniqueRetry({
      generateRow: async () => ({
        ...baseExpense,
        expense_number: await nextDocumentNumber({
          supabase,
          prefix: 'EXP',
          table: 'expenses',
          column: 'expense_number',
        }),
      }),
      insert: async (row) => await supabase.from('expenses').insert([row]).select().single(),
    })

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
