// ============================================
// SUP-#### — a supplier's portable code, given out in order per agency
// ============================================
// The code is what a rate sheet names its supplier by, so a supplier with no
// code cannot be linked from a CSV. Nothing gave one out: a supplier added on
// the form had none until an import or Reconcile Codes stamped it. New
// suppliers now take the next free SUP-#### of their agency; codes the agency
// chose itself (any other shape) are left alone and never reused.

const PATTERN = /^SUP-(\d+)$/i

/** The next `count` free codes after the highest SUP-#### in `taken`. */
export function nextSupplierCodes(taken: Iterable<string | null | undefined>, count: number): string[] {
  const used = new Set<string>()
  let max = 0
  for (const code of taken) {
    if (!code) continue
    used.add(code.toUpperCase())
    const m = PATTERN.exec(code.trim())
    if (m) max = Math.max(max, Number(m[1]))
  }
  const out: string[] = []
  let n = max
  while (out.length < count) {
    n++
    const code = `SUP-${String(n).padStart(4, '0')}`
    if (!used.has(code)) out.push(code)
  }
  return out
}
