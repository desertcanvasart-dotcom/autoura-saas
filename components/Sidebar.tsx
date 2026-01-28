'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/app/contexts/AuthContext'
import { useTenant } from '@/app/contexts/TenantContext'
import { useRole, UserRole } from '@/hooks/useRole'
import NotificationBell from '@/components/NotificationBell'
import TenantSwitcher from '@/components/TenantSwitcher'
import {
  LayoutDashboard,
  Users,
  DollarSign,
  Settings,
  ChevronRight,
  ChevronDown,
  MessageSquare,
  FileText,
  Calendar, 
  CheckSquare,
  Menu,
  X,
  User,
  Truck,
  TrendingUp,
  Hotel,
  UtensilsCrossed,
  Plane,
  Coins,
  LogOut,
  Mail,
  Ticket,
  Contact,
  Library,
  Receipt,
  Wallet,
  BarChart3,
  CreditCard,
  LayoutTemplate,
  ConciergeBell,
  Train,
  BedDouble,
  Ship,
  Building,
  UserCog,
  Shield,
  BookOpen,
  Handshake,
  Send,
  Route,
  Package,
  Briefcase,
  Tags
} from 'lucide-react'

interface SidebarProps {
  isCollapsed: boolean
  setIsCollapsed: (collapsed: boolean) => void
}

interface NavSubItem {
  label: string
  href: string
  icon?: any
  roles?: UserRole[]
}

interface NavItem {
  label: string
  href: string
  icon: any
  roles?: UserRole[]
  children?: NavSubItem[]
  businessTypes?: string[] // Which business types can see this item
}

interface NavSection {
  title: string
  key: string
  roles?: UserRole[]
  items: NavItem[]
}

// Define navigation with role-based visibility
const navigation: NavSection[] = [
  {
    title: 'Main',
    key: 'main',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Analytics', href: '/analytics', icon: TrendingUp },
    ]
  },
  {
    title: 'CRM',
    key: 'crm',
    roles: ['admin', 'manager', 'agent'],
    items: [
      { label: 'Clients', href: '/clients', icon: Users, businessTypes: ['b2c_only', 'b2c_and_b2b'] },
      { label: 'Staff', href: '/contacts?type=staff', icon: UserCog },
      { label: 'Follow-ups', href: '/followups', icon: CheckSquare },
      { label: 'Calendar', href: '/calendar', icon: Calendar },
    ]
  },
  {
    title: 'Communication',
    key: 'communication',
    roles: ['admin', 'manager', 'agent'],
    items: [
      { label: 'Conversations', href: '/conversations', icon: MessageSquare },
      { label: 'Inbox', href: '/inbox', icon: Mail },
      { label: 'WhatsApp', href: '/whatsapp-inbox', icon: MessageSquare },
      { label: 'WhatsApp Parser', href: '/whatsapp-parser', icon: Send },
      { label: 'Message Templates', href: '/templates', icon: FileText },
    ]
  },
  {
    title: 'Operations',
    key: 'operations',
    roles: ['admin', 'manager'],
    items: [
      { label: 'Suppliers', href: '/suppliers', icon: Building },
      { label: 'Itineraries', href: '/itineraries', icon: Route },
      { label: 'Team Members', href: '/team-members', icon: Users },
      { label: 'Tasks', href: '/tasks', icon: CheckSquare },
    ]
  },
  {
    title: 'Quotes',
    key: 'quotes',
    roles: ['admin', 'manager', 'agent'],
    items: [
      {
        label: 'B2C Quotes',
        href: '/quotes/b2c',
        icon: User,
        businessTypes: ['b2c_only', 'b2c_and_b2b']
      },
      {
        label: 'B2B Quotes',
        href: '/quotes/b2b',
        icon: Building,
        businessTypes: ['b2b_only', 'b2c_and_b2b']
      },
    ]
  },
  {
    title: 'Bookings',
    key: 'bookings',
    roles: ['admin', 'manager', 'agent'],
    items: [
      { label: 'All Bookings', href: '/bookings', icon: BookOpen },
    ]
  },
  {
    title: 'Rates & Pricing',
    key: 'rates',
    roles: ['admin', 'manager'],
    items: [
      { label: 'Rates Hub', href: '/rates', icon: Coins },
      { label: 'Hotels', href: '/rates/hotels', icon: Hotel },
      { label: 'Nile Cruises', href: '/rates/cruises', icon: Ship },
      { label: 'Sleeping Trains', href: '/rates/sleeping-train', icon: BedDouble },
      { label: 'Flights', href: '/rates/flights', icon: Plane },
      { label: 'Trains', href: '/rates/trains', icon: Train },
      { label: 'Meals', href: '/rates/meals', icon: UtensilsCrossed },
      { label: 'Attractions', href: '/rates/attractions', icon: Building },
      { label: 'Tour Guides', href: '/rates/guides', icon: Users },   
      { label: 'Activities', href: '/rates/activities', icon: Ticket },    
      { label: 'Transportation', href: '/rates/transportation', icon: Truck },
      { label: 'Airport Services', href: '/rates/airport-services', icon: Plane },
      { label: 'Hotel Services', href: '/rates/hotel-services', icon: ConciergeBell },
      { label: 'Tipping', href: '/rates/tipping', icon: DollarSign },
    ]
  },
  {
    title: 'Finance',
    key: 'finance',
    roles: ['admin', 'manager'],
    items: [
      { label: 'Payments', href: '/payments', icon: DollarSign },
      { label: 'Invoices', href: '/invoices', icon: FileText },
      { label: 'Receipts', href: '/receipts', icon: Receipt },
      { label: 'Receivables', href: '/accounts-receivable', icon: Wallet },
      { label: 'Payables', href: '/accounts-payable', icon: CreditCard },
      { label: 'Expenses', href: '/expenses', icon: Receipt },
      { label: 'Commissions', href: '/commissions', icon: Handshake },
      { label: 'Profit & Loss', href: '/profit-loss', icon: TrendingUp },
    ]
  },
  {
    title: 'Content',
    key: 'content',
    roles: ['admin', 'manager'],
    items: [
      { label: 'Content Library', href: '/content-library', icon: Library },
      { label: 'Writing Rules', href: '/content-library/rules', icon: BookOpen },
      { label: 'Documents', href: '/documents', icon: FileText },
    ]
  },
  {
    title: 'Reports',
    key: 'reports',
    roles: ['admin', 'manager'],
    items: [
      { label: 'Reports', href: '/financial-reports', icon: BarChart3 },
    ]
  },
  {
    title: 'B2B',
    key: 'b2b',
    roles: ['admin', 'manager'],
    items: [
      { label: 'Tour Builder', href: '/tours/manage', icon: LayoutTemplate },
      { label: 'Ready Made Packages', href: '/tours', icon: Package },
      { label: 'Partners', href: '/b2b/partners', icon: Handshake },
      { label: 'Quotes', href: '/b2b/quotes', icon: FileText },
      { label: 'Pricing Rules', href: '/b2b/pricing-rules', icon: Tags },
    ]
  },
  {
    title: 'Settings',
    key: 'settings',
    roles: ['admin'],
    items: [
      { label: 'Settings', href: '/settings', icon: Settings },
      { label: 'Organization', href: '/settings/tenant', icon: Building },
      { label: 'Team Management', href: '/settings/team', icon: Users },
      { label: 'Billing and Subscriptions', href: '/settings/billing', icon: CreditCard },
      { label: 'User Management', href: '/users', icon: Shield },
    ]
  }
]

// Storage key for section states
const STORAGE_KEY = 'autoura-sidebar-sections'

// Role badge colors
const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  agent: 'bg-green-100 text-green-700',
  viewer: 'bg-gray-100 text-gray-600'
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  agent: 'Agent',
  viewer: 'Viewer'
}

export default function Sidebar({ isCollapsed, setIsCollapsed }: SidebarProps) {
  const pathname = usePathname()
  const { profile, signOut } = useAuth()
  const { tenant, hasB2B, hasB2C } = useTenant()
  const { role, canAccess } = useRole()

  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [expandedSections, setExpandedSections] = useState<string[]>(['main', 'crm', 'trips'])
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['Contacts'])
  const [currentUrl, setCurrentUrl] = useState('')

  // Filter navigation based on user role AND feature flags
  const filteredNavigation = navigation.filter(section => {
    // Filter by role
    if (section.roles && !canAccess(section.roles)) return false

    // Filter by feature flags
    if (section.key === 'b2b' && !hasB2B) return false

    return true
  }).map(section => ({
    ...section,
    items: section.items.filter(item => {
      // Filter by role
      if (item.roles && !canAccess(item.roles)) return false

      // Filter by feature flags instead of business type
      if (item.businessTypes) {
        // Determine current business type from feature flags
        let currentBusinessType: string
        if (hasB2C && hasB2B) {
          currentBusinessType = 'b2c_and_b2b'
        } else if (hasB2C && !hasB2B) {
          currentBusinessType = 'b2c_only'
        } else if (!hasB2C && hasB2B) {
          currentBusinessType = 'b2b_only'
        } else {
          return false // No features enabled
        }

        // Show item if current business type matches any allowed type
        return item.businessTypes.includes(currentBusinessType)
      }

      return true
    })
  }))

  // Load saved section states from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setExpandedSections(parsed.sections || ['main', 'crm', 'trips'])
        setExpandedMenus(parsed.menus || ['Contacts'])
      } catch {
        // Use defaults if parsing fails
      }
    }
  }, [])

  // Save section states to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      sections: expandedSections,
      menus: expandedMenus
    }))
  }, [expandedSections, expandedMenus])

  // Get full URL on client side only
  useEffect(() => {
    setCurrentUrl(window.location.href)
  }, [pathname])

  // Auto-expand section containing active page
  useEffect(() => {
    filteredNavigation.forEach(section => {
      const hasActiveItem = section.items.some(item => 
        pathname === item.href || 
        (item.href !== '/dashboard' && pathname.startsWith(item.href)) ||
        item.children?.some(child => pathname === child.href || currentUrl.includes(child.href))
      )
      if (hasActiveItem && !expandedSections.includes(section.key)) {
        setExpandedSections(prev => [...prev, section.key])
      }
    })
  }, [pathname, currentUrl, filteredNavigation])

  // Auto-expand menu if on contacts page
  useEffect(() => {
    if (pathname === '/contacts') {
      setExpandedMenus(prev => prev.includes('Contacts') ? prev : [...prev, 'Contacts'])
    }
  }, [pathname])

  const toggleSection = (key: string) => {
    setExpandedSections(prev => 
      prev.includes(key) 
        ? prev.filter(k => k !== key)
        : [...prev, key]
    )
  }

  const toggleMenu = (label: string) => {
    setExpandedMenus(prev => 
      prev.includes(label) 
        ? prev.filter(l => l !== label)
        : [...prev, label]
    )
  }

  // Check if a child link is active (works with query params on client)
  const isChildActive = (childHref: string): boolean => {
    if (!currentUrl) return false
    
    if (childHref === '/contacts') {
      return pathname === '/contacts' && !currentUrl.includes('type=')
    }
    
    const typeMatch = childHref.match(/type=(\w+)/)
    if (typeMatch) {
      return currentUrl.includes(`type=${typeMatch[1]}`)
    }
    
    return false
  }

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-lg"
      >
        {isMobileOpen ? (
          <X className="w-6 h-6 text-gray-700" />
        ) : (
          <Menu className="w-6 h-6 text-gray-700" />
        )}
      </button>

      {/* Overlay for mobile */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-40 h-screen bg-white border-r border-gray-200
          transition-all duration-300 ease-in-out flex flex-col
          ${isCollapsed ? 'w-16' : 'w-56'}
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo Header with Tenant Name and Notification Bell */}
        <div className="flex items-center justify-between h-14 px-3 border-b border-gray-200 flex-shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-7 h-7 flex-shrink-0">
              <img
                src="/autoura-logo.png"
                alt="Autoura"
                className="w-full h-full object-contain"
              />
            </div>
            {!isCollapsed && tenant && (
              <span className="text-sm font-semibold text-gray-900 truncate">
                {tenant.company_name}
              </span>
            )}
          </Link>

          <div className="flex items-center gap-1 flex-shrink-0">
            {!isCollapsed && <NotificationBell />}

            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden lg:block p-1 hover:bg-gray-100 rounded transition-colors"
            >
              <ChevronRight
                className={`w-4 h-4 text-gray-500 transition-transform ${
                  isCollapsed ? '' : 'rotate-180'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Notification Bell for collapsed state */}
        {isCollapsed && (
          <div className="flex justify-center py-2 border-b border-gray-100">
            <NotificationBell />
          </div>
        )}

        {/* Tenant Switcher */}
        <TenantSwitcher isCollapsed={isCollapsed} />

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400">
          {filteredNavigation.map((section) => {
            const isSectionExpanded = expandedSections.includes(section.key)
            
            return (
              <div key={section.key}>
                {/* Section Header */}
                {!isCollapsed ? (
                  <button
                    onClick={() => toggleSection(section.key)}
                    className="flex items-center justify-between w-full px-2 py-1.5 mb-1 rounded-md hover:bg-gray-50 transition-colors group"
                  >
                    <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider group-hover:text-gray-600">
                      {section.title}
                    </h3>
                    <ChevronDown 
                      className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${
                        isSectionExpanded ? '' : '-rotate-90'
                      }`}
                    />
                  </button>
                ) : (
                  section.title !== 'Main' && (
                    <div className="h-px bg-gray-200 my-2 mx-2"></div>
                  )
                )}

                {/* Section Items */}
                <div className={`
                  space-y-0.5 overflow-hidden transition-all duration-200
                  ${!isCollapsed && !isSectionExpanded ? 'max-h-0 opacity-0' : 'max-h-[1000px] opacity-100'}
                `}>
                  {section.items.map((item) => {
                    const Icon = item.icon
                    const hasChildren = item.children && item.children.length > 0
                    const isExpanded = expandedMenus.includes(item.label)
                    
                    const isOnContactsPage = pathname === '/contacts'
                    const isActive = hasChildren 
                      ? isOnContactsPage
                      : pathname === item.href || 
                        (item.href !== '/dashboard' && pathname.startsWith(item.href))

                    // For items with children (collapsible)
                    if (hasChildren && !isCollapsed) {
                      return (
                        <div key={item.label}>
                          <button
                            onClick={() => toggleMenu(item.label)}
                            className={`
                              flex items-center gap-2.5 px-2 py-1.5 rounded-md w-full
                              transition-all duration-150 text-sm
                              ${isActive
                                ? 'bg-primary-50 text-primary-700 font-medium'
                                : 'text-gray-700 hover:bg-gray-50'
                              }
                            `}
                          >
                            <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-primary-600' : 'text-gray-500'}`} />
                            <span className="text-[13px] flex-1 text-left">{item.label}</span>
                            <ChevronDown 
                              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                                isExpanded ? 'rotate-180' : ''
                              }`} 
                            />
                          </button>
                          
                          {/* Children */}
                          <div className={`
                            overflow-hidden transition-all duration-200 ease-in-out
                            ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
                          `}>
                            <div className="ml-4 pl-2.5 border-l border-gray-200 mt-1 space-y-0.5">
                              {item.children!.filter(child => {
                                if (!child.roles) return true
                                return canAccess(child.roles)
                              }).map((child) => {
                                const ChildIcon = child.icon
                                const isChildItemActive = isChildActive(child.href)
                                
                                return (
                                  <Link
                                    key={child.href}
                                    href={child.href}
                                    onClick={() => setIsMobileOpen(false)}
                                    className={`
                                      flex items-center gap-2 px-2 py-1.5 rounded-md
                                      transition-all duration-150 text-sm
                                      ${isChildItemActive
                                        ? 'bg-primary-50 text-primary-700 font-medium'
                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                      }
                                    `}
                                  >
                                    {ChildIcon && (
                                      <ChildIcon className={`w-4 h-4 flex-shrink-0 ${isChildItemActive ? 'text-primary-600' : 'text-gray-400'}`} />
                                    )}
                                    <span className="text-[12px]">{child.label}</span>
                                    {isChildItemActive && (
                                      <div className="ml-auto w-1 h-1 rounded-full bg-primary-600" />
                                    )}
                                  </Link>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      )
                    }

                    // Regular items
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsMobileOpen(false)}
                        className={`
                          flex items-center gap-2.5 px-2 py-1.5 rounded-md
                          transition-all duration-150 text-sm
                          ${isActive
                            ? 'bg-primary-50 text-primary-700 font-medium'
                            : 'text-gray-700 hover:bg-gray-50'
                          }
                          ${isCollapsed ? 'justify-center' : ''}
                        `}
                        title={isCollapsed ? item.label : ''}
                      >
                        <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-primary-600' : 'text-gray-500'}`} />
                        {!isCollapsed && (
                          <span className="text-[13px]">{item.label}</span>
                        )}
                        {!isCollapsed && isActive && (
                          <div className="ml-auto w-1 h-1 rounded-full bg-primary-600" />
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        {/* User Profile Footer */}
        <div className="border-t border-gray-200 p-2.5 flex-shrink-0 space-y-1">
          {/* User Info with Role Badge */}
          <div
            className={`
              flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md
              ${isCollapsed ? 'justify-center' : ''}
            `}
          >
            <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <User className="w-3.5 h-3.5 text-green-700" />
            </div>
            {!isCollapsed && (
              <div className="flex-1 text-left min-w-0">
                <p className="text-[13px] font-medium text-gray-700 truncate">
                  {profile?.full_name || 'User'}
                </p>
                <span className={`inline-block px-1.5 py-0.5 text-[9px] font-medium rounded ${ROLE_COLORS[role]}`}>
                  {ROLE_LABELS[role]}
                </span>
              </div>
            )}
          </div>
          
          {/* Sign Out Button */}
          <button
            onClick={handleSignOut}
            className={`
              flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md
              text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors
              ${isCollapsed ? 'justify-center' : ''}
            `}
            title={isCollapsed ? 'Sign out' : ''}
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
            {!isCollapsed && (
              <span className="text-[13px]">Sign out</span>
            )}
          </button>
        </div>
      </aside>

      {/* Custom scrollbar styles */}
      <style jsx global>{`
        .scrollbar-thin::-webkit-scrollbar {
          width: 4px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 2px;
        }
        .scrollbar-thin:hover::-webkit-scrollbar-thumb {
          background: #9ca3af;
        }
      `}</style>
    </>
  )
}