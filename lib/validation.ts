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
  name: z.string().min(1, 'Name is required').max(255).trim(),
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
  title: z.string().min(1).max(255).trim(),
  start_date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  end_date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
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
  title: z.string().min(1, 'Title is required').max(255).trim(),
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
  description: z.string().min(1).max(500).trim(),
  quantity: z.number().min(0).max(10000),
  unit_price: z.number().min(0).max(1000000),
  total: z.number().min(0).max(1000000000).optional(),
})

export const InvoiceCreateSchema = z.object({
  client_id: UUIDSchema,
  itinerary_id: UUIDSchema.optional().nullable(),
  invoice_number: z.string().max(50).trim().optional(),
  issue_date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  due_date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  status: z.enum(['draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled']).default('draft'),
  currency: z.string().length(3).default('USD'),
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
  role: z.enum(['admin', 'manager', 'agent', 'viewer']).default('agent'),
})

// ============================================
// USER PROFILE SCHEMA
// ============================================

export const ProfileUpdateSchema = z.object({
  full_name: z.string().min(1).max(255).trim().optional(),
  phone: PhoneSchema,
  timezone: z.string().max(100).optional(),
  company_name: z.string().max(255).trim().optional().nullable(),
})

// ============================================
// TEAM MEMBER SCHEMA
// ============================================

export const TeamMemberCreateSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  email: EmailSchema.optional().nullable(),
  phone: PhoneSchema,
  role: z.string().max(50).default('staff'),
  notes: z.string().max(2000).trim().optional().nullable(),
})

// ============================================
// EXPENSE SCHEMA
// ============================================

export const ExpenseCreateSchema = z.object({
  description: z.string().min(1).max(500).trim(),
  amount: z.number().min(0).max(1000000),
  currency: z.string().length(3).default('USD'),
  category: z.string().max(100).optional(),
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  receipt_url: z.string().url().max(500).optional().nullable(),
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