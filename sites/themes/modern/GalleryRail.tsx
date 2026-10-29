'use client'
// The gallery on phones: the pictures side by side, swiped one at a time,
// with "1 / 6" counting along. On wider screens CSS lays the same pictures
// out as one large and four small, and the counter hides.

import { useRef, useState } from 'react'
import s from './theme.module.css'

export function GalleryRail({ count, label, children }: { count: number; label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(1)
  const onScroll = () => {
    const el = ref.current
    if (el && el.clientWidth) setAt(Math.min(count, Math.round(el.scrollLeft / el.clientWidth) + 1))
  }
  return (
    <>
      <div ref={ref} className={s.galleryRail} onScroll={onScroll} aria-label={label}>{children}</div>
      {count > 1 && <span className={s.galleryCount} aria-hidden="true">{at} / {count}</span>}
    </>
  )
}
