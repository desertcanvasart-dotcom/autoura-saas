'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/app/supabase'
import Link from 'next/link'
import {
  MessageSquare,
  FileText,
  Users,
  DollarSign,
  Calendar,
  Truck,
  BarChart3,
  Building2,
  Check,
  X,
  Sparkles,
  Globe,
  Shield,
  ArrowRight,
  Play,
  Star,
  MapPin,
  Ship,
  FileSearch,
  Clock,
  Menu,
  XIcon,
  Mail,
  Inbox,
  Handshake,
  Map,
  RefreshCcw
} from 'lucide-react'

// Animation hook for scroll reveal
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.1, rootMargin: '50px' }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [])

  return { ref, isVisible }
}

// Animated section wrapper
function AnimatedSection({
  children,
  className = '',
  delay = 0
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const { ref, isVisible } = useScrollReveal()

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${className}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(40px)',
        transitionDelay: `${delay}ms`
      }}
    >
      {children}
    </div>
  )
}

// Content data
const heroContent = {
  subheadline: "However your customers reach you, Autoura captures the enquiry and outputs a complete itinerary, calculated pricing, and a ready-to-send PDF — in minutes, not hours.",
  trustSignals: [
    "Built by a tour operator with 30+ years in tourism",
    "Processing real bookings since 2024"
  ]
}

const platforms = [
  {
    name: 'WhatsApp',
    color: '#25D366',
    icon: (
      <svg viewBox="0 0 24 24" fill="#fff" className="w-[55%] h-[55%]">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.553 4.12 1.52 5.856L0 24l6.335-1.652A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75c-1.875 0-3.63-.506-5.14-1.387l-.368-.22-3.821.997 1.02-3.715-.24-.382A9.712 9.712 0 012.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75z"/>
      </svg>
    ),
  },
  {
    name: 'Email',
    color: '#EA4335',
    icon: (
      <svg viewBox="0 0 24 24" fill="#fff" className="w-[55%] h-[55%]">
        <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
      </svg>
    ),
  },
]

// Cycling icon-only platform slot — fixed size, no reflow
function PlatformSlot() {
  const [displayIndex, setDisplayIndex] = useState(0)
  const [nextIndex, setNextIndex] = useState<number | null>(null)
  const [animState, setAnimState] = useState<'idle' | 'fadeOut' | 'fadeIn'>('idle')
  const counterRef = useRef(0)

  useEffect(() => {
    const interval = setInterval(() => {
      const next = (counterRef.current + 1) % platforms.length
      counterRef.current = next
      setNextIndex(next)
      setAnimState('fadeOut')
    }, 2200)

    return () => clearInterval(interval)
  }, [])

  // When fadeOut transition ends, swap to new icon and fade in
  const handleTransitionEnd = useCallback(() => {
    if (animState === 'fadeOut' && nextIndex !== null) {
      setDisplayIndex(nextIndex)
      setNextIndex(null)
      setAnimState('fadeIn')
      // After a frame, trigger fade-in transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimState('idle')
        })
      })
    }
  }, [animState, nextIndex])

  const iconStyle: React.CSSProperties =
    animState === 'idle'
      ? { opacity: 1, transform: 'translateY(0) scale(1)', transition: 'opacity 0.35s ease-out, transform 0.35s ease-out' }
      : animState === 'fadeOut'
      ? { opacity: 0, transform: 'translateY(-30%) scale(0.95)', transition: 'opacity 0.28s ease-in, transform 0.28s ease-in' }
      : // fadeIn — start state, no transition (snap below), then idle triggers transition
        { opacity: 0, transform: 'translateY(30%) scale(0.95)', transition: 'none' }

  const platform = platforms[displayIndex]

  return (
    <span
      className="inline-flex items-center justify-center align-middle relative overflow-hidden"
      style={{
        width: '0.82em',
        height: '0.82em',
        borderRadius: '0.18em',
      }}
    >
      <span
        className="absolute inset-0 flex items-center justify-center"
        style={{ ...iconStyle, background: platform.color, borderRadius: 'inherit' }}
        onTransitionEnd={handleTransitionEnd}
      >
        {platform.icon}
      </span>
    </span>
  )
}

// ── NEW DATA ARRAYS ──

const socialProofStats = [
  { value: '222+', label: 'API Endpoints' },
  { value: '53+', label: 'Operational Modules' },
  { value: '15', label: 'Rate Categories' },
  { value: '4', label: 'Service Tiers' },
  { value: '2', label: 'Messaging Platforms (more coming soon)' },
]

const problemScenarios = [
  {
    scenario: "A client messages: 'CAI-LXR 3pax JP passport VoK Karnak 5* htl 4NTS BB'. You spend 45 minutes decoding abbreviations, looking up entrance fees, and typing it into Excel.",
    consequence: "By the time you reply, they've booked with someone faster.",
  },
  {
    scenario: "Entrance fees changed last month. Three quotes went out with old prices. The vehicle rate was for 2 pax but the group grew to 5. Nobody caught it.",
    consequence: "Your margin evaporated before the tour even started.",
  },
  {
    scenario: "Your accountant asks for Q3 margins by tour type. You spend two days pulling invoices from email attachments and reconciling against supplier payments.",
    consequence: "You still don't know your actual profit.",
  },
]

const aiDemoExtracted = [
  { label: 'Client', value: 'Tanaka-san', confidence: 98 },
  { label: 'Nationality', value: 'Japanese (non-EU)', confidence: 96 },
  { label: 'Dates', value: 'Mar 15–19, 2025', confidence: 94 },
  { label: 'Pax', value: '3 adults', confidence: 99 },
  { label: 'Destinations', value: 'Cairo → Luxor', confidence: 97 },
]

const aiDemoItinerary = [
  { day: 1, title: 'Cairo — Pyramids & Sphinx', icon: MapPin },
  { day: 2, title: 'Cairo — Islamic Cairo & Khan el-Khalili', icon: Building2 },
  { day: 3, title: 'Fly to Luxor — Valley of the Kings', icon: MapPin },
  { day: 4, title: 'Luxor — Karnak & Luxor Temple', icon: MapPin },
]

const pricingPills = [
  { icon: DollarSign, label: '15 Rate Categories' },
  { icon: Star, label: '4 Tiers (Budget → Luxury)' },
  { icon: Globe, label: 'Dual Passport Pricing' },
  { icon: Truck, label: 'Auto Vehicle Selection' },
  { icon: RefreshCcw, label: 'Multi-Currency Support' },
  { icon: BarChart3, label: 'Per-Trip Margin' },
]

const platformStages = [
  {
    step: 1,
    headline: 'Every Inquiry, One Inbox',
    description: 'WhatsApp messages, emails, and walk-in inquiries land in a single unified inbox. AI extracts client name, dates, group size, nationality, and preferences from the conversation. Client profiles are created automatically.',
    screenshotNote: 'Capture /whatsapp-inbox showing conversations with parsed metadata badges',
    mockupImage: '/mockups/inbox.png',
    icon: Inbox,
  },
  {
    step: 2,
    headline: 'Itineraries That Price Themselves',
    description: 'Build day-by-day itineraries with the visual tour builder or let AI generate a draft. Every service auto-priced from your rate database. Switch tiers, adjust group size, or change dates — pricing recalculates instantly across all 14 service slots.',
    screenshotNote: 'Capture /tour-builder with 3+ days and pricing sidebar showing totals',
    mockupImage: '/mockups/tour-builder.png',
    icon: FileText,
  },
  {
    step: 3,
    headline: 'Assign, Confirm, Track',
    description: 'Assign guides, vehicles, and hotels to each itinerary. Send supplier vouchers via WhatsApp with one click. Calendar view shows every active tour across your team with drag-to-reschedule and conflict detection.',
    screenshotNote: 'Capture /calendar showing multiple active tours with assigned resources',
    mockupImage: '/mockups/calendar.png',
    icon: Calendar,
  },
  {
    step: 4,
    headline: 'From Invoice to P&L in Real Time',
    description: 'Generate multi-currency invoices directly from itineraries. Track deposits, balances, and AR aging (30/60/90 days). See per-trip profit and loss before departure. Auto-calculated commissions for every agent.',
    screenshotNote: 'Capture /financial-reports showing P&L chart, cash flow, and AR aging',
    mockupImage: '/mockups/financial-reports.png',
    icon: BarChart3,
  },
]

const capabilityClusters = [
  {
    icon: Sparkles,
    iconBg: 'bg-emerald-100 text-emerald-700',
    title: 'AI & Automation',
    bullets: [
      'WhatsApp parsing with 200+ Egyptian abbreviation recognition',
      'Auto-itinerary generation from unstructured conversations',
      'Confidence scoring on every extracted field',
      'Multi-language document generation (EN, JP)',
    ],
    badge: '5 AI modules',
  },
  {
    icon: DollarSign,
    iconBg: 'bg-amber-100 text-amber-700',
    title: 'Rate Management',
    bullets: [
      '15 rate categories from transport to tipping',
      'Seasonal pricing with automatic date selection',
      'EU/non-EU dual passport rates on every service',
      'Bulk import/export with full audit trail',
    ],
    badge: '15 rate tables',
  },
  {
    icon: Map,
    iconBg: 'bg-blue-100 text-blue-700',
    title: 'Tour Building',
    bullets: [
      'Drag-and-drop day planner with auto-pricing',
      'Pre-built templates by destination',
      'Content library with per-tier descriptions',
      'Instant pricing recalculation on any change',
    ],
    badge: 'End-to-end builder',
  },
  {
    icon: Handshake,
    iconBg: 'bg-violet-100 text-violet-700',
    title: 'B2B Partner System',
    bullets: [
      'Partner profiles with custom pricing rules',
      '4-tier pax-based pricing (1–40 pax, sedan to bus)',
      'One-click B2B quote conversion from any itinerary',
      'Transport packages by route, vehicle, and duration',
    ],
    badge: 'Full partner portal',
  },
  {
    icon: BarChart3,
    iconBg: 'bg-rose-100 text-rose-700',
    title: 'Financial Suite',
    bullets: [
      'Per-trip P&L visible before departure',
      'AR aging reports (30/60/90 days)',
      'Auto-calculated commissions per booking',
      'Expense tracking with receipt uploads',
    ],
    badge: '7 financial modules',
  },
  {
    icon: MessageSquare,
    iconBg: 'bg-cyan-100 text-cyan-700',
    title: 'Communications Hub',
    bullets: [
      'Unified WhatsApp + Gmail inbox',
      'Complete client timeline (messages, quotes, invoices)',
      'Supplier confirmations and voucher delivery',
      'Follow-up reminders and notification system',
    ],
    badge: 'Integrated CRM',
  },
]

const destinationTemplates = [
  {
    name: 'Egypt',
    status: 'Complete',
    statusColor: 'bg-emerald-100 text-emerald-700',
    bullets: [
      '200+ entrance fees with EU/non-EU rates',
      'Pre-built Nile cruise itineraries (Luxor–Aswan)',
      '200+ industry abbreviation glossary for AI parsing',
      'Supplier rate cards by city (Cairo, Luxor, Aswan, Alexandria)',
    ],
  },
  { name: 'Jordan', status: 'Configurable', statusColor: 'bg-stone-100 text-stone-600', bullets: [] },
  { name: 'Morocco', status: 'Configurable', statusColor: 'bg-stone-100 text-stone-600', bullets: [] },
  { name: 'Your Destination', status: 'Configurable', statusColor: 'bg-stone-100 text-stone-600', bullets: [] },
]

const enhancedTestimonials = [
  {
    quote: "I used to spend 3–4 hours building one itinerary. Now I generate a draft in 5 minutes and spend my time actually selling.",
    author: "Islam Hussein",
    role: "Founder",
    company: "Travel2Egypt",
    featureTag: "AI Itinerary Generation",
  },
  {
    quote: "The WhatsApp AI parsing changed everything. Clients message at midnight with abbreviations only we understand. By morning, I have a structured itinerary with confidence scores ready to review.",
    author: "Operations Manager",
    role: "DMC Operations",
    company: "Regional Tour Operator",
    featureTag: "WhatsApp AI Parsing",
  },
  {
    quote: "For the first time, I know my actual margin on each tour before it departs. Not estimated. Not averaged. The actual number — with commissions, supplier costs, and currency conversion included.",
    author: "Finance Director",
    role: "Finance",
    company: "Regional Travel Agency",
    featureTag: "Financial Management",
  },
]

const integrationBadges = [
  { icon: MessageSquare, label: 'WhatsApp Business API' },
  { icon: Mail, label: 'Gmail OAuth' },
  { icon: Sparkles, label: 'Claude AI (Anthropic)' },
  { icon: Globe, label: 'Multi-Currency' },
  { icon: Shield, label: 'Role-Based Access' },
  { icon: Clock, label: 'Full Audit Logging' },
  { icon: FileText, label: 'PDF Generation' },
  { icon: FileSearch, label: 'CSV Import/Export' },
]

export default function AutouraHomepage() {
  const [isLoaded, setIsLoaded] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Check authentication and redirect if needed
  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const { data: memberData } = await supabase
          .from('tenant_members')
          .select('tenant_id')
          .eq('user_id', session.user.id)
          .single()
        if (memberData?.tenant_id) {
          const { data: featuresData } = await supabase
            .from('tenant_features')
            .select('onboarding_completed')
            .eq('tenant_id', memberData.tenant_id)
            .single()
          if (featuresData && !featuresData.onboarding_completed) {
            router.push('/onboarding')
          } else {
            router.push('/dashboard')
          }
        }
      }
    }
    checkAuthAndRedirect()
  }, [router, supabase])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [videoModalOpen, setVideoModalOpen] = useState(false)

  useEffect(() => {
    setIsLoaded(true)
  }, [])

  // Close video modal on Escape key
  useEffect(() => {
    if (!videoModalOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVideoModalOpen(false)
    }
    document.addEventListener('keydown', handleEsc)
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [videoModalOpen])

  return (
    <div className="min-h-screen bg-[#F5F3EF] overflow-x-hidden">

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#F5F3EF] border-b border-[#E8E5DF]">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-[10px]">
            <img src="/autoura-logo.png" alt="Autoura" className="w-12 h-12 object-contain" />
            <span className="text-[19px] font-bold text-[#111710] tracking-[-0.3px]">Autoura</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-[#555] hover:text-[#111710] transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-[#555] hover:text-[#111710] transition-colors">How It Works</a>
            <Link href="/integrations" className="text-sm font-medium text-[#555] hover:text-[#111710] transition-colors">Integrations</Link>
            <Link href="/docs" className="text-sm font-medium text-[#555] hover:text-[#111710] transition-colors">Docs</Link>
            <Link href="/about" className="text-sm font-medium text-[#555] hover:text-[#111710] transition-colors">About</Link>
            <Link href="/login" className="text-sm font-medium text-[#555] hover:text-[#111710] transition-colors">Login</Link>
            <a
              href="https://calendly.com/autoura"
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-[9px] bg-[#647C47] text-white text-sm font-semibold rounded-[9px] hover:bg-[#4f6339] transition-all hover:shadow-[0_4px_16px_rgba(59,94,46,0.22)]"
            >
              Book a Free Demo
            </a>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-stone-600 hover:text-stone-900"
          >
            {mobileMenuOpen ? <XIcon className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden px-6 pt-4 pb-2 border-t border-[#D6D2CA] space-y-3">
            <a href="#features" className="block text-sm text-[#555] hover:text-[#111710] py-2">Features</a>
            <a href="#how-it-works" className="block text-sm text-[#555] hover:text-[#111710] py-2">How It Works</a>
            <Link href="/integrations" className="block text-sm text-[#555] hover:text-[#111710] py-2">Integrations</Link>
            <Link href="/docs" className="block text-sm text-[#555] hover:text-[#111710] py-2">Docs</Link>
            <Link href="/about" className="block text-sm text-[#555] hover:text-[#111710] py-2">About</Link>
            <Link href="/login" className="block text-sm text-[#555] hover:text-[#111710] py-2">Login</Link>
            <a
              href="https://calendly.com/autoura"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full px-4 py-2 bg-[#647C47] text-white text-sm font-semibold rounded-[9px] text-center hover:bg-[#4f6339]"
            >
              Book a Free Demo
            </a>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-40 sm:pt-44 pb-16 sm:pb-20 px-6 text-center max-w-[860px] mx-auto">
        <div
          className={`transition-all duration-1000 ease-out ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-[7px] bg-white border border-[#D6D2CA] rounded-full mb-8">
            <span className="w-[7px] h-[7px] rounded-full bg-[#647C47]" />
            <span className="text-[13px] font-medium text-[#647C47]">AI-Powered Travel Operations</span>
          </div>

          {/* Headline with cycling platform */}
          <h1 className="hero-headline text-[36px] sm:text-[46px] md:text-[56px] font-extrabold text-[#111710] leading-[1.18] tracking-[-1.8px] mb-7">
            Turn a message on <PlatformSlot /> into a fully-priced tour.
          </h1>

          {/* Subheadline */}
          <p className="text-[18px] leading-[1.65] text-[#5A5A52] max-w-[640px] mx-auto mb-10">
            {heroContent.subheadline}
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-[14px] mb-10">
            <a
              href="https://calendly.com/autoura"
              target="_blank"
              rel="noopener noreferrer"
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-[6px] px-7 py-[14px] bg-[#647C47] text-white text-[15px] font-semibold rounded-[9px] hover:bg-[#4f6339] transition-all hover:shadow-[0_6px_24px_rgba(59,94,46,0.25)] hover:-translate-y-px"
            >
              Book a Free Demo
              <span className="group-hover:translate-x-[3px] transition-transform">→</span>
            </a>
            <button
              onClick={() => setVideoModalOpen(true)}
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-[14px] bg-white text-[#111710] text-[15px] font-semibold rounded-[9px] border border-[#D6D2CA] hover:border-[#bbb] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:-translate-y-px"
            >
              <span className="text-[#647C47] text-sm">▷</span>
              See How It Works
            </button>
          </div>

          {/* Trust bar */}
          <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 sm:gap-8 text-sm text-[#6B6B63]">
            {heroContent.trustSignals.map((signal, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[#647C47] font-bold text-[15px]">✓</span>
                <span>{signal}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof Bar */}
      <section className="py-8 sm:py-10 px-4 sm:px-6 border-y border-stone-200/50 bg-stone-50/50">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-6 sm:gap-12">
          {socialProofStats.map((stat, i) => (
            <AnimatedSection key={i} delay={i * 80}>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-stone-900">{stat.value}</div>
                <div className="text-xs sm:text-sm text-stone-500 mt-1">{stat.label}</div>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </section>

      {/* The Problem */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 bg-stone-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 left-1/4 w-64 h-64 bg-red-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto relative">
          <AnimatedSection>
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white mb-4 sm:mb-6">
                Your Current Stack Is Held Together by <span className="text-red-400">Copy-Paste</span>
              </h2>
            </div>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 max-w-6xl mx-auto">
            {problemScenarios.map((item, i) => (
              <AnimatedSection key={i} delay={i * 100}>
                <div className="p-5 sm:p-6 bg-stone-800/50 backdrop-blur border border-stone-700/50 rounded-xl h-full flex flex-col hover:bg-stone-800/70 hover:-translate-y-1 transition-all duration-300">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                      <X className="w-4 h-4 text-red-400" />
                    </div>
                  </div>
                  <p className="text-stone-300 leading-relaxed text-sm sm:text-base flex-1">{item.scenario}</p>
                  <p className="text-amber-400 text-sm font-medium mt-4 pt-4 border-t border-stone-700/50">{item.consequence}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
          <AnimatedSection delay={400}>
            <p className="text-center text-lg sm:text-xl text-stone-300 mt-12 sm:mt-16 max-w-3xl mx-auto">
              You didn&apos;t start a travel business to be a <span className="text-white font-semibold">data entry specialist</span>.
              Autoura handles the operations so you can focus on the travel.
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* AI Demo — Flagship Feature */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection>
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-stone-900 mb-4 sm:mb-6">
                Paste a WhatsApp Message. <span className="text-[#647C47]">Get a Priced Itinerary.</span>
              </h2>
              <p className="text-stone-600 text-base sm:text-lg max-w-3xl mx-auto">
                Autoura&apos;s AI reads the conversation — including industry shorthand like CAI, VoK, NTS, and pax counts — and builds a complete day-by-day itinerary with calculated pricing in under 30 seconds.
              </p>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 max-w-6xl mx-auto items-start">
            {/* WhatsApp Phone Mockup */}
            <AnimatedSection delay={0}>
              <div className="bg-stone-800 rounded-[2rem] p-3 shadow-2xl transition-transform duration-500 hover:scale-[1.02]">
                <div className="bg-[#075E54] rounded-t-2xl px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                    <Users className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="text-white text-sm font-medium">Tanaka-san</div>
                    <div className="text-white/60 text-xs">online</div>
                  </div>
                </div>
                <div className="bg-[#ECE5DD] rounded-b-2xl p-4 min-h-[280px]">
                  <div className="bg-white rounded-lg p-3 shadow-sm max-w-[90%] mb-3">
                    <p className="text-stone-800 text-sm leading-relaxed">
                      Hi, I need a quote for 3 pax, Japanese passports. CAI arrival Mar 15, want to see Pyramids, Sphinx, then fly LXR for VoK, Karnak, Hatshepsut Temple. 5* htl, 4NTS BB. Need guide EN/JP. Airport meet &amp; greet both cities. Private transport throughout.
                    </p>
                    <p className="text-right text-xs text-stone-400 mt-1">2:47 AM</p>
                  </div>
                </div>
              </div>
            </AnimatedSection>

            {/* AI Output Card */}
            <AnimatedSection delay={300}>
              <div className="bg-white rounded-2xl shadow-xl border border-stone-200 overflow-hidden transition-all duration-500 hover:shadow-2xl hover:scale-[1.01]">
                <div className="bg-[#647C47] px-5 py-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-white" />
                  <span className="text-white text-sm font-medium">Autoura AI Output</span>
                  <span className="ml-auto text-xs text-white/70 bg-white/20 px-2 py-0.5 rounded-full">Processed in 12s</span>
                </div>
                <div className="p-5">
                  {/* Extracted Fields */}
                  <div className="space-y-2 mb-5">
                    {aiDemoExtracted.map((field, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-500" />
                          <span className="text-stone-500">{field.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-stone-900">{field.value}</span>
                          <span className="text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{field.confidence}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Itinerary Skeleton */}
                  <div className="border-t border-stone-100 pt-4">
                    <div className="text-xs font-medium text-stone-400 uppercase tracking-wide mb-3">Generated Itinerary</div>
                    <div className="space-y-2">
                      {aiDemoItinerary.map((day) => (
                        <div key={day.day} className="flex items-center gap-3 text-sm">
                          <span className="w-7 h-7 rounded-lg bg-[#647C47]/10 text-[#647C47] text-xs font-bold flex items-center justify-center shrink-0">D{day.day}</span>
                          <day.icon className="w-4 h-4 text-stone-400 shrink-0" />
                          <span className="text-stone-700">{day.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Price Summary */}
                  <div className="mt-4 pt-4 border-t border-stone-100 flex items-center justify-between">
                    <span className="text-sm text-stone-500">Estimated total (3 pax, Deluxe)</span>
                    <span className="text-lg font-bold text-[#647C47]">$4,260</span>
                  </div>
                </div>
              </div>
            </AnimatedSection>
          </div>

          {/* Detail Badges */}
          <AnimatedSection delay={500}>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-10 sm:mt-12">
              {['Understands 200+ Egyptian travel abbreviations', 'Dual-passport pricing auto-applied', 'Confidence scoring on every field'].map((text, i) => (
                <span key={i} className="inline-flex items-center gap-2 px-4 py-2 bg-[#647C47]/5 border border-[#647C47]/20 rounded-full text-sm text-[#647C47] font-medium">
                  <Sparkles className="w-3.5 h-3.5" />
                  {text}
                </span>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Pricing Engine Deep-Dive */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 bg-gradient-to-b from-stone-100 to-stone-50">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection>
            <div className="text-center mb-10 sm:mb-14">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-stone-900 mb-4 sm:mb-6">
                A Pricing Engine That <span className="text-[#647C47]">Thinks Like a Tour Operator</span>
              </h2>
              <p className="text-stone-600 text-base sm:text-lg max-w-3xl mx-auto">
                14 service slots per day. Seasonal rates. Entrance fees by nationality. Automatic vehicle upgrades when the group grows. Your margin calculated on every quote.
              </p>
            </div>
          </AnimatedSection>

          {/* Screenshot Placeholder */}
          <AnimatedSection delay={100}>
            <div className="max-w-5xl mx-auto mb-10 sm:mb-12">
              <img src="/mockups/pricing-grid.png" alt="Autoura Pricing Grid — day-by-day calculator" className="w-full rounded-2xl shadow-lg border border-stone-200 transition-transform duration-500 hover:scale-[1.02]" />
            </div>
          </AnimatedSection>

          {/* Stat Pills */}
          <AnimatedSection delay={200}>
            <div className="flex flex-wrap items-center justify-center gap-3 max-w-4xl mx-auto">
              {pricingPills.map((pill, i) => (
                <div key={i} className="flex items-center gap-2 bg-white rounded-full px-4 py-2.5 border border-stone-200 text-sm font-medium text-stone-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                  <pill.icon className="w-4 h-4 text-[#647C47]" />
                  {pill.label}
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Platform Walkthrough */}
      <section id="how-it-works" className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection>
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-stone-900 mb-4 sm:mb-6">
                From Inquiry to Invoice in <span className="text-[#647C47]">One Flow</span>
              </h2>
              <p className="text-stone-600 text-base sm:text-lg max-w-2xl mx-auto">
                See how a booking moves through Autoura — from the first message to the final commission payment.
              </p>
            </div>
          </AnimatedSection>

          <div className="space-y-12 sm:space-y-20 max-w-6xl mx-auto">
            {platformStages.map((stage, i) => (
              <AnimatedSection key={stage.step} delay={i * 100}>
                <div className={`flex flex-col ${i % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'} gap-8 sm:gap-12 items-center`}>
                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-[#647C47] text-white font-bold flex items-center justify-center text-sm shadow-lg">
                        {stage.step}
                      </div>
                      <stage.icon className="w-5 h-5 text-[#647C47]" />
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-stone-900 mb-3">{stage.headline}</h3>
                    <p className="text-stone-600 leading-relaxed">{stage.description}</p>
                  </div>
                  {/* Screenshot Placeholder */}
                  <div className="flex-1 min-w-0 w-full">
                    <img src={stage.mockupImage} alt={stage.headline} className="w-full rounded-xl shadow-md border border-stone-200 transition-all duration-500 hover:scale-[1.02] hover:shadow-xl" />
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Power Features Grid */}
      <section id="features" className="py-16 sm:py-24 px-4 sm:px-6 bg-gradient-to-b from-stone-50 to-[#F5F3EF]">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection>
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-stone-900 mb-4 sm:mb-6">
                53 Modules. <span className="text-[#647C47]">One Platform.</span>
              </h2>
              <p className="text-stone-600 text-base sm:text-lg max-w-2xl mx-auto">
                Every tool a tour operator needs — from the first WhatsApp message to the final commission payment.
              </p>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 max-w-6xl mx-auto">
            {capabilityClusters.map((cluster, i) => (
              <AnimatedSection key={i} delay={i * 80}>
                <div className="bg-white rounded-2xl p-6 sm:p-8 border border-stone-200 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 h-full flex flex-col">
                  <div className="flex items-center gap-3 mb-5">
                    <div className={`w-10 h-10 rounded-xl ${cluster.iconBg} flex items-center justify-center`}>
                      <cluster.icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-bold text-stone-900">{cluster.title}</h3>
                  </div>
                  <ul className="space-y-3 flex-1">
                    {cluster.bullets.map((bullet, j) => (
                      <li key={j} className="flex items-start gap-2.5 text-sm text-stone-600">
                        <Check className="w-4 h-4 text-[#647C47] mt-0.5 shrink-0" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 pt-4 border-t border-stone-100">
                    <span className="text-xs font-medium text-stone-400 bg-stone-50 px-2.5 py-1 rounded-full">{cluster.badge}</span>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Destination Templates */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 bg-gradient-to-br from-amber-50/50 to-orange-50/30">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-16 items-start max-w-6xl mx-auto">
            {/* Text */}
            <AnimatedSection>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 rounded-full mb-6">
                <MapPin className="w-4 h-4 text-amber-700" />
                <span className="text-sm font-medium text-amber-700">Destination Templates</span>
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-stone-900 mb-4 sm:mb-6">
                Destination-Ready <span className="text-amber-600">from Day One</span>
              </h2>
              <p className="text-stone-600 text-base sm:text-lg leading-relaxed mb-4">
                Autoura ships with Egypt as a complete operational template — 200+ attractions with entrance fees, Nile cruise itineraries, and a full abbreviation glossary.
              </p>
              <p className="text-stone-600 text-base sm:text-lg leading-relaxed">
                The architecture is destination-agnostic. Add your own rates, attractions, and supplier data for any country.
              </p>
            </AnimatedSection>

            {/* Destination Cards */}
            <AnimatedSection delay={200}>
              <div className="space-y-3">
                {destinationTemplates.map((dest, i) => (
                  <div
                    key={dest.name}
                    className={`rounded-xl border p-4 sm:p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${
                      i === 0
                        ? 'bg-white border-amber-200 shadow-md'
                        : 'bg-white/60 border-stone-200 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <MapPin className={`w-4 h-4 ${i === 0 ? 'text-amber-600' : 'text-stone-400'}`} />
                        <span className={`font-semibold ${i === 0 ? 'text-stone-900' : 'text-stone-500'}`}>{dest.name}</span>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${dest.statusColor}`}>{dest.status}</span>
                    </div>
                    {dest.bullets.length > 0 && (
                      <ul className="space-y-1.5 mt-3">
                        {dest.bullets.map((b, j) => (
                          <li key={j} className="flex items-start gap-2 text-sm text-stone-600">
                            <Check className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {i > 0 && (
                      <p className="text-xs text-stone-400 mt-2">Import your rates, configure entrance fees, launch.</p>
                    )}
                  </div>
                ))}
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 bg-stone-100">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection>
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-stone-900 mb-4 sm:mb-6">
                What Operators Are Saying
              </h2>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-6xl mx-auto">
            {enhancedTestimonials.map((testimonial, i) => (
              <AnimatedSection key={i} delay={i * 100}>
                <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-lg border border-stone-200 h-full flex flex-col hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  <span className="inline-block self-start px-2.5 py-1 text-xs font-medium rounded-full bg-[#647C47]/10 text-[#647C47] mb-4">
                    {testimonial.featureTag}
                  </span>
                  <div className="flex items-center gap-1 mb-4">
                    {[...Array(5)].map((_, j) => (
                      <Star key={j} className="w-4 h-4 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <blockquote className="text-stone-700 text-base leading-relaxed mb-6 flex-1">
                    &ldquo;{testimonial.quote}&rdquo;
                  </blockquote>
                  <div className="border-t border-stone-100 pt-4">
                    <p className="font-semibold text-stone-900">{testimonial.author}</p>
                    <p className="text-sm text-stone-500">{testimonial.role}, {testimonial.company}</p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Integration & Security Strip */}
      <section className="py-6 sm:py-8 px-4 sm:px-6 bg-stone-900">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-center gap-4 sm:gap-8">
          {integrationBadges.map((badge, i) => (
            <div key={i} className="flex items-center gap-2 text-white/60">
              <badge.icon className="w-4 h-4" />
              <span className="text-xs sm:text-sm font-medium">{badge.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <AnimatedSection>
            <div className="relative bg-gradient-to-br from-stone-900 to-stone-800 rounded-2xl sm:rounded-3xl p-8 sm:p-12 md:p-16 overflow-hidden">
              <div className="absolute inset-0 opacity-30">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#647C47]/30 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl" />
              </div>
              <div className="relative text-center">
                <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white mb-4 sm:mb-6">
                  Stop Quoting from Spreadsheets
                </h2>
                <p className="text-stone-300 text-base sm:text-lg max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed">
                  From a WhatsApp message to a branded, priced PDF in under 5 minutes. From scattered Excel files to real-time per-trip P&amp;L. From manual copy-paste to AI-powered operations.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <a
                    href="https://calendly.com/autoura"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-[#647C47] text-white font-semibold rounded-[9px] hover:bg-[#4f6339] transition-all hover:shadow-xl hover:shadow-[#647C47]/30 flex items-center justify-center gap-2"
                  >
                    Book a Free Demo
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </a>
                  <Link
                    href="/docs"
                    className="text-stone-400 hover:text-white text-sm font-medium transition-colors"
                  >
                    Or explore the documentation →
                  </Link>
                </div>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 sm:py-12 px-4 sm:px-6 border-t border-stone-200">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <img src="/autoura-logo.png" alt="Autoura" className="w-14 h-14 object-contain" />
            </div>
            <div className="flex items-center gap-6 sm:gap-8 text-sm text-stone-500">
              <Link href="/about" className="hover:text-stone-700 transition-colors">About</Link>
              <Link href="/docs" className="hover:text-stone-700 transition-colors">Docs</Link>
              <Link href="/integrations" className="hover:text-stone-700 transition-colors">Integrations</Link>
              <Link href="/privacy" className="hover:text-stone-700 transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-stone-700 transition-colors">Terms</Link>
              <Link href="/contact" className="hover:text-stone-700 transition-colors">Contact</Link>
            </div>
            <p className="text-sm text-stone-400">
              © {new Date().getFullYear()} Autoura. Built in Cairo.
            </p>
          </div>
        </div>
      </footer>

      {/* Video Modal */}
      {videoModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          onClick={() => setVideoModalOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

          {/* Modal content */}
          <div
            className="relative w-full max-w-4xl mx-4 aspect-video rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setVideoModalOpen(false)}
              className="absolute -top-10 right-0 sm:-top-12 sm:-right-0 text-white/80 hover:text-white transition-colors z-10 flex items-center gap-1 text-sm"
            >
              <XIcon className="w-5 h-5" />
              <span className="hidden sm:inline">Close</span>
            </button>

            {/* YouTube embed */}
            <iframe
              src="https://www.youtube.com/embed/jUa1j1rvUeY?autoplay=1&rel=0&modestbranding=1"
              title="See How Autoura Works"
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </div>
  )
}
