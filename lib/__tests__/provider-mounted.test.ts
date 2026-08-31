// Every exported React context Provider must actually be MOUNTED somewhere.
//
// GET-C03 (QA, 31 Aug): ModalContext shipped a polished confirm-dialog system
// whose Provider was mounted nowhere. Its useModal() hook returned a no-op
// fallback whose confirmDestructive resolved false — so destructive actions on
// three modules silently did nothing, forever, with only a dev-console
// warning. The component tree looked complete; the wiring did not exist.
//
// This scan makes that state unrepresentable: a Provider nobody mounts fails
// the suite by name. The fix is either to mount it or to delete the file —
// an unmounted provider with a silent fallback is a trap, not a utility.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')
const SCAN_DIRS = ['app', 'components', 'lib']

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return out }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx$/.test(entry)) out.push(full)
  }
  return out
}

describe('React providers', () => {
  const files = SCAN_DIRS.flatMap(d => walk(join(ROOT, d)))
  const sources = new Map(files.map(f => [f, readFileSync(f, 'utf8')]))

  it('every exported Provider is mounted somewhere outside its own file', () => {
    const unmounted: string[] = []
    for (const [file, src] of sources) {
      for (const m of src.matchAll(/export (?:function|const) (\w+Provider)\b/g)) {
        const name = m[1]
        const mounted = [...sources].some(
          ([other, otherSrc]) => other !== file && otherSrc.includes(`<${name}`)
        )
        if (!mounted) unmounted.push(`${name} (${file.replace(ROOT + '/', '')})`)
      }
    }
    expect(
      unmounted,
      'Unmounted providers — their hooks silently no-op via fallbacks. Mount them or delete the file.'
    ).toEqual([])
  })
})
