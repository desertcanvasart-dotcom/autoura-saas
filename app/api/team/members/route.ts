import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    console.log('📋 Fetching team members...')

    const authResult = await requireAuth()
    if (authResult.error) {
      console.error('❌ Auth failed:', authResult.error)
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { tenant_id, user } = authResult
    console.log('✅ Auth successful:', { tenant_id, user_id: user?.id })

    const adminClient = createAdminClient()

    // Fetch team members with user details
    // Note: auth.users is in a different schema, so we use the auth schema explicitly
    const { data: members, error } = await adminClient
      .from('tenant_members')
      .select(`
        id,
        tenant_id,
        user_id,
        role,
        status,
        invited_at,
        joined_at,
        created_at,
        updated_at
      `)
      .eq('tenant_id', tenant_id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Error fetching team members:', {
        error,
        code: error.code,
        message: error.message,
        details: error.details
      })
      return NextResponse.json(
        { success: false, error: `Failed to fetch team members: ${error.message}` },
        { status: 500 }
      )
    }

    // Fetch user emails separately from auth.users
    const userIds = members?.map(m => m.user_id).filter(Boolean) || []
    const { data: users } = await adminClient.auth.admin.listUsers()

    // Create a map of user_id -> email
    const userEmailMap = new Map(
      users.users.map(u => [u.id, u.email])
    )

    // Combine the data
    const membersWithEmails = members?.map(member => ({
      ...member,
      users: {
        email: userEmailMap.get(member.user_id) || 'Unknown'
      }
    }))

    console.log(`✅ Found ${membersWithEmails?.length || 0} team members`)

    return NextResponse.json({
      success: true,
      data: membersWithEmails
    })
  } catch (error: any) {
    console.error('❌ Error in team members GET:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
