'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { 
  MessageSquare, 
  Mail, 
  Check, 
  ArrowRight, 
  Sparkles,
  Globe,
  Clock,
  Zap,
  Shield,
  Menu,
  X as XIcon
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

// Active integrations
const activeIntegrations = [
  {
    name: "WhatsApp Business API",
    description: "Connect your WhatsApp Business account to receive and manage client conversations directly in Autoura. AI automatically extracts client details, dates, and preferences from every message.",
    icon: MessageSquare,
    color: "from-green-500 to-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    status: "Live",
    features: [
      "Receive messages in unified inbox",
      "AI-powered conversation parsing",
      "Send quotes and documents directly",
      "Team assignment and notifications",
      "Full conversation history per client"
    ]
  },
  {
    name: "Gmail",
    description: "Send professional quotes, itineraries, and invoices directly from Autoura through your Gmail account. All sent emails are automatically logged to client profiles.",
    icon: Mail,
    color: "from-red-500 to-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    status: "Live",
    features: [
      "Send quotes with PDF attachments",
      "Email itineraries to clients",
      "Invoice delivery via email",
      "Automatic logging to client profile",
      "Custom email templates"
    ]
  }
]

// Coming soon integrations
const comingSoonIntegrations = [
  {
    name: "LINE",
    description: "Popular messaging app in Japan and Southeast Asia. Connect with clients who prefer LINE over WhatsApp.",
    icon: MessageSquare,
    region: "Japan, Thailand, Taiwan",
    eta: "Q2 2026"
  },
  {
    name: "WeChat",
    description: "Essential for Chinese market. Receive inquiries and send quotes directly through WeChat.",
    icon: MessageSquare,
    region: "China",
    eta: "Q2 2026"
  },
  {
    name: "Stripe",
    description: "Accept credit card payments online. Clients can pay deposits and balances directly from their quote.",
    icon: Zap,
    region: "Global",
    eta: "Q3 2026"
  },
  {
    name: "QuickBooks",
    description: "Sync invoices and payments automatically with your accounting software.",
    icon: Shield,
    region: "Global",
    eta: "Q3 2026"
  },
  {
    name: "Google Calendar",
    description: "Sync tour schedules, guide assignments, and client appointments to your calendar.",
    icon: Clock,
    region: "Global",
    eta: "Q4 2026"
  },
  {
    name: "Booking.com / Expedia",
    description: "Receive OTA bookings directly in Autoura and manage them alongside direct clients.",
    icon: Globe,
    region: "Global",
    eta: "2027"
  }
]

export default function IntegrationsPage() {
  const [isLoaded, setIsLoaded] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    setIsLoaded(true)
  }, [])

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Decorative background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#647C47]/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-20 w-72 h-72 bg-green-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-red-500/5 rounded-full blur-3xl" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-stone-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-[#647C47] to-[#4a5c35] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">A</span>
              </div>
              <span className="text-xl font-semibold text-stone-900 tracking-tight">Autoura</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <Link href="/#features" className="text-sm text-stone-600 hover:text-stone-900 transition-colors">Features</Link>
              <Link href="/#how-it-works" className="text-sm text-stone-600 hover:text-stone-900 transition-colors">How It Works</Link>
              <Link href="/integrations" className="text-sm text-[#647C47] font-medium">Integrations</Link>
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

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden pt-4 pb-2 border-t border-stone-200 mt-4 space-y-3">
              <Link href="/#features" className="block text-sm text-stone-600 hover:text-stone-900 py-2">Features</Link>
              <Link href="/#how-it-works" className="block text-sm text-stone-600 hover:text-stone-900 py-2">How It Works</Link>
              <Link href="/integrations" className="block text-sm text-[#647C47] font-medium py-2">Integrations</Link>
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
          <div 
            className={`max-w-3xl mx-auto text-center transition-all duration-1000 ease-out ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#647C47]/10 rounded-full mb-6">
              <Sparkles className="w-4 h-4 text-[#647C47]" />
              <span className="text-sm font-medium text-[#647C47]">Seamless Connections</span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-stone-900 leading-tight tracking-tight mb-6">
              Integrations That{' '}
              <span className="text-[#647C47]">Power Your Operations</span>
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-stone-600 max-w-2xl mx-auto leading-relaxed">
              Connect Autoura with the tools your clients already use. From WhatsApp conversations to Gmail communications — everything flows into one unified system.
            </p>
          </div>
        </div>
      </section>

      {/* Active Integrations */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection>
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium mb-4">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Live Now
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-stone-900 mb-4">
                Active Integrations
              </h2>
              <p className="text-stone-600 max-w-2xl mx-auto">
                These integrations are live and ready to use in your Autoura account.
              </p>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            {activeIntegrations.map((integration, i) => (
              <AnimatedSection key={integration.name} delay={i * 100}>
                <div className={`${integration.bgColor} ${integration.borderColor} border-2 rounded-2xl p-6 sm:p-8 h-full`}>
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${integration.color} flex items-center justify-center shadow-lg`}>
                        <integration.icon className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-stone-900">{integration.name}</h3>
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-green-500 text-white rounded-full text-xs font-medium mt-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          {integration.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-stone-600 mb-6 leading-relaxed">
                    {integration.description}
                  </p>

                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-stone-700 uppercase tracking-wide">Features</h4>
                    <ul className="space-y-2">
                      {integration.features.map((feature, j) => (
                        <li key={j} className="flex items-start gap-3 text-stone-700">
                          <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Coming Soon Integrations */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 bg-stone-100">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection>
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium mb-4">
                <Clock className="w-4 h-4" />
                Coming Soon
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-stone-900 mb-4">
                On the Roadmap
              </h2>
              <p className="text-stone-600 max-w-2xl mx-auto">
                We're constantly adding new integrations based on what tour operators need. Here's what's coming next.
              </p>
            </div>
          </AnimatedSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {comingSoonIntegrations.map((integration, i) => (
              <AnimatedSection key={integration.name} delay={i * 50}>
                <div className="bg-white rounded-xl p-6 border border-stone-200 hover:shadow-lg hover:border-stone-300 transition-all h-full">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center">
                      <integration.icon className="w-6 h-6 text-stone-500" />
                    </div>
                    <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium">
                      {integration.eta}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-stone-900 mb-2">{integration.name}</h3>
                  <p className="text-stone-600 text-sm mb-4">{integration.description}</p>

                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-stone-400" />
                    <span className="text-xs text-stone-500">{integration.region}</span>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Request Integration Section */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <AnimatedSection>
            <div className="relative bg-gradient-to-br from-stone-900 to-stone-800 rounded-2xl sm:rounded-3xl p-8 sm:p-12 overflow-hidden text-center">
              <div className="absolute inset-0 opacity-30">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#647C47]/30 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl" />
              </div>

              <div className="relative">
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">
                  Need a Different Integration?
                </h2>
                <p className="text-stone-300 text-base sm:text-lg max-w-xl mx-auto mb-8 leading-relaxed">
                  We build based on what operators actually need. If there's a tool you rely on that's not on our roadmap, let us know — we prioritize based on real demand.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <a 
                    href="https://calendly.com/autoura"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group w-full sm:w-auto px-6 py-3 bg-[#647C47] text-white font-semibold rounded-xl hover:bg-[#5a7040] transition-all hover:shadow-xl hover:shadow-[#647C47]/30 flex items-center justify-center gap-2"
                  >
                    Request an Integration
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </a>
                  <Link 
                    href="/contact"
                    className="w-full sm:w-auto px-6 py-3 bg-white/10 text-white font-semibold rounded-xl border border-white/20 hover:bg-white/20 transition-all flex items-center justify-center"
                  >
                    Contact Us
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
              <div className="w-8 h-8 bg-gradient-to-br from-[#647C47] to-[#4a5c35] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">A</span>
              </div>
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
    </div>
  )
}