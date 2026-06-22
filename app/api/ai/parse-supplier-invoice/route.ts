import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createMessageWithRetry, getUserFriendlyError } from '@/lib/ai/anthropic-client'

const ACCEPTED_TYPES: Record<string, 'pdf' | 'image'> = {
  'application/pdf': 'pdf',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
}

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

const EXTRACTION_PROMPT = `You are an expert at reading supplier invoices for a travel/tour operations company.

Analyze the uploaded document (PDF or image) and extract all invoice information into a structured JSON format.

EXTRACTION RULES:
1. Extract EXACTLY what is written — do not infer or guess missing fields
2. For amounts, extract the numeric value only (no currency symbols)
3. For dates, convert to YYYY-MM-DD format when possible
4. If a field is not present or unreadable, set it to null
5. For line items, extract each individual line with description, quantity, unit price, and total
6. Detect the currency from symbols or text (€, $, £, EGP, E£, LE, etc.)
7. Look for tax/VAT amounts separately from the subtotal
8. The supplier name is typically at the top of the invoice or in the header/letterhead
9. The invoice number may be labeled as "Invoice #", "Inv No", "Bill No", "Reference", "Ref", etc.

CURRENCY DETECTION:
- € or EUR = EUR
- $ or USD = USD
- £ or GBP = GBP
- EGP, E£, LE, ج.م = EGP
- If unclear, default to EUR

Return ONLY a valid JSON object (no markdown, no explanation) with this exact structure:

{
  "supplier_name": "string or null",
  "supplier_invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "currency": "EUR|USD|GBP|EGP",
  "subtotal": number or null,
  "tax_amount": number or null,
  "total_amount": number or null,
  "description": "brief summary of what this invoice is for, or null",
  "line_items": [
    { "description": "string", "quantity": number, "unit_price": number, "amount": number }
  ],
  "confidence": {
    "supplier_name": "high|medium|low",
    "invoice_number": "high|medium|low",
    "amounts": "high|medium|low",
    "overall": "high|medium|low"
  },
  "notes": "any observations about the document quality, missing fields, or ambiguities"
}`

export async function POST(request: NextRequest) {
  try {
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ success: false, error: 'Expected a multipart/form-data file upload' }, { status: 400 })
    }
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 })
    }

    const fileCategory = ACCEPTED_TYPES[file.type]
    if (!fileCategory) {
      return NextResponse.json(
        { success: false, error: `Unsupported file type: ${file.type}. Accepted: PDF, PNG, JPG, WebP, GIF` },
        { status: 400 }
      )
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'File too large. Maximum size is 20MB.' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const base64Data = Buffer.from(arrayBuffer).toString('base64')

    const contentBlocks: Anthropic.MessageCreateParamsNonStreaming['messages'][0]['content'] = []
    if (fileCategory === 'pdf') {
      contentBlocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64Data },
      } as any)
    } else {
      contentBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: file.type as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif', data: base64Data },
      })
    }
    contentBlocks.push({ type: 'text', text: EXTRACTION_PROMPT })

    const message = await createMessageWithRetry({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: contentBlocks }],
    })

    const responseText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('')

    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json(
        { success: false, error: 'Could not extract structured data from this document. Please try a clearer image or PDF.' },
        { status: 422 }
      )
    }

    const extracted = JSON.parse(jsonMatch[0])

    return NextResponse.json({
      success: true,
      data: {
        supplier_name: extracted.supplier_name || '',
        supplier_invoice_number: extracted.supplier_invoice_number || '',
        invoice_date: extracted.invoice_date || '',
        due_date: extracted.due_date || '',
        currency: extracted.currency || 'EUR',
        subtotal: extracted.subtotal,
        tax_amount: extracted.tax_amount || 0,
        total_amount: extracted.total_amount || extracted.subtotal || 0,
        description: extracted.description || '',
        line_items: extracted.line_items || [],
        confidence: extracted.confidence || {},
        notes: extracted.notes || '',
      },
    })
  } catch (error: unknown) {
    console.error('Supplier invoice parsing error:', error)
    const friendly = getUserFriendlyError(error)
    return NextResponse.json({ success: false, error: friendly.message }, { status: friendly.status })
  }
}
