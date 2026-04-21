// ============================================
// Embeddings helper (OpenAI text-embedding-3-small, 1536 dims)
// ============================================
// Used by the copilot knowledge base to index content for semantic retrieval.
// ============================================

import OpenAI from 'openai'

export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMS = 1536

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
    _openai = new OpenAI({ apiKey })
  }
  return _openai
}

/**
 * Embed a single string. Throws on failure. Caller should handle errors.
 */
export async function embedText(text: string): Promise<number[]> {
  const input = text.slice(0, 8000).trim()
  if (!input) throw new Error('embedText: empty input')
  const client = getOpenAI()
  const resp = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input,
  })
  const vec = resp.data?.[0]?.embedding
  if (!vec || vec.length !== EMBEDDING_DIMS) {
    throw new Error(`embedText: unexpected embedding shape (length=${vec?.length})`)
  }
  return vec
}

/**
 * Embed a batch of strings in a single API call.
 * OpenAI supports up to ~2048 inputs per request; we cap at 96 for safety.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const inputs = texts.map((t) => (t || '').slice(0, 8000).trim()).filter((t) => t.length > 0)
  if (inputs.length === 0) return []

  const client = getOpenAI()
  const out: number[][] = []
  const CHUNK = 96
  for (let i = 0; i < inputs.length; i += CHUNK) {
    const slice = inputs.slice(i, i + CHUNK)
    const resp = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: slice,
    })
    for (const item of resp.data) {
      out.push(item.embedding)
    }
  }
  return out
}

/**
 * Simple character-based chunker for long documents.
 * Keeps paragraphs intact when possible, then falls back to sentence splits.
 */
export function chunkText(
  text: string,
  opts: { maxChars?: number; overlap?: number } = {}
): string[] {
  const maxChars = opts.maxChars ?? 1200
  const overlap = opts.overlap ?? 200
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (!clean) return []
  if (clean.length <= maxChars) return [clean]

  // First try paragraph splits
  const paragraphs = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    if (para.length > maxChars) {
      // Paragraph itself too large — flush current then hard-split
      if (current) {
        chunks.push(current)
        current = ''
      }
      for (let i = 0; i < para.length; i += maxChars - overlap) {
        chunks.push(para.slice(i, i + maxChars))
      }
      continue
    }
    if (current.length + para.length + 2 <= maxChars) {
      current = current ? `${current}\n\n${para}` : para
    } else {
      if (current) chunks.push(current)
      current = para
    }
  }
  if (current) chunks.push(current)
  return chunks
}

/**
 * Postgres vector literal for pgvector.
 * Node client doesn't have a native type, so we pass as string like '[0.1,0.2,...]'.
 */
export function toPgVector(vec: number[]): string {
  return `[${vec.join(',')}]`
}
