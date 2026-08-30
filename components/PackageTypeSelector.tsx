'use client'

import { useState } from 'react'
import { PACKAGE_TYPE_CONFIGS, type PackageType, type PackageTypeConfig } from '@/lib/package-types'
import { 
  Sun, 
  Map, 
  Building2, 
  Package, 
  Ship, 
  Anchor,
  Hotel,
  Plane,
  Car,
  MapPin,
  Utensils,
  Check,
  X
} from 'lucide-react'


interface PackageTypeOption extends PackageTypeConfig {
  icon: React.ElementType
  color: string
  bgColor: string
  borderColor: string
}

/** Presentation only — the DATA (slug/name/description/includes) comes from
 *  lib/package-types.ts so server code can read the same vocabulary. */
const PACKAGE_TYPE_UI: Record<PackageType, { icon: React.ElementType; color: string; bgColor: string; borderColor: string }> = {

  'day-trips': { icon: Sun, color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' },
  'tours-only': { icon: Map, color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
  'land-package': { icon: Building2, color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
  'full-package': { icon: Package, color: 'text-primary-600', bgColor: 'bg-primary-50', borderColor: 'border-primary-200' },
  'cruise-land': { icon: Ship, color: 'text-indigo-600', bgColor: 'bg-indigo-50', borderColor: 'border-indigo-200' },
  'shore-excursions': { icon: Anchor, color: 'text-cyan-600', bgColor: 'bg-cyan-50', borderColor: 'border-cyan-200' },
}

const PACKAGE_TYPES: PackageTypeOption[] = PACKAGE_TYPE_CONFIGS.map(cfg => ({
  ...cfg,
  ...PACKAGE_TYPE_UI[cfg.slug],
}))

interface InclusionBadgeProps {
  included: boolean
  label: string
  icon: React.ElementType
}

function InclusionBadge({ included, label, icon: Icon }: InclusionBadgeProps) {
  return (
    <div className={`flex items-center gap-1.5 text-xs ${included ? 'text-gray-700' : 'text-gray-400'}`}>
      {included ? (
        <Check className="w-3.5 h-3.5 text-green-500" />
      ) : (
        <X className="w-3.5 h-3.5 text-gray-300" />
      )}
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
    </div>
  )
}

interface PackageTypeSelectorProps {
  value: PackageType | null
  onChange: (type: PackageType) => void
  className?: string
}

export default function PackageTypeSelector({ 
  value, 
  onChange, 
  className = '' 
}: PackageTypeSelectorProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Select Package Type</h3>
        <p className="text-xs text-gray-500">This determines what services will be included in the itinerary</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {PACKAGE_TYPES.map((pkg) => {
          const Icon = pkg.icon
          const isSelected = value === pkg.slug
          
          return (
            <button
              key={pkg.slug}
              type="button"
              onClick={() => onChange(pkg.slug)}
              className={`
                relative flex flex-col p-4 rounded-xl border-2 transition-all text-left
                ${isSelected 
                  ? `${pkg.borderColor} ${pkg.bgColor} ring-2 ring-offset-2 ring-${pkg.color.replace('text-', '')}` 
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }
              `}
            >
              {/* Selected indicator */}
              {isSelected && (
                <div className={`absolute top-3 right-3 w-5 h-5 rounded-full ${pkg.bgColor} ${pkg.color} flex items-center justify-center`}>
                  <Check className="w-3.5 h-3.5" />
                </div>
              )}
              
              {/* Header */}
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-lg ${pkg.bgColor} ${pkg.color} flex items-center justify-center`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className={`text-sm font-semibold ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                    {pkg.name}
                  </h4>
                </div>
              </div>
              
              {/* Description */}
              <p className="text-xs text-gray-500 mb-3 line-clamp-2">
                {pkg.description}
              </p>
              
              {/* Inclusions */}
              <div className="grid grid-cols-2 gap-1.5 pt-3 border-t border-gray-100">
                <InclusionBadge 
                  included={pkg.includes.accommodation} 
                  label="Hotels" 
                  icon={Hotel} 
                />
                <InclusionBadge 
                  included={pkg.includes.airportTransfers} 
                  label="Airport" 
                  icon={Plane} 
                />
                <InclusionBadge 
                  included={pkg.includes.internalTransfers} 
                  label="Transfers" 
                  icon={Car} 
                />
                <InclusionBadge 
                  included={pkg.includes.tours} 
                  label="Tours" 
                  icon={MapPin} 
                />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Export the package types for use elsewhere
export { PACKAGE_TYPES }
export type { PackageType }
export type { PackageTypeOption }