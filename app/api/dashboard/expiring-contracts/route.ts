// GET /api/dashboard/expiring-contracts — the supplier agreements that need a
// renewal conversation: valid_to within the warning horizon (60 days) or
// lapsed within the last 30. Session client throughout: RLS scopes this to
// the operator's tenant. Loads on its own so a slow scan never holds up the
// dashboard numbers.

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import {
  CONTRACT_EXPIRING_DAYS,
  contractStatus,
  contractsExpiryWindow,
  daysUntil,
} from '@/lib/supplier-contracts'

export const dynamic = 'force-dynamic'

const LIMIT = 25

export async function GET() {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const supabase = auth.supabase!

    const today = new Date().toISOString().slice(0, 10)
    const { from, to } = contractsExpiryWindow(today)

    const { data, error } = await supabase
      .from('supplier_contracts')
      .select('id, supplier_id, property_id, title, document_type, valid_from, valid_to, supplier:suppliers(id, name, type), property:supplier_properties(id, name)')
      .not('valid_to', 'is', null)
      .gte('valid_to', from)
      .lte('valid_to', to)
      .order('valid_to', { ascending: true })
      .limit(LIMIT)
    if (error) {
      // 42P01 = table absent: migration 332 not applied. A quiet panel.
      if (error.code === '42P01') return NextResponse.json({ success: true, data: { items: [], today, horizonDays: CONTRACT_EXPIRING_DAYS } })
      throw error
    }

    const items = (data ?? []).map(row => {
      const supplier = Array.isArray(row.supplier) ? row.supplier[0] : row.supplier
      const property = Array.isArray(row.property) ? row.property[0] : row.property
      return {
        id: row.id,
        title: row.title,
        documentType: row.document_type,
        validTo: row.valid_to as string,
        daysLeft: daysUntil(today, row.valid_to as string),
        status: contractStatus(row.valid_from, row.valid_to, today),
        supplier: supplier ? { id: supplier.id, name: supplier.name, type: supplier.type } : null,
        property: property ? { id: property.id, name: property.name } : null,
        href: `/suppliers?supplier=${row.supplier_id}&tab=documents`,
      }
    })

    return NextResponse.json({ success: true, data: { items, today, horizonDays: CONTRACT_EXPIRING_DAYS } })
  } catch (err) {
    console.error('expiring-contracts error:', err)
    return NextResponse.json({ success: false, error: 'Failed to load contracts' }, { status: 500 })
  }
}
