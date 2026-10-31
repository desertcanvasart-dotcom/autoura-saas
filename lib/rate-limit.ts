import { NextRequest, NextResponse } from 'next/server'
import { clientIpFromHeaders } from '@/lib/client-ip'

// ============================================
// RATE LIMITING UTILITY
// ============================================

interface RateLimitRecord {
  count: number
  resetTime: number
}

// In-memory store. NOTE: this is PER-INSTANCE and non-durable — with N app
// instances the effective limit is roughly N× and counters reset on deploy.
// It's a best-effort speed bump, not a hard guarantee. For a real distributed
// limit, back checkRateLimit with a shared store (Redis/Upstash) keyed the
// same way; the call sites don't change.
const rateLimitStore = new Map<string, RateLimitRecord>()

// Cleanup old records every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

// ============================================
// RATE LIMIT CONFIGURATIONS
// ============================================

export const RATE_LIMITS = {
  // General API calls
  api: {
    limit: 100,        // requests
    windowMs: 60000,   // per minute
  },
  // Authentication attempts
  auth: {
    limit: 5,          // attempts
    windowMs: 300000,  // per 5 minutes
  },
  // Public marketing contact form (no session, keyed by IP)
  contact: {
    limit: 5,          // submissions
    windowMs: 60000,   // per minute
  },
  // Traveller trip chat (share-token authed). Chat cadence is bursty — six
  // short lines in a minute is normal, not abuse — and hotel/CGNAT NAT means
  // one IP can carry several unrelated travellers. The per-trip store-backed
  // hourly cap remains the real flood control.
  chat: {
    limit: 20,         // messages
    windowMs: 60000,   // per minute
  },
  // File uploads
  upload: {
    limit: 10,         // uploads
    windowMs: 3600000, // per hour
  },
  // Email sending (lib/send-guard.ts) — a person, and a whole company.
  email: {
    limit: 60,         // emails
    windowMs: 3600000, // per hour
  },
  emailCompany: {
    limit: 1000,       // emails
    windowMs: 86400000, // per day
  },
  // Expensive operations (reports, exports)
  heavy: {
    limit: 5,          // requests
    windowMs: 60000,   // per minute
  },
  // AI calls (lib/ai-guard.ts) — a person: generous for real work, a
  // ceiling for a stuck loop or a script.
  ai: {
    limit: 20,         // AI requests
    windowMs: 60000,   // per minute
  },
  // AI work triggered by inbound messages, per conversation (lib/ai-guard).
  aiPerConversation: {
    limit: 10,         // AI runs
    windowMs: 3600000, // per hour
  },
  // AI calls — a whole company, across all its people.
  aiCompany: {
    limit: 300,        // AI requests
    windowMs: 3600000, // per hour
  },
  // SMS / WhatsApp sent from a template (lib/rate-limit-shared.ts) — a
  // person, and a whole company.
  messaging: {
    limit: 30,         // messages
    windowMs: 3600000, // per hour
  },
  messagingCompany: {
    limit: 300,        // messages
    windowMs: 86400000, // per day
  },
  // Data exports (app/api/account/export): each one reads every table.
  dataExport: {
    limit: 5,          // exports
    windowMs: 3600000, // per hour
  },
  // Publish websites (app/api/publish/internal/*): anonymous visitors.
  // A visitor's WhatsApp clicks (each makes a tracked reference), and a whole
  // site's — past either, the button opens WhatsApp without a reference.
  publishWaVisitor: {
    limit: 10,         // references
    windowMs: 60000,   // per minute
  },
  publishWaSite: {
    limit: 300,        // references
    windowMs: 3600000, // per hour
  },
  // A whole site's enquiries (each makes a CRM lead and rings the bell); a
  // visitor's own limit is `contact`.
  publishEnquirySite: {
    limit: 60,         // enquiries
    windowMs: 3600000, // per hour
  },
  // Publish admin, a whole company: AI page drafts (Claude) and Google place
  // searches (billed Text Search calls).
  publishDraftCompany: {
    limit: 20,         // drafts
    windowMs: 3600000, // per hour
  },
  publishPlaceSearchCompany: {
    limit: 30,         // searches
    windowMs: 3600000, // per hour
  },
  // Invitations
  invitation: {
    limit: 10,         // invites
    windowMs: 3600000, // per hour
  },
}

// ============================================
// CORE RATE LIMIT FUNCTION
// ============================================

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  resetTime: number
}

export function checkRateLimit(
  identifier: string,
  type: keyof typeof RATE_LIMITS = 'api'
): RateLimitResult {
  const config = RATE_LIMITS[type]
  const key = `${type}:${identifier}`
  const now = Date.now()
  
  const record = rateLimitStore.get(key)
  
  // First request or window expired
  if (!record || now > record.resetTime) {
    const resetTime = now + config.windowMs
    rateLimitStore.set(key, { count: 1, resetTime })
    return {
      success: true,
      limit: config.limit,
      remaining: config.limit - 1,
      resetTime,
    }
  }
  
  // Within window, check limit
  if (record.count >= config.limit) {
    return {
      success: false,
      limit: config.limit,
      remaining: 0,
      resetTime: record.resetTime,
    }
  }
  
  // Increment count
  record.count++
  return {
    success: true,
    limit: config.limit,
    remaining: config.limit - record.count,
    resetTime: record.resetTime,
  }
}

// ============================================
// HELPER TO GET CLIENT IDENTIFIER
// ============================================

/**
 * Best-effort client IP, resistant to X-Forwarded-For spoofing: the entry the
 * trusted edge appended, not the leftmost (see lib/client-ip.ts).
 */
export function getClientIdentifier(request: NextRequest): string {
  // Can't establish a trustworthy IP → one shared bucket (fail closed toward
  // limiting, not toward unlimited per-request identifiers).
  return clientIpFromHeaders(request.headers) ?? 'unknown'
}

/**
 * Preferred rate-limit identifier. An authenticated user id can't be spoofed
 * (it comes from the verified session), so use it when available; fall back to
 * the hardened client IP for anonymous requests.
 */
export function getRateLimitIdentifier(
  request: NextRequest,
  userId?: string | null
): string {
  return userId ? `user:${userId}` : `ip:${getClientIdentifier(request)}`
}

// ============================================
// RATE LIMIT RESPONSE HELPER
// ============================================

export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000)
  
  return NextResponse.json(
    {
      success: false,
      error: 'Too many requests. Please try again later.',
      retryAfter,
    },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': result.resetTime.toString(),
        'Retry-After': retryAfter.toString(),
      },
    }
  )
}

// ============================================
// MIDDLEWARE HELPER
// ============================================

export function withRateLimit(
  type: keyof typeof RATE_LIMITS = 'api'
) {
  return async function rateLimit(
    request: NextRequest,
    handler: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    const identifier = getClientIdentifier(request)
    const result = checkRateLimit(identifier, type)
    
    if (!result.success) {
      return rateLimitResponse(result)
    }
    
    // Add rate limit headers to response
    const response = await handler()
    response.headers.set('X-RateLimit-Limit', result.limit.toString())
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
    response.headers.set('X-RateLimit-Reset', result.resetTime.toString())
    
    return response
  }
}

// ============================================
// USAGE EXAMPLES
// ============================================

/*
// In API route:
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  // Check rate limit
  const ip = getClientIdentifier(request)
  const result = checkRateLimit(ip, 'auth')
  
  if (!result.success) {
    return rateLimitResponse(result)
  }
  
  // Continue with handler...
}

// Or with wrapper:
import { withRateLimit } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  return withRateLimit('email')(request, async () => {
    // Your email sending logic
    return NextResponse.json({ success: true })
  })
}
*/

// ============================================
// COMPOSITE RATE LIMITER (User + IP)
// ============================================

export function checkCompositeRateLimit(
  userId: string | null,
  ip: string,
  type: keyof typeof RATE_LIMITS = 'api'
): RateLimitResult {
  // Check IP-based limit (stricter)
  const ipResult = checkRateLimit(`ip:${ip}`, type)
  if (!ipResult.success) {
    return ipResult
  }
  
  // If user is authenticated, also check user-based limit (more lenient)
  if (userId) {
    const userResult = checkRateLimit(`user:${userId}`, type)
    // Return the more restrictive result
    if (!userResult.success) {
      return userResult
    }
    return userResult.remaining < ipResult.remaining ? userResult : ipResult
  }
  
  return ipResult
}