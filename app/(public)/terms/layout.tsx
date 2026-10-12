import { buildPageMetadata } from '@/lib/seo/site'

export const metadata = buildPageMetadata({
  title: 'Terms of Service',
  description:
    'The terms that govern your use of Autoura: accounts and trials, subscriptions and billing, acceptable use, your data, liability and termination.',
  path: '/terms',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
