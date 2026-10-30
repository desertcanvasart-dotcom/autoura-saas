'use client'

import { Suspense } from 'react'
import UrlTabs, { type UrlTab } from '@/components/nav/UrlTabs'
import AllChannelsView from './_views/AllChannelsView'
import EmailView from './_views/EmailView'
import WhatsAppView from './_views/WhatsAppView'

// One Inbox, a tab per channel (?channel=). "All" is the cross-channel view
// (unified conversations: WhatsApp, email and trip messages); Email is the
// person's own Gmail; WhatsApp is the team's shared WhatsApp inbox. There is
// no website-chat channel: the website concierge's leads arrive as WhatsApp
// or email threads (lib/concierge/promote-brief-to-thread.ts) and in Leads.
const STAFF = ['admin', 'manager', 'member'] as const
const TABS: UrlTab[] = [
  { key: 'all', label: 'All', roles: [...STAFF], render: () => <AllChannelsView /> },
  { key: 'email', label: 'Email', roles: [...STAFF], render: () => <EmailView /> },
  { key: 'whatsapp', label: 'WhatsApp', roles: [...STAFF], render: () => <WhatsAppView /> },
]

export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <UrlTabs tabs={TABS} param="channel" label="Inbox channels" />
    </Suspense>
  )
}
