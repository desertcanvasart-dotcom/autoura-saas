import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Lazy-initialized Supabase client (avoids build-time errors when env vars unavailable)
let _supabase: ReturnType<typeof createClient> | null = null

function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabase
}

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId')
  
  if (!userId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 })
  }

  const { data, error } = await (getSupabase() as any)
    .from('email_signatures')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ signatures: data })
}

export async function POST(request: NextRequest) {
  const { userId, name, content, isDefault } = await request.json()

  if (!userId || !name || !content) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // If setting as default, unset other defaults
  if (isDefault) {
    await (getSupabase() as any)
      .from('email_signatures')
      .update({ is_default: false })
      .eq('user_id', userId)
  }

  const { data, error } = await (getSupabase() as any)
    .from('email_signatures')
    .insert({
      user_id: userId,
      name,
      content,
      is_default: isDefault || false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ signature: data })
}

export async function PUT(request: NextRequest) {
  const { id, userId, name, content, isDefault } = await request.json()

  if (!id || !userId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // If setting as default, unset other defaults
  if (isDefault) {
    await (getSupabase() as any)
      .from('email_signatures')
      .update({ is_default: false })
      .eq('user_id', userId)
  }

  const { data, error } = await (getSupabase() as any)
    .from('email_signatures')
    .update({
      name,
      content,
      is_default: isDefault,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ signature: data })
}

export async function DELETE(request: NextRequest) {
  const { id, userId } = await request.json()

  if (!id || !userId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { error } = await getSupabase()
    .from('email_signatures')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}