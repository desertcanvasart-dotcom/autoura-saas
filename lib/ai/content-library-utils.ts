// =====================================================
// AI CONTENT LIBRARY UTILITIES
// =====================================================
// 📁 COPY TO: lib/ai/content-library-utils.ts
// =====================================================
// 
// These utilities fetch content and rules from your
// custom library and format them for AI generation.
// =====================================================

import { createClient } from '@/app/supabase'
import type {
  ContentLibraryItem,
  ContentVariation,
  WritingRule,
  PromptTemplate,
  Tier,
  PromptPurpose,
  ContentForGeneration,
  WritingRulesForGeneration
} from '@/types/content-library'

// =====================================================
// CONTENT FETCHING
// =====================================================

/**
 * Fetch content items by IDs with a specific tier variation
 */
export async function fetchContentByIds(
  ids: string[],
  tier: Tier
): Promise<ContentForGeneration[]> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('content_library')
    .select(`
      id,
      name,
      category:content_categories(name),
      variations:content_variations(*)
    `)
    .in('id', ids)
    .eq('is_active', true)

  if (error || !data) {
    console.error('Error fetching content:', error)
    return []
  }

  return data
  .map((item: any) => {
      const variation = item.variations?.find(
        (v: ContentVariation) => v.tier === tier && v.is_active
      )
      
      if (!variation) return null
      
      return {
        id: item.id,
        name: item.name,
        tier,
        description: variation.description,
        highlights: variation.highlights || [],
        category: item.category?.name || 'Unknown'
      }
    })
    .filter((item): item is ContentForGeneration => item !== null)
}

/**
 * Fetch content items by tags with a specific tier variation
 */
export async function fetchContentByTags(
  tags: string[],
  tier: Tier,
  categorySlug?: string
): Promise<ContentForGeneration[]> {
  const supabase = createClient()
  
  let query = supabase
    .from('content_library')
    .select(`
      id,
      name,
      tags,
      category:content_categories(id, name, slug),
      variations:content_variations(*)
    `)
    .overlaps('tags', tags)
    .eq('is_active', true)

  if (categorySlug) {
    // Filter by category in the application layer since we need the slug
    const { data } = await query
    
    if (!data) return []
    
    const filtered = data.filter(item => item.category?.slug === categorySlug)
    
    return filtered
      .map(item => {
        const variation = item.variations?.find(
          (v: ContentVariation) => v.tier === tier && v.is_active
        )
        
        if (!variation) return null
        
        return {
          id: item.id,
          name: item.name,
          tier,
          description: variation.description,
          highlights: variation.highlights || [],
          category: item.category?.name || 'Unknown'
        }
      })
      .filter((item): item is ContentForGeneration => item !== null)
  }

  const { data, error } = await query

  if (error || !data) {
    console.error('Error fetching content by tags:', error)
    return []
  }

  return data
    .map(item => {
      const variation = item.variations?.find(
        (v: ContentVariation) => v.tier === tier && v.is_active
      )
      
      if (!variation) return null
      
      return {
        id: item.id,
        name: item.name,
        tier,
        description: variation.description,
        highlights: variation.highlights || [],
        category: item.category?.name || 'Unknown'
      }
    })
    .filter((item): item is ContentForGeneration => item !== null)
}

/**
 * Fetch content by category with a specific tier
 */
export async function fetchContentByCategory(
  categorySlug: string,
  tier: Tier
): Promise<ContentForGeneration[]> {
  const supabase = createClient()
  
  // First get category ID
  const { data: category } = await supabase
    .from('content_categories')
    .select('id, name')
    .eq('slug', categorySlug)
    .single()

  if (!category) return []

  const { data, error } = await supabase
    .from('content_library')
    .select(`
      id,
      name,
      variations:content_variations(*)
    `)
    .eq('category_id', category.id)
    .eq('is_active', true)

  if (error || !data) {
    console.error('Error fetching content by category:', error)
    return []
  }

  return data
    .map(item => {
      const variation = item.variations?.find(
        (v: ContentVariation) => v.tier === tier && v.is_active
      )
      
      if (!variation) return null
      
      return {
        id: item.id,
        name: item.name,
        tier,
        description: variation.description,
        highlights: variation.highlights || [],
        category: category.name
      }
    })
    .filter((item): item is ContentForGeneration => item !== null)
}

/**
 * Search content by name/description
 */
export async function searchContent(
  searchTerm: string,
  tier: Tier,
  limit: number = 10
): Promise<ContentForGeneration[]> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('content_library')
    .select(`
      id,
      name,
      category:content_categories(name),
      variations:content_variations(*)
    `)
    .or(`name.ilike.%${searchTerm}%,short_description.ilike.%${searchTerm}%`)
    .eq('is_active', true)
    .limit(limit)

  if (error || !data) {
    console.error('Error searching content:', error)
    return []
  }

  return data
    .map(item => {
      const variation = item.variations?.find(
        (v: ContentVariation) => v.tier === tier && v.is_active
      )
      
      if (!variation) return null
      
      return {
        id: item.id,
        name: item.name,
        tier,
        description: variation.description,
        highlights: variation.highlights || [],
        category: item.category?.name || 'Unknown'
      }
    })
    .filter((item): item is ContentForGeneration => item !== null)
}

// =====================================================
// WRITING RULES
// =====================================================

/**
 * Fetch active writing rules for a specific context
 */
export async function fetchWritingRules(
  appliesTo: 'itinerary' | 'email' | 'whatsapp' | 'all' = 'all',
  minPriority: number = 1
): Promise<WritingRulesForGeneration> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('writing_rules')
    .select('*')
    .eq('is_active', true)
    .gte('priority', minPriority)
    .order('priority', { ascending: false })

  if (error || !data) {
    console.error('Error fetching writing rules:', error)
    return { enforce: [], prefer: [], avoid: [] }
  }

  // Filter by applies_to
  const filtered = data.filter(rule => 
    rule.applies_to.includes('all') || rule.applies_to.includes(appliesTo)
  )

  return {
    enforce: filtered
      .filter(r => r.rule_type === 'enforce')
      .map(r => `${r.name}: ${r.description}`),
    prefer: filtered
      .filter(r => r.rule_type === 'prefer')
      .map(r => `${r.name}: ${r.description}`),
    avoid: filtered
      .filter(r => r.rule_type === 'avoid')
      .map(r => `${r.name}: ${r.description}`)
  }
}

/**
 * Fetch writing rules with examples (for training/documentation)
 */
export async function fetchWritingRulesWithExamples(): Promise<WritingRule[]> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('writing_rules')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: false })

  if (error) {
    console.error('Error fetching writing rules:', error)
    return []
  }

  return data || []
}

// =====================================================
// PROMPT TEMPLATES
// =====================================================

/**
 * Fetch default prompt template for a purpose
 */
export async function fetchDefaultPrompt(
  purpose: PromptPurpose
): Promise<PromptTemplate | null> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('prompt_templates')
    .select('*')
    .eq('purpose', purpose)
    .eq('is_active', true)
    .eq('is_default', true)
    .single()

  if (error) {
    // Fall back to any active template for this purpose
    const { data: fallback } = await supabase
      .from('prompt_templates')
      .select('*')
      .eq('purpose', purpose)
      .eq('is_active', true)
      .limit(1)
      .single()

    return fallback || null
  }

  return data
}

/**
 * Fetch prompt template by ID
 */
export async function fetchPromptById(id: string): Promise<PromptTemplate | null> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('prompt_templates')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching prompt template:', error)
    return null
  }

  return data
}

// =====================================================
// PROMPT BUILDING
// =====================================================

/**
 * Format content array for inclusion in prompt
 */
export function formatContentForPrompt(content: ContentForGeneration[]): string {
  if (content.length === 0) return 'No specific content provided.'
  
  return content.map(c => `
### ${c.name} (${c.tier.toUpperCase()})
**Category:** ${c.category}

${c.description}
${c.highlights.length > 0 ? `\n**Key Highlights:** ${c.highlights.join(' • ')}` : ''}
`).join('\n---\n')
}

/**
 * Format writing rules for inclusion in prompt
 */
export function formatRulesForPrompt(rules: WritingRulesForGeneration): string {
  let output = ''
  
  if (rules.enforce.length > 0) {
    output += `\n## MUST FOLLOW (Critical Rules):\n${rules.enforce.map(r => `• ${r}`).join('\n')}`
  }
  
  if (rules.prefer.length > 0) {
    output += `\n\n## PREFERRED (Best Practices):\n${rules.prefer.map(r => `• ${r}`).join('\n')}`
  }
  
  if (rules.avoid.length > 0) {
    output += `\n\n## AVOID (Never Do):\n${rules.avoid.map(r => `• ${r}`).join('\n')}`
  }
  
  return output || 'No specific writing rules provided.'
}

/**
 * Replace variables in prompt template
 */
export function replacePromptVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template
  
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
    result = result.replace(regex, value)
  })
  
  // Warn about unreplaced variables
  const unreplaced = result.match(/\{\{\w+\}\}/g)
  if (unreplaced) {
    console.warn('Unreplaced variables in prompt:', unreplaced)
  }
  
  return result
}

/**
 * Build complete prompt with content and rules
 */
export async function buildGenerationPrompt(options: {
  purpose: PromptPurpose
  tier: Tier
  contentIds?: string[]
  contentTags?: string[]
  variables: Record<string, string>
  promptId?: string
}): Promise<{
  systemPrompt: string
  userPrompt: string
  model: string
  temperature: number
  maxTokens: number
  contentUsed: string[]
  rulesApplied: number
} | null> {
  const { purpose, tier, contentIds, contentTags, variables, promptId } = options
  
  // 1. Fetch prompt template
  const prompt = promptId 
    ? await fetchPromptById(promptId)
    : await fetchDefaultPrompt(purpose)
  
  if (!prompt) {
    console.error(`No prompt template found for purpose: ${purpose}`)
    return null
  }
  
  // 2. Fetch content
  let content: ContentForGeneration[] = []
  
  if (contentIds && contentIds.length > 0) {
    content = await fetchContentByIds(contentIds, tier)
  } else if (contentTags && contentTags.length > 0) {
    content = await fetchContentByTags(contentTags, tier)
  }
  
  // 3. Fetch writing rules
  const appliesTo = purpose.includes('email') ? 'email' 
    : purpose.includes('whatsapp') ? 'whatsapp' 
    : 'itinerary'
  const rules = await fetchWritingRules(appliesTo)
  
  // 4. Build variables object
  const allVariables: Record<string, string> = {
    ...variables,
    tier,
    content_references: formatContentForPrompt(content),
    writing_rules: formatRulesForPrompt(rules)
  }
  
  // 5. Replace variables in prompts
  const systemPrompt = prompt.system_prompt 
    ? replacePromptVariables(prompt.system_prompt, allVariables)
    : ''
  const userPrompt = replacePromptVariables(prompt.user_prompt_template, allVariables)
  
  return {
    systemPrompt,
    userPrompt,
    model: prompt.model,
    temperature: Number(prompt.temperature),
    maxTokens: prompt.max_tokens,
    contentUsed: content.map(c => c.id),
    rulesApplied: rules.enforce.length + rules.prefer.length + rules.avoid.length
  }
}

// =====================================================
// USAGE LOGGING
// =====================================================

/**
 * Log content usage for analytics
 */
export async function logContentUsage(
  contentIds: string[],
  variationTier: Tier,
  itineraryId?: string,
  context: string = 'itinerary_generation'
): Promise<void> {
  const supabase = createClient()
  
  // Get variation IDs
  const { data: variations } = await supabase
    .from('content_variations')
    .select('id, content_id')
    .in('content_id', contentIds)
    .eq('tier', variationTier)

  if (!variations) return

  const logs = variations.map(v => ({
    content_id: v.content_id,
    variation_id: v.id,
    itinerary_id: itineraryId || null,
    context
  }))

  await supabase
    .from('content_usage_log')
    .insert(logs)
}