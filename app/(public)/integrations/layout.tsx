import { buildPageMetadata } from '@/lib/seo/site'

export const metadata = buildPageMetadata({
  title: 'Integrations',
  description:
    'Autoura connects WhatsApp and your own Gmail to one inbox for tour operators. Accounting sync, LINE, WeChat, Stripe and calendar integrations are planned.',
  path: '/integrations',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
