import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
})

// ============================================
// STRUCTURED ITINERARY DETECTION
// ============================================

interface StructureDetectionResult {
  isStructured: boolean
  confidence: number
  detectedDays: number
  signals: string[]
  extractedDays: ExtractedDay[] | null
}

interface ExtractedDay {
  date: string | null
  day_number: number
  title: string
  activities: string[]
  city: string | null
  is_transfer_only: boolean
  is_arrival: boolean
  is_departure: boolean
  flight_info: string | null
  hotel_name: string | null
  meals_mentioned: string[]
  attractions: string[]
}

function detectStructuredItinerary(text: string): StructureDetectionResult {
  const signals: string[] = []
  let confidence = 0

  // Pattern 1: Explicit dates (April 30, May 1, etc.)
  const datePatterns = [
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b/gi,
    /\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/gi,
    /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g,
    /\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b/g
  ]
  
  let dateMatches = 0
  for (const pattern of datePatterns) {
    const matches = text.match(pattern)
    if (matches) dateMatches += matches.length
  }
  
  if (dateMatches >= 2) {
    signals.push(`Found ${dateMatches} date references`)
    confidence += Math.min(dateMatches * 10, 30)
  }

  // Pattern 2: Day markers (Day 1:, Day 2:, etc.)
  const dayMarkerPattern = /\bDay\s*\d+\s*[:\-–]/gi
  const dayMarkers = text.match(dayMarkerPattern)
  if (dayMarkers && dayMarkers.length >= 2) {
    signals.push(`Found ${dayMarkers.length} day markers`)
    confidence += Math.min(dayMarkers.length * 15, 30)
  }

  // Pattern 3: Bullet points or numbered lists with activities
  const bulletPattern = /^[\s]*[\*\-•]\s+.+/gm
  const bulletMatches = text.match(bulletPattern)
  if (bulletMatches && bulletMatches.length >= 3) {
    signals.push(`Found ${bulletMatches.length} bullet points`)
    confidence += Math.min(bulletMatches.length * 3, 20)
  }

  // Pattern 4: Transfer/flight mentions
  const transferPatterns = [
    /\b(transfer|pickup|pick-up|pick up)\b/gi,
    /\b(flight|fly|domestic flight|airport)\b/gi,
    /\b(arrival|arrive|departure|depart)\b/gi
  ]
  
  for (const pattern of transferPatterns) {
    if (pattern.test(text)) {
      signals.push('Contains transfer/flight info')
      confidence += 10
      break
    }
  }

  // Pattern 5: Hotel names mentioned
  const hotelPatterns = [
    /\b(hotel|resort|palace|sofitel|marriott|hilton|four seasons|st\.?\s*regis|ritz|oberoi|mena house)\b/gi,
    /\bovernight\s+(at|in)\b/gi
  ]
  
  for (const pattern of hotelPatterns) {
    if (pattern.test(text)) {
      signals.push('Contains hotel references')
      confidence += 10
      break
    }
  }

  // Pattern 6: City transitions (Cairo → Luxor, etc.)
  const cityTransitionPatterns = [
    /\b(Cairo|Luxor|Aswan|Alexandria|Hurghada|Sharm)\s*(→|->|to|–)\s*(Cairo|Luxor|Aswan|Alexandria|Hurghada|Sharm)\b/gi,
    /\bfly\s+to\s+(Cairo|Luxor|Aswan)\b/gi,
    /\btravel\s+to\s+(Cairo|Luxor|Aswan)\b/gi
  ]
  
  for (const pattern of cityTransitionPatterns) {
    if (pattern.test(text)) {
      signals.push('Contains city transitions')
      confidence += 15
      break
    }
  }

  // Pattern 7: Specific attraction names
  const attractionPatterns = [
    /\b(pyramids?|sphinx|giza|karnak|luxor temple|valley of the kings|hatshepsut|abu simbel|philae|edfu|kom ombo|egyptian museum|grand egyptian museum|GEM|khan el-khalili|citadel|old cairo|coptic)\b/gi
  ]
  
  let attractionMatches = 0
  for (const pattern of attractionPatterns) {
    const matches = text.match(pattern)
    if (matches) attractionMatches += matches.length
  }
  
  if (attractionMatches >= 3) {
    signals.push(`Found ${attractionMatches} attraction references`)
    confidence += Math.min(attractionMatches * 3, 15)
  }

  // Pattern 8: Structured format indicators
  const structureIndicators = [
    /overnight\s+in/gi,
    /return\s+to\s+(your\s+)?hotel/gi,
    /private\s+(guide|transfer|vehicle|tour)/gi,
    /full[- ]?day/gi,
    /half[- ]?day/gi,
    /free\s+(day|time|afternoon|morning)/gi
  ]
  
  let structureCount = 0
  for (const pattern of structureIndicators) {
    if (pattern.test(text)) structureCount++
  }
  
  if (structureCount >= 2) {
    signals.push(`Found ${structureCount} structure indicators`)
    confidence += structureCount * 5
  }

  // Count detected days
  let detectedDays = 0
  
  // Method 1: Count unique dates
  const allDates = new Set<string>()
  for (const pattern of datePatterns) {
    const matches = text.match(pattern)
    if (matches) {
      matches.forEach(m => allDates.add(m.toLowerCase()))
    }
  }
  detectedDays = Math.max(detectedDays, allDates.size)
  
  // Method 2: Count day markers
  if (dayMarkers) {
    detectedDays = Math.max(detectedDays, dayMarkers.length)
  }

  // Determine if structured
  const isStructured = confidence >= 40 && detectedDays >= 2

  return {
    isStructured,
    confidence: Math.min(confidence, 100),
    detectedDays,
    signals,
    extractedDays: null // Will be populated by Claude if structured
  }
}

// Helper function to extract email using regex
function extractEmailFromText(text: string): string {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  const matches = text.match(emailRegex)
  return matches ? matches[0] : ''
}

// Helper function to extract phone using regex
function extractPhoneFromText(text: string): string {
  const telPatterns = [
    /TEL[：:]\s*([0-9\-\+\(\)\s]{8,20})/i,
    /Tel[：:]\s*([0-9\-\+\(\)\s]{8,20})/i,
    /Phone[：:]\s*([0-9\-\+\(\)\s]{8,20})/i,
    /Mobile[：:]\s*([0-9\-\+\(\)\s]{8,20})/i,
    /携帯[：:]\s*([0-9\-\+\(\)\s]{8,20})/,
    /電話[：:]\s*([0-9\-\+\(\)\s]{8,20})/,
  ]
  
  for (const pattern of telPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }
  
  const phonePatterns = [
    /\+\d{1,3}[\s\-]?\d{2,4}[\s\-]?\d{3,4}[\s\-]?\d{3,4}/,
    /\d{2,4}-\d{3,4}-\d{3,4}/,
    /\(\d{2,4}\)\s?\d{3,4}[\s\-]?\d{3,4}/,
  ]
  
  for (const pattern of phonePatterns) {
    const match = text.match(pattern)
    if (match) {
      return match[0].trim()
    }
  }
  
  return ''
}

export async function POST(request: Request) {
  try {
    const { conversation } = await request.json()

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'No conversation provided' },
        { status: 400 }
      )
    }

    // Pre-detect if this is a structured itinerary
    const structureDetection = detectStructuredItinerary(conversation)
    
    console.log('📊 Structure Detection:', {
      isStructured: structureDetection.isStructured,
      confidence: structureDetection.confidence,
      detectedDays: structureDetection.detectedDays,
      signals: structureDetection.signals
    })

    // Pre-extract email and phone using regex as fallback
    const regexEmail = extractEmailFromText(conversation)
    const regexPhone = extractPhoneFromText(conversation)

    // Build the appropriate prompt based on detection
    const systemPrompt = structureDetection.isStructured
      ? buildStructuredExtractionPrompt()
      : buildGeneralExtractionPrompt()

    // Call Claude to analyze the conversation
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `${systemPrompt}\n\n---\n\nINPUT TEXT:\n${conversation}`
        }
      ]
    })

    // Extract text content from Claude's response
    const responseText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('')

    // Parse JSON from response
    let extracted: any = {}
    try {
      // Find JSON in the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0])
      }
    } catch (e) {
      console.error('Failed to parse Claude response:', e)
      console.log('Raw response:', responseText)
    }

    // Helper to validate date
    const isValidDate = (dateStr: string): boolean => {
      if (!dateStr) return false
      const date = new Date(dateStr)
      return !isNaN(date.getTime())
    }

    // Build final response with fallbacks
    const data = {
      // Client info
      client_name: extracted.client_name || '',
      client_email: extracted.client_email || regexEmail || '',
      client_phone: extracted.client_phone || regexPhone || '',
      company_name: extracted.company_name || '',
      nationality: extracted.nationality || '',
      
      // Trip info
      trip_name: extracted.trip_name || extracted.tour_requested || 'Egypt Tour',
      tour_requested: extracted.tour_requested || '',
      start_date: isValidDate(extracted.start_date) ? extracted.start_date : '',
      end_date: isValidDate(extracted.end_date) ? extracted.end_date : '',
      duration_days: parseInt(extracted.duration_days) || structureDetection.detectedDays || 1,
      num_adults: parseInt(extracted.num_adults) || 2,
      num_children: parseInt(extracted.num_children) || 0,
      
      // Preferences
      language: extracted.language || 'English',
      interests: Array.isArray(extracted.interests) ? extracted.interests : [],
      cities: Array.isArray(extracted.cities) ? extracted.cities : [],
      special_requests: Array.isArray(extracted.special_requests) ? extracted.special_requests : [],
      budget_level: extracted.budget_level || 'standard',
      
      // Accommodation
      hotel_name: extracted.hotel_name || '',
      hotel_location: extracted.hotel_location || '',
      
      // Metadata
      conversation_language: extracted.conversation_language || 'English',
      confidence_score: parseFloat(extracted.confidence_score) || 0.8,
      
      // STRUCTURE DETECTION RESULTS
      is_structured_input: structureDetection.isStructured,
      structure_confidence: structureDetection.confidence,
      structure_signals: structureDetection.signals,
      
      // EXTRACTED DAY-BY-DAY (only if structured)
      extracted_days: structureDetection.isStructured && extracted.days 
        ? extracted.days 
        : null,
      
      // Raw itinerary text for generator (only if structured)
      raw_itinerary: structureDetection.isStructured ? conversation : null
    }

    console.log('✅ Parsed result:', {
      client: data.client_name,
      isStructured: data.is_structured_input,
      days: data.extracted_days?.length || 0,
      confidence: data.structure_confidence
    })

    return NextResponse.json({
      success: true,
      data
    })

  } catch (error) {
    console.error('Error parsing conversation:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to analyze conversation',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// ============================================
// PROMPT FOR STRUCTURED ITINERARY EXTRACTION
// ============================================

function buildStructuredExtractionPrompt(): string {
  return `You are an expert travel operations assistant. The user has provided a STRUCTURED ITINERARY with specific dates and activities.

Your task is to EXTRACT the exact structure - do NOT modify, suggest alternatives, or add anything not explicitly mentioned.

CRITICAL RULES:
1. Extract EXACTLY what is written - do not add or remove activities
2. If a day says "transfer only" or "arrival" - mark it as transfer_only: true
3. If specific attractions are listed, extract them EXACTLY as written
4. If a day mentions "free time" or "at leisure" - do not add activities
5. Preserve the EXACT dates if provided (April 30, May 1, etc.)
6. Do NOT add meals unless explicitly mentioned
7. Do NOT add guide services unless explicitly mentioned

Return a JSON object with this structure:

{
  "client_name": "extracted name or empty string",
  "client_email": "extracted email or empty string",
  "client_phone": "extracted phone or empty string",
  "company_name": "company if B2B or empty string",
  "nationality": "nationality if mentioned or empty string",
  
  "trip_name": "descriptive name for the trip",
  "tour_requested": "what they asked for",
  "start_date": "YYYY-MM-DD format",
  "end_date": "YYYY-MM-DD format",
  "duration_days": number,
  "num_adults": number,
  "num_children": number,
  
  "language": "guide language preference",
  "interests": ["extracted interests"],
  "cities": ["cities in order of visit"],
  "special_requests": ["any special requests"],
  "budget_level": "budget|standard|deluxe|luxury",
  
  "hotel_name": "hotel if mentioned",
  "hotel_location": "location if mentioned",
  
  "conversation_language": "language of the input",
  "confidence_score": 0.0 to 1.0,
  
  "days": [
    {
      "day_number": 1,
      "date": "YYYY-MM-DD or null",
      "date_display": "April 30" (original format),
      "title": "Day title as provided",
      "city": "city for this day",
      "is_arrival": true/false,
      "is_departure": true/false,
      "is_transfer_only": true/false,
      "is_free_day": true/false,
      "activities": ["exact activities listed"],
      "attractions": ["specific attraction names"],
      "meals_included": {
        "breakfast": true/false,
        "lunch": true/false,
        "dinner": true/false
      },
      "guide_required": true/false (only true if explicitly mentioned),
      "transport_type": "private transfer|flight|train|cruise|null",
      "flight_info": "flight details if any",
      "hotel_name": "hotel for this night or null",
      "overnight_city": "city for overnight",
      "notes": "any additional notes"
    }
  ]
}

IMPORTANT: 
- For arrival days with just airport transfer, set is_transfer_only: true and activities: ["Airport transfer to hotel"]
- For departure days, set is_departure: true
- Only set guide_required: true if guide/guided tour is explicitly mentioned for that day
- Do NOT assume meals are included unless stated`
}

// ============================================
// PROMPT FOR GENERAL REQUEST EXTRACTION
// ============================================

function buildGeneralExtractionPrompt(): string {
  return `You are an expert travel agent assistant that analyzes WhatsApp conversations and emails to extract booking information.

This appears to be a GENERAL REQUEST (not a structured day-by-day itinerary). Extract the key information to help create a custom itinerary.

IMPORTANT: Carefully scan the ENTIRE message including email signatures at the bottom.

Extract the following and return as JSON:

{
  "client_name": "Full name of the client/sender",
  "client_email": "Email address",
  "client_phone": "Phone number",
  "company_name": "Company name if B2B",
  "nationality": "Client nationality if mentioned",
  
  "trip_name": "Descriptive trip name",
  "tour_requested": "What they're asking for",
  "start_date": "YYYY-MM-DD format",
  "end_date": "YYYY-MM-DD format if mentioned",
  "duration_days": number,
  "num_adults": number,
  "num_children": number,
  
  "language": "Preferred guide language",
  "interests": ["places they want to visit", "activities"],
  "cities": ["cities mentioned"],
  "special_requests": ["any special requests"],
  "budget_level": "budget|standard|deluxe|luxury",
  
  "hotel_name": "Hotel if mentioned",
  "hotel_location": "Location if mentioned",
  
  "conversation_language": "Language of the conversation",
  "confidence_score": 0.0 to 1.0
}

EXTRACTION RULES:
1. EMAIL: Search for pattern xxx@xxx.xxx anywhere
2. PHONE: Look for "TEL:", "Tel:", "Phone:", followed by numbers
3. For signatures, look for company info, address, contact person
4. Use empty string "" for missing text
5. Use 0 for missing numbers
6. Use [] for missing arrays
7. Default num_adults to 2 if not specified
8. Default duration_days to 1 if not clear`
}