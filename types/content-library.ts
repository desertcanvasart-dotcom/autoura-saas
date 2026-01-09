// =====================================================
// AUTOURA CONTENT LIBRARY - TYPE DEFINITIONS
// =====================================================
// 📁 COPY TO: types/content-library.ts
// =====================================================

// =====================================================
// ENUMS & CONSTANTS
// =====================================================

export const TIERS = ['budget', 'standard', 'deluxe', 'luxury'] as const
export type Tier = typeof TIERS[number]

export const RULE_CATEGORIES = ['tone', 'vocabulary', 'structure', 'formatting', 'brand'] as const
export type RuleCategory = typeof RULE_CATEGORIES[number]

export const RULE_TYPES = ['enforce', 'prefer', 'avoid'] as const
export type RuleType = typeof RULE_TYPES[number]

export const PROMPT_PURPOSES = [
  'itinerary_full',
  'day_description', 
  'site_description',
  'transfer',
  'email',
  'summary',
  'whatsapp'
] as const
export type PromptPurpose = typeof PROMPT_PURPOSES[number]

export const CONTENT_APPLIES_TO = ['itinerary', 'email', 'whatsapp', 'all'] as const
export type ContentAppliesTo = typeof CONTENT_APPLIES_TO[number]

// =====================================================
// DATABASE TYPES
// =====================================================

export interface ContentCategory {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ContentLibraryItem {
  id: string
  category_id: string
  name: string
  slug: string
  short_description: string | null
  location: string | null
  duration: string | null
  tags: string[]
  metadata: Record<string, unknown>
  is_active: boolean
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  // Joined data
  category?: ContentCategory
  variations?: ContentVariation[]
  variation_count?: number
}

export interface ContentVariation {
  id: string
  content_id: string
  tier: Tier
  title: string | null
  description: string
  highlights: string[]
  inclusions: string[]
  internal_notes: string | null
  is_active: boolean
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface WritingRule {
  id: string
  name: string
  category: RuleCategory
  rule_type: RuleType
  description: string
  examples: {
    good?: string[]
    bad?: string[]
    budget?: string
    standard?: string
    deluxe?: string
    luxury?: string
  }
  priority: number
  applies_to: ContentAppliesTo[]
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PromptTemplate {
  id: string
  name: string
  purpose: PromptPurpose
  description: string | null
  system_prompt: string | null
  user_prompt_template: string
  variables: string[]
  model: string
  temperature: number
  max_tokens: number
  is_active: boolean
  is_default: boolean
  version: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ContentUsageLog {
  id: string
  content_id: string | null
  variation_id: string | null
  itinerary_id: string | null
  used_at: string
  context: string | null
}

// =====================================================
// API REQUEST/RESPONSE TYPES
// =====================================================

// Content Library
export interface CreateContentRequest {
  category_id: string
  name: string
  slug?: string // Auto-generated if not provided
  short_description?: string
  location?: string
  duration?: string
  tags?: string[]
  metadata?: Record<string, unknown>
  variations?: CreateVariationRequest[]
}

export interface UpdateContentRequest {
  name?: string
  slug?: string
  short_description?: string
  location?: string
  duration?: string
  tags?: string[]
  metadata?: Record<string, unknown>
  is_active?: boolean
}

export interface CreateVariationRequest {
  tier: Tier
  title?: string
  description: string
  highlights?: string[]
  inclusions?: string[]
  internal_notes?: string
}

export interface UpdateVariationRequest {
  title?: string
  description?: string
  highlights?: string[]
  inclusions?: string[]
  internal_notes?: string
  is_active?: boolean
}

// Writing Rules
export interface CreateWritingRuleRequest {
  name: string
  category: RuleCategory
  rule_type: RuleType
  description: string
  examples?: WritingRule['examples']
  priority?: number
  applies_to?: ContentAppliesTo[]
}

export interface UpdateWritingRuleRequest {
  name?: string
  category?: RuleCategory
  rule_type?: RuleType
  description?: string
  examples?: WritingRule['examples']
  priority?: number
  applies_to?: ContentAppliesTo[]
  is_active?: boolean
}

// Prompt Templates
export interface CreatePromptTemplateRequest {
  name: string
  purpose: PromptPurpose
  description?: string
  system_prompt?: string
  user_prompt_template: string
  variables?: string[]
  model?: string
  temperature?: number
  max_tokens?: number
  is_default?: boolean
}

export interface UpdatePromptTemplateRequest {
  name?: string
  purpose?: PromptPurpose
  description?: string
  system_prompt?: string
  user_prompt_template?: string
  variables?: string[]
  model?: string
  temperature?: number
  max_tokens?: number
  is_active?: boolean
  is_default?: boolean
}

// =====================================================
// FILTER & QUERY TYPES
// =====================================================

export interface ContentLibraryFilters {
  category_id?: string
  category_slug?: string
  tags?: string[]
  is_active?: boolean
  search?: string
  has_variations?: boolean
  has_tier?: Tier
}

export interface WritingRuleFilters {
  category?: RuleCategory
  rule_type?: RuleType
  applies_to?: ContentAppliesTo
  is_active?: boolean
  min_priority?: number
}

export interface PromptTemplateFilters {
  purpose?: PromptPurpose
  is_active?: boolean
  is_default?: boolean
}

// =====================================================
// AI GENERATION TYPES
// =====================================================

export interface ContentForGeneration {
  id: string
  name: string
  tier: Tier
  description: string
  highlights: string[]
  category: string
}

export interface WritingRulesForGeneration {
  enforce: string[]
  prefer: string[]
  avoid: string[]
}

export interface GenerationContext {
  content: ContentForGeneration[]
  rules: WritingRulesForGeneration
  prompt: PromptTemplate
  variables: Record<string, string>
}

export interface GenerationRequest {
  purpose: PromptPurpose
  tier: Tier
  variables: Record<string, string>
  content_ids?: string[]  // Specific content to include
  content_tags?: string[] // Or fetch by tags
}

export interface GenerationResponse {
  success: boolean
  output: string
  content_used: string[]
  rules_applied: string[]
  tokens_used: number
  model: string
}

// =====================================================
// UI HELPER TYPES
// =====================================================

export interface ContentLibraryStats {
  total_items: number
  by_category: Record<string, number>
  with_all_tiers: number
  missing_variations: number
}

export interface CategoryWithCount extends ContentCategory {
  content_count: number
}

export interface ContentWithVariations extends ContentLibraryItem {
  variations: ContentVariation[]
  missing_tiers: Tier[]
}

// =====================================================
// TIER DISPLAY HELPERS
// =====================================================

export const TIER_CONFIG: Record<Tier, {
  label: string
  color: string
  bgColor: string
  icon: string
  description: string
}> = {
  budget: {
    label: 'Budget',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    icon: 'Wallet',
    description: 'Value-focused, essential experiences'
  },
  standard: {
    label: 'Standard',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    icon: 'Star',
    description: 'Balanced comfort and experience'
  },
  deluxe: {
    label: 'Deluxe',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    icon: 'Gem',
    description: 'Enhanced experiences and refinement'
  },
  luxury: {
    label: 'Luxury',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    icon: 'Crown',
    description: 'Exclusive access and ultimate comfort'
  }
}

export const RULE_CATEGORY_CONFIG: Record<RuleCategory, {
  label: string
  color: string
  icon: string
}> = {
  tone: {
    label: 'Tone',
    color: 'text-pink-600',
    icon: 'Heart'
  },
  vocabulary: {
    label: 'Vocabulary',
    color: 'text-blue-600',
    icon: 'BookOpen'
  },
  structure: {
    label: 'Structure',
    color: 'text-green-600',
    icon: 'LayoutList'
  },
  formatting: {
    label: 'Formatting',
    color: 'text-orange-600',
    icon: 'Type'
  },
  brand: {
    label: 'Brand',
    color: 'text-purple-600',
    icon: 'Award'
  }
}

export const RULE_TYPE_CONFIG: Record<RuleType, {
  label: string
  color: string
  bgColor: string
}> = {
  enforce: {
    label: 'Must Follow',
    color: 'text-red-700',
    bgColor: 'bg-red-50'
  },
  prefer: {
    label: 'Preferred',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50'
  },
  avoid: {
    label: 'Avoid',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100'
  }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Generate a slug from a name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Get missing tiers for a content item
 */
export function getMissingTiers(variations: ContentVariation[]): Tier[] {
  const existingTiers = variations.map(v => v.tier)
  return TIERS.filter(tier => !existingTiers.includes(tier))
}

/**
 * Check if content has all tier variations
 */
export function hasAllTiers(variations: ContentVariation[]): boolean {
  return getMissingTiers(variations).length === 0
}

/**
 * Format content for AI prompt
 */
export function formatContentForPrompt(content: ContentForGeneration[]): string {
  return content.map(c => `
### ${c.name} (${c.tier})
Category: ${c.category}
${c.description}
${c.highlights.length > 0 ? `\nHighlights: ${c.highlights.join(', ')}` : ''}
`).join('\n---\n')
}

/**
 * Format writing rules for AI prompt
 */
export function formatRulesForPrompt(rules: WritingRule[]): string {
  const grouped: WritingRulesForGeneration = {
    enforce: [],
    prefer: [],
    avoid: []
  }
  
  rules.forEach(rule => {
    const text = `${rule.name}: ${rule.description}`
    grouped[rule.rule_type].push(text)
  })
  
  let output = ''
  
  if (grouped.enforce.length > 0) {
    output += `\n## MUST FOLLOW:\n${grouped.enforce.map(r => `- ${r}`).join('\n')}`
  }
  if (grouped.prefer.length > 0) {
    output += `\n\n## PREFERRED:\n${grouped.prefer.map(r => `- ${r}`).join('\n')}`
  }
  if (grouped.avoid.length > 0) {
    output += `\n\n## AVOID:\n${grouped.avoid.map(r => `- ${r}`).join('\n')}`
  }
  
  return output
}

/**
 * Replace template variables in a prompt
 */
export function replacePromptVariables(
  template: string, 
  variables: Record<string, string>
): string {
  let result = template
  Object.entries(variables).forEach(([key, value]) => {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value)
  })
  return result
}