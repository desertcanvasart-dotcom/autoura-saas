import { notFound } from 'next/navigation'

// A hostname that serves no site. Deliberately says nothing about who might
// own it: no company name, no branding.
export default function UnknownHost() {
  notFound()
}
