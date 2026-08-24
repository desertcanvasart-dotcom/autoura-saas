import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Ops' }

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return children
}
