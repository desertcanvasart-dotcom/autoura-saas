// A button that does nothing is a promise the page does not keep.
//
// The tour page ended its price panel with a full-width green "Request This
// Tour" button that had no handler, no form and no link — since the page was
// written. There is nothing behind it to wire to: the page is the agency's own
// view of its catalogue (not a customer's), and the calculator it might have
// opened takes a pricing variation, which 43 of 44 live tours do not have. The
// sibling product removed its copy for the same reason. If a request flow is
// ever built, the button comes back WITH it.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

const SOURCE = readFileSync(join(process.cwd(), 'app/tours/[code]/page.tsx'), 'utf8')

describe('tour page', () => {
  it('no longer offers "Request This Tour"', () => {
    expect(SOURCE).not.toContain('Request This Tour')
  })

  it('every button on the page does something', () => {
    const buttons = SOURCE.match(/<button\b[^>]*>/g) ?? []
    expect(buttons.length).toBeGreaterThan(0)
    const dead = buttons.filter(tag => !/onClick=|type="submit"/.test(tag))
    expect(dead, 'a <button> with no onClick and no submit').toEqual([])
  })
})
