'use client'

import { useState } from 'react'
import { ArrowRight, ArrowLeft, MessageSquare, FileText, Users as UsersIcon, Settings, DollarSign, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react'

interface QuickTourStepProps {
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}

const TOUR_SLIDES = [
  {
    id: 1,
    icon: MessageSquare,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100',
    title: 'WhatsApp AI Parser',
    description: 'Turn conversations into itineraries instantly',
    features: [
      'Paste WhatsApp chats directly into the system',
      'AI extracts travel details, dates, and preferences',
      'Generates complete itineraries with day-by-day plans',
      'Auto-calculates pricing based on your rates'
    ],
    tip: 'Tip: Works with any messaging format - just copy and paste!'
  },
  {
    id: 2,
    icon: FileText,
    iconColor: 'text-green-600',
    iconBg: 'bg-green-100',
    title: 'B2C & B2B Quotes',
    description: 'Create professional quotes in minutes',
    features: [
      'B2C: Single pricing for direct clients',
      'B2B: Multi-pax pricing tables (2-30 travelers)',
      'PDF generation with your branding',
      'Send via WhatsApp, email, or download'
    ],
    tip: 'Tip: Use templates to speed up quote creation!'
  },
  {
    id: 3,
    icon: UsersIcon,
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-100',
    title: 'Client & Partner Management',
    description: 'Keep all your contacts organized',
    features: [
      'Store client details and communication history',
      'Manage B2B partners with commission tracking',
      'Track all quotes and bookings per client',
      'Follow-up reminders and task management'
    ],
    tip: 'Tip: Use tags to categorize and filter your clients!'
  },
  {
    id: 4,
    icon: DollarSign,
    iconColor: 'text-orange-600',
    iconBg: 'bg-orange-100',
    title: 'Financial Management',
    description: 'Track every dollar effortlessly',
    features: [
      'Invoicing with payment tracking',
      'Expense management with supplier tracking',
      'Accounts receivable & payable reports',
      'Profit & loss analysis'
    ],
    tip: 'Tip: Set up automated payment reminders to improve cash flow!'
  },
  {
    id: 5,
    icon: Settings,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-100',
    title: 'Rate Management',
    description: 'Configure your pricing once, use everywhere',
    features: [
      'Hotels, transportation, guides, and activities',
      'Season-based pricing',
      'Tier-based rates (Budget, Standard, Deluxe, Luxury)',
      'Automatic price calculations'
    ],
    tip: 'Tip: Update rates centrally - all quotes use the latest prices!'
  },
  {
    id: 6,
    icon: BarChart3,
    iconColor: 'text-teal-600',
    iconBg: 'bg-teal-100',
    title: 'Analytics & Insights',
    description: 'Make data-driven decisions',
    features: [
      'Quote conversion rates',
      'Revenue and profit trends',
      'Client acquisition sources',
      'Team performance metrics'
    ],
    tip: 'Tip: Review analytics weekly to spot trends early!'
  }
]

export default function QuickTourStep({ onNext, onBack, onSkip }: QuickTourStepProps) {
  const [currentSlide, setCurrentSlide] = useState(0)

  const nextSlide = () => {
    if (currentSlide < TOUR_SLIDES.length - 1) {
      setCurrentSlide(currentSlide + 1)
    }
  }

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1)
    }
  }

  const slide = TOUR_SLIDES[currentSlide]
  const Icon = slide.icon

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        {/* Title */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Quick Tour: Key Features
          </h2>
          <p className="text-gray-600">
            Learn what you can do with Autoura
          </p>
        </div>

        {/* Progress Dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {TOUR_SLIDES.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`h-2 rounded-full transition-all ${
                index === currentSlide
                  ? 'w-8 bg-[#2d3b2d]'
                  : 'w-2 bg-gray-300 hover:bg-gray-400'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>

        {/* Slide Content */}
        <div className="min-h-[400px]">
          <div className="text-center mb-6">
            <div className={`w-16 h-16 ${slide.iconBg} rounded-full flex items-center justify-center mx-auto mb-4`}>
              <Icon className={`w-8 h-8 ${slide.iconColor}`} />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {slide.title}
            </h3>
            <p className="text-gray-600">
              {slide.description}
            </p>
          </div>

          {/* Features List */}
          <div className="max-w-2xl mx-auto mb-6">
            <ul className="space-y-3">
              {slide.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-green-600 text-sm">✓</span>
                  </div>
                  <span className="text-gray-700">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Tip */}
          <div className="max-w-2xl mx-auto bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-900">
              <strong className="font-semibold">💡 {slide.tip.split(':')[0]}:</strong>
              {slide.tip.split(':')[1]}
            </p>
          </div>
        </div>

        {/* Slide Navigation */}
        <div className="flex items-center justify-center gap-4 mt-8 mb-6">
          <button
            onClick={prevSlide}
            disabled={currentSlide === 0}
            className="p-2 rounded-lg border border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>

          <span className="text-sm font-medium text-gray-600">
            {currentSlide + 1} / {TOUR_SLIDES.length}
          </span>

          <button
            onClick={nextSlide}
            disabled={currentSlide === TOUR_SLIDES.length - 1}
            className="p-2 rounded-lg border border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            aria-label="Next slide"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-6 border-t border-gray-200">
          <button
            onClick={onBack}
            className="px-6 py-2 text-gray-600 hover:text-gray-900 font-medium flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onSkip}
              className="px-6 py-2 text-gray-600 hover:text-gray-900 font-medium transition-colors"
            >
              Skip Tour
            </button>

            <button
              onClick={onNext}
              className="bg-[#2d3b2d] text-white py-2 px-6 rounded-lg hover:bg-[#3d4b3d] font-medium flex items-center gap-2 transition-colors"
            >
              {currentSlide === TOUR_SLIDES.length - 1 ? 'Finish Tour' : 'Next'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
