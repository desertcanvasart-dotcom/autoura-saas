'use client'

import { Mail, MessageSquare } from 'lucide-react'

export default function ChannelBadge({ channel }: { channel: 'email' | 'whatsapp' | string }) {
  if (channel === 'whatsapp') {
    return <span className="inline-flex items-center gap-1 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium"><MessageSquare className="w-3 h-3" />WA</span>
  }
  return <span className="inline-flex items-center gap-1 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium"><Mail className="w-3 h-3" />Email</span>
}
