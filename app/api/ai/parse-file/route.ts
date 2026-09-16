// ============================================
// POST /api/ai/parse-file
// Extract text from PDF, image, or DOCX files
// Uses Claude vision for images/PDFs, basic XML parsing for DOCX
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { createMessageWithRetry, getUserFriendlyError, isAiServiceError, replyText } from '@/lib/ai/anthropic-client'
import { CLAUDE_MODEL } from '@/lib/ai/models'

const MAX_FILE_SIZE = 32 * 1024 * 1024 // 32MB

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }

    const body = await request.json()
    const { file, filename, mimeType } = body

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 })
    }

    // Decode base64 to check size
    const buffer = Buffer.from(file, 'base64')
    if (buffer.length > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'File too large (max 32MB)' }, { status: 400 })
    }

    const lowerName = (filename || '').toLowerCase()
    let extractedText = ''

    // --- DOC (legacy): refused, not guessed at ---
    // This used to send the .doc bytes to Claude labelled image/png, which the
    // API rejects every time — the operator then saw an AI error for a file
    // format we simply do not read.
    if (lowerName.endsWith('.doc') || mimeType === 'application/msword') {
      return NextResponse.json({
        success: false,
        error: 'Old Word (.doc) files cannot be read. Save it as .docx or PDF and upload again.',
      }, { status: 400 })
    }
    // --- DOCX: extract text from XML ---
    else if (lowerName.endsWith('.docx') || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      extractedText = await extractTextFromDocx(buffer)
    }
    // --- Images: use Claude vision ---
    else if (mimeType?.startsWith('image/') || lowerName.match(/\.(png|jpg|jpeg|webp|gif)$/)) {
      extractedText = await extractTextWithVision(file, mimeType || 'image/png')
    }
    // --- PDF: use Claude vision (send as document) ---
    else if (lowerName.endsWith('.pdf') || mimeType === 'application/pdf') {
      extractedText = await extractTextFromPdf(file)
    }
    // --- Plain text ---
    else if (lowerName.endsWith('.txt') || mimeType?.startsWith('text/')) {
      extractedText = buffer.toString('utf-8')
    }
    else {
      return NextResponse.json({
        success: false,
        error: `Unsupported file type: ${mimeType || filename}`,
      }, { status: 400 })
    }

    if (!extractedText || extractedText.trim().length < 5) {
      return NextResponse.json({
        success: false,
        error: 'Could not extract any meaningful text from the file',
      }, { status: 422 })
    }

    return NextResponse.json({
      success: true,
      text: extractedText.trim(),
      filename,
      charCount: extractedText.trim().length,
    })

  } catch (error: any) {
    if (isAiServiceError(error)) {
      const { message, status } = getUserFriendlyError(error)
      return NextResponse.json({ success: false, error: message }, { status })
    }
    console.error('Parse file error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'File processing failed' },
      { status: 500 }
    )
  }
}

// --- Extract text from DOCX (ZIP containing XML) ---
async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    // DOCX is a ZIP file. We use a lightweight approach:
    // Find the word/document.xml inside the ZIP and extract text from XML tags
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(buffer)
    const docXml = await zip.file('word/document.xml')?.async('string')
    if (!docXml) return ''

    // Strip XML tags, keep text content
    const text = docXml
      .replace(/<w:br[^>]*\/>/g, '\n')           // line breaks
      .replace(/<\/w:p>/g, '\n')                   // paragraph ends
      .replace(/<[^>]+>/g, '')                     // strip all tags
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#x[0-9a-fA-F]+;/g, '')           // remove special entities
      .replace(/\n{3,}/g, '\n\n')                  // collapse multiple newlines
      .trim()

    return text
  } catch (err) {
    // Not a readable ZIP. There is no AI fallback: the old one sent the bytes
    // as an image, which the API always rejects. Empty text → the handler's 422.
    console.error('DOCX extraction error:', (err as Error).message)
    return ''
  }
}

// --- Extract text from image using Claude vision ---
async function extractTextWithVision(base64Data: string, mediaType: string): Promise<string> {
  const validMediaTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
  type ValidMediaType = typeof validMediaTypes[number]

  let resolvedType: ValidMediaType = 'image/png'
  if (validMediaTypes.includes(mediaType as ValidMediaType)) {
    resolvedType = mediaType as ValidMediaType
  } else if (mediaType === 'image/jpg') {
    resolvedType = 'image/jpeg'
  }

  const response = await createMessageWithRetry({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    // Transcription, not reasoning.
    output_config: { effort: 'low' },
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: resolvedType,
            data: base64Data,
          },
        },
        {
          type: 'text',
          text: 'Extract ALL text content from this image. This is a travel itinerary, booking request, or tour program. Preserve the structure (day numbers, activities, hotel names, etc). Return only the extracted text, nothing else.',
        },
      ],
    }],
  })

  return replyText(response)
}

// --- Extract text from PDF using Claude ---
async function extractTextFromPdf(base64Data: string): Promise<string> {
  const response = await createMessageWithRetry({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    // Transcription, not reasoning.
    output_config: { effort: 'low' },
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: base64Data,
          },
        },
        {
          type: 'text',
          text: 'Extract ALL text content from this PDF document. This is a travel itinerary, booking request, or tour program. Preserve the structure (day numbers, activities, hotel names, flight details, etc). Return only the extracted text, nothing else.',
        },
      ],
    }],
  })

  return replyText(response)
}
