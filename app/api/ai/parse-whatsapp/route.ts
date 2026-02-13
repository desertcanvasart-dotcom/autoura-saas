import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '@/lib/supabase-server'

// Lazy-initialized Anthropic client (avoids build-time errors when env vars unavailable)
let _anthropic: Anthropic | null = null

function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not defined in environment variables')
    }
    _anthropic = new Anthropic({ apiKey })
  }
  return _anthropic
}

// ============================================
// EGYPTIAN TRAVEL ABBREVIATIONS
// ============================================

const EGYPT_CITY_CODES = [
  'CAI', 'ALX', 'ALY', 'ASW', 'LXR', 'HRG', 'SSH', 'RMF', 'ABS',
  'GZA', 'KOM', 'EDU', 'EDFU', 'ESN', 'ABY', 'DEN', 'SAQ', 'MEM', 'FAY', 'SIW'
]

const EGYPT_ACCOMMODATION_CODES = ['NTS', 'CRZ', 'HTL', 'OVN']

const AIRLINE_CODES = [
  'MS', 'BA', 'TK', 'QR', 'EK', 'EY', 'LH', 'AF', 'KL', 'FZ', 'G9', 'SV', 'RJ', 'NP', 'SM'
]

// ============================================
// STRUCTURED ITINERARY DETECTION
// ============================================

interface StructureDetectionResult {
  isStructured: boolean
  confidence: number
  detectedDays: number
  signals: string[]
  extractedDays: ExtractedDay[] | null
  rawDaySegments: string[]
}

interface ExtractedDay {
  date: string | null
  date_display: string | null
  day_number: number
  title: string
  activities: string[]
  city: string | null
  overnight_city: string
  is_transfer_only: boolean
  is_arrival: boolean
  is_departure: boolean
  is_free_day: boolean
  flight_info: string | null
  hotel_name: string | null
  meals_mentioned: string[]
  attractions: string[]
  guide_required: boolean
  transport_type: string | null
  notes: string | null
}

function detectStructuredItinerary(text: string): StructureDetectionResult {
  const signals: string[] = []
  let confidence = 0
  const rawDaySegments: string[] = []

  // ============================================
  // PATTERN 1: Egyptian day markers (D1, D2, D3...)
  // This is the PRIMARY pattern for Egyptian travel agents
  // ============================================
  const egyptDayPattern = /\bD(\d+)\b/gi
  const egyptDayMatches = text.match(egyptDayPattern)
  let maxDayNumber = 0
  
  if (egyptDayMatches && egyptDayMatches.length >= 1) {
    // Extract the highest day number
    egyptDayMatches.forEach(match => {
      const num = parseInt(match.replace(/\D/g, ''))
      if (num > maxDayNumber) maxDayNumber = num
    })
    
    signals.push(`Found ${egyptDayMatches.length} Egyptian day markers (D1, D2... up to D${maxDayNumber})`)
    confidence += Math.min(egyptDayMatches.length * 15, 40)
  }

  // ============================================
  // PATTERN 2: NTS (nights) patterns - 2NTS CAI, 3NTS CRZ
  // ============================================
  const ntsPattern = /(\d+)\s*NTS?\s*([A-Z]{2,4})/gi
  const ntsMatches = text.match(ntsPattern)
  
  if (ntsMatches && ntsMatches.length >= 1) {
    signals.push(`Found ${ntsMatches.length} night allocation patterns (e.g., "2NTS CAI")`)
    confidence += ntsMatches.length * 15
    
    // Calculate total nights from NTS pattern
    let totalNights = 0
    let match
    const ntsRegex = /(\d+)\s*NTS?/gi
    while ((match = ntsRegex.exec(text)) !== null) {
      totalNights += parseInt(match[1])
    }
    if (totalNights > 0) {
      signals.push(`Total nights from NTS pattern: ${totalNights} (= ${totalNights + 1} days)`)
    }
  }

  // ============================================
  // PATTERN 3: Egyptian city codes (CAI, ALX, ASW, LXR, HRG, CRZ)
  // ============================================
  const cityCodePattern = new RegExp(`\\b(${EGYPT_CITY_CODES.join('|')})\\b`, 'gi')
  const cityMatches = text.match(cityCodePattern)
  
  if (cityMatches && cityMatches.length >= 2) {
    const uniqueCities = [...new Set(cityMatches.map(c => c.toUpperCase()))]
    signals.push(`Found ${uniqueCities.length} Egyptian city codes: ${uniqueCities.join(', ')}`)
    confidence += Math.min(uniqueCities.length * 8, 25)
  }

  // ============================================
  // PATTERN 4: CRZ (Cruise) mentions
  // ============================================
  const cruisePattern = /\b(CRZ|C\/IN|C\/OUT|check\s*in\s*crz|check\s*out\s*crz)\b/gi
  const cruiseMatches = text.match(cruisePattern)
  
  if (cruiseMatches && cruiseMatches.length >= 1) {
    signals.push(`Found cruise indicators (CRZ, C/IN, C/OUT)`)
    confidence += 15
  }

  // ============================================
  // PATTERN 5: Flight codes (MS956, BA155, etc.)
  // ============================================
  const flightPattern = new RegExp(`\\b(${AIRLINE_CODES.join('|')})(\\d{2,4})\\b`, 'gi')
  const flightMatches = text.match(flightPattern)
  
  if (flightMatches && flightMatches.length >= 1) {
    signals.push(`Found ${flightMatches.length} flight codes: ${flightMatches.join(', ')}`)
    confidence += 15
  }

  // ============================================
  // PATTERN 6: Time markers (@05:10, @23:20)
  // ============================================
  const timePattern = /@\s*\d{1,2}[:\.]?\d{2}/gi
  const timeMatches = text.match(timePattern)
  
  if (timeMatches && timeMatches.length >= 1) {
    signals.push(`Found ${timeMatches.length} time markers`)
    confidence += 10
  }

  // ============================================
  // PATTERN 7: INSIDE/OUTSIDE markers
  // ============================================
  const insideOutsidePattern = /\(\s*(INSIDE|OUTSIDE)\s*\)/gi
  const insideOutsideMatches = text.match(insideOutsidePattern)
  
  if (insideOutsideMatches && insideOutsideMatches.length >= 1) {
    signals.push(`Found ${insideOutsideMatches.length} entrance markers (INSIDE/OUTSIDE)`)
    confidence += 15
  }

  // ============================================
  // PATTERN 8: PROGRAM: header
  // ============================================
  const programPattern = /\bPROGRAM\s*:/i
  if (programPattern.test(text)) {
    signals.push('Found "PROGRAM:" header')
    confidence += 20
  }

  // ============================================
  // PATTERN 9: Standard "Day 1:", "Day 2:" markers
  // ============================================
  const dayMarkerPattern = /\bDay\s*(\d+)\s*[:\-–]/gi
  const dayMarkers = text.match(dayMarkerPattern)
  if (dayMarkers && dayMarkers.length >= 2) {
    signals.push(`Found ${dayMarkers.length} standard day markers (Day 1:, Day 2:)`)
    confidence += Math.min(dayMarkers.length * 12, 30)
    
    // Extract highest day number
    dayMarkers.forEach(match => {
      const num = parseInt(match.replace(/\D/g, ''))
      if (num > maxDayNumber) maxDayNumber = num
    })
  }

  // ============================================
  // PATTERN 10: Explicit date patterns
  // ============================================
  const datePatterns = [
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b/gi,
    /\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/gi,
    /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g,
  ]
  
  let dateMatches = 0
  for (const pattern of datePatterns) {
    const matches = text.match(pattern)
    if (matches) dateMatches += matches.length
  }
  
  if (dateMatches >= 2) {
    signals.push(`Found ${dateMatches} date references`)
    confidence += Math.min(dateMatches * 8, 20)
  }

  // ============================================
  // PATTERN 11: Meal indicators (L, D, B, LUNCH, DINNER)
  // ============================================
  const mealPattern = /\b(LUNCH|DINNER|BREAKFAST)\b|\b,\s*[LD]\s*,|\b,\s*[LD]\s*$/gi
  const mealMatches = text.match(mealPattern)
  
  if (mealMatches && mealMatches.length >= 2) {
    signals.push(`Found ${mealMatches.length} meal indicators`)
    confidence += 10
  }

  // ============================================
  // PATTERN 12: Overnight indicators
  // ============================================
  const overnightPattern = /\bOVERNIGHT\s+(AT|IN)\b/gi
  const overnightMatches = text.match(overnightPattern)
  
  if (overnightMatches && overnightMatches.length >= 1) {
    signals.push(`Found ${overnightMatches.length} overnight indicators`)
    confidence += 10
  }

  // ============================================
  // PATTERN 13: Egyptian attractions
  // ============================================
  const attractionPatterns = [
    /\b(pyramids?|sphinx|giza|karnak|luxor\s*temple|valley\s*of\s*(the\s*)?kings|hatshepsut|abu\s*simbel|philae|phaila|edfu|kom\s*ombo|egyptian\s*museum|grand\s*(egyptian\s*)?museum|GEM|khan\s*el[- ]?khalili|citadel|high\s*dam|unfinished\s*obelisk|memnon|pompey|qaitbay|montazah|alexandria\s*library)\b/gi
  ]
  
  let attractionCount = 0
  for (const pattern of attractionPatterns) {
    const matches = text.match(pattern)
    if (matches) attractionCount += matches.length
  }
  
  if (attractionCount >= 3) {
    signals.push(`Found ${attractionCount} Egyptian attractions`)
    confidence += Math.min(attractionCount * 3, 15)
  }

  // ============================================
  // PATTERN 14: City transitions (CAI/ALX/CAI, LXR/HRG)
  // ============================================
  const transitionPattern = /[A-Z]{2,4}\s*\/\s*[A-Z]{2,4}/gi
  const transitionMatches = text.match(transitionPattern)
  
  if (transitionMatches && transitionMatches.length >= 1) {
    signals.push(`Found ${transitionMatches.length} city transitions (e.g., CAI/ALX)`)
    confidence += transitionMatches.length * 10
  }

  // ============================================
  // EXTRACT DAY SEGMENTS for passing to AI
  // ============================================
  
  // Method 1: Split by D1, D2, D3... pattern
  const daySegmentPattern = /\bD(\d+)\b/gi
  let lastIndex = 0
  let match
  const segments: { dayNum: number; content: string; startIndex: number }[] = []
  
  while ((match = daySegmentPattern.exec(text)) !== null) {
    if (segments.length > 0) {
      // Complete the previous segment
      segments[segments.length - 1].content = text.substring(segments[segments.length - 1].startIndex, match.index).trim()
    }
    segments.push({
      dayNum: parseInt(match[1]),
      content: '',
      startIndex: match.index
    })
  }
  
  // Complete the last segment
  if (segments.length > 0) {
    segments[segments.length - 1].content = text.substring(segments[segments.length - 1].startIndex).trim()
  }
  
  // Sort by day number and extract content
  segments.sort((a, b) => a.dayNum - b.dayNum)
  segments.forEach(seg => {
    if (seg.content) {
      rawDaySegments.push(seg.content)
    }
  })

  // ============================================
  // CALCULATE DETECTED DAYS
  // ============================================
  let detectedDays = maxDayNumber

  // If no day markers found, try to calculate from NTS pattern
  if (detectedDays === 0 && ntsMatches) {
    let totalNights = 0
    const ntsRegex = /(\d+)\s*NTS?/gi
    let m
    while ((m = ntsRegex.exec(text)) !== null) {
      totalNights += parseInt(m[1])
    }
    if (totalNights > 0) {
      detectedDays = totalNights + 1
    }
  }

  // Fallback to segment count
  if (detectedDays === 0 && rawDaySegments.length > 0) {
    detectedDays = rawDaySegments.length
  }

  // ============================================
  // DETERMINE IF STRUCTURED
  // ============================================
  
  // Lower threshold if we have strong Egyptian patterns
  const hasEgyptianPatterns = egyptDayMatches && egyptDayMatches.length >= 2
  const hasNtsPattern = ntsMatches && ntsMatches.length >= 1
  const hasCityCodes = cityMatches && cityMatches.length >= 2
  
  // If we have D1, D2 patterns OR NTS patterns, it's definitely structured
  const definitelyStructured = hasEgyptianPatterns || (hasNtsPattern && hasCityCodes)
  
  const isStructured = definitelyStructured || (confidence >= 35 && detectedDays >= 2)

  // Boost confidence if definitely structured
  if (definitelyStructured && confidence < 70) {
    confidence = Math.max(confidence, 70)
  }

  console.log('🔍 Structure Detection Debug:', {
    egyptDayMatches: egyptDayMatches?.length || 0,
    ntsMatches: ntsMatches?.length || 0,
    cityMatches: cityMatches?.length || 0,
    maxDayNumber,
    detectedDays,
    confidence,
    definitelyStructured,
    isStructured,
    signals
  })

  return {
    isStructured,
    confidence: Math.min(confidence, 100),
    detectedDays,
    signals,
    extractedDays: null,
    rawDaySegments
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
    // Require authentication - this makes expensive Anthropic API calls
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { conversation } = await request.json()

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'No conversation provided' },
        { status: 400 }
      )
    }

    // Pre-detect if this is a structured itinerary
    const structureDetection = detectStructuredItinerary(conversation)
    
    console.log('📊 Structure Detection Result:', {
      isStructured: structureDetection.isStructured,
      confidence: structureDetection.confidence,
      detectedDays: structureDetection.detectedDays,
      signals: structureDetection.signals,
      rawDaySegments: structureDetection.rawDaySegments.length
    })

    // Pre-extract email and phone using regex as fallback
    const regexEmail = extractEmailFromText(conversation)
    const regexPhone = extractPhoneFromText(conversation)

    // Build the appropriate prompt based on detection
    const systemPrompt = structureDetection.isStructured
      ? buildStructuredExtractionPrompt(structureDetection.rawDaySegments)
      : buildGeneralExtractionPrompt()

    // Call Claude to analyze the conversation
    const message = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
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
      console.log('Raw response:', responseText.substring(0, 500))
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
      tour_name: extracted.tour_name || extracted.trip_name || 'Egypt Tour',
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
      structureConfidence: data.structure_confidence,
      days: data.extracted_days?.length || 0,
      durationDays: data.duration_days,
      signals: data.structure_signals
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

function buildStructuredExtractionPrompt(rawDaySegments: string[]): string {
  return `You are an expert travel operations assistant specializing in EGYPTIAN TOURISM.

The user has provided a STRUCTURED ITINERARY using Egyptian travel industry abbreviations.

=================================================================
EGYPTIAN TRAVEL ABBREVIATIONS - YOU MUST DECODE THESE
=================================================================

CITY CODES (IATA):
CAI = Cairo, ALX/ALY = Alexandria, ASW = Aswan, LXR = Luxor
HRG = Hurghada, SSH = Sharm El Sheikh, RMF = Marsa Alam
ABS = Abu Simbel, GZA = Giza, KOM = Kom Ombo, EDU/EDFU = Edfu

ACCOMMODATION:
NTS = Nights (e.g., "3NTS CAI" = 3 nights in Cairo)
CRZ = Cruise / Nile Cruise
HTL = Hotel
C/IN = Check-in, C/OUT = Check-out

AIRLINE CODES:
MS = EgyptAir, BA = British Airways, TK = Turkish Airlines
QR = Qatar Airways, EK = Emirates, LH = Lufthansa

DAY MARKERS:
D1, D2, D3... = Day 1, Day 2, Day 3...
"D1 CAI/ALX/CAI" = Day 1: Cairo to Alexandria and back to Cairo

ENTRANCE MARKERS:
(INSIDE) = Entrance fee required, guests go inside
(OUTSIDE) = Photo stop only, no entrance fee

MEALS:
L = Lunch, D = Dinner, B = Breakfast
"Chinese Dinner" = Dinner at Chinese restaurant

CALCULATION:
Number of DAYS = Number of NIGHTS + 1
Example: "2NTS CAI + 3NTS CRZ + 3NTS HRG" = 8 nights = 9 days

=================================================================
CRITICAL RULES
=================================================================

1. EXTRACT EXACTLY what is written - do NOT add or remove activities
2. If a day just shows "D5 CRZ" with nothing else = Free/Sailing day
3. If a day shows "D8 HRG" with nothing else = Free day in Hurghada
4. Decode ALL abbreviations to full names
5. Mark attractions with (INSIDE) in entrance_included array
6. Mark attractions with (OUTSIDE) in photo_stops array
7. If flight code is mentioned (MS956@05:10), extract it
8. Count total days from NTS pattern: 2+3+3 = 8 nights = 9 days

=================================================================
DAY SEGMENTS DETECTED
=================================================================
${rawDaySegments.length > 0 ? rawDaySegments.map((seg, i) => `Segment ${i + 1}: ${seg}`).join('\n') : 'Parse from raw input'}

=================================================================
OUTPUT FORMAT
=================================================================

Return ONLY valid JSON:

{
  "client_name": "extracted name or empty string",
  "client_email": "extracted email or empty string",
  "client_phone": "extracted phone or empty string",
  "company_name": "company if B2B or empty string",
  "nationality": "nationality if mentioned or empty string",
  
  "trip_name": "Descriptive trip name based on itinerary",
  "tour_requested": "original request summary",
  "tour_name": "Descriptive tour name",
  "start_date": "YYYY-MM-DD format if mentioned",
  "end_date": "YYYY-MM-DD format if mentioned",
  "duration_days": number (calculate from NTS if not explicit),
  "num_adults": number (default 2),
  "num_children": number (default 0),
  
  "language": "guide language preference",
  "interests": ["decoded interests/attractions"],
  "cities": ["Cairo", "Alexandria", "Aswan", "Luxor", "Hurghada"],
  "special_requests": ["any special requests"],
  "budget_level": "budget|standard|deluxe|luxury",
  
  "hotel_name": "hotel if mentioned",
  "hotel_location": "location if mentioned",
  
  "conversation_language": "English",
  "confidence_score": 0.95,
  
  "days": [
    {
      "day_number": 1,
      "date": "YYYY-MM-DD or null",
      "date_display": "original date format or null",
      "title": "Day 1: Arrival & Alexandria Day Trip",
      "city": "Cairo",
      "cities_visited": ["Cairo", "Alexandria"],
      "overnight_city": "Cairo",
      "is_arrival": true,
      "is_departure": false,
      "is_transfer_only": false,
      "is_free_day": false,
      "is_cruise_day": false,
      "activities": ["Arrive Cairo", "Transfer to Alexandria", "Visit Pompey's Pillar", "Visit Qaitbay Citadel", "Photo stop at Alexandria Library", "Visit Montazah Park", "Return to Cairo"],
      "attractions": ["Pompey's Pillar", "Qaitbay Citadel", "Alexandria Library", "Montazah Park"],
      "entrance_included": ["Pompey's Pillar", "Qaitbay Citadel", "Montazah Park"],
      "photo_stops": ["Alexandria Library"],
      "meals_included": {
        "breakfast": false,
        "lunch": true,
        "dinner": true
      },
      "guide_required": true,
      "transport_type": "flight",
      "flight_info": "MS956 arriving 05:10",
      "hotel_name": null,
      "notes": null
    }
  ]
}

IMPORTANT VALIDATIONS:
- Count your days array to ensure it matches duration_days
- Every D1, D2, D3... in input must have a corresponding day object
- Days with only city code and nothing else = is_free_day: true
- Cruise days (CRZ) without activities = is_free_day: true, is_cruise_day: true`
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
  "tour_name": "Tour name",
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
8. Default duration_days to 1 if not clear

CRITICAL DURATION RULES:
9. Number of DAYS = Number of NIGHTS + 1. ALWAYS.
   - "4-night cruise" = 5 days (duration_days: 5)
   - "3-night cruise" = 4 days (duration_days: 4)
   - "7-night cruise" = 8 days (duration_days: 8)
   - "four nights" = 5 days (duration_days: 5)
   When the request mentions NIGHTS, add 1 to get days.

CRUISE BUSINESS RULES:
10. Nile cruise from Luxor: ALWAYS 4 nights / 5 days (Luxor to Aswan). There is NO 3-night or 4-day cruise from Luxor.
11. Nile cruise from Aswan: ALWAYS 3 nights / 4 days (Aswan to Luxor).
12. Round-trip Luxor cruise: ALWAYS 7 nights / 8 days.
13. Lake Nasser cruise: typically 3 or 4 nights.

NATIONALITY & LANGUAGE RULES:
14. ALWAYS extract nationality when mentioned (e.g., "Japanese customer", "French group", "5 Japanese" = nationality: "Japanese")
15. Infer guide language from nationality when no language is explicitly stated:
    - Japanese → language: "Japanese"
    - French → language: "French"
    - Spanish → language: "Spanish"
    - German → language: "German"
    - Italian → language: "Italian"
    - Chinese → language: "Chinese"
    - Korean → language: "Korean"
    - Portuguese → language: "Portuguese"
    - Russian → language: "Russian"
    - Arabic → language: "Arabic"
    - If nationality is English-speaking (American, British, Australian, etc.) or not listed → language: "English"
16. If both nationality and language are explicitly mentioned, use the explicitly stated language.`
}