import { z } from 'zod'

// ============================================
// INPUT VALIDATION SCHEMAS
// npm install zod
// ============================================

// ============================================
// COMMON SCHEMAS
// ============================================

export const UUIDSchema = z.string().uuid()

export const EmailSchema = z.string().email().max(255).toLowerCase().trim()

// A bare \d{4}-\d{2}-\d{2} regex let impossible dates like 2026-13-99 reach
// the DB — the round-trip through Date rejects them.
const PlainDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(s => {
    const [y, m, d] = s.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    return (
      dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    )
  }, 'Not a valid calendar date')

export const DateStringSchema = z.string().datetime().or(PlainDateSchema)

// Shape-normalized 3-letter code ('usd' → 'USD'); length(3) alone let '$$$' through.
export const CurrencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Must be a 3-letter currency code')

export const PhoneSchema = z.string().max(50).trim().optional().nullable()

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().max(100).optional(),
  sort: z.string().max(50).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
})

// ============================================
// CLIENT SCHEMAS
// ============================================

export const ClientCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  email: EmailSchema.optional().nullable(),
  phone: PhoneSchema,
  company: z.string().max(255).trim().optional().nullable(),
  address: z.string().max(500).trim().optional().nullable(),
  city: z.string().max(100).trim().optional().nullable(),
  country: z.string().max(100).trim().optional().nullable(),
  notes: z.string().max(5000).trim().optional().nullable(),
  source: z.string().max(100).trim().optional().nullable(),
  tags: z.array(z.string().max(50)).max(20).optional(),
})

export const ClientUpdateSchema = ClientCreateSchema.partial().extend({
  id: UUIDSchema,
})

// ============================================
// ITINERARY SCHEMAS
// ============================================

export const ItineraryCreateSchema = z.object({
  client_id: UUIDSchema,
  title: z.string().trim().min(1).max(255),
  start_date: DateStringSchema,
  end_date: DateStringSchema,
  status: z.enum(['draft', 'pending', 'confirmed', 'completed', 'cancelled']).default('draft'),
  pax: z.number().int().min(1).max(100).default(1),
  notes: z.string().max(5000).trim().optional().nullable(),
})

export const ItineraryUpdateSchema = ItineraryCreateSchema.partial().extend({
  id: UUIDSchema,
})

// ============================================
// TASK SCHEMAS
// ============================================

export const TaskCreateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(255),
  description: z.string().max(5000).trim().optional().nullable(),
  assigned_to: UUIDSchema.optional().nullable(),
  due_date: z.string().datetime().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).default('pending'),
  client_id: UUIDSchema.optional().nullable(),
  itinerary_id: UUIDSchema.optional().nullable(),
})

export const TaskUpdateSchema = TaskCreateSchema.partial().extend({
  id: UUIDSchema,
})

// ============================================
// INVOICE SCHEMAS
// ============================================

export const InvoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().min(0).max(10000),
  unit_price: z.number().min(0).max(1000000),
  total: z.number().min(0).max(1000000000).optional(),
})

export const InvoiceCreateSchema = z.object({
  client_id: UUIDSchema,
  itinerary_id: UUIDSchema.optional().nullable(),
  invoice_number: z.string().max(50).trim().optional(),
  issue_date: DateStringSchema,
  due_date: DateStringSchema,
  status: z.enum(['draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled']).default('draft'),
  currency: CurrencyCodeSchema.default('USD'),
  items: z.array(InvoiceItemSchema).min(1, 'At least one item required'),
  notes: z.string().max(2000).trim().optional().nullable(),
  tax_rate: z.number().min(0).max(100).default(0),
  discount: z.number().min(0).max(1000000).default(0),
})

// ============================================
// USER INVITATION SCHEMA
// ============================================

export const InvitationCreateSchema = z.object({
  email: EmailSchema,
  role: z.enum(['admin', 'manager', 'member', 'viewer']).default('member'),
})

// ============================================
// USER PROFILE SCHEMA
// ============================================

export const ProfileUpdateSchema = z.object({
  full_name: z.string().trim().min(1).max(255).optional(),
  phone: PhoneSchema,
  timezone: z.string().max(100).optional(),
  company_name: z.string().max(255).trim().optional().nullable(),
})

// ============================================
// TEAM MEMBER SCHEMA
// ============================================

export const TeamMemberCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: EmailSchema.optional().nullable(),
  phone: PhoneSchema,
  role: z.string().max(50).default('staff'),
  notes: z.string().max(2000).trim().optional().nullable(),
})

// ============================================
// EXPENSE SCHEMA
// ============================================

export const ExpenseCreateSchema = z.object({
  description: z.string().trim().min(1).max(500),
  amount: z.number().min(0).max(1000000),
  currency: CurrencyCodeSchema.default('USD'),
  category: z.string().max(100).optional(),
  date: DateStringSchema,
  receipt_url: z.string().url().max(500).refine(u => /^https?:\/\//i.test(u), 'Only http(s) URLs are allowed').optional().nullable(),
  notes: z.string().max(2000).trim().optional().nullable(),
  itinerary_id: UUIDSchema.optional().nullable(),
  vendor: z.string().max(255).trim().optional().nullable(),
})

// ============================================
// VALIDATION HELPER FUNCTION
// ============================================

import { NextResponse } from 'next/server'

export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: NextResponse } {
  const result = schema.safeParse(data)
  
  if (!result.success) {
    const errors = result.error.issues.map(e => ({  
    field: e.path.join('.'),
      message: e.message
    }))
    
    return {
      success: false,
      error: NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: errors
        },
        { status: 400 }
      )
    }
  }
  
  return { success: true, data: result.data }
}

// ============================================
// USAGE EXAMPLE
// ============================================

/*
import { ClientCreateSchema, validateInput } from '@/lib/validation'

export async function POST(request: NextRequest) {
  const body = await request.json()
  
  // Validate input
  const validation = validateInput(ClientCreateSchema, body)
  if (!validation.success) {
    return validation.error // Returns 400 with detailed errors
  }
  
  // Use validated & sanitized data
  const clientData = validation.data
  
  // Safe to use - all fields are validated and typed
  const { data, error } = await supabase
    .from('clients')
    .insert(clientData)
    .select()
    .single()
}
*/