import { describe, it, expect, vi } from 'vitest'
import { matchByShorthand, matchDaysToBlocks, matchPrompt, matchSchema, type AiMatchReply, type RawDay } from '@/lib/day-blocks/match'
import type { DayBlock } from '@/lib/day-blocks/blocks'

const none = { included: false, venue: null }
const block = (code: string, shorthand: string[], over: Partial<DayBlock> = {}): DayBlock => ({
  code, name: code, shorthand, day_type: 'tour', city: 'Cairo', to_city: null, night: 'same', night_place: null,
  attractions: [], photo_stops: [], guide: 'egyptologist', meals: { breakfast: none, lunch: none, dinner: none },
  transport: null, assistance: [], optional_extras: [], description: null, notes: null, source: null, ...over,
})

const LIBRARY = [
  block('CAI-ALX', ['CAI/ALX/CAI', 'ALX DAY'], { city: 'Alexandria', attractions: ["Pompey's Pillar"] }),
  block('CAI-GIZ-GEM', ['GIZA+GEM', 'PYR GEM']),
  block('ASW-ABS-ROAD', ['ABS', 'ABU SIMBEL'], { city: 'Abu Simbel' }),
  block('ASW-ABS-OVN-1', ['ABS OVN'], { city: 'Aswan', to_city: 'Abu Simbel', night: 'move', day_type: 'transfer' }),
]

const day = (dayNumber: number, raw: string, over: Partial<RawDay> = {}): RawDay => ({ dayNumber, raw, ...over })

describe('shorthand, before any AI', () => {
  it('a day that carries a block’s shorthand is that block', () => {
    expect(matchByShorthand(day(3, 'D3 CAI/ALX/CAI L'), LIBRARY)).toEqual({ code: 'CAI-ALX', shorthand: 'CAI/ALX/CAI' })
    expect(matchByShorthand(day(2, 'D2 giza+gem with lunch'), LIBRARY)?.code).toBe('CAI-GIZ-GEM')
  })

  it('whole words only: "ABS" is not inside "ABSOLUTELY"', () => {
    expect(matchByShorthand(day(1, 'absolutely free day'), LIBRARY)).toBeNull()
  })

  it('the more specific shorthand wins: "ABS OVN" over "ABS"', () => {
    expect(matchByShorthand(day(4, 'D4 ABS OVN by road'), LIBRARY)?.code).toBe('ASW-ABS-OVN-1')
  })

  it('a place name is not a block: "Abu Simbel" fits a road trip and a flight alike', () => {
    expect(matchByShorthand(day(4, 'D4 fly to Abu Simbel'), LIBRARY)).toBeNull()
  })

  it('a word inside a longer sentence is a hint for the AI, not the day', () => {
    const lib = [...LIBRARY, block('ASW-FELUCCA', ['FELUCCA'], { city: 'Aswan' })]
    expect(matchByShorthand(day(5, 'D5 sail to Kom Ombo, felucca ride in the evening before dinner aboard'), lib)).toBeNull()
    expect(matchByShorthand(day(5, 'D5 FELUCCA'), lib)?.code).toBe('ASW-FELUCCA')
  })

  it('two blocks named equally specifically go to the AI', () => {
    const lib = [block('A', ['XYZ']), block('B', ['XYZ'])]
    expect(matchByShorthand(day(1, 'XYZ'), lib)).toBeNull()
  })
})

describe('matching a trip', () => {
  it('asks the AI only about the days shorthand did not settle, and holds it to the library', async () => {
    const ask = vi.fn(async (pending: readonly RawDay[]): Promise<AiMatchReply> => {
      expect(pending.map(d => d.dayNumber)).toEqual([1, 2, 4])
      return {
        matches: [
          { day_number: 1, code: 'CAI-GIZ-GEM', confidence: 'high', reason: 'Pyramids and GEM in Cairo' },
          // Not in the library: no match, never a guess.
          { day_number: 2, code: 'CAI-ISLAMIC', confidence: 'high', reason: 'made up' },
          { day_number: 4, code: 'ASW-ABS-ROAD', confidence: 'low', reason: 'by flight, the block is by road' },
          // Not asked about, and already settled by shorthand: ignored.
          { day_number: 3, code: 'CAI-GIZ-GEM', confidence: 'high', reason: 'x' },
        ],
      }
    })
    const matches = await matchDaysToBlocks(
      [day(1, 'Pyramids then the new museum'), day(2, 'Citadel and bazaar'), day(3, 'CAI/ALX/CAI'), day(4, 'fly to Abu Simbel')],
      LIBRARY,
      ask,
    )
    expect(ask).toHaveBeenCalledTimes(1)
    expect(matches).toEqual([
      { dayNumber: 1, code: 'CAI-GIZ-GEM', by: 'ai', confidence: 'high', reason: 'Pyramids and GEM in Cairo' },
      { dayNumber: 2, code: null, by: 'none', confidence: null, reason: 'made up' },
      { dayNumber: 3, code: 'CAI-ALX', by: 'shorthand', confidence: 'high', reason: 'Written as "CAI/ALX/CAI"' },
      { dayNumber: 4, code: 'ASW-ABS-ROAD', by: 'ai', confidence: 'low', reason: 'by flight, the block is by road' },
    ])
  })

  it('no AI call when shorthand settles every day, or when there are no blocks', async () => {
    const ask = vi.fn(async () => null)
    await matchDaysToBlocks([day(1, 'GIZA+GEM')], LIBRARY, ask)
    await matchDaysToBlocks([day(1, 'anything')], [], ask)
    expect(ask).not.toHaveBeenCalled()
  })

  it('a failed AI reply leaves those days unmatched, not guessed', async () => {
    const matches = await matchDaysToBlocks([day(1, 'Pyramids')], LIBRARY, async () => null)
    expect(matches).toEqual([{ dayNumber: 1, code: null, by: 'none', confidence: null, reason: null }])
  })
})

describe('the question', () => {
  it('limits the answer to the library’s codes or null', () => {
    const schema = matchSchema(LIBRARY)
    const code = schema.properties.matches.items.properties.code
    expect(code.anyOf[0].enum).toEqual(['CAI-ALX', 'CAI-GIZ-GEM', 'ASW-ABS-ROAD', 'ASW-ABS-OVN-1'])
    expect(code.anyOf[1]).toEqual({ type: 'null' })
  })

  it('describes each block by what it is, and each day by its own text', () => {
    const p = matchPrompt([day(4, 'D4 ABS OVN', { city: 'Aswan' })], LIBRARY)
    expect(p.library).toContain('ASW-ABS-OVN-1: ASW-ABS-OVN-1; type transfer; city Aswan → Abu Simbel; night move (Abu Simbel); shorthand ABS OVN')
    expect(p.days).toContain('Day 4\ncity: Aswan\ntext: D4 ABS OVN')
  })
})
