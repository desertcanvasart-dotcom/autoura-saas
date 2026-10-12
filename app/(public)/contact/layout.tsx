import { buildPageMetadata } from '@/lib/seo/site'

export const metadata = buildPageMetadata({
  title: 'Contact & Pilot Application',
  description:
    'Apply for the Autoura assisted pilot or ask about plans, onboarding and your rate sheets. Send us a message and we typically respond within 24 hours.',
  path: '/contact',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
