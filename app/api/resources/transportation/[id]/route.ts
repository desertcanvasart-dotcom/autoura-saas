import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { saveRoute } from '../route'


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { id } = await params

    const { data, error } = await (createAdminClient() as any)
      .from('transportation_rates')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)
      .single()

    if (error) {
      console.error('Error fetching transportation rate:', error)
      return NextResponse.json({ error: 'Transportation rate not found' }, { status: 404 })
    }

    const transformedData = { ...data, base_rate_non: data.base_rate_non_eur }

    return NextResponse.json(transformedData)
  } catch (error) {
    console.error('Error in transportation rate GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT — save the route this row belongs to. The page sends the whole route
// (every vehicle) plus existing_ids (the route's current rows); the id in the
// URL is one of them. See saveRoute in ../route.ts.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { id } = await params
    const body = await request.json()
    const existingIds = Array.isArray(body.existing_ids) && body.existing_ids.length ? body.existing_ids.map(String) : [id]
    const { status, json } = await saveRoute(authResult.tenant_id!, body, existingIds)
    return NextResponse.json(json, { status })
  } catch (error) {
    console.error('Error in transportation rate PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { id } = await params

    const { error } = await createAdminClient()
      .from('transportation_rates')
      .delete()
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)

    if (error) {
      console.error('Error deleting transportation rate:', error)
      return NextResponse.json(
        { error: `Failed to delete transportation rate: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in transportation rate DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}