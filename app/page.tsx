'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { 
  Menu, 
  X, 
  Check, 
  ChevronRight,
  Calendar,
  Users,
  FileText,
  MessageSquare,
  BarChart3,
  Globe,
  Zap,
  Shield,
  Clock,
  ArrowRight,
  Star,
  Play,
  Building2,
  Briefcase
} from 'lucide-react'

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [language, setLanguage] = useState<'en' | 'ar'>('en')

  const content = {
    en: {
      nav: {
        features: 'Features',
        pricing: 'Pricing',
        demo: 'Schedule a Demo'
      },
      hero: {
        badge: 'Travel Operations Platform',
        title: 'Run your travel business from one place',
        subtitle: 'Autoura helps tour operators manage bookings, clients, itineraries, and team operations — all in one streamlined platform.',
        cta: 'Schedule a Demo',
        secondary: 'Watch Demo'
      },
      features: {
        title: 'Everything you need to run your travel business',
        subtitle: 'Powerful tools designed specifically for tour operators and travel agencies',
        items: [
          {
            icon: Calendar,
            title: 'Itinerary Builder',
            description: 'Create beautiful, detailed itineraries with AI-powered suggestions and real-time pricing calculations.'
          },
          {
            icon: Users,
            title: 'Client Management',
            description: 'Keep track of all your clients, their preferences, booking history, and communication in one place.'
          },
          {
            icon: FileText,
            title: 'Document Generation',
            description: 'Generate professional invoices, contracts, vouchers, and receipts automatically.'
          },
          {
            icon: MessageSquare,
            title: 'WhatsApp Integration',
            description: 'Parse WhatsApp conversations to extract booking details and auto-create itineraries.'
          },
          {
            icon: BarChart3,
            title: 'Analytics Dashboard',
            description: 'Track revenue, bookings, conversion rates, and business performance in real-time.'
          },
          {
            icon: Globe,
            title: 'Multi-Currency Support',
            description: 'Handle international clients with automatic currency conversion and localized pricing.'
          }
        ]
      },
      pricing: {
        title: 'Simple, transparent pricing',
        subtitle: 'Choose the plan that fits your business. Start with a 14-day free trial.',
        plans: [
          {
            name: 'B2C Operations',
            description: 'Perfect for tour operators focused on direct-to-consumer sales',
            price: '$7',
            period: 'per member/month',
            minimum: 'Minimum 5 members',
            features: [
              'Unlimited itineraries',
              'Client management (CRM)',
              'Document generation',
              'WhatsApp integration',
              'Email integration',
              'Analytics dashboard',
              'Multi-currency support',
              'Team collaboration',
              'Mobile access',
              'Priority support'
            ],
            cta: 'Schedule a Demo',
            popular: false
          },
          {
            name: 'B2C + B2B Operations',
            description: 'For agencies working with both consumers and trade partners',
            price: '$10',
            period: 'per member/month',
            minimum: 'Minimum 5 members',
            features: [
              'Everything in B2C Operations',
              'B2B partner portal',
              'Trade partner management',
              'B2B pricing rules engine',
              'Commission management',
              'Partner document templates',
              'Multi-tier pricing',
              'White-label options',
              'API access',
              'Dedicated account manager'
            ],
            cta: 'Schedule a Demo',
            popular: true
          }
        ]
      },
      testimonials: {
        title: 'Trusted by travel operators worldwide',
        items: [
          {
            quote: 'Autoura transformed how we manage our tour operations. What used to take hours now takes minutes.',
            author: 'Ahmed Hassan',
            role: 'CEO, Egypt Tours Plus',
            rating: 5
          },
          {
            quote: 'The WhatsApp integration alone has saved us countless hours. Our team loves how easy it is to use.',
            author: 'Sarah Mitchell',
            role: 'Operations Manager, Adventure Seekers',
            rating: 5
          },
          {
            quote: 'Finally, a platform that understands the unique needs of tour operators. Highly recommended!',
            author: 'Carlos Rivera',
            role: 'Founder, Latin Journeys',
            rating: 5
          }
        ]
      },
      cta: {
        title: 'Ready to get your travel operation under control?',
        subtitle: 'Bring all your tours, clients, and teams into one organised system in the next 7 days.',
        button: 'Schedule a Demo'
      },
      footer: {
        product: {
          title: 'Product',
          links: ['Features', 'Pricing', 'Integrations', 'Changelog']
        },
        resources: {
          title: 'Resources',
          links: ['Documentation', 'Help Center', 'Blog', 'Templates']
        },
        company: {
          title: 'Company',
          links: ['About', 'Contact', 'Privacy', 'Terms']
        },
        copyright: '© 2026 Autoura. All rights reserved.'
      }
    },
    ar: {
      nav: {
        features: 'المميزات',
        pricing: 'الأسعار',
        demo: 'احجز عرضاً توضيحياً'
      },
      hero: {
        badge: 'منصة إدارة عمليات السفر',
        title: 'أدر شركة السفر الخاصة بك من مكان واحد',
        subtitle: 'تساعد أوتورا منظمي الرحلات على إدارة الحجوزات والعملاء والبرامج السياحية وعمليات الفريق في منصة واحدة متكاملة.',
        cta: 'احجز عرضاً توضيحياً',
        secondary: 'شاهد العرض'
      },
      features: {
        title: 'كل ما تحتاجه لإدارة شركة السفر الخاصة بك',
        subtitle: 'أدوات قوية مصممة خصيصاً لمنظمي الرحلات ووكالات السفر',
        items: [
          {
            icon: Calendar,
            title: 'منشئ البرامج السياحية',
            description: 'أنشئ برامج سياحية جميلة ومفصلة مع اقتراحات مدعومة بالذكاء الاصطناعي وحسابات الأسعار الفورية.'
          },
          {
            icon: Users,
            title: 'إدارة العملاء',
            description: 'تتبع جميع عملائك وتفضيلاتهم وسجل الحجوزات والتواصل في مكان واحد.'
          },
          {
            icon: FileText,
            title: 'إنشاء المستندات',
            description: 'أنشئ فواتير وعقود وقسائم وإيصالات احترافية تلقائياً.'
          },
          {
            icon: MessageSquare,
            title: 'تكامل واتساب',
            description: 'حلل محادثات واتساب لاستخراج تفاصيل الحجز وإنشاء البرامج السياحية تلقائياً.'
          },
          {
            icon: BarChart3,
            title: 'لوحة التحليلات',
            description: 'تتبع الإيرادات والحجوزات ومعدلات التحويل وأداء الأعمال في الوقت الفعلي.'
          },
          {
            icon: Globe,
            title: 'دعم العملات المتعددة',
            description: 'تعامل مع العملاء الدوليين بتحويل العملات التلقائي والتسعير المحلي.'
          }
        ]
      },
      pricing: {
        title: 'أسعار بسيطة وشفافة',
        subtitle: 'اختر الخطة المناسبة لعملك. ابدأ بتجربة مجانية لمدة 14 يوماً.',
        plans: [
          {
            name: 'عمليات B2C',
            description: 'مثالي لمنظمي الرحلات الذين يركزون على المبيعات المباشرة للمستهلكين',
            price: '$7',
            period: 'لكل عضو/شهر',
            minimum: 'الحد الأدنى 5 أعضاء',
            features: [
              'برامج سياحية غير محدودة',
              'إدارة العملاء (CRM)',
              'إنشاء المستندات',
              'تكامل واتساب',
              'تكامل البريد الإلكتروني',
              'لوحة التحليلات',
              'دعم العملات المتعددة',
              'تعاون الفريق',
              'الوصول عبر الهاتف',
              'دعم ذو أولوية'
            ],
            cta: 'احجز عرضاً توضيحياً',
            popular: false
          },
          {
            name: 'عمليات B2C + B2B',
            description: 'للوكالات التي تعمل مع المستهلكين والشركاء التجاريين',
            price: '$10',
            period: 'لكل عضو/شهر',
            minimum: 'الحد الأدنى 5 أعضاء',
            features: [
              'كل شيء في خطة B2C',
              'بوابة شركاء B2B',
              'إدارة الشركاء التجاريين',
              'محرك قواعد تسعير B2B',
              'إدارة العمولات',
              'قوالب مستندات الشركاء',
              'التسعير متعدد المستويات',
              'خيارات العلامة البيضاء',
              'الوصول إلى API',
              'مدير حساب مخصص'
            ],
            cta: 'احجز عرضاً توضيحياً',
            popular: true
          }
        ]
      },
      testimonials: {
        title: 'موثوق به من قبل منظمي الرحلات حول العالم',
        items: [
          {
            quote: 'غيرت أوتورا طريقة إدارتنا لعمليات الرحلات. ما كان يستغرق ساعات أصبح يستغرق دقائق.',
            author: 'أحمد حسن',
            role: 'الرئيس التنفيذي، إيجيبت تورز بلس',
            rating: 5
          },
          {
            quote: 'تكامل واتساب وحده وفر لنا ساعات لا حصر لها. فريقنا يحب سهولة الاستخدام.',
            author: 'سارة ميتشل',
            role: 'مدير العمليات، أدفنتشر سيكرز',
            rating: 5
          },
          {
            quote: 'أخيراً، منصة تفهم الاحتياجات الفريدة لمنظمي الرحلات. موصى بها بشدة!',
            author: 'كارلوس ريفيرا',
            role: 'مؤسس، لاتين جورنيز',
            rating: 5
          }
        ]
      },
      cta: {
        title: 'مستعد للسيطرة على عملية السفر الخاصة بك؟',
        subtitle: 'اجمع كل رحلاتك وعملائك وفرقك في نظام منظم واحد خلال 7 أيام.',
        button: 'احجز عرضاً توضيحياً'
      },
      footer: {
        product: {
          title: 'المنتج',
          links: ['المميزات', 'الأسعار', 'التكاملات', 'سجل التغييرات']
        },
        resources: {
          title: 'الموارد',
          links: ['التوثيق', 'مركز المساعدة', 'المدونة', 'القوالب']
        },
        company: {
          title: 'الشركة',
          links: ['عن الشركة', 'اتصل بنا', 'الخصوصية', 'الشروط']
        },
        copyright: '© 2026 أوتورا. جميع الحقوق محفوظة.'
      }
    }
  }

  const t = content[language]
  const isRTL = language === 'ar'

  return (
    <div className={`min-h-screen bg-white ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <Image 
                src="/autoura-logo.png" 
                alt="Autoura" 
                width={140} 
                height={36}
                className="h-9 w-auto"
              />
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <Link href="#features" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                {t.nav.features}
              </Link>
              <Link href="#pricing" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                {t.nav.pricing}
              </Link>
            </div>

            {/* CTA Button */}
            <div className="hidden md:flex items-center gap-4">
              <a
                href="https://calendly.com/autoura"
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 text-sm font-medium text-white bg-[#2d3b2d] rounded-lg hover:bg-[#3d4b3d] transition-colors"
              >
                {t.nav.demo}
              </a>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100">
            <div className="px-4 py-4 space-y-3">
              <Link 
                href="#features" 
                className="block px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                {t.nav.features}
              </Link>
              <Link 
                href="#pricing" 
                className="block px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                {t.nav.pricing}
              </Link>
              <a
                href="https://calendly.com/autoura"
                target="_blank"
                rel="noopener noreferrer"
                className="block px-4 py-2.5 text-sm font-medium text-white bg-[#2d3b2d] rounded-lg text-center"
              >
                {t.nav.demo}
              </a>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#2d3b2d]/10 rounded-full mb-6">
              <Zap className="w-4 h-4 text-[#2d3b2d]" />
              <span className="text-sm font-medium text-[#2d3b2d]">{t.hero.badge}</span>
            </div>

            {/* Title */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              {t.hero.title}
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
              {t.hero.subtitle}
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://calendly.com/autoura"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-8 py-4 text-base font-medium text-white bg-[#2d3b2d] rounded-xl hover:bg-[#3d4b3d] transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#2d3b2d]/20"
              >
                {t.hero.cta}
                <ArrowRight className="w-5 h-5" />
              </a>
              <button className="w-full sm:w-auto px-8 py-4 text-base font-medium text-gray-700 bg-white border-2 border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
                <Play className="w-5 h-5" />
                {t.hero.secondary}
              </button>
            </div>
          </div>

          {/* Dashboard Preview */}
          <div className="mt-16 relative">
            <div className="bg-gradient-to-b from-[#2d3b2d] to-[#1d2b1d] rounded-2xl p-2 shadow-2xl">
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-800">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="ml-4 text-sm text-gray-400">autoura.net/dashboard</span>
                </div>
                <div className="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-sm">Dashboard Preview</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              {t.features.title}
            </h2>
            <p className="text-lg text-gray-600">
              {t.features.subtitle}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {t.features.items.map((feature, index) => (
              <div 
                key={index}
                className="p-6 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors group"
              >
                <div className="w-12 h-12 bg-[#2d3b2d] rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              {t.pricing.title}
            </h2>
            <p className="text-lg text-gray-600">
              {t.pricing.subtitle}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {t.pricing.plans.map((plan, index) => (
              <div 
                key={index}
                className={`relative p-8 bg-white rounded-2xl shadow-lg border-2 ${
                  plan.popular ? 'border-[#2d3b2d]' : 'border-transparent'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#2d3b2d] text-white text-sm font-medium rounded-full">
                    Most Popular
                  </div>
                )}

                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-2">
                    {index === 0 ? (
                      <Users className="w-6 h-6 text-[#2d3b2d]" />
                    ) : (
                      <Building2 className="w-6 h-6 text-[#2d3b2d]" />
                    )}
                    <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                  </div>
                  <p className="text-gray-600 text-sm">{plan.description}</p>
                </div>

                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                    <span className="text-gray-500">/{plan.period}</span>
                  </div>
                  <p className="text-sm text-amber-600 font-medium mt-1">{plan.minimum}</p>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-[#2d3b2d] flex-shrink-0 mt-0.5" />
                      <span className="text-gray-600 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href="https://calendly.com/autoura"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block w-full py-3 text-center font-medium rounded-xl transition-colors ${
                    plan.popular
                      ? 'bg-[#2d3b2d] text-white hover:bg-[#3d4b3d]'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-16">
            {t.testimonials.title}
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {t.testimonials.items.map((testimonial, index) => (
              <div 
                key={index}
                className="p-6 bg-gray-50 rounded-2xl"
              >
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-700 mb-6 italic">
                  "{testimonial.quote}"
                </p>
                <div>
                  <p className="font-semibold text-gray-900">{testimonial.author}</p>
                  <p className="text-sm text-gray-500">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-[#2d3b2d]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {t.cta.title}
          </h2>
          <p className="text-lg text-gray-300 mb-10">
            {t.cta.subtitle}
          </p>
          <a
            href="https://calendly.com/autoura"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-4 text-base font-medium text-[#2d3b2d] bg-white rounded-xl hover:bg-gray-100 transition-colors"
          >
            {t.cta.button}
            <ArrowRight className="w-5 h-5" />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 bg-[#2d3b2d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            {/* Logo & Description */}
            <div className="md:col-span-1">
              <Image 
                src="/autoura-logo-white.png" 
                alt="Autoura" 
                width={120} 
                height={32}
                className="h-8 w-auto mb-4 brightness-0 invert"
              />
              <p className="text-gray-400 text-sm">
                The complete travel operations platform for modern tour operators.
              </p>
            </div>

            {/* Product Links */}
            <div>
              <h4 className="text-white font-semibold mb-4">{t.footer.product.title}</h4>
              <ul className="space-y-3">
                <li>
                  <Link href="#features" className="text-gray-400 hover:text-white text-sm transition-colors">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="#pricing" className="text-gray-400 hover:text-white text-sm transition-colors">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-gray-400 hover:text-white text-sm transition-colors">
                    Integrations
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-gray-400 hover:text-white text-sm transition-colors">
                    Changelog
                  </Link>
                </li>
              </ul>
            </div>

            {/* Resources Links */}
            <div>
              <h4 className="text-white font-semibold mb-4">{t.footer.resources.title}</h4>
              <ul className="space-y-3">
                <li>
                  <Link href="#" className="text-gray-400 hover:text-white text-sm transition-colors">
                    Documentation
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-gray-400 hover:text-white text-sm transition-colors">
                    Help Center
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-gray-400 hover:text-white text-sm transition-colors">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-gray-400 hover:text-white text-sm transition-colors">
                    Templates
                  </Link>
                </li>
              </ul>
            </div>

            {/* Company Links */}
            <div>
              <h4 className="text-white font-semibold mb-4">{t.footer.company.title}</h4>
              <ul className="space-y-3">
                <li>
                  <Link href="/about" className="text-gray-400 hover:text-white text-sm transition-colors">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="text-gray-400 hover:text-white text-sm transition-colors">
                    Contact
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="text-gray-400 hover:text-white text-sm transition-colors">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="text-gray-400 hover:text-white text-sm transition-colors">
                    Terms
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="pt-8 border-t border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-gray-400 text-sm">{t.footer.copyright}</p>
            
            {/* Language Switcher */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setLanguage('en')}
                className={`text-sm transition-colors ${
                  language === 'en' ? 'text-white font-medium' : 'text-gray-400 hover:text-white'
                }`}
              >
                English
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}