import type { Archetype } from '@/lib/publish/brand'
import type { Theme } from './types'
import { privateJourneys } from './private-journeys'
import { transparentValue } from './transparent-value'

/** Every archetype has exactly one theme (the type makes a missing one a
 *  compile error). Phase 2/3 archetypes — publication-led, shared
 *  departures, B2B — are added here. */
export const THEMES: Record<Archetype, Theme> = {
  private_journeys: privateJourneys,
  transparent_value: transparentValue,
}
