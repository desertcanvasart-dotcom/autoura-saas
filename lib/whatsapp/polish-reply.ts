// ============================================================================
// Polish my reply — the operator's own words, made ready to send
// ============================================================================
// The operator types the point their own way ("yes all 6 sites one day, 330
// euro for 2, pickup 7am, ask which hotel"), picks a style, and the AI writes
// it as a finished WhatsApp message. Owner's choices (2026-11-17):
//   - the style is picked EVERY time (short / detailed / formal …)
//   - the message is written in the language of the customer's LAST message
//     (the operator may type notes in Arabic, English, a mix…)
// Rules: never sent by itself — the text goes back into the box; and NO NEW
// FACTS — prices, times, dates, inclusions come only from the notes or the
// conversation. `unsourcedNumbers` flags any number that slipped in anyway.
//
// Pure, safe in the browser (the AI call lives in the API route).

export type PolishStyle = 'friendly' | 'short' | 'detailed' | 'formal'

export const POLISH_STYLES: { key: PolishStyle; label: string; hint: string; instruction: string }[] = [
  {
    key: 'friendly', label: 'Professional & friendly', hint: 'Warm, clear, the everyday choice',
    instruction: 'Professional and friendly. Warm but businesslike, clear and easy to read. At most one emoji, only if it fits.',
  },
  {
    key: 'short', label: 'Short', hint: 'A few lines, straight to the point',
    instruction: 'Short and direct: two to five short lines. Polite, no headings, no lists unless the notes are a list. No emojis.',
  },
  {
    key: 'detailed', label: 'Detailed', hint: 'Organised with headings and bullet points',
    instruction: 'Detailed and well organised: a short greeting, then the points under *bold* headings with bullet points (•) where it helps, then a clear closing question or next step.',
  },
  {
    key: 'formal', label: 'Formal', hint: 'Respectful and businesslike',
    instruction: 'Formal and respectful business register. Polite forms of address (e.g. vous / Sie / usted where the language has them), no contractions, no emojis.',
  },
]

export const DEFAULT_POLISH_STYLE: PolishStyle = 'friendly'

export function polishStyle(key: unknown): (typeof POLISH_STYLES)[number] {
  return POLISH_STYLES.find(s => s.key === key) ?? POLISH_STYLES[0]
}

export interface PolishMessage { direction: 'inbound' | 'outbound'; text: string }

const MAX_TURNS = 12
const MAX_TURN_CHARS = 1500

/** The system prompt and the user turn for one polish request. */
export function buildPolishPrompt(args: {
  businessName: string
  style: PolishStyle
  notes: string
  messages: readonly PolishMessage[]
  customerName?: string | null
}): { system: string; user: string } {
  const style = polishStyle(args.style)
  const recent = args.messages.slice(-MAX_TURNS)
  const hasInbound = recent.some(m => m.direction === 'inbound')
  const transcript = recent.length
    ? recent.map(m => `${m.direction === 'inbound' ? 'CUSTOMER' : 'US'}: ${m.text.slice(0, MAX_TURN_CHARS)}`).join('\n\n')
    : '(no messages yet)'

  const system = `You write WhatsApp messages for ${args.businessName}, a travel company. A team member gives you their NOTES — what they want to say, written quickly, in any language. Turn the notes into one finished message they can send to the customer as it is.

STYLE: ${style.label}. ${style.instruction}

LANGUAGE: ${hasInbound
    ? "Write in the language of the CUSTOMER's most recent message in the conversation, whatever language the notes are in."
    : 'There is no customer message yet: write in the language of the notes.'}

FACTS — the most important rule:
- Say what the notes say. Every price, amount, time, date, number of people, place, inclusion or promise must come from the notes or from the conversation. Never add, guess or change one.
- If the notes don't give a fact, leave it out. Don't add placeholders like [price] or [time].
- Don't drop anything the notes ask to say or ask.
- Don't sign with a person's name unless the notes give one.

WHATSAPP FORMAT: plain text with line breaks. *single asterisks* for bold, _underscores_ for italics, "•" for bullets. No markdown headings (#), no **double asterisks**, no links unless the notes contain them.

Reply with JSON only, no code fence:
{"language": "<the language you wrote in, in English, e.g. French>", "message": "<the finished message>"}`

  const user = [
    args.customerName ? `CUSTOMER NAME: ${args.customerName}` : null,
    'CONVERSATION (oldest first):',
    transcript,
    '',
    'NOTES FROM OUR TEAM MEMBER:',
    args.notes.trim(),
  ].filter(l => l !== null).join('\n')

  return { system, user }
}

/** The model's JSON reply → the message and its language; null when unusable. */
export function parsePolishReply(raw: string): { message: string; language: string | null } | null {
  let text = String(raw ?? '').trim()
  text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  try {
    const parsed = JSON.parse(text)
    const message = typeof parsed?.message === 'string' ? parsed.message.trim() : ''
    if (!message) return null
    const language = typeof parsed?.language === 'string' && parsed.language.trim() ? parsed.language.trim() : null
    return { message: cleanWhatsAppFormat(message), language }
  } catch {
    return null
  }
}

/** Markdown the model may still use → WhatsApp's own marks. */
export function cleanWhatsAppFormat(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const numbersIn = (s: string): string[] =>
  (String(s ?? '').match(/\d+(?:[.,]\d+)?/g) ?? [])
    .map(n => n.replace(',', '.').replace(/^0+(?=\d)/, ''))

/**
 * Numbers in the polished message found neither in the notes nor in the
 * conversation — a price or time the AI may have made up. Zeros are ignored
 * ("07h00", "15:00" add a 0 the notes never wrote).
 */
export function unsourcedNumbers(polished: string, sources: readonly string[]): string[] {
  const known = new Set(sources.flatMap(numbersIn))
  // "7.30" in the notes covers "7" and "30" in "7:30" / "7h30".
  for (const n of [...known]) for (const part of n.split('.')) known.add(part.replace(/^0+(?=\d)/, ''))
  // "4pm" in the notes is "16h00" in French: an hour 1–11 also covers +12.
  for (const n of [...known]) { const h = Number(n); if (Number.isInteger(h) && h >= 1 && h <= 11) known.add(String(h + 12)) }
  const out: string[] = []
  for (const n of numbersIn(polished)) {
    if (/^0+$/.test(n.replace('.', ''))) continue
    if (known.has(n)) continue
    if (n.includes('.') && n.split('.').every(p => known.has(p.replace(/^0+(?=\d)/, '')) || /^0+$/.test(p))) continue
    if (!out.includes(n)) out.push(n)
  }
  return out
}
