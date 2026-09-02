// Ported from travel-ops-pro (__tests__/lib/optional-selection.test.ts).

import { describe, it, expect } from 'vitest'
import { parseOptionalSelection, isOptionalSelected } from '@/lib/b2b/optional-selection'

describe('parseOptionalSelection', () => {
  it('reads an explicit list of ids', () => {
    expect(parseOptionalSelection({ selected_optional_ids: ['a', 'b'] })).toEqual({
      mode: 'some', ids: ['a', 'b'],
    })
  })

  it('lets an explicit list beat the legacy all-or-nothing flag', () => {
    // Ticking two options must not silently price all five.
    expect(parseOptionalSelection({ include_optionals: true, selected_optional_ids: ['a'] })).toEqual({
      mode: 'some', ids: ['a'],
    })
  })

  it('treats an empty list as "none", never as "all"', () => {
    expect(parseOptionalSelection({ include_optionals: true, selected_optional_ids: [] }).mode).toBe('none')
  })

  it('still honours the legacy flag when no list is sent', () => {
    expect(parseOptionalSelection({ include_optionals: true }).mode).toBe('all')
  })

  it('takes only a literal true as consent', () => {
    for (const value of ['true', 1, 'yes', {}, [], null, undefined, false]) {
      expect(parseOptionalSelection({ include_optionals: value }).mode).toBe('none')
    }
  })

  it('drops blanks and duplicates from the list', () => {
    expect(parseOptionalSelection({ selected_optional_ids: ['a', 'a', '', '  ', 'b'] }).ids).toEqual(['a', 'b'])
  })

  it('ignores non-strings in the list rather than coercing them', () => {
    expect(parseOptionalSelection({ selected_optional_ids: [1, null, 'a'] }).ids).toEqual(['a'])
  })

  it('defaults to none on an empty body', () => {
    expect(parseOptionalSelection({})).toEqual({ mode: 'none', ids: [] })
  })
})

describe('isOptionalSelected', () => {
  const some = parseOptionalSelection({ selected_optional_ids: ['a', 'b'] })

  it('picks out exactly the chosen ids', () => {
    expect(isOptionalSelected('a', some)).toBe(true)
    expect(isOptionalSelected('c', some)).toBe(false)
  })

  it('is true for everything under the legacy flag', () => {
    expect(isOptionalSelected('anything', parseOptionalSelection({ include_optionals: true }))).toBe(true)
  })

  it('is false for everything when nothing was chosen', () => {
    expect(isOptionalSelected('a', parseOptionalSelection({}))).toBe(false)
  })

  it('is false for a service with no id, rather than throwing', () => {
    expect(isOptionalSelected(undefined, some)).toBe(false)
  })
})
