import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// ============================================================================
// A CSV import filled in a tour's long description, the database stored all
// 754 characters of it, and the tour looked as though it had arrived empty:
// the Tour Manager had no Long Description field at all. It was carried in
// form state, loaded from the template and saved back — just never shown.
// ============================================================================

const form = fs.readFileSync(
  path.join(process.cwd(), 'app/tours/manage/TourManagerContent.tsx'),
  'utf8'
)

describe('every field the CSV can fill has somewhere to show it', () => {
  it('renders a Long Description editor', () => {
    expect(form).toContain('name="long_description"')
    expect(form).toContain('value={formData.long_description}')
  })

  it('keeps it a textarea, since the content is multi-line by nature', () => {
    // A day-by-day write-up in a single-line input is unreadable and the line
    // breaks the importer preserves would be invisible.
    const i = form.indexOf('name="long_description"')
    const around = form.slice(Math.max(0, i - 200), i + 200)
    expect(around).toContain('<textarea')
  })

  it('still loads it from the template when editing', () => {
    // The field round-trips today; the gap was only that nobody could see it.
    expect(form).toContain("long_description: template.long_description || ''")
  })
})
