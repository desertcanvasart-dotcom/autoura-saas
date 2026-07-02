// ============================================
// CRUISE DETECTION SYSTEM
// ============================================

import type { PackageType } from './parsing-utils'

export interface CruiseDetectionResult {
  isCruise: boolean
  cruiseType: 'nile-cruise' | 'lake-nasser' | null
  route: string | null
  detectedDuration: number | null
  startCity: string | null
  endCity: string | null
  keywords: string[]
  includesLand: boolean
  cruiseNights: number
  landNights: number
}

export function detectCruiseRequest(
  tourRequested: string,
  interests: string[],
  cities: string[],
  specialRequests: string[],
  durationDays: number,
  rawItinerary?: string
): CruiseDetectionResult {
  const allText = [
    tourRequested || '',
    rawItinerary || '',
    ...(interests || []),
    ...(cities || []),
    ...(specialRequests || [])
  ].join(' ').toLowerCase()

  // Cruise keywords - includes abbreviations
  const cruiseKeywords = [
    'nile cruise', 'cruise', 'river cruise', 'boat cruise',
    'felucca', 'dahabiya', 'sailing', 'cruise ship',
    'lake nasser', 'floating hotel',
    'crz', 'nts crz', 'check in crz', 'c/in crz', 'on board'
  ]

  const matchedKeywords = cruiseKeywords.filter(keyword => allText.includes(keyword))
  const isCruise = matchedKeywords.length > 0

  // Calculate cruise nights from "XNTs CRZ" pattern
  let cruiseNights = 0
  const cruiseNtsMatch = allText.match(/(\d+)\s*nts?\s*crz/i)
  if (cruiseNtsMatch) {
    cruiseNights = parseInt(cruiseNtsMatch[1])
  }

  // Calculate land nights
  let landNights = 0
  const landPatterns = [
    /(\d+)\s*nts?\s*cai/gi,  // Cairo nights
    /(\d+)\s*nts?\s*hrg/gi,  // Hurghada nights
    /(\d+)\s*nts?\s*ssh/gi,  // Sharm nights
    /(\d+)\s*nts?\s*alx/gi,  // Alexandria nights
    /(\d+)\s*nts?\s*htl/gi   // Generic hotel nights
  ]

  for (const pattern of landPatterns) {
    let match
    while ((match = pattern.exec(allText)) !== null) {
      landNights += parseInt(match[1])
    }
  }

  if (!isCruise) {
    return {
      isCruise: false,
      cruiseType: null,
      route: null,
      detectedDuration: null,
      startCity: null,
      endCity: null,
      keywords: [],
      includesLand: false,
      cruiseNights: 0,
      landNights: 0
    }
  }

  // Detect cruise type
  let cruiseType: 'nile-cruise' | 'lake-nasser' = 'nile-cruise'
  if (allText.includes('lake nasser') || allText.includes('abu simbel cruise')) {
    cruiseType = 'lake-nasser'
  }

  // Detect route direction
  let route: string | null = null
  let startCity: string | null = null
  let endCity: string | null = null

  // Check various route patterns
  const routePatterns = [
    { pattern: /luxor\s*(?:to|-|\/)\s*aswan|lxr\s*(?:to|-|\/)\s*asw/i, route: 'luxor-aswan', start: 'Luxor', end: 'Aswan' },
    { pattern: /aswan\s*(?:to|-|\/)\s*luxor|asw\s*(?:to|-|\/)\s*lxr/i, route: 'aswan-luxor', start: 'Aswan', end: 'Luxor' },
    { pattern: /round\s*trip/i, route: 'round-trip', start: 'Luxor', end: 'Luxor' }
  ]

  for (const { pattern, route: r, start, end } of routePatterns) {
    if (pattern.test(allText)) {
      route = r
      startCity = start
      endCity = end
      break
    }
  }

  // If no explicit route, infer from cities or default
  if (!route) {
    const citiesLower = (cities || []).map(c => c.toLowerCase())
    if (citiesLower.some(c => c.includes('luxor') || c.includes('lxr'))) {
      route = 'luxor-aswan'
      startCity = 'Luxor'
      endCity = 'Aswan'
    } else if (citiesLower.some(c => c.includes('aswan') || c.includes('asw'))) {
      route = 'aswan-luxor'
      startCity = 'Aswan'
      endCity = 'Luxor'
    } else if (cruiseType === 'lake-nasser') {
      route = 'aswan-abu-simbel'
      startCity = 'Aswan'
      endCity = 'Abu Simbel'
    } else {
      // Default to aswan-luxor (most common)
      route = 'aswan-luxor'
      startCity = 'Aswan'
      endCity = 'Luxor'
    }
  }

  // Detect duration from text
  let detectedDuration: number | null = null
  const durationPatterns = [
    { pattern: /(\d+)\s*night/i, addOne: true },
    { pattern: /(\d+)\s*day/i, addOne: false },
    { pattern: /(\d+)-night/i, addOne: true },
    { pattern: /(\d+)-day/i, addOne: false },
    { pattern: /(\d+)\s*nts?\s*crz/i, addOne: true }
  ]

  for (const { pattern, addOne } of durationPatterns) {
    const match = allText.match(pattern)
    if (match) {
      const num = parseInt(match[1])
      detectedDuration = addOne ? num + 1 : num
      break
    }
  }

  // Detect if trip includes land (hotels)
  const landCities = ['cairo', 'alexandria', 'hurghada', 'sharm', 'giza', 'dahab', 'marsa alam',
                      'cai', 'alx', 'hrg', 'ssh', 'gza', 'rmf']

  const citiesLower = (cities || []).map(c => c.toLowerCase())
  const hasLandCities = citiesLower.some(city =>
    landCities.some(lc => city.includes(lc))
  ) || landCities.some(lc => allText.includes(lc + ' hotel') || allText.includes('nts ' + lc))

  const includesLand = hasLandCities || landNights > 0 || (durationDays > (cruiseNights + 1))



  return {
    isCruise: true,
    cruiseType,
    route,
    detectedDuration,
    startCity,
    endCity,
    keywords: matchedKeywords,
    includesLand,
    cruiseNights,
    landNights
  }
}

// ============================================
// DETERMINE EFFECTIVE PACKAGE TYPE
// ============================================

export function determinePackageType(
  requestedPackageType: string,
  cruiseDetection: CruiseDetectionResult
): PackageType {
  // If explicitly requested cruise-land, use it
  if (requestedPackageType === 'cruise-land') {
    return 'cruise-land'
  }

  // If not a cruise detected, use the requested package type (or land-package as default)
  if (!cruiseDetection.isCruise) {
    if (requestedPackageType === 'full-package') {
      return 'land-package'
    }
    return (requestedPackageType as PackageType) || 'land-package'
  }

  // It's a cruise - determine if cruise-only or cruise+land
  if (cruiseDetection.includesLand) {
    return 'cruise-land'
  }

  return 'cruise-package'
}
