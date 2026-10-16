// app/api/translate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { requireAuth } from '@/lib/supabase-server'
import { aiBudgetDenied, aiInputTooLong } from '@/lib/ai-guard'

/** A message to translate, not a document. */
const MAX_TRANSLATE_CHARS = 5_000

// Lazy-initialized OpenAI client (avoids build-time errors when env vars unavailable)
let _openai: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined in environment variables')
    }
    _openai = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 1 })
  }
  return _openai
}

export async function POST(request: NextRequest) {
  try {
    // Signed in, and within the AI ceiling. The middleware already demanded a
    // session, but this route checked nothing itself and paid OpenAI for any
    // amount of text, as often as it was called.
    const auth = await requireAuth()
    if (auth.error !== null) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const overBudget = await aiBudgetDenied(auth.user!.id, auth.tenant_id)
    if (overBudget) return overBudget

    // Check API key first
    if (!process.env.OPENAI_API_KEY) {
      console.error('Missing OPENAI_API_KEY')
      return NextResponse.json(
        { success: false, error: 'Translation service not configured' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { text, targetLanguage, action } = body

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Text is required' },
        { status: 400 }
      )
    }
    const tooLong = aiInputTooLong(text, MAX_TRANSLATE_CHARS)
    if (tooLong) return tooLong
    // The language name goes into the prompt: a name, not instructions.
    if (targetLanguage !== undefined && (typeof targetLanguage !== 'string' || targetLanguage.length > 40)) {
      return NextResponse.json({ success: false, error: 'Unknown target language' }, { status: 400 })
    }

    let prompt: string
    let systemPrompt: string

    if (action === 'toEnglish') {
      // Translate incoming message TO English
      systemPrompt = 'You are a professional translator. Detect the language of the input and translate it to English. Respond only with the translation, nothing else.'
      prompt = `Translate the following text to English. Only respond with the translation, no explanations:\n\n${text}`
    } else if (action === 'fromEnglish') {
      // Translate outgoing message FROM English
      if (!targetLanguage) {
        return NextResponse.json(
          { success: false, error: 'Target language is required' },
          { status: 400 }
        )
      }
      systemPrompt = 'You are a professional translator. Respond only with the translation, nothing else.'
      prompt = `Translate the following English text to ${targetLanguage}. Only respond with the translation, no explanations:\n\n${text}`
    } else {
      // Default: auto-detect and translate to target
      if (!targetLanguage) {
        return NextResponse.json(
          { success: false, error: 'Target language is required' },
          { status: 400 }
        )
      }
      systemPrompt = 'You are a professional translator. Respond only with the translation, nothing else.'
      prompt = `Translate the following text to ${targetLanguage}. Only respond with the translation, no explanations:\n\n${text}`
    }

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1000
    })

    const translatedText = response.choices[0]?.message?.content?.trim()

    if (!translatedText) {
      return NextResponse.json(
        { success: false, error: 'Translation returned empty' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        translatedText,
        originalText: text,
        action,
        targetLanguage: action === 'toEnglish' ? 'en' : targetLanguage
      }
    })

  } catch (error: any) {
    console.error('Translation API error:', error)
    
    if (error?.status === 401 || error?.code === 'invalid_api_key') {
      return NextResponse.json(
        { success: false, error: 'Invalid API key' },
        { status: 401 }
      )
    }

    if (error?.status === 429) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429 }
      )
    }

    return NextResponse.json(
      { success: false, error: 'Translation failed' },
      { status: 500 }
    )
  }
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }
  return NextResponse.json({
    success: true,
    message: 'Translation API is running',
    configured: !!process.env.OPENAI_API_KEY,
    supportedActions: ['toEnglish', 'fromEnglish', 'translate']
  })
}