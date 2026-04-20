'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, User } from 'lucide-react'
import type { GridConfig } from '@/app/pricing-grid/types'

interface ClientInfoBarProps {
  config: GridConfig
  onConfigChange: (updates: Partial<GridConfig>) => void
}

export default function ClientInfoBar({ config, onConfigChange }: ClientInfoBarProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-5 py-3 flex items-center justify-between text-sm hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 text-gray-500">
          <User className="w-4 h-4" />
          <span className="font-medium">Client & Trip Details</span>
          <span className="text-gray-400">(click to {isExpanded ? 'collapse' : 'expand'})</span>
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {isExpanded && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
          {/* Tour Name - full width */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Tour Name</label>
            <input
              type="text"
              value={config.tourName}
              onChange={e => onConfigChange({ tourName: e.target.value })}
              placeholder="Egypt Cultural Heritage, Nile Cruise & Red Sea Adventure"
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-[#647C47] focus:ring-1 focus:ring-[#647C47] outline-none"
            />
          </div>

          {/* 3-column: Name, Email, Phone */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Client Name</label>
              <input
                type="text"
                value={config.clientName}
                onChange={e => onConfigChange({ clientName: e.target.value })}
                placeholder="John Smith"
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-[#647C47] focus:ring-1 focus:ring-[#647C47] outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Email</label>
              <input
                type="email"
                value={config.clientEmail}
                onChange={e => onConfigChange({ clientEmail: e.target.value })}
                placeholder="client@example.com"
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-[#647C47] focus:ring-1 focus:ring-[#647C47] outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Phone</label>
              <input
                type="tel"
                value={config.clientPhone}
                onChange={e => onConfigChange({ clientPhone: e.target.value })}
                placeholder="+1 (555) 123-4567"
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-[#647C47] focus:ring-1 focus:ring-[#647C47] outline-none"
              />
            </div>
          </div>

          {/* Nationality */}
          <div className="max-w-md">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Nationality</label>
            <input
              type="text"
              value={config.nationality}
              onChange={e => onConfigChange({ nationality: e.target.value })}
              placeholder="American, British, Japanese..."
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-[#647C47] focus:ring-1 focus:ring-[#647C47] outline-none"
            />
          </div>
        </div>
      )}
    </div>
  )
}
