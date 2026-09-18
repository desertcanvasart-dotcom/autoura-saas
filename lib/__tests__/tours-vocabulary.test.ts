import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { VOCABULARY_KIND_INFO } from '@/lib/vocabulary'

// ============================================================================
// The four tour dropdowns were the last ones an agency could not change: three
// hardcoded arrays, and a theme coming from tour_categories — a table nothing
// seeded and no screen could add to, so it was empty for every tenant.
// ============================================================================

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const codeOnly = (src: string) =>
  src.split('\n').filter((l) => {
    const t = l.trim()
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('--')
  }).join('\n')

const FORM = 'app/tours/manage/TourManagerContent.tsx'

describe('the tour form asks the vocabulary, not a constant', () => {
  const form = codeOnly(read(FORM))

  it('has no hardcoded option lists left', () => {
    // Word boundaries, not substrings: SINGLE_DAY_TOUR_TYPES legitimately
    // remains, and it contains "TOUR_TYPES".
    for (const name of ['TOUR_TYPES', 'PHYSICAL_LEVELS', 'BEST_FOR_OPTIONS']) {
      expect(form, name).not.toMatch(new RegExp(`\\b${name}\\b`))
    }
  })

  it('reads all four kinds', () => {
    for (const kind of ['tour_type', 'tour_physical_level', 'tour_best_for', 'tour_theme']) {
      expect(form, kind).toContain(`useVocabulary('${kind}')`)
    }
  })

  it('stores keys, not the words on screen', () => {
    // option.key on the checkbox, not option.label — otherwise renaming a
    // "best for" tag would orphan every tour already filed under it.
    expect(form).toContain('formData.best_for.includes(option.key)')
    expect(form).toContain('toggleBestFor(option.key)')
  })
})

describe('behaviour stays keyed even though the words are free', () => {
  const form = codeOnly(read(FORM))

  it('single-day detection reads the days a type covers, not a hardcoded list', () => {
    // It was `SINGLE_DAY_TOUR_TYPES = ['day_tour', 'stopover']`, so Sawa Tours'
    // own "OverDay Trip" — a day trip — was held to 2 days and a night, and
    // any 2+ day edit rewrote a "Package" tour into a Multi-Day Tour. The
    // range now lives on the vocabulary entry (migration 363).
    expect(form).not.toContain("SINGLE_DAY_TOUR_TYPES = ['day_tour', 'stopover']")
    expect(form).toContain("isSingleDayType(i)")
    expect(form).toContain('suggestTourType(')
    expect(form).toContain('durationForType(')
  })

  it('the settings description warns what a new entry will do', () => {
    // The 351 rule: if a key carries behaviour, the screen has to say so.
    const d = VOCABULARY_KIND_INFO.tour_type.description
    expect(d).toMatch(/day tour/i)
    expect(d).toMatch(/hours/i)
    expect(d).toMatch(/multi-day/i)
    // And what an agency's OWN entry does, which is now the opposite of what
    // this text used to promise.
    expect(d).toMatch(/sets its own duration/i)
  })

  it('all four kinds are grouped under Tours', () => {
    for (const k of ['tour_type', 'tour_physical_level', 'tour_best_for', 'tour_theme'] as const) {
      expect(VOCABULARY_KIND_INFO[k].group, k).toBe('Tours')
    }
  })
})

describe('migration 358 seeds what the form needs', () => {
  const sql = read('supabase/migrations/358_tour_fields_vocabulary.sql')

  it('seeds every one of the four kinds', () => {
    for (const kind of ['tour_type', 'tour_physical_level', 'tour_best_for', 'tour_theme']) {
      expect(sql, kind).toContain(`p_kind = '${kind}'`)
    }
  })

  it('keeps the three behaviour-bearing tour_type keys', () => {
    for (const key of ['day_tour', 'multi_day', 'stopover']) {
      expect(sql, key).toContain(`'tour_type', '${key}'`)
    }
  })

  it('keeps the physical_level keys already stored on rows', () => {
    // These are in the database today; re-filing them would strand every tour.
    for (const key of ['easy', 'moderate', 'challenging', 'demanding']) {
      expect(sql, key).toContain(`'tour_physical_level', '${key}'`)
    }
  })

  it('re-files best_for, which stored labels rather than keys', () => {
    // The one field that did NOT store keys: arrays like {Families,"Solo Travelers"}.
    expect(sql).toContain('UPDATE tour_templates')
    expect(sql).toContain('best_for')
    expect(sql).toMatch(/regexp_replace/)
  })

  it('is additive — it drops nothing', () => {
    expect(codeOnly(sql)).not.toMatch(/DROP TABLE/i)
    expect(codeOnly(sql)).not.toMatch(/DROP COLUMN/i)
  })
})

describe('migration 359 refuses to destroy data that appeared later', () => {
  const sql = read('supabase/migrations/359_retire_tour_categories.sql')

  it('aborts if any theme row exists by then', () => {
    // Measured as zero when this was written. "Measured once" is not "true
    // forever", so the migration re-checks instead of trusting the note.
    expect(sql).toContain('tour_categories now holds')
    expect(sql).toContain('RAISE EXCEPTION')
  })

  it('aborts if any template still points at one', () => {
    expect(sql).toContain('still point at a tour_category')
  })

  it('will not run before its replacement exists', () => {
    expect(sql).toContain('apply 358 first')
  })

  it('drops without CASCADE', () => {
    expect(sql).not.toMatch(/DROP TABLE[^;]*CASCADE/i)
  })
})

describe('nothing in the app still reads the retired table', () => {
  it('no query joins tour_categories or category_id', () => {
    const roots = ['app', 'lib']
    const walk = (dir: string): string[] => {
      const full = path.join(process.cwd(), dir)
      if (!fs.existsSync(full)) return []
      return fs.readdirSync(full, { withFileTypes: true }).flatMap((e) => {
        const rel = path.join(dir, e.name)
        if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(rel)
        return /\.tsx?$/.test(e.name) ? [rel] : []
      })
    }
    const offenders = roots
      .flatMap(walk)
      .filter((f) => !f.includes('__tests__'))
      .filter((f) => /\btour_categories\b/.test(codeOnly(read(f))))
    expect(offenders).toEqual([])
  })
})
