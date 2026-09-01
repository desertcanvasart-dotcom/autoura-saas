// Two failures from one tour-creation flow (operator, 1 Sep):
//
//   1. Creating a template fired handleSubmit twice ~1.4s apart, and because
//      a template's code is generated per submit with no unique constraint,
//      that produced TWO templates the list showed side by side (confirmed in
//      production: "Memphis, Sakkara & Dahshur Day Trip", two codes, 16:53:28
//      and :29). The fix routes the submit through useSubmitGuard.
//
//   2. The follow-up "Would you like to add activities?" prompt rendered as a
//      red delete confirmation — trash icon, "Warning: this action cannot be
//      undone" — because a plain confirm() defaulted to the 'danger' variant.
//
// Both are source-level invariants; this pins them so neither silently comes
// back.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('tour creation safety', () => {
  it('routes the template submit through the double-submit guard', () => {
    const src = read('app/tours/manage/TourManagerContent.tsx')
    expect(src, 'must import the guard').toContain('useSubmitGuard')
    // handleSubmit's body must run inside guard(...) so a double-fire is dropped.
    const submitBody = src.slice(src.indexOf('const handleSubmit'))
    expect(
      /const handleSubmit[\s\S]{0,600}?await guard\(async/.test(submitBody),
      'handleSubmit must wrap its work in guard(async () => …)'
    ).toBe(true)
  })

  it('a plain confirm() is not styled as a destructive delete', () => {
    // The default variant gates the trash icon, the red title and the
    // "cannot be undone" warning (isDestructive === variant 'danger').
    const src = read('components/ConfirmDialog.tsx')
    expect(
      /const variant = state\.variant \|\| '(info|warning|success)'/.test(src),
      "confirm() must default to a non-danger variant — every real delete passes variant: 'danger' itself"
    ).toBe(true)
  })

  it('the add-activities prompt is an explicit non-destructive question', () => {
    const src = read('app/tours/manage/TourManagerContent.tsx')
    const call = src.slice(src.indexOf('add activities and set up'))
    expect(call.slice(0, 300)).toContain("variant: 'info'")
  })
})
