'use client'

import { Sparkles, ArrowRight } from 'lucide-react'

interface WelcomeStepProps {
  onNext: () => void
  tenant: any
}

export default function WelcomeStep({ onNext, tenant }: WelcomeStepProps) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12">
        {/* Icon */}
        <div className="w-16 h-16 bg-gradient-to-br from-[#2d3b2d] to-[#3d4b3d] rounded-full flex items-center justify-center mx-auto mb-6">
          <Sparkles className="w-8 h-8 text-white" />
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-4">
          Welcome to Autoura! 🎉
        </h1>

        <p className="text-lg text-gray-600 text-center mb-8">
          We're excited to have you, <strong>{tenant?.company_name}</strong>!
          <br />
          Let's get your account set up in just a few minutes.
        </p>

        {/* Features Overview */}
        <div className="space-y-4 mb-8">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-green-600 text-sm">✓</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">WhatsApp AI Parser</h3>
              <p className="text-sm text-gray-600">
                Generate quotes instantly from WhatsApp conversations
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-green-600 text-sm">✓</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">B2C & B2B Management</h3>
              <p className="text-sm text-gray-600">
                Manage both direct clients and partner agencies
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-green-600 text-sm">✓</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Automated Pricing</h3>
              <p className="text-sm text-gray-600">
                Smart rate calculations and multi-pax pricing tables
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-green-600 text-sm">✓</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Financial Management</h3>
              <p className="text-sm text-gray-600">
                Track invoices, expenses, and payments in one place
              </p>
            </div>
          </div>
        </div>

        {/* What's Next */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-8">
          <h4 className="font-semibold text-gray-900 mb-2">What's Next?</h4>
          <p className="text-sm text-gray-600">
            We'll help you configure your business settings, customize your branding,
            and give you a quick tour of the platform. This should take about 3-5 minutes.
          </p>
        </div>

        {/* Action Button */}
        <button
          onClick={onNext}
          className="w-full bg-[#2d3b2d] text-white py-3 px-6 rounded-lg hover:bg-[#3d4b3d] transition-colors font-medium flex items-center justify-center gap-2 group"
        >
          Let's Get Started
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  )
}
