'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { 
  MessageSquare, 
  FileText, 
  Users, 
  DollarSign, 
  Calendar, 
  Truck,
  ClipboardList,
  BarChart3,
  Building2,
  ChevronRight,
  Check,
  X,
  Sparkles,
  Zap,
  Globe,
  Shield,
  ArrowRight,
  Play,
  Star,
  MapPin,
  Ship,
  Languages,
  FileSearch,
  Clock,
  Menu,
  XIcon,
  Bot,
  BookOpen,
  Package,
  PieChart,
  Lock,
  UserCheck,
  Timer
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
  headline: "Stop Running Your Travel Business from WhatsApp and Excel",
  subheadline: "Autoura is the operations platform built for tour operators who are tired of copying prices between spreadsheets, losing client requests in chat threads, and manually creating the same itinerary PDF for the hundredth time.",
  trustSignals: [
    "Built by a tour operator with 30+ years in Egypt tourism",
    "Processing real bookings since 2025"
  ]
}

const painPoints = [
  "Client inquiries arrive on WhatsApp. You screenshot them into a folder, then forget which folder.",
  "Your pricing lives in an Excel file that three people edited last month. No one knows which version is correct.",
  "Creating a 7-day itinerary takes 3 hours because you're copying attraction descriptions from old documents.",
  "A Japanese client messages at 2 AM. By the time you translate and respond, they've booked with someone faster.",
  "Your accountant asks for Q3 revenue by tour type. You spend two days pulling invoices from email attachments.",
  "A guide calls in sick. You scroll through 200 WhatsApp messages trying to find which clients are affected.",
  "Supplier rates changed last month. Half your quotes are still using old prices."
]

const pillars = [
  {
    icon: Users,
    title: "Sales & CRM",
    description: "WhatsApp inbox, client profiles, lead tracking, and instant quote generation. Every conversation becomes a searchable record.",
    color: "from-emerald-500 to-teal-600"
  },
  {
    icon: ClipboardList,
    title: "Operations",
    description: "Itinerary builder, resource scheduling, supplier management, and daily manifests. Know exactly what's happening every day.",
    color: "from-amber-500 to-orange-600"
  },
  {
    icon: DollarSign,
    title: "Finance",
    description: "Invoicing, payment tracking, supplier payables, and profit margins. See your actual margin on every tour.",
    color: "from-violet-500 to-purple-600"
  }
]

const steps = [
  {
    title: "Client Messages You",
    description: "The conversation appears in your Autoura inbox. AI extracts their name, dates, group size, and interests automatically.",
    icon: MessageSquare
  },
  {
    title: "Generate Itinerary",
    description: "Select the tier, click generate. Autoura builds a day-by-day itinerary with correct fees and calculated margins.",
    icon: Sparkles
  },
  {
    title: "Send Professional Quote",
    description: "One click creates a branded PDF. Send directly via WhatsApp or email from the platform.",
    icon: FileText
  },
  {
    title: "Operations Begin",
    description: "Guides, vehicles, and hotels are assigned. Supplier vouchers generate automatically.",
    icon: Calendar
  },
  {
    title: "Track & Close",
    description: "Record payments, see profit margins update in real-time. Archive when complete.",
    icon: BarChart3
  }
]

// Updated modules array with 11 total modules (6 existing + 5 new)
const modules = [
  {
    id: "whatsapp-inbox",
    title: "WhatsApp Business Inbox",
    shortTitle: "WhatsApp",
    icon: MessageSquare,
    badge: "AI-Powered",
    badgeColor: "bg-emerald-100 text-emerald-700",
    category: "SALES",
    before: [
      "Scroll through 50+ chats to find that client",
      "Screenshot conversations to remember details",
      "Miss messages when you're guiding a tour",
      "No idea which team member last spoke to a client"
    ],
    after: [
      "All conversations in one searchable inbox",
      "Assign chats to team members with alerts",
      "AI extracts client details automatically",
      "Full history linked to client profile"
    ]
  },
  {
    id: "lead-processing",
    title: "Lead Processing",
    shortTitle: "Leads",
    icon: Bot,
    badge: "AI-Powered",
    badgeColor: "bg-emerald-100 text-emerald-700",
    category: "SALES",
    highlight: "30 sec vs 15 min",
    before: [
      "Reading through long WhatsApp threads",
      "Manually extracting dates, pax, budget",
      "Typing everything into spreadsheets",
      "Missing details buried in messages",
      "Inconsistent data across team members"
    ],
    after: [
      "Paste any WhatsApp conversation",
      "AI extracts name, dates, pax, budget, nationality",
      "Auto-created client profile instantly",
      "Confidence scores show accuracy",
      "Consistent structure every single time"
    ]
  },
  {
    id: "itinerary-builder",
    title: "Smart Itinerary Builder",
    shortTitle: "Itinerary",
    icon: FileText,
    badge: "AI-Powered",
    badgeColor: "bg-emerald-100 text-emerald-700",
    category: "SALES",
    before: [
      "Copy-paste from old Word documents",
      "Manually look up entrance fees",
      "Calculate pricing in Excel, hope it's right",
      "3-4 hours to create one itinerary"
    ],
    after: [
      "AI generates day-by-day itineraries",
      "Entrance fees auto-populate by nationality",
      "Costs and margins calculated instantly",
      "Edit and regenerate in minutes"
    ]
  },
  {
    id: "content-library",
    title: "Content Library",
    shortTitle: "Content",
    icon: BookOpen,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "SALES",
    highlight: "Your voice, always",
    before: [
      "Generic descriptions that sound like everyone else",
      "Inconsistent tone across itineraries",
      "Copy-pasting from old documents",
      "No tier differentiation — luxury sounds like budget",
      "Hours rewriting AI-generated content"
    ],
    after: [
      "Your own descriptions for sites, hotels, experiences",
      "4 tier variations — Budget to Luxury, each unique",
      "Writing rules enforce your brand voice",
      "AI uses YOUR content — not generic output",
      "Consistent quality across every itinerary"
    ]
  },
  {
    id: "crm",
    title: "Client Management",
    shortTitle: "CRM",
    icon: Users,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "SALES",
    before: [
      "Client info scattered everywhere",
      "No record of past trips or preferences",
      "Repeat clients treated like new inquiries",
      "Can't segment clients by any attribute"
    ],
    after: [
      "Complete client profiles with all details",
      "Full booking history and communication log",
      "VIP flagging and preferences saved",
      "Search and filter by any attribute"
    ]
  },
  {
    id: "pricing-engine",
    title: "Rate Database & Pricing",
    shortTitle: "Pricing",
    icon: DollarSign,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "OPERATIONS",
    before: [
      "Rates in multiple Excel files",
      "Seasonal changes require manual updates",
      "Entrance fees change — you find out late",
      "No single source of truth"
    ],
    after: [
      "Centralized rates for everything",
      "Seasonal pricing with auto date selection",
      "Entrance fees with EU and non-EU rates",
      "Update once, reflected everywhere"
    ]
  },
  {
    id: "resource-assignment",
    title: "Resource Assignment",
    shortTitle: "Resources",
    icon: Package,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "OPERATIONS",
    highlight: "1 click vs 10+ msgs",
    before: [
      "Calling guides and drivers one by one",
      "Individual messages to each supplier",
      "No confirmation if they saw it",
      "Hotel bookings in separate sheets",
      "Last-minute confusion about assignments"
    ],
    after: [
      "Assign all resources directly to itinerary",
      "One-click WhatsApp with full details",
      "Confirmation tracking — know who's confirmed",
      "All assignments visible in one place",
      "Staff included — airport, hotel, all covered"
    ]
  },
  {
    id: "supplier-management",
    title: "Supplier Management",
    shortTitle: "Suppliers",
    icon: Building2,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "OPERATIONS",
    before: [
      "Contacts saved in personal phones",
      "No record of which supplier served which booking",
      "Contracts lost in email",
      "Payables tracked manually"
    ],
    after: [
      "Supplier directory with contacts and rates",
      "Link suppliers to each itinerary",
      "Track payables per booking",
      "Upload contracts to supplier profile"
    ]
  },
  {
    id: "invoicing",
    title: "Invoicing & Payments",
    shortTitle: "Invoicing",
    icon: FileSearch,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "FINANCE",
    before: [
      "Create invoices manually in Word",
      "Track payments in spreadsheets",
      "No connection to the itinerary",
      "Chase payments from memory"
    ],
    after: [
      "Generate invoices from itineraries",
      "Record deposits and balances",
      "Automatic payment status tracking",
      "Send reminders via WhatsApp"
    ]
  },
  {
    id: "financial-management",
    title: "Financial Management",
    shortTitle: "Finance",
    icon: PieChart,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "FINANCE",
    highlight: "Know daily",
    before: [
      "Paper receipts in a shoebox",
      "Trip profitability unknown until months later",
      "Chasing clients for overdue payments",
      "Forgetting to pay suppliers on time",
      "Hours building monthly reports"
    ],
    after: [
      "Expenses linked to itineraries instantly",
      "P&L per trip before departure",
      "AR aging reports (30/60/90 days)",
      "Payment scheduling for suppliers",
      "One-click financial reports"
    ]
  },
  {
    id: "team-security",
    title: "Team Management & Security",
    shortTitle: "Team",
    icon: Shield,
    badge: "Core",
    badgeColor: "bg-slate-100 text-slate-700",
    category: "FINANCE",
    highlight: "Secure",
    before: [
      "Everyone using same credentials",
      "Can't control who sees what",
      "No record of who made changes",
      "Onboarding takes days",
      "No way to revoke access quickly"
    ],
    after: [
      "4 roles: Admin, Manager, Agent, Viewer",
      "Each person sees only what they need",
      "Full audit log of every action",
      "1-click invites for new team members",
      "Instant deactivation when staff leave"
    ]
  }
]

const differentiators = [
  {
    icon: Shield,
    title: "Built by a Tour Operator",
    description: "The founder has run Egypt tours since 1993. Every feature solved a real problem."
  },
  {
    icon: MessageSquare,
    title: "WhatsApp-Native",
    description: "AI reads conversations and starts building itineraries before you finish your coffee."
  },
  {
    icon: DollarSign,
    title: "Pricing That Works",
    description: "EU vs non-EU rates. Seasonal pricing. Child discounts. The math you actually do."
  },
  {
    icon: Globe,
    title: "Multi-Language",
    description: "Parse messages and generate documents in Japanese, French, Spanish, Arabic."
  },
  {
    icon: Zap,
    title: "No Feature Bloat",
    description: "30 things you need, built to work together. Not 500 features you'll never use."
  },
  {
    icon: BarChart3,
    title: "Transparent Margins",
    description: "Real profit on every booking. Not estimated. Not averaged. The actual number."
  }
]

const egyptFeatures = [
  {
    icon: MapPin,
    title: "Egypt Entrance Fees Built In",
    description: "Pyramids, Luxor Temple, Valley of the Kings, Abu Simbel — with EU and non-EU rates."
  },
  {
    icon: Ship,
    title: "Nile Cruise Integration",
    description: "Pre-built Luxor-Aswan itineraries. Select ship, cabin type, get instant pricing."
  },
  {
    icon: Building2,
    title: "Local Supplier Database",
    description: "Connect your guides, drivers, hotels. Rate cards for Cairo, Luxor, Aswan, Alexandria."
  },
  {
    icon: Languages,
    title: "Arabic + English Interface",
    description: "Your team works in Arabic. Documents go out in English, French, Spanish, Japanese."
  }
]

const testimonials = [
  {
    quote: "I used to spend 3-4 hours building one itinerary. Now I generate a draft in 5 minutes and spend my time actually selling.",
    author: "Islam Hussein",
    role: "Founder",
    company: "Travel2Egypt"
  },
  {
    quote: "The WhatsApp integration changed everything. Clients message at midnight, AI extracts what they want, and I wake up with a draft ready.",
    author: "Operations Manager",
    role: "DMC",
    company: "Cairo Tour Operator"
  },
  {
    quote: "Finally, I know my actual margin on each tour. Not what I thought it was. What it actually is.",
    author: "Finance Director",
    role: "Finance",
    company: "Regional Travel Agency"
  }
]

export default function AutouraHomepage() {
  const [activeModule, setActiveModule] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    setIsLoaded(true)
  }, [])

  return (
    <div className="min-h-screen bg-stone-50 overflow-x-hidden">
      {/* Decorative background elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#647C47]/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-20 w-72 h-72 bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet-500/5 rounded-full blur-3xl" />
      </div>

      {/* Navigation - UPDATED: Removed Pricing & Sign In, Added About & Integrations */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-stone-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
  <img 
    src="/autoura-logo.png" 
    alt="Autoura" 
    className="w-10 h-10 object-contain"
  />
  <span className="text-xl font-semibold text-stone-900 tracking-tight">Autoura</span>
</Link>

{/* Desktop Navigation */}

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-stone-600 hover:text-stone-900 transition-colors">Features</a>
              <a href="#how-it-works" className="text-sm text-stone-600 hover:text-stone-900 transition-colors">How It Works</a>
              <Link href="/integrations" className="text-sm text-stone-600 hover:text-stone-900 transition-colors">Integrations</Link>
              <Link href="/about" className="text-sm text-stone-600 hover:text-stone-900 transition-colors">About</Link>
              <a 
                href="https://calendly.com/autoura"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-[#647C47] text-white text-sm font-medium rounded-lg hover:bg-[#4a5c35] transition-all hover:shadow-lg hover:shadow-[#647C47]/20"
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

          {/* Mobile Navigation - UPDATED */}
          {mobileMenuOpen && (
            <div className="md:hidden pt-4 pb-2 border-t border-stone-200 mt-4 space-y-3">
              <a href="#features" className="block text-sm text-stone-600 hover:text-stone-900 py-2">Features</a>
              <a href="#how-it-works" className="block text-sm text-stone-600 hover:text-stone-900 py-2">How It Works</a>
              <Link href="/integrations" className="block text-sm text-stone-600 hover:text-stone-900 py-2">Integrations</Link>
              <Link href="/about" className="block text-sm text-stone-600 hover:text-stone-900 py-2">About</Link>
              <a 
                href="https://calendly.com/autoura"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full px-4 py-2 bg-[#647C47] text-white text-sm font-medium rounded-lg text-center hover:bg-[#4a5c35]"
              >
                Book a Free Demo
              </a>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-28 sm:pt-32 pb-16 sm:pb-20 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-4xl mx-auto text-center">
            <div 
              className={`transition-all duration-1000 ease-out ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#647C47]/10 rounded-full mb-6 sm:mb-8">
                <Sparkles className="w-4 h-4 text-[#647C47]" />
                <span className="text-sm font-medium text-[#647C47]">AI-Powered Travel Operations</span>
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold text-stone-900 leading-tight tracking-tight mb-4 sm:mb-6">
                Stop Running Your Travel Business from{' '}
                <span className="relative">
                  <span className="relative z-10 text-[#647C47]">WhatsApp and Excel</span>
                  <span className="absolute bottom-1 sm:bottom-2 left-0 right-0 h-2 sm:h-3 bg-[#647C47]/20 -z-0" />
                </span>
              </h1>

              <p className="text-base sm:text-lg md:text-xl text-stone-600 max-w-3xl mx-auto mb-8 sm:mb-10 leading-relaxed px-2">
                {heroContent.subheadline}
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-8 sm:mb-12">
                <a 
                  href="https://calendly.com/autoura"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-[#647C47] text-white font-semibold rounded-xl hover:bg-[#4a5c35] transition-all hover:shadow-xl hover:shadow-[#647C47]/30 flex items-center justify-center gap-2"
                >
                  Book a Free Demo
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </a>
                <button className="group w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-white text-stone-700 font-semibold rounded-xl border border-stone-200 hover:border-stone-300 hover:shadow-lg transition-all flex items-center justify-center gap-2">
                  <Play className="w-4 h-4 text-[#647C47]" />
                  See How It Works
                </button>
              </div>

              <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 sm:gap-6 text-sm text-stone-500">
                {heroContent.trustSignals.map((signal, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#647C47] flex-shrink-0" />
                    <span>{signal}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Hero Image/Dashboard Preview */}
          <div 
            className={`mt-12 sm:mt-16 transition-all duration-1000 delay-300 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
          >
            <div className="relative max-w-6xl mx-auto">
              <div className="absolute inset-0 bg-gradient-to-t from-stone-50 via-transparent to-transparent z-10 pointer-events-none" />
              <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl shadow-stone-900/10 border border-stone-200/50 overflow-hidden">
                <div className="bg-stone-100 px-4 py-3 flex items-center gap-2 border-b border-stone-200">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <span className="ml-4 text-xs text-stone-400 hidden sm:inline">autoura.net/dashboard</span>
                </div>
                <div className="p-4 sm:p-8 bg-gradient-to-br from-stone-50 to-white min-h-[300px] sm:min-h-[400px] flex items-center justify-center">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 w-full max-w-4xl">
                    {pillars.map((pillar, i) => (
                      <div 
                        key={i}
                        className="bg-white rounded-xl p-4 sm:p-6 shadow-lg border border-stone-100 hover:shadow-xl transition-shadow"
                        style={{ animationDelay: `${i * 100}ms` }}
                      >
                        <div className={`w-10 sm:w-12 h-10 sm:h-12 rounded-xl bg-gradient-to-br ${pillar.color} flex items-center justify-center mb-3 sm:mb-4`}>
                          <pillar.icon className="w-5 sm:w-6 h-5 sm:h-6 text-white" />
                        </div>
                        <h3 className="font-semibold text-stone-900 mb-2">{pillar.title}</h3>
                        <p className="text-sm text-stone-500">{pillar.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
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
              <p className="text-stone-400 text-base sm:text-lg max-w-2xl mx-auto">
                Sound familiar? Every tour operator knows these problems.
              </p>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 max-w-5xl mx-auto">
            {painPoints.map((point, i) => (
              <AnimatedSection key={i} delay={i * 50}>
                <div className="group p-4 sm:p-5 bg-stone-800/50 backdrop-blur border border-stone-700/50 rounded-xl hover:bg-stone-800 transition-all hover:border-red-500/30">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-red-500/30 transition-colors">
                      <X className="w-4 h-4 text-red-400" />
                    </div>
                    <p className="text-stone-300 leading-relaxed text-sm sm:text-base">{point}</p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>

          <AnimatedSection delay={400}>
            <p className="text-center text-lg sm:text-xl text-stone-300 mt-12 sm:mt-16 max-w-3xl mx-auto px-2">
              You didn't start a travel business to be a <span className="text-white font-semibold">data entry specialist</span>. 
              Autoura handles the operations so you can focus on the travel.
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* Platform Overview */}
      <section id="features" className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection>
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-stone-900 mb-4 sm:mb-6">
                One Platform for <span className="text-[#647C47]">Everything</span>
              </h2>
              <p className="text-stone-600 text-base sm:text-lg max-w-2xl mx-auto">
                From the first WhatsApp message to the final payment receipt — a single system designed for how tour operators actually work.
              </p>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {pillars.map((pillar, i) => (
              <AnimatedSection key={i} delay={i * 100}>
                <div className="group relative">
                  <div className={`absolute inset-0 bg-gradient-to-br ${pillar.color} rounded-2xl blur-xl opacity-0 group-hover:opacity-20 transition-opacity`} />
                  <div className="relative bg-white rounded-2xl p-6 sm:p-8 shadow-lg border border-stone-100 hover:shadow-xl hover:border-stone-200 transition-all h-full">
                    <div className={`w-12 sm:w-14 h-12 sm:h-14 rounded-xl bg-gradient-to-br ${pillar.color} flex items-center justify-center mb-4 sm:mb-6 shadow-lg`}>
                      <pillar.icon className="w-6 sm:w-7 h-6 sm:h-7 text-white" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-stone-900 mb-2 sm:mb-3">{pillar.title}</h3>
                    <p className="text-stone-600 leading-relaxed text-sm sm:text-base">{pillar.description}</p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-16 sm:py-24 px-4 sm:px-6 bg-gradient-to-b from-stone-100 to-stone-50">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection>
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-stone-900 mb-4 sm:mb-6">
                From Inquiry to Invoice in <span className="text-[#647C47]">One Flow</span>
              </h2>
              <p className="text-stone-600 text-base sm:text-lg max-w-2xl mx-auto">
                See how a typical booking moves through Autoura — from first contact to completed tour.
              </p>
            </div>
          </AnimatedSection>

          <div className="relative max-w-4xl mx-auto">
            {/* Connecting line */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-[#647C47] via-[#647C47]/50 to-transparent hidden md:block" />

            <div className="space-y-6 sm:space-y-8">
              {steps.map((step, i) => (
                <AnimatedSection key={i} delay={i * 100}>
                  <div className="flex items-start gap-4 sm:gap-6 group">
                    <div className="relative flex-shrink-0">
                      <div className="w-12 sm:w-16 h-12 sm:h-16 rounded-xl sm:rounded-2xl bg-white shadow-lg border border-stone-200 flex items-center justify-center group-hover:shadow-xl group-hover:border-[#647C47]/30 transition-all">
                        <step.icon className="w-5 sm:w-7 h-5 sm:h-7 text-[#647C47]" />
                      </div>
                      <div className="absolute -top-1 sm:-top-2 -right-1 sm:-right-2 w-5 sm:w-6 h-5 sm:h-6 rounded-full bg-[#647C47] text-white text-xs font-bold flex items-center justify-center shadow-md">
                        {i + 1}
                      </div>
                    </div>
                    <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md border border-stone-100 flex-1 group-hover:shadow-lg transition-shadow min-w-0">
                      <h3 className="text-base sm:text-lg font-bold text-stone-900 mb-1 sm:mb-2">{step.title}</h3>
                      <p className="text-stone-600 text-sm sm:text-base">{step.description}</p>
                    </div>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Core Modules - Before/After - NOW WITH 11 MODULES */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection>
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-stone-900 mb-4 sm:mb-6">
                Every Module Built for <span className="text-[#647C47]">Real Operations</span>
              </h2>
              <p className="text-stone-600 text-base sm:text-lg max-w-2xl mx-auto">
                See the before and after for each part of your workflow.
              </p>
            </div>
          </AnimatedSection>

          {/* Module Tabs - Updated for 11 modules with better scrolling */}
          <div className="flex overflow-x-auto pb-2 mb-8 sm:mb-12 gap-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:justify-center scrollbar-hide">
            {modules.map((module, i) => (
              <button
                key={module.id}
                onClick={() => setActiveModule(i)}
                className={`flex-shrink-0 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeModule === i 
                    ? 'bg-[#647C47] text-white shadow-lg shadow-[#647C47]/30' 
                    : 'bg-white text-stone-600 border border-stone-200 hover:border-stone-300'
                }`}
              >
                <module.icon className="w-4 h-4" />
                <span className="sm:hidden">{module.shortTitle}</span>
                <span className="hidden sm:inline">{module.title}</span>
              </button>
            ))}
          </div>

          {/* Active Module Content */}
          <AnimatedSection key={activeModule}>
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl border border-stone-200 overflow-hidden max-w-5xl mx-auto">
              <div className="p-4 sm:p-6 bg-stone-50 border-b border-stone-200 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-10 sm:w-12 h-10 sm:h-12 rounded-xl bg-[#647C47] flex items-center justify-center">
                    {(() => {
                      const IconComponent = modules[activeModule].icon
                      return <IconComponent className="w-5 sm:w-6 h-5 sm:h-6 text-white" />
                    })()}
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-stone-900">{modules[activeModule].title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${modules[activeModule].badgeColor}`}>
                        {modules[activeModule].badge}
                      </span>
                      <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-stone-100 text-stone-600">
                        {modules[activeModule].category}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Highlight badge for new modules */}
                {modules[activeModule].highlight && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-[#647C47] text-white rounded-full text-sm font-medium">
                    <Timer className="w-4 h-4" />
                    {modules[activeModule].highlight}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-200">
                {/* Before */}
                <div className="p-4 sm:p-8 bg-red-50/30">
                  <div className="flex items-center gap-2 mb-4 sm:mb-6">
                    <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                      <X className="w-4 h-4 text-red-600" />
                    </div>
                    <h4 className="font-semibold text-red-700 uppercase text-sm tracking-wide">Before Autoura</h4>
                  </div>
                  <ul className="space-y-3 sm:space-y-4">
                    {modules[activeModule].before.map((point, i) => (
                      <li key={i} className="flex items-start gap-3 text-stone-600 text-sm sm:text-base">
                        <X className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* After */}
                <div className="p-4 sm:p-8 bg-gradient-to-br from-[#647C47]/5 to-transparent">
                  <div className="flex items-center gap-2 mb-4 sm:mb-6">
                    <div className="w-8 h-8 rounded-lg bg-[#647C47]/20 flex items-center justify-center">
                      <Check className="w-4 h-4 text-[#647C47]" />
                    </div>
                    <h4 className="font-semibold text-[#647C47] uppercase text-sm tracking-wide">With Autoura</h4>
                  </div>
                  <ul className="space-y-3 sm:space-y-4">
                    {modules[activeModule].after.map((point, i) => (
                      <li key={i} className="flex items-start gap-3 text-stone-700 text-sm sm:text-base">
                        <Check className="w-5 h-5 text-[#647C47] flex-shrink-0 mt-0.5" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Differentiators */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 bg-gradient-to-b from-[#647C47] to-[#4a5c35] relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto relative">
          <AnimatedSection>
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white mb-4 sm:mb-6">
                Why Tour Operators Choose Autoura
              </h2>
              <p className="text-white/70 text-base sm:text-lg max-w-2xl mx-auto">
                This isn't generic SaaS. It's built for the specific chaos of travel operations.
              </p>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {differentiators.map((item, i) => (
              <AnimatedSection key={i} delay={i * 50}>
                <div className="group bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4 sm:p-6 hover:bg-white/20 transition-all">
                  <div className="w-10 sm:w-12 h-10 sm:h-12 rounded-xl bg-white/20 flex items-center justify-center mb-3 sm:mb-4 group-hover:bg-white/30 transition-colors">
                    <item.icon className="w-5 sm:w-6 h-5 sm:h-6 text-white" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-white/70 text-sm sm:text-base">{item.description}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Egypt-Specific Features */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection>
            <div className="flex items-center justify-center gap-4 mb-12 sm:mb-16">
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 rounded-full mb-4 sm:mb-6">
                  <MapPin className="w-4 h-4 text-amber-700" />
                  <span className="text-sm font-medium text-amber-700">Made for Egypt</span>
                </div>
                <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-stone-900 mb-4 sm:mb-6">
                  Egypt-Specific Features <span className="text-amber-600">Built In</span>
                </h2>
                <p className="text-stone-600 text-base sm:text-lg max-w-2xl mx-auto">
                  Not adapted from generic software — built from the ground up for Egyptian tour operators.
                </p>
              </div>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-4xl mx-auto">
            {egyptFeatures.map((feature, i) => (
              <AnimatedSection key={i} delay={i * 100}>
                <div className="group bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 sm:p-6 border border-amber-200/50 hover:shadow-lg transition-all">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="w-10 sm:w-12 h-10 sm:h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0 shadow-lg">
                      <feature.icon className="w-5 sm:w-6 h-5 sm:h-6 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base sm:text-lg font-bold text-stone-900 mb-1 sm:mb-2">{feature.title}</h3>
                      <p className="text-stone-600 text-sm sm:text-base">{feature.description}</p>
                    </div>
                  </div>
                </div>
              </AnimatedSection>
            ))}
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {testimonials.map((testimonial, i) => (
              <AnimatedSection key={i} delay={i * 100}>
                <div className="bg-white rounded-xl sm:rounded-2xl p-6 sm:p-8 shadow-lg border border-stone-200 h-full flex flex-col">
                  <div className="flex items-center gap-1 mb-4 sm:mb-6">
                    {[...Array(5)].map((_, j) => (
                      <Star key={j} className="w-4 sm:w-5 h-4 sm:h-5 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <blockquote className="text-stone-700 text-base sm:text-lg leading-relaxed mb-4 sm:mb-6 flex-1">
                    "{testimonial.quote}"
                  </blockquote>
                  <div className="border-t border-stone-100 pt-4 sm:pt-6">
                    <p className="font-semibold text-stone-900">{testimonial.author}</p>
                    <p className="text-sm text-stone-500">{testimonial.role}, {testimonial.company}</p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
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
                  Your Competitors Are Still Using Spreadsheets
                </h2>
                <p className="text-stone-300 text-base sm:text-lg max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed">
                  While they're copying entrance fees by hand and scrolling through WhatsApp looking for passport details, 
                  you could be sending quotes in minutes and tracking real profit margins.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <a 
                    href="https://calendly.com/autoura"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-[#647C47] text-white font-semibold rounded-xl hover:bg-[#5a7040] transition-all hover:shadow-xl hover:shadow-[#647C47]/30 flex items-center justify-center gap-2"
                  >
                    Book a Free Demo
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </a>
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
        <img 
          src="/autoura-logo.png" 
          alt="Autoura" 
          className="w-8 h-8 object-contain"
        />
        <span className="text-xl font-semibold text-stone-900 tracking-tight">Autoura</span>
      </div>
      <div className="flex items-center gap-6 sm:gap-8 text-sm text-stone-500">
        <Link href="/about" className="hover:text-stone-700 transition-colors">About</Link>
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