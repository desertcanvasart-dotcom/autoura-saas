// ============================================
// What an archetype theme is
// ============================================
// docs/publish/PLAN.md §7. An archetype is a theme PACKAGE: its frame
// (header, footer), how each kind of page is laid out, and the order of a
// tour page's sections. The brand layer (lib/publish/brand.ts) is applied on
// top through CSS variables — a theme never reads a company's colours or
// fonts directly, so no company ever needs its own theme code.

import type { ReactNode } from 'react'
import type { PagePayload } from '@/lib/publish/contract'
import type { Archetype } from '@/lib/publish/brand'

/**
 * The sections a tour page can have. Each renders from Autoura records
 * (step 5) or from approved narrative (step 7) — and renders NOTHING when its
 * data is absent, so a theme never shows an empty box or a made-up value.
 */
export const TOUR_SECTIONS = [
  'hero', 'price', 'overview', 'highlights', 'itinerary', 'accommodation',
  'inclusions', 'departures', 'groupSize', 'terms', 'enquiry',
] as const
export type TourSection = typeof TOUR_SECTIONS[number]

export interface ThemePageProps {
  page: PagePayload
  preview: boolean
}

export interface Theme {
  archetype: Archetype
  /** Shown in the admin when choosing (PLAN §2 archetype table). */
  label: string
  description: string
  /** Tour page section order — the archetype's sales logic. */
  tourSections: readonly TourSection[]
  /** Header, footer and page chrome around every page. */
  Frame: (props: ThemePageProps & { children: ReactNode }) => ReactNode
  /** The page body, by kind. */
  Page: (props: ThemePageProps) => ReactNode
}
