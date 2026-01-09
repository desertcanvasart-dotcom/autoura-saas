import { SupabaseClient } from '@supabase/supabase-js'

// ============================================
// TOUR MATCHER SERVICE
// Matches WhatsApp conversation data to existing tour templates
// ============================================

export interface MatchInput {
  tour_requested?: string      // Free text description of tour
  cities?: string[]            // Cities mentioned
  attractions?: string[]       // Specific attractions mentioned
  duration_days?: number       // Requested duration
  interests?: string[]         // Client interests
  budget_level?: string        // budget, standard, luxury
}

export interface TourMatch {
  template_id: string
  template_code: string
  template_name: string
  match_score: number         // 0-100 confidence score
  match_reasons: string[]     // Why it matched
  tour_type: string
  duration_days: number
  cities_covered: string[]
  highlights: string[]
  variations: {
    id: string
    name: string
    tier: string
    min_pax: number
    max_pax: number
  }[]
}

export interface MatchResult {
  success: boolean
  matches: TourMatch[]
  best_match: TourMatch | null
  custom_tour_recommended: boolean
  recommendation: string
  error?: string
}

// Keywords that map to specific attractions/places
const ATTRACTION_KEYWORDS: Record<string, string[]> = {
  'pyramids': ['Giza', 'Cairo'],
  'sphinx': ['Giza', 'Cairo'],
  'giza': ['Giza', 'Cairo'],
  'sakkara': ['Sakkara', 'Cairo'],
  'saqqara': ['Sakkara', 'Cairo'],
  'dahshur': ['Dahshur', 'Cairo'],
  'memphis': ['Memphis', 'Cairo'],
  'museum': ['Cairo'],
  'egyptian museum': ['Cairo'],
  'khan khalili': ['Cairo'],
  'citadel': ['Cairo'],
  'coptic': ['Cairo'],
  'luxor': ['Luxor'],
  'karnak': ['Luxor'],
  'valley of kings': ['Luxor'],
  'hatshepsut': ['Luxor'],
  'aswan': ['Aswan'],
  'philae': ['Aswan'],
  'abu simbel': ['Aswan', 'Abu Simbel'],
  'nile cruise': ['Luxor', 'Aswan'],
  'alexandria': ['Alexandria'],
  'library': ['Alexandria'],
  'siwa': ['Siwa'],
  'desert': ['White Desert', 'Black Desert'],
  'white desert': ['White Desert', 'Bahariya'],
  'hurghada': ['Hurghada'],
  'sharm': ['Sharm El Sheikh'],
  'red sea': ['Hurghada', 'Sharm El Sheikh'],
  'diving': ['Hurghada', 'Sharm El Sheikh', 'Dahab'],
  'snorkeling': ['Hurghada', 'Sharm El Sheikh'],
}

// Tour type keywords
const TOUR_TYPE_KEYWORDS: Record<string, string[]> = {
  'day_tour': ['day trip', 'day tour', 'full day', 'half day'],
  'multi_day': ['multi-day', 'package', 'tour package', 'days tour'],
  'cruise': ['cruise', 'nile cruise', 'felucca'],
  'safari': ['safari', 'desert', 'camping'],
  'diving': ['diving', 'dive', 'scuba', 'snorkeling'],
  'cultural': ['cultural', 'history', 'historical', 'ancient'],
  'adventure': ['adventure', 'hiking', 'trekking']
}

export async function matchTourTemplate(
  supabase: SupabaseClient,
  input: MatchInput
): Promise<MatchResult> {
  
  const result: MatchResult = {
    success: false,
    matches: [],
    best_match: null,
    custom_tour_recommended: false,
    recommendation: ''
  }

  try {
    // ============================================
    // 1. EXTRACT CITIES FROM INPUT
    // ============================================
    const extractedCities = new Set<string>()
    
    // From explicit cities
    if (input.cities) {
      input.cities.forEach((c: string) => extractedCities.add(c))
    }

    // From tour_requested text
    if (input.tour_requested) {
      const requestLower = input.tour_requested.toLowerCase()
      
      for (const [keyword, cities] of Object.entries(ATTRACTION_KEYWORDS)) {
        if (requestLower.includes(keyword)) {
          cities.forEach((c: string) => extractedCities.add(c))
        }
      }
    }

    // From attractions
    if (input.attractions) {
      input.attractions.forEach((attr: string) => {
        const attrLower = attr.toLowerCase()
        for (const [keyword, cities] of Object.entries(ATTRACTION_KEYWORDS)) {
          if (attrLower.includes(keyword)) {
            cities.forEach((c: string) => extractedCities.add(c))
          }
        }
      })
    }

    const targetCities = Array.from(extractedCities)
    console.log('🗺️ Extracted cities:', targetCities)

    // ============================================
    // 2. DETERMINE TOUR TYPE
    // ============================================
    let targetTourType: string | null = null
    
    if (input.tour_requested) {
      const requestLower = input.tour_requested.toLowerCase()
      
      for (const [type, keywords] of Object.entries(TOUR_TYPE_KEYWORDS)) {
        if (keywords.some((k: string) => requestLower.includes(k))) {
          targetTourType = type
          break
        }
      }
    }

    // Infer from duration
    if (!targetTourType && input.duration_days) {
      targetTourType = input.duration_days <= 1 ? 'day_tour' : 'multi_day'
    }

    console.log('🎯 Target tour type:', targetTourType)

    // ============================================
    // 3. FETCH MATCHING TEMPLATES
    // ============================================
    let query = supabase
      .from('tour_templates')
      .select(`
        *,
        variations:tour_variations(id, variation_name, tier, min_pax, max_pax, is_active)
      `)
      .eq('is_active', true)

    // Filter by tour type if determined
    if (targetTourType) {
      query = query.eq('tour_type', targetTourType)
    }

    // Filter by duration if specified
    if (input.duration_days) {
      query = query.gte('duration_days', input.duration_days - 1)
                   .lte('duration_days', input.duration_days + 1)
    }

    const { data: templates, error: templatesError } = await query

    if (templatesError) {
      console.error('Error fetching templates:', templatesError)
      result.error = 'Failed to fetch tour templates'
      return result
    }

    if (!templates || templates.length === 0) {
      result.success = true
      result.custom_tour_recommended = true
      result.recommendation = 'No matching tour templates found. Recommend creating a custom itinerary.'
      return result
    }

    // ============================================
    // 4. SCORE EACH TEMPLATE
    // ============================================
    const scoredMatches: TourMatch[] = []

    for (const template of templates) {
      let score = 0
      const reasons: string[] = []

      // City matching (up to 50 points)
      if (template.cities_covered && targetCities.length > 0) {
        const templateCities = template.cities_covered.map((c: string) => c.toLowerCase())
        const matchingCities = targetCities.filter((c: string) => 
          templateCities.some((tc: string) => tc.includes(c.toLowerCase()) || c.toLowerCase().includes(tc))
        )
        
        if (matchingCities.length > 0) {
          const cityScore = Math.min(50, (matchingCities.length / targetCities.length) * 50)
          score += cityScore
          reasons.push(`Cities match: ${matchingCities.join(', ')}`)
        }
      }

      // Name/description matching (up to 20 points)
      if (input.tour_requested && template.template_name) {
        const requestWords = input.tour_requested.toLowerCase().split(/\s+/)
        const templateWords = template.template_name.toLowerCase().split(/\s+/)
        
        const matchingWords = requestWords.filter((w: string) => 
          templateWords.some((tw: string) => tw.includes(w) || w.includes(tw))
        )
        
        if (matchingWords.length > 0) {
          const nameScore = Math.min(20, matchingWords.length * 5)
          score += nameScore
          reasons.push(`Name keywords match`)
        }
      }

      // Duration match (up to 15 points)
      if (input.duration_days && template.duration_days) {
        const durationDiff = Math.abs(template.duration_days - input.duration_days)
        if (durationDiff === 0) {
          score += 15
          reasons.push('Exact duration match')
        } else if (durationDiff === 1) {
          score += 10
          reasons.push('Close duration match')
        }
      }

      // Tour type match (up to 10 points)
      if (targetTourType && template.tour_type === targetTourType) {
        score += 10
        reasons.push(`Tour type: ${targetTourType}`)
      }

      // Budget/tier match (up to 5 points)
      if (input.budget_level && template.variations) {
        const hasMatchingTier = template.variations.some((v: any) => 
          v.tier === input.budget_level && v.is_active
        )
        if (hasMatchingTier) {
          score += 5
          reasons.push(`Has ${input.budget_level} option`)
        }
      }

      // Only include if score > 20
      if (score >= 20) {
        scoredMatches.push({
          template_id: template.id,
          template_code: template.template_code,
          template_name: template.template_name,
          match_score: Math.round(score),
          match_reasons: reasons,
          tour_type: template.tour_type,
          duration_days: template.duration_days,
          cities_covered: template.cities_covered || [],
          highlights: template.highlights || [],
          variations: (template.variations || [])
            .filter((v: any) => v.is_active)
            .map((v: any) => ({
              id: v.id,
              name: v.variation_name,
              tier: v.tier,
              min_pax: v.min_pax,
              max_pax: v.max_pax
            }))
        })
      }
    }

    // Sort by score descending
    scoredMatches.sort((a: TourMatch, b: TourMatch) => b.match_score - a.match_score)

    // ============================================
    // 5. BUILD RESULT
    // ============================================
    result.success = true
    result.matches = scoredMatches.slice(0, 5) // Top 5 matches

    if (scoredMatches.length > 0) {
      result.best_match = scoredMatches[0]
      
      if (scoredMatches[0].match_score >= 70) {
        result.recommendation = `Strong match: "${scoredMatches[0].template_name}" (${scoredMatches[0].match_score}% confidence)`
      } else if (scoredMatches[0].match_score >= 50) {
        result.recommendation = `Good match: "${scoredMatches[0].template_name}" - consider customizing`
        result.custom_tour_recommended = true
      } else {
        result.recommendation = `Partial match found. Consider creating custom itinerary.`
        result.custom_tour_recommended = true
      }
    } else {
      result.custom_tour_recommended = true
      result.recommendation = 'No suitable templates found. Creating custom itinerary.'
    }

    return result

  } catch (error: any) {
    console.error('Error in matchTourTemplate:', error)
    result.error = error.message
    return result
  }
}

// ============================================
// GET TOUR TEMPLATE DETAILS WITH PRICING
// ============================================

export interface TemplateWithPricing {
  template: any
  days: any[]
  variations: any[]
  pricing: any[]
}

export async function getTemplateWithPricing(
  supabase: SupabaseClient,
  templateId: string,
  pax: number,
  isEuroPassport: boolean
): Promise<TemplateWithPricing | null> {
  
  try {
    // Get template with all related data
    const { data: template, error: templateError } = await supabase
      .from('tour_templates')
      .select(`
        *,
        category:tour_categories(id, category_name)
      `)
      .eq('id', templateId)
      .single()

    if (templateError || !template) {
      console.error('Template not found:', templateError)
      return null
    }

    // Get variations
    const { data: variations } = await supabase
      .from('tour_variations')
      .select('*')
      .eq('template_id', templateId)
      .eq('is_active', true)

    // Get days with activities
    const { data: days } = await supabase
      .from('tour_days')
      .select(`
        *,
        activities:tour_day_activities(
          *,
          entrance:attractions(id, name, entrance_fee_eur, entrance_fee_non_eur),
          transportation:transportation_rates(id, vehicle_type, rate_per_day)
        ),
        accommodation:hotel_contacts(id, name, rate_double_eur),
        lunch_meal:restaurant_contacts!lunch_meal_id(id, name, lunch_rate_eur),
        dinner_meal:restaurant_contacts!dinner_meal_id(id, name, dinner_rate_eur),
        guide:guides(id, name, daily_rate_eur)
      `)
      .eq('tour_id', templateId)
      .order('day_number', { ascending: true })

    // Get pricing for this pax and passport type
    const { data: pricing } = await supabase
      .from('tour_pricing')
      .select('*')
      .eq('tour_id', templateId)
      .eq('pax', pax)
      .eq('is_euro_passport', isEuroPassport)

    return {
      template,
      days: days || [],
      variations: variations || [],
      pricing: pricing || []
    }

  } catch (error) {
    console.error('Error getting template with pricing:', error)
    return null
  }
}