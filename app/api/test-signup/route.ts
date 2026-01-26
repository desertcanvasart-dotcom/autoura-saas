import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  // Create server-side Supabase client (not browser client)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )
  const body = await request.json()

  const testEmail = `test-${Date.now()}@gmail.com`  // Use realistic domain
  const testPassword = 'TestPassword123!'
  const testName = 'Test User'
  const testCompany = 'Test Company'

  console.log('🧪 Testing signup with:', testEmail)

  try {
    // Step 1: Test Supabase connection
    console.log('[1/5] Testing Supabase connection...')
    const { data: connectionTest, error: connectionError } = await supabase
      .from('tenants')
      .select('count', { count: 'exact', head: true })

    if (connectionError) {
      return NextResponse.json({
        success: false,
        step: 1,
        error: 'Connection test failed',
        details: connectionError.message
      }, { status: 500 })
    }
    console.log('✅ Connection OK')

    // Step 2: Test signup
    console.log('[2/5] Testing auth.signUp()...')
    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: {
          full_name: testName,
          company_name: testCompany,
        },
      },
    })

    if (signupError) {
      return NextResponse.json({
        success: false,
        step: 2,
        error: 'Signup failed',
        details: signupError.message,
        code: signupError.code,
        status: signupError.status
      }, { status: 500 })
    }
    console.log('✅ Signup OK, user ID:', signupData.user?.id)

    // Step 3: Check if tenant was created
    console.log('[3/5] Checking if tenant was created...')
    const { data: tenants, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('contact_email', testEmail)

    if (tenantError) {
      return NextResponse.json({
        success: false,
        step: 3,
        error: 'Failed to query tenants',
        details: tenantError.message
      }, { status: 500 })
    }
    console.log('✅ Tenant check:', tenants?.length ? 'Created' : 'NOT created')

    // Step 4: Check if tenant_members was created
    console.log('[4/5] Checking if tenant_members was created...')
    const { data: members, error: membersError } = await supabase
      .from('tenant_members')
      .select('*')
      .eq('user_id', signupData.user?.id)

    if (membersError) {
      return NextResponse.json({
        success: false,
        step: 4,
        error: 'Failed to query tenant_members',
        details: membersError.message
      }, { status: 500 })
    }
    console.log('✅ Tenant members check:', members?.length ? 'Created' : 'NOT created')

    // Step 5: Check if user_profiles was created
    console.log('[5/5] Checking if user_profiles was created...')
    const { data: profiles, error: profilesError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', signupData.user?.id)

    if (profilesError) {
      return NextResponse.json({
        success: false,
        step: 5,
        error: 'Failed to query user_profiles',
        details: profilesError.message
      }, { status: 500 })
    }
    console.log('✅ User profiles check:', profiles?.length ? 'Created' : 'NOT created')

    // Success!
    return NextResponse.json({
      success: true,
      message: 'All checks passed!',
      data: {
        user_id: signupData.user?.id,
        email: testEmail,
        tenant_created: tenants?.length ? true : false,
        tenant_id: tenants?.[0]?.id,
        member_created: members?.length ? true : false,
        profile_created: profiles?.length ? true : false,
      }
    })

  } catch (error: any) {
    console.error('❌ Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Unexpected error',
      details: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}
