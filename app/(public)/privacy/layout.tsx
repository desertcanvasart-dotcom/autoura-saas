import { buildPageMetadata } from '@/lib/seo/site'

export const metadata = buildPageMetadata({
  title: 'Privacy Policy',
  description:
    'How Autoura collects, uses, shares, secures and retains your information, the cookies we use, international transfers, and your rights over your data.',
  path: '/privacy',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
