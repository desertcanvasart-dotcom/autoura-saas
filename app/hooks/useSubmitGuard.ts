import { useState, useRef, useCallback } from 'react'

// ============================================
// DOUBLE-SUBMIT GUARD
// ============================================
// Eleven rate-entry forms had no in-flight guard: a double-clicked "Create
// Rate" fired handleSubmit twice, and — for tables whose code is generated
// inside the handler (cruises) — produced two rows with DIFFERENT codes that
// no unique constraint could dedupe. The pricing grid then had two near-
// identical rates to choose between.
//
// This guards both layers:
//   * a ref, set synchronously before the first await, drops the second call
//     even if two clicks land in the same tick (state updates are async and
//     would not have flipped yet);
//   * `submitting` drives the button's `disabled` for the visible feedback.

export function useSubmitGuard() {
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef(false)

  /** Run `fn` unless a submit is already in flight. Always releases the lock. */
  const guard = useCallback(async (fn: () => Promise<void>): Promise<void> => {
    if (inFlight.current) return
    inFlight.current = true
    setSubmitting(true)
    try {
      await fn()
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }, [])

  return { submitting, guard }
}
