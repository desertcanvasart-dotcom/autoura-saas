'use client'
// The enquiry form, one short step at a time (redesign): when and who → the
// trip → your details. Without script — and in the first paint — every step
// shows at once and the form posts as it always has; once the page is live,
// the steps take turns. Steps are hidden, never removed, so what a visitor
// typed in one step is still there when the form is sent.

import { useEffect, useState, type ReactNode } from 'react'
import s from './enquiry.module.css'

export function EnquirySteps({ steps, titles, labels }: {
  steps: ReactNode[]
  titles: string[]
  labels: { next: string; back: string; send: string; step: string; of: string }
}) {
  const [enhanced, setEnhanced] = useState(false)
  const [at, setAt] = useState(0)
  useEffect(() => { setEnhanced(true) }, [])
  const last = at === steps.length - 1

  return (
    <>
      {enhanced && (
        <div className={s.progress} aria-live="polite">
          <span>{labels.step} {at + 1} {labels.of} {steps.length} — {titles[at]}</span>
          <span className={s.bar}><span style={{ width: `${((at + 1) / steps.length) * 100}%` }} /></span>
        </div>
      )}
      {steps.map((step, i) => (
        <fieldset key={i} className={s.step} hidden={enhanced && i !== at}>
          <legend className={enhanced ? s.visuallyHidden : s.legend}>{titles[i]}</legend>
          {step}
        </fieldset>
      ))}
      <div className={s.actions}>
        {enhanced && at > 0 && <button type="button" className={s.back} onClick={() => setAt(at - 1)}>{labels.back}</button>}
        {enhanced && !last
          ? <button type="button" className={s.submit} onClick={() => setAt(at + 1)}>{labels.next}</button>
          : <button type="submit" className={s.submit}>{labels.send}</button>}
      </div>
    </>
  )
}
