'use client'

import Link from 'next/link'
import { FileText, Hotel, Car, Ship, Users, Building, ArrowRight, FileCheck } from 'lucide-react'

const DOCUMENT_SECTIONS = [
  {
    title: 'Customer Documents',
    description: 'Contracts and invoices for clients',
    items: [
        {
            name: 'Customer Contracts', 
            description: 'Travel agreements and booking confirmations',
            href: '/itineraries', 
        icon: FileCheck,
        color: 'bg-purple-100 text-purple-700'
      }
    ]
  },
  {
    title: 'Supplier Documents',
    description: 'Vouchers and service orders for suppliers',
    href: '/documents/supplier',
    items: [
      {
        name: 'All Supplier Documents',
        description: 'View and manage all vouchers and service orders',
        href: '/documents/supplier',
        icon: Building,
        color: 'bg-indigo-100 text-indigo-700'
      },
      {
        name: 'Hotel Vouchers',
        description: 'Accommodation confirmations',
        href: '/documents/supplier?type=hotel_voucher',
        icon: Hotel,
        color: 'bg-blue-100 text-blue-700'
      },
      {
        name: 'Transport Vouchers',
        description: 'Transfer and transportation orders',
        href: '/documents/supplier?type=transport_voucher',
        icon: Car,
        color: 'bg-amber-100 text-amber-700'
      },
      {
        name: 'Cruise Vouchers',
        description: 'Nile cruise booking confirmations',
        href: '/documents/supplier?type=cruise_voucher',
        icon: Ship,
        color: 'bg-cyan-100 text-cyan-700'
      },
      // No Activity Vouchers card: this app puts entrance fees and activities
      // on service orders (lib/documents/group-services), so Generate never
      // makes one and the card always opened an empty list.
      {
        name: 'Guide Assignments',
        description: 'Guide briefings and assignments',
        href: '/documents/supplier?type=guide_assignment',
        icon: Users,
        color: 'bg-pink-100 text-pink-700'
      },
      {
        name: 'Service Orders',
        description: 'General service instructions',
        href: '/documents/supplier?type=service_order',
        icon: FileText,
        color: 'bg-purple-100 text-purple-700'
      }
    ]
  }
]

export default function DocumentsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-xl font-semibold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500">Manage customer contracts and supplier vouchers</p>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 space-y-8">
        {DOCUMENT_SECTIONS.map((section, sectionIdx) => (
          <div key={sectionIdx}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{section.title}</h2>
                <p className="text-sm text-gray-500">{section.description}</p>
              </div>
              {section.href && (
                <Link
                  href={section.href}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                >
                  View All <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {section.items.map((item, itemIdx) => {
                const Icon = item.icon
                return (
                  <Link
                    key={itemIdx}
                    href={item.href}
                    className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md hover:border-primary-200 transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${item.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">
                          {item.name}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">{item.description}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary-600 transition-colors" />
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}

        {/* Quick Tips */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">💡 Quick Tips</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Generate supplier documents from any itinerary using the "Documents" button</li>
            <li>• Documents are auto-grouped by supplier from your itinerary services</li>
            <li>• Send vouchers directly via Email or WhatsApp to suppliers</li>
            <li>• Track confirmation status for each document</li>
          </ul>
        </div>
      </div>
    </div>
  )
}