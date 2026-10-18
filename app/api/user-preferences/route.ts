import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_MARGIN_PERCENT } from '@/lib/ai/parsing-utils'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function createClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching preferences:', error)
      throw error
    }

    // The company's currency is the default for anyone who has not chosen
    // their own — EUR was, so a USD or EGP company's first quotes came out in
    // euros unless every person changed it.
    const companyCurrency = await companyCurrencyFor(supabase)
    const preferences = data
      ? { ...data, default_currency: data.default_currency || companyCurrency }
      : {
          default_cost_mode: 'auto',
          default_tier: 'standard',
          default_margin_percent: 25,
          default_currency: companyCurrency,
        }

    return NextResponse.json({
      success: true,
      data: preferences
    })
  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const prefData = {
      user_id: user.id,
      default_cost_mode: body.default_cost_mode || 'auto',
      default_tier: body.default_tier || 'standard',
      // `??`, not `|| 25`: a user who chooses a 0% (at-cost) margin had 25
      // written to their profile instead. See lib/pricing/resolve-margin.ts.
      default_margin_percent: body.default_margin_percent ?? DEFAULT_MARGIN_PERCENT,
      default_currency: body.default_currency || await companyCurrencyFor(supabase),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('user_preferences')
      .upsert(prefData, { 
        onConflict: 'user_id',
        ignoreDuplicates: false 
      })
      .select()
      .single()

    if (error) {
      console.error('Error saving preferences:', error)
      throw error
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
/** The current company's currency (tenants.default_currency), else EUR. */
async function companyCurrencyFor(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  try {
    const { data: tenantId } = await supabase.rpc('get_user_tenant_id')
    if (!tenantId) return 'EUR'
    const { data } = await supabase.from('tenants').select('default_currency').eq('id', tenantId as string).maybeSingle()
    return (data as { default_currency?: string | null } | null)?.default_currency || 'EUR'
  } catch {
    return 'EUR'
  }
}
