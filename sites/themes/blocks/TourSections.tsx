import type { ThemePageProps, TourSection } from '../types'

/**
 * A tour page's sections, in the archetype's order. Step 3 carries no tour
 * facts yet, so only the sections that need none render; the rest render
 * nothing — never a placeholder price or an invented inclusion. Step 5
 * gives each section its data from the records.
 */
export function TourSections({ sections, render }: {
  sections: readonly TourSection[]
  render: Partial<Record<TourSection, () => React.ReactNode>>
} & Partial<ThemePageProps>) {
  return <>{sections.map(s => {
    const node = render[s]?.()
    return node ? <div key={s} data-section={s}>{node}</div> : null
  })}</>
}
