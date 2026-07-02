import { NextRequest, NextResponse } from 'next/server'

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
  // File uploads
  upload: {
    limit: 10,         // uploads
    windowMs: 3600000, // per hour
  },
  // Email sending
  email: {
    limit: 20,         // emails
    windowMs: 3600000, // per hour
  },
  // Expensive operations (reports, exports)
  heavy: {
    limit: 5,          // requests
    windowMs: 60000,   // per minute
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

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const IPV6_RE = /^[0-9a-fA-F:]+$/

function isValidIp(value: string): boolean {
  if (IPV4_RE.test(value)) {
    return value.split('.').every(o => Number(o) <= 255)
  }
  return value.includes(':') && IPV6_RE.test(value)
}

/**
 * Best-effort client IP, resistant to X-Forwarded-For spoofing.
 *
 * X-Forwarded-For is client-controllable: a client can PREPEND arbitrary
 * entries, and each proxy APPENDS the address it saw. So the trustworthy
 * client IP is not the leftmost entry (the old bug — trivially spoofed to
 * rotate identifiers and bypass the limit) but the one the outermost trusted
 * proxy appended: the Nth entry from the right, where N = number of trusted
 * proxy hops (TRUSTED_PROXY_COUNT, default 1 for a single edge like Railway).
 * Values that don't parse as an IP are rejected so a garbage header can't
 * mint unlimited identifiers.
 */
export function getClientIdentifier(request: NextRequest): string {
  const hops = Math.max(1, parseInt(process.env.TRUSTED_PROXY_COUNT || '1', 10) || 1)

  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const parts = forwardedFor.split(',').map(p => p.trim()).filter(Boolean)
    // The address the outermost trusted proxy observed.
    const candidate = parts[parts.length - hops]
    if (candidate && isValidIp(candidate)) {
      return candidate
    }
  }

  const realIp = request.headers.get('x-real-ip')?.trim()
  if (realIp && isValidIp(realIp)) {
    return realIp
  }

  // Can't establish a trustworthy IP → one shared bucket (fail closed toward
  // limiting, not toward unlimited per-request identifiers).
  return 'unknown'
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