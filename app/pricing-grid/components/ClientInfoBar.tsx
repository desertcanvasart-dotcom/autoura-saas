'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, User } from 'lucide-react'
import type { GridConfig } from '../types'

interface ClientInfoBarProps {
  config: GridConfig
  onChange: (config: GridConfig) => void
}

export default function ClientInfoBar({ config, onChange }: ClientInfoBarProps) {
  const [isExpanded, setIsExpanded] = useState(!config.clientName && !config.tourName)
  const update = (partial: Partial<GridConfig>) => onChange({ ...config, ...partial })

  const hasSummary = config.clientName || config.tourName

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-4 overflow-hidden">
      {/* Collapsed Header */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <User className="w-4 h-4 text-gray-400" />
        {hasSummary ? (
          <div className="flex-1 flex items-center gap-3 text-sm">
            {config.clientName && (
              <span className="font-medium text-gray-900">{config.clientName}</span>
            )}
            {config.clientName && config.tourName && (
              <span className="text-gray-300">—</span>
            )}
            {config.tourName && (
              <span className="text-gray-600">{config.tourName}</span>
            )}
            {config.itineraryCode && (
              <span className="px-2 py-0.5 text-[10px] font-bold bg-green-50 text-green-700 rounded-full border border-green-200">
                {config.itineraryCode}
              </span>
            )}
          </div>
        ) : (
          <span className="flex-1 text-sm text-gray-400">Client & Trip Details (click to expand)</span>
        )}
        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </div>

      {/* Expanded Fields */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-4 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Tour Name — full width on small screens */}
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Tour Name</label>
              <input
                type="text"
                value={config.tourName}
                onChange={(e) => update({ tourName: e.target.value })}
                placeholder="Egypt Cultural Heritage, Nile Cruise & Red Sea Adventure"
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition-all"
              />
            </div>

            {/* Client Name */}
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Client Name</label>
              <input
                type="text"
                value={config.clientName}
                onChange={(e) => update({ clientName: e.target.value })}
                placeholder="John Smith"
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-200 transition-all"
              />
            </div>

            {/* Email */}
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Email</label>
              <input
                type="email"
                value={config.clientEmail}
                onChange={(e) => update({ clientEmail: e.target.value })}
                placeholder="client@example.com"
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-200 transition-all"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Phone</label>
              <input
                type="tel"
                value={config.clientPhone}
                onChange={(e) => update({ clientPhone: e.target.value })}
                placeholder="+1 (555) 123-4567"
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-200 transition-all"
              />
            </div>

            {/* Nationality */}
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Nationality</label>
              <input
                type="text"
                value={config.nationality}
                onChange={(e) => update({ nationality: e.target.value })}
                placeholder="American, British, Japanese..."
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-200 transition-all"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
