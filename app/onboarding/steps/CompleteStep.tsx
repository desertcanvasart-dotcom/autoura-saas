'use client'

import { CheckCircle, ArrowRight, Sparkles, MessageSquare, FileText, Users, DollarSign } from 'lucide-react'

interface CompleteStepProps {
  onComplete: () => void
  tenant: any
}

export default function CompleteStep({ onComplete, tenant }: CompleteStepProps) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12">
        {/* Success Icon */}
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-12 h-12 text-green-600" />
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-4">
          You're All Set! 🎉
        </h1>

        <p className="text-lg text-gray-600 text-center mb-8">
          Your Autoura account is ready, <strong>{tenant?.company_name}</strong>.
          <br />
          Let's explore what you can do next!
        </p>

        {/* Quick Actions */}
        <div className="space-y-4 mb-8">
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">
                  Try the WhatsApp Parser
                </h3>
                <p className="text-sm text-gray-600">
                  Paste a WhatsApp conversation and watch AI generate a complete itinerary with pricing
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-green-50 to-green-100 border border-green-200 rounded-lg p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">
                  Create Your First Quote
                </h3>
                <p className="text-sm text-gray-600">
                  Build a B2C quote for a client or a B2B rate sheet for partners
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">
                  Add Your Team
                </h3>
                <p className="text-sm text-gray-600">
                  Invite team members and assign roles (Admin, Manager, Member, Viewer)
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">
                  Set Up Your Rates
                </h3>
                <p className="text-sm text-gray-600">
                  Configure rates for hotels, transportation, guides, and activities
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Help Section */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-8">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-[#2d3b2d] flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-gray-900 mb-1">
                Need help getting started?
              </p>
              <p className="text-gray-600">
                Check out our knowledge base or reach out to support at support@autoura.net
              </p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={onComplete}
          className="w-full bg-[#2d3b2d] text-white py-3 px-6 rounded-lg hover:bg-[#3d4b3d] transition-colors font-medium flex items-center justify-center gap-2 group"
        >
          Go to Dashboard
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  )
}
