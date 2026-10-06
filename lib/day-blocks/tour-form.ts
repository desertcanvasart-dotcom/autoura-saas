// ============================================
// A day block, filled into Tour Manager's day form
// ============================================
// Tour Manager builds a programme one day at a time, through a form that
// Save turns into the stored day (lib/tours/day-edit.ts). "Fill from a
// block" fills that form from one of the agency's day blocks; the operator
// reviews it and presses Add Day as always, so every rule the form enforces
// still applies.
//
//   · city      — where the day is; a day that moves you is placed where it
//                 ENDS (the tour's rule: a flight or a train is yesterday's
//                 city → today's), with the leg from → to stated.
//   · night     — a hotel night, a cruise night, or none (a departure; a
//                 night the block's own package includes, like a camp).
//   · meals     — on the ship, at the hotel or the camp = in the rate
//                 ('included'); at a restaurant = a priced line ('external');
//                 not provided = 'none'. Every meal is stated.
//   · sights    — each paid attraction picked BY ID from the fee sheet, as
//                 the library resolved it (aliases); a name with no fee is
//                 listed, never guessed.
//   · travel    — a flight is a flight; four hours, eight or twelve.
//
// Pure: the editor and the tests share it.

import type { DayMealStatus, MealSlot } from '@/lib/tours/day-meals'
import type { BlockMeal } from './blocks'
import type { GridBlock } from './grid-apply'

export interface FeeOption {
  id: string
  attraction_name: string
  city?: string | null
}

export interface TourDayFill {
  title: string
  description: string
  city: string
  night: '' | 'hotel' | 'cruise' | 'none'
  meals: Record<MealSlot, DayMealStatus>
  picked: { id: string; name: string }[]
  transportType: '' | 'flight'
  legFrom: string
  legTo: string
  length: '' | 'half_day' | 'day_tour' | 'long_day_tour'
  noSightseeing: boolean
  cruiseAssist: { embark?: boolean; disembark?: boolean }
  /** What the form cannot hold or no fee answers: for the operator. */
  notes: string[]
}

const norm = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase()

function meal(m: BlockMeal | undefined): DayMealStatus {
  if (!m?.included) return 'none'
  return /ship|hotel|camp|board|cruise/i.test(m.venue ?? '') ? 'included' : 'external'
}

/** "8h" → a day tour; "10h"/"12h" → a long day; "4h"/"half" → half a day. */
function length(transport: string | null): TourDayFill['length'] {
  const t = transport ?? ''
  if (/half/i.test(t)) return 'half_day'
  const hours = Number(t.match(/(\d+)\s*h\b/i)?.[1])
  if (!hours) return ''
  return hours <= 5 ? 'half_day' : hours <= 8 ? 'day_tour' : 'long_day_tour'
}

export function blockToTourDay(block: GridBlock, fees: readonly FeeOption[], opts: { dayTour?: boolean } = {}): TourDayFill {
  const notes: string[] = []
  const moves = block.night === 'move' && !!block.to_city
  const flight = /\b(flight|fly|flies|plane)\b/i.test(block.transport ?? '')

  // Each paid attraction, as the library resolved it, picked by id.
  const picked: TourDayFill['picked'] = []
  for (const name of block.attractions) {
    const check = block.attraction_checks?.find(c => c.name === name)
    const feeNames = check?.ok && check.fees?.length ? check.fees : [name]
    for (const feeName of feeNames) {
      const candidates = fees.filter(f => norm(f.attraction_name) === norm(feeName))
      const fee = candidates.find(f => norm(f.city) === norm(block.city)) ?? candidates[0]
      if (fee) {
        if (!picked.some(p => p.id === fee.id)) picked.push({ id: fee.id, name: fee.attraction_name })
      } else {
        notes.push(`No entrance fee called "${name}" — pick it below, or add it in Rates.`)
      }
    }
  }

  const night: TourDayFill['night'] = opts.dayTour
    ? ''
    : block.night === 'on_board' ? 'cruise'
    : block.night === 'none' || block.night === 'included' ? 'none'
    : 'hotel'
  if (block.night === 'included') {
    notes.push(`The night is part of the block's own package${block.night_place ? ` (${block.night_place})` : ''}: no hotel is booked for it.`)
  }

  const assistance = block.assistance.join(' ')
  const cruiseAssist: TourDayFill['cruiseAssist'] = {}
  if (/boarding|embark/i.test(assistance)) cruiseAssist.embark = true
  if (/leaving|disembark/i.test(assistance)) cruiseAssist.disembark = true

  if (block.guide === 'assistant' || block.guide === 'spot') {
    notes.push(`This day has ${block.guide === 'assistant' ? 'an English-speaking assistant' : 'a spot guide'} instead of an Egyptologist: set it on the tour's variation.`)
  }
  if (/airport|check-?in|check-?out/i.test(assistance) && !flight) {
    notes.push(`Assistance: ${block.assistance.join(', ')} — the tour adds airport and hotel services from its arrival and departure days.`)
  }

  return {
    title: block.name,
    description: block.description ?? '',
    city: (moves ? block.to_city : block.city) ?? '',
    night,
    meals: { breakfast: meal(block.meals?.breakfast), lunch: meal(block.meals?.lunch), dinner: meal(block.meals?.dinner) },
    picked,
    transportType: moves && flight ? 'flight' : '',
    legFrom: moves ? block.city ?? '' : '',
    legTo: moves ? block.to_city ?? '' : '',
    length: length(block.transport),
    noSightseeing: block.attractions.length + block.photo_stops.length === 0 && block.day_type !== 'tour',
    cruiseAssist,
    notes,
  }
}
