'use client'

// ============================================
// Close a popover WITHOUT eating the user's click
// ============================================
// The house pattern for dismissable dropdowns was an invisible backdrop:
//
//   <div className="fixed inset-0 z-10" onClick={close} />
//
// It closes the dropdown — and SWALLOWS the click that did it. With the
// supplier form's role dropdown open, the first click on "Save Changes" hit
// the backdrop, closed the dropdown, and did nothing else; the save needed a
// second click nobody knew to make. An external audit filed it twice (H01,
// W02) as "invisible full-screen overlay blocks the UI", which is exactly
// what it is.
//
// This hook is the replacement: a capture-phase listener on the document
// closes the popover on any pointerdown OUTSIDE it, and because no element
// ever sits over the page, the same press lands on whatever the user aimed
// at. One press, both effects — the dropdown closes AND the button works.
//
// The ref must wrap the trigger as well as the popover, or pressing the
// trigger would close-then-reopen in the same gesture.

import { useEffect, type RefObject } from 'react'

export function useDismissOnOutside(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void
) {
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss()
    }
    // Capture phase, so content that stopPropagation()s its own clicks
    // cannot accidentally keep every other popover on the page open.
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, ref, onDismiss])
}
