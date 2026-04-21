// ============================================
// POST /api/copilot/knowledge/bulk-import
// Two modes:
//   - as_is:     paste stored as a single entry, chunked + embedded
//   - ai_extract: Claude segments the text into typed entries
//                 (kb_faq / kb_policy / kb_tour / kb_custom), each stored separately
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '@/lib/supabase-server'
import { chunkText, embedBatch, EMBEDDING_MODEL, toPgVector } from '@/lib/embeddings'

type KbSourceType = 'kb_faq' | 'kb_policy' | 'kb_tour' | 'kb_custom'
const KB_TYPES: KbSourceType[] = ['kb_faq', 'kb_policy', 'kb_tour', 'kb_custom']
const MODEL = process.env.WHATSAPP_AI_MODEL || 'claude-sonnet-4-20250514'

let _anthropic: Anthropic | null = null
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  return _anthropic
}

interface ExtractedEntry {
  source_type: KbSourceType
  title?: string | null
  question?: string | null
  content: string
}

async function aiExtract(text: string): Promise<ExtractedEntry[]> {
  const anthropic = getAnthropic()

  const systemPrompt = `You are a content structurer for a travel agency knowledge base. Given a blob of pasted text (which may contain FAQs, policies, tour descriptions, or general info), split it into discrete knowledge entries.

CATEGORIES
- kb_faq     — a question + answer pair. Requires BOTH a clear question and its answer.
- kb_policy  — policies, terms, rules, cancellation / refund / payment details.
- kb_tour    — tour descriptions, itineraries, what's included.
- kb_custom  — anything else worth the copilot knowing.

RULES
- Preserve original wording of factual content (prices, dates, names). Do NOT invent details.
- Combine related sentences into one entry (don't over-split). Each entry should be self-contained and useful in isolation.
- For FAQs, rewrite the question if needed so it sounds like something a customer would naturally ask.
- Give each entry a short, descriptive title (under 70 chars). For FAQs the title is optional.
- Skip filler, marketing language, duplicate sections.
- Output valid JSON only — no markdown, no backticks.

OUTPUT
{
  "entries": [
    { "source_type": "kb_faq", "title": "...", "question": "...", "content": "the answer" },
    { "source_type": "kb_policy", "title": "Cancellation policy", "content": "..." },
    ...
  ]
}

Limit to at most 40 entries per call.`

  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: `Structure the following text into knowledge entries:\n\n${text}` }],
  })

  const first = resp.content[0]
  if (first?.type !== 'text') throw new Error('Non-text response')
  let jsonText = first.text.trim()
  jsonText = jsonText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
  const parsed = JSON.parse(jsonText)
  if (!parsed || !Array.isArray(parsed.entries)) throw new Error('Bad extraction shape')

  return parsed.entries
    .filter((e: any) => e && typeof e.content === 'string' && e.content.trim())
    .map((e: any) => ({
      source_type: KB_TYPES.includes(e.source_type) ? e.source_type : 'kb_custom',
      title: typeof e.title === 'string' && e.title.trim() ? e.title.trim().slice(0, 140) : null,
      question: typeof e.question === 'string' && e.question.trim() ? e.question.trim() : null,
      content: e.content.trim(),
    }))
    .slice(0, 40) as ExtractedEntry[]
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.supabase || !auth.tenant_id) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
  }
  const { supabase, tenant_id } = auth

  const body = await request.json().catch(() => ({}))
  const text: string = (body.text || '').toString()
  const mode: 'as_is' | 'ai_extract' = body.mode === 'ai_extract' ? 'ai_extract' : 'as_is'
  const defaultType: KbSourceType = KB_TYPES.includes(body.source_type) ? body.source_type : 'kb_custom'
  const defaultTitle: string | null = (body.title || '').toString().trim() || null

  if (!text.trim() || text.trim().length < 20) {
    return NextResponse.json({ success: false, error: 'Paste at least 20 characters of content' }, { status: 400 })
  }

  // 1. Build list of entries
  let entries: ExtractedEntry[]
  if (mode === 'ai_extract') {
    try {
      entries = await aiExtract(text)
    } catch (err: any) {
      return NextResponse.json({ success: false, error: `AI extraction failed: ${err?.message}` }, { status: 502 })
    }
    if (entries.length === 0) {
      return NextResponse.json({ success: false, error: 'AI extracted no entries from the text' }, { status: 422 })
    }
  } else {
    entries = [{ source_type: defaultType, title: defaultTitle, content: text.trim() }]
  }

  // 2. Chunk + embed each entry. Collect all chunks in one batch embed call for cost efficiency.
  interface Prepared {
    entry: ExtractedEntry
    chunks: string[]
    queryTexts: string[]
  }
  const prepared: Prepared[] = []
  const allQueryTexts: string[] = []

  for (const e of entries) {
    const chunks = chunkText(e.content)
    if (chunks.length === 0) continue
    const queryTexts = chunks.map((c) => {
      if (e.source_type === 'kb_faq' && e.question) return e.question
      if (e.title) return `${e.title}\n\n${c}`
      return c
    })
    prepared.push({ entry: e, chunks, queryTexts })
    allQueryTexts.push(...queryTexts)
  }

  if (prepared.length === 0) {
    return NextResponse.json({ success: false, error: 'No usable chunks after normalization' }, { status: 400 })
  }

  let vectors: number[][]
  try {
    vectors = await embedBatch(allQueryTexts)
  } catch (err: any) {
    return NextResponse.json({ success: false, error: `Embedding failed: ${err?.message}` }, { status: 502 })
  }
  if (vectors.length !== allQueryTexts.length) {
    return NextResponse.json({ success: false, error: 'Embedding count mismatch' }, { status: 502 })
  }

  // 3. Insert parents + child chunks
  let cursor = 0
  let createdCount = 0
  const failures: string[] = []

  for (const p of prepared) {
    const parentVec = vectors[cursor]
    const { data: parent, error: parentErr } = await supabase
      .from('copilot_knowledge')
      .insert({
        tenant_id,
        source_type: p.entry.source_type,
        title: p.entry.title,
        query_text: p.queryTexts[0],
        answer_text: p.chunks[0],
        metadata: {
          question: p.entry.question || null,
          total_chunks: p.chunks.length,
          imported: true,
          import_mode: mode,
        },
        embedding: toPgVector(parentVec) as any,
        embedding_model: EMBEDDING_MODEL,
        chunk_index: 0,
      })
      .select('id')
      .single()

    if (parentErr || !parent) {
      failures.push(parentErr?.message || 'unknown')
      cursor += p.chunks.length
      continue
    }

    if (p.chunks.length > 1) {
      const childRows = p.chunks.slice(1).map((chunk, idx) => ({
        tenant_id,
        source_type: p.entry.source_type,
        parent_id: parent.id,
        title: p.entry.title,
        query_text: p.queryTexts[idx + 1],
        answer_text: chunk,
        metadata: { question: p.entry.question || null, imported: true, import_mode: mode },
        embedding: toPgVector(vectors[cursor + idx + 1]) as any,
        embedding_model: EMBEDDING_MODEL,
        chunk_index: idx + 1,
      }))
      const { error: childErr } = await supabase.from('copilot_knowledge').insert(childRows)
      if (childErr) {
        failures.push(childErr.message)
      }
    }

    createdCount += 1
    cursor += p.chunks.length
  }

  return NextResponse.json({
    success: true,
    mode,
    created: createdCount,
    total: prepared.length,
    failures,
    preview: entries.slice(0, 5).map((e) => ({
      source_type: e.source_type,
      title: e.title,
      question: e.question,
      preview: e.content.slice(0, 120) + (e.content.length > 120 ? '…' : ''),
    })),
  })
}
