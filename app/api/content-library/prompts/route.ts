import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

const VALID_PURPOSES = [
  'itinerary_full', 'day_description', 'site_description',
  'transfer', 'email', 'summary', 'whatsapp'
]

// GET - List prompt templates
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ error: 'Auth failed' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const purpose = searchParams.get('purpose')
    const activeOnly = searchParams.get('active_only') !== 'false'
    const defaultOnly = searchParams.get('default_only') === 'true'

    let query = supabase
      .from('prompt_templates')
      .select('*')
      .order('purpose', { ascending: true })
      .order('name', { ascending: true })

    if (activeOnly) query = query.eq('is_active', true)
    if (purpose && VALID_PURPOSES.includes(purpose)) query = query.eq('purpose', purpose)
    if (defaultOnly) query = query.eq('is_default', true)

    const { data, error } = await query
    if (error) {
      // Table may not exist yet
      console.error('Error fetching prompt templates:', error)
      return NextResponse.json([])
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Prompts GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new prompt template
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    const { supabase, tenant_id, user } = authResult
    if (!supabase || !user) return NextResponse.json({ error: 'Auth failed' }, { status: 401 })

    const body = await request.json()
    const { name, purpose, description, system_prompt, user_prompt_template, variables, model, temperature, max_tokens, is_default } = body

    if (!name || !purpose || !user_prompt_template) {
      return NextResponse.json({ error: 'name, purpose, and user_prompt_template are required' }, { status: 400 })
    }
    if (!VALID_PURPOSES.includes(purpose)) {
      return NextResponse.json({ error: `Invalid purpose. Must be one of: ${VALID_PURPOSES.join(', ')}` }, { status: 400 })
    }

    const finalTemperature = temperature ?? 0.7
    if (finalTemperature < 0 || finalTemperature > 2) {
      return NextResponse.json({ error: 'Temperature must be between 0 and 2' }, { status: 400 })
    }

    // If setting as default, unset other defaults for this purpose
    if (is_default) {
      await supabase.from('prompt_templates').update({ is_default: false }).eq('purpose', purpose).eq('is_default', true)
    }

    // Extract variables from template if not provided
    let finalVariables = variables
    if (!finalVariables) {
      const matches = user_prompt_template.match(/\{\{(\w+)\}\}/g)
      finalVariables = matches ? [...new Set(matches.map((m: string) => m.replace(/\{\{|\}\}/g, '')))] : []
    }

    const { data, error } = await supabase
      .from('prompt_templates')
      .insert({
        tenant_id,
        name,
        purpose,
        description: description || null,
        system_prompt: system_prompt || null,
        user_prompt_template,
        variables: finalVariables,
        model: model || 'claude-sonnet-4-20250514',
        temperature: finalTemperature,
        max_tokens: max_tokens || 2000,
        is_default: is_default || false,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating prompt template:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Prompts POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Update prompt template
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ error: 'Auth failed' }, { status: 401 })

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    if (updates.purpose && !VALID_PURPOSES.includes(updates.purpose)) {
      return NextResponse.json({ error: `Invalid purpose` }, { status: 400 })
    }
    if (updates.temperature !== undefined && (updates.temperature < 0 || updates.temperature > 2)) {
      return NextResponse.json({ error: 'Temperature must be between 0 and 2' }, { status: 400 })
    }

    if (updates.is_default === true) {
      const { data: current } = await supabase.from('prompt_templates').select('purpose').eq('id', id).single()
      if (current) {
        await supabase.from('prompt_templates').update({ is_default: false }).eq('purpose', updates.purpose || current.purpose).eq('is_default', true).neq('id', id)
      }
    }

    delete updates.created_at
    delete updates.created_by
    delete updates.tenant_id

    if (updates.system_prompt || updates.user_prompt_template) {
      const { data: current } = await supabase.from('prompt_templates').select('version').eq('id', id).single()
      if (current) updates.version = (current.version || 0) + 1
    }

    const { data, error } = await supabase.from('prompt_templates').update(updates).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete prompt template
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ error: 'Auth failed' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })

    const { data: template } = await supabase.from('prompt_templates').select('is_default').eq('id', id).single()
    if (template?.is_default) {
      return NextResponse.json({ error: 'Cannot delete default template. Set another as default first.' }, { status: 400 })
    }

    const { error } = await supabase.from('prompt_templates').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
