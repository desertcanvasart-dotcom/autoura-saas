'use client'

import { useState } from 'react'
import {
  ChevronDown, ChevronRight, Trash2, Copy, MapPin, Plus, X, GripVertical,
  Truck, User as UserIcon,
} from 'lucide-react'
import type { ReviewDay, ReviewService } from '@/app/pricing-grid/types'

interface ReviewDayCardProps {
  day: ReviewDay
  onUpdate: (updates: Partial<ReviewDay>) => void
  onRemove: () => void
  onDuplicate: () => void
  onToggleExpand: () => void
}

export default function ReviewDayCard({ day, onUpdate, onRemove, onDuplicate, onToggleExpand }: ReviewDayCardProps) {
  const [newServiceText, setNewServiceText] = useState('')
  const [newServiceCategory, setNewServiceCategory] = useState<'group' | 'per_person'>('per_person')

  const groupServices = day.services.filter(s => s.category === 'group')
  const perPersonServices = day.services.filter(s => s.category === 'per_person')

  const handleAddService = () => {
    if (!newServiceText.trim()) return
    const newService: ReviewService = {
      id: crypto.randomUUID(),
      text: newServiceText.trim(),
      category: newServiceCategory,
    }
    onUpdate({ services: [...day.services, newService] })
    setNewServiceText('')
  }

  const handleRemoveService = (serviceId: string) => {
    onUpdate({ services: day.services.filter(s => s.id !== serviceId) })
  }

  const handleUpdateServiceText = (serviceId: string, text: string) => {
    onUpdate({
      services: day.services.map(s => s.id === serviceId ? { ...s, text } : s),
    })
  }

  const handleToggleCategory = (serviceId: string) => {
    onUpdate({
      services: day.services.map(s =>
        s.id === serviceId
          ? { ...s, category: s.category === 'group' ? 'per_person' : 'group' }
          : s
      ),
    })
  }

  // Collapsed view
  if (!day.isExpanded) {
    return (
      <div
        className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-[#647C47]/40 hover:shadow-sm transition-all"
        onClick={onToggleExpand}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ChevronRight className="w-4 h-4 text-gray-400" />
            <span className="bg-[#647C47] text-white text-xs font-bold px-2 py-0.5 rounded-full">
              D{day.dayNumber}
            </span>
            <span className="font-medium text-gray-800">{day.title || `Day ${day.dayNumber}`}</span>
            {day.city && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <MapPin className="w-3 h-3" /> {day.city}
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400">{day.services.length} services</span>
        </div>
      </div>
    )
  }

  // Expanded view
  return (
    <div className="bg-white border border-[#647C47]/30 rounded-xl shadow-sm overflow-hidden">
      {/* Day Header */}
      <div className="bg-gradient-to-r from-[#647C47]/5 to-transparent px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={onToggleExpand}>
            <ChevronDown className="w-4 h-4 text-[#647C47]" />
            <span className="bg-[#647C47] text-white text-xs font-bold px-2 py-0.5 rounded-full">
              D{day.dayNumber}
            </span>
            <input
              type="text"
              value={day.title}
              onChange={e => onUpdate({ title: e.target.value })}
              onClick={e => e.stopPropagation()}
              placeholder="Day title..."
              className="font-medium text-gray-800 bg-transparent border-none outline-none focus:bg-white focus:border focus:border-gray-200 focus:rounded px-2 py-0.5 flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={day.city}
                onChange={e => onUpdate({ city: e.target.value })}
                placeholder="City"
                className="w-28 text-sm px-2 py-1 border border-gray-200 rounded-md focus:border-[#647C47] outline-none"
              />
            </div>
            <button onClick={onDuplicate} title="Duplicate day" className="p-1.5 text-gray-400 hover:text-[#647C47] rounded">
              <Copy className="w-4 h-4" />
            </button>
            <button onClick={onRemove} title="Remove day" className="p-1.5 text-gray-400 hover:text-red-500 rounded">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="px-4 py-2 border-b border-gray-50">
        <input
          type="text"
          value={day.description}
          onChange={e => onUpdate({ description: e.target.value })}
          placeholder="Day description (optional)..."
          className="w-full text-sm text-gray-500 bg-transparent border-none outline-none focus:bg-white focus:border focus:border-gray-200 focus:rounded px-1"
        />
      </div>

      {/* Group Services */}
      {groupServices.length > 0 && (
        <div className="px-4 py-2">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-2">
            <span className="w-1 h-3 bg-blue-400 rounded-full"></span>
            Group Services
          </div>
          {groupServices.map(svc => (
            <ServiceRow
              key={svc.id}
              service={svc}
              onUpdateText={text => handleUpdateServiceText(svc.id, text)}
              onRemove={() => handleRemoveService(svc.id)}
              onToggleCategory={() => handleToggleCategory(svc.id)}
            />
          ))}
        </div>
      )}

      {/* Per-Person Services */}
      {perPersonServices.length > 0 && (
        <div className={`px-4 py-2 ${groupServices.length > 0 ? 'border-t border-gray-100' : ''}`}>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-2">
            <span className="w-1 h-3 bg-green-400 rounded-full"></span>
            Per-Person Services
          </div>
          {perPersonServices.map(svc => (
            <ServiceRow
              key={svc.id}
              service={svc}
              onUpdateText={text => handleUpdateServiceText(svc.id, text)}
              onRemove={() => handleRemoveService(svc.id)}
              onToggleCategory={() => handleToggleCategory(svc.id)}
            />
          ))}
        </div>
      )}

      {/* Add Service */}
      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <select
            value={newServiceCategory}
            onChange={e => setNewServiceCategory(e.target.value as 'group' | 'per_person')}
            className="text-xs px-2 py-1.5 border border-gray-200 rounded-md bg-white focus:border-[#647C47] outline-none"
          >
            <option value="group">Group</option>
            <option value="per_person">Per-person</option>
          </select>
          <input
            type="text"
            value={newServiceText}
            onChange={e => setNewServiceText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddService()}
            placeholder="Add a service..."
            className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-md focus:border-[#647C47] outline-none"
          />
          <button
            onClick={handleAddService}
            disabled={!newServiceText.trim()}
            className="p-1.5 text-[#647C47] hover:bg-[#647C47]/10 rounded disabled:opacity-30 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Day footer */}
      <div className="bg-gray-50 px-4 py-2 border-t border-gray-200">
        <span className="text-xs text-gray-400">
          {day.services.length} service{day.services.length !== 1 ? 's' : ''} &middot; {groupServices.length} group &middot; {perPersonServices.length} per-person
        </span>
      </div>
    </div>
  )
}

function ServiceRow({
  service, onUpdateText, onRemove, onToggleCategory,
}: {
  service: ReviewService
  onUpdateText: (text: string) => void
  onRemove: () => void
  onToggleCategory: () => void
}) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 hover:bg-gray-50 rounded-lg group">
      <button
        onClick={onToggleCategory}
        title={`Switch to ${service.category === 'group' ? 'per-person' : 'group'}`}
        className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
          service.category === 'group'
            ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
            : 'bg-green-100 text-green-600 hover:bg-green-200'
        }`}
      >
        {service.category === 'group' ? 'G' : 'P'}
      </button>
      <input
        type="text"
        value={service.text}
        onChange={e => onUpdateText(e.target.value)}
        className="flex-1 text-sm bg-transparent border-none outline-none focus:bg-white focus:border focus:border-gray-200 focus:rounded px-1 py-0.5"
      />
      <button
        onClick={onRemove}
        className="flex-shrink-0 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
