'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/contexts/AuthContext'
import { useTenant } from '@/app/contexts/TenantContext'
import { Check } from 'lucide-react'
import WelcomeStep from './steps/WelcomeStep'
import BusinessStep from './steps/BusinessStep'
import BrandingStep from './steps/BrandingStep'
import TeamSetupStep from './steps/TeamSetupStep'
import QuickTourStep from './steps/QuickTourStep'
import CompleteStep from './steps/CompleteStep'

const STEPS = [
  { id: 0, name: 'Welcome', component: WelcomeStep },
  { id: 1, name: 'Business', component: BusinessStep },
  { id: 2, name: 'Branding', component: BrandingStep },
  { id: 3, name: 'Team', component: TeamSetupStep },
  { id: 4, name: 'Tour', component: QuickTourStep },
  { id: 5, name: 'Complete', component: CompleteStep },
]

export default function OnboardingContent() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { tenant, loading: tenantLoading } = useTenant()
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [checkingStatus, setCheckingStatus] = useState(true)

  // Check if onboarding is already completed
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      if (!user || authLoading || tenantLoading) return

      try {
        const response = await fetch('/api/onboarding/status')
        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data.onboarding_completed) {
            // Redirect to dashboard if onboarding already completed
            router.push('/dashboard')
            return
          }
          // Resume from last step if incomplete
          if (result.data.onboarding_step > 0) {
            setCurrentStep(result.data.onboarding_step)
          }
        }
      } catch (error) {
        console.error('Error checking onboarding status:', error)
      } finally {
        setCheckingStatus(false)
        setLoading(false)
      }
    }

    checkOnboardingStatus()
  }, [user, authLoading, tenantLoading, router])

  // Authentication check
  useEffect(() => {
    if (!authLoading && !user) {
      console.log('❌ Onboarding: No user found, redirecting to login')
      router.push('/login')
    } else if (user) {
      console.log('✅ Onboarding: User authenticated:', user.email)
    }
  }, [user, authLoading, router])

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSkip = () => {
    // Skip to completion
    setCurrentStep(STEPS.length - 1)
  }

  const handleComplete = async () => {
    try {
      const response = await fetch('/api/onboarding/complete', {
        method: 'POST'
      })

      if (response.ok) {
        // Redirect to dashboard
        router.push('/dashboard')
      }
    } catch (error) {
      console.error('Error completing onboarding:', error)
    }
  }

  if (authLoading || tenantLoading || checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2d3b2d] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const CurrentStepComponent = STEPS[currentStep].component

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      {/* Progress Bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      index < currentStep
                        ? 'bg-green-500 text-white'
                        : index === currentStep
                        ? 'bg-[#2d3b2d] text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {index < currentStep ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span
                    className={`ml-2 text-sm font-medium hidden sm:inline ${
                      index === currentStep
                        ? 'text-gray-900'
                        : 'text-gray-500'
                    }`}
                  >
                    {step.name}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-3 ${
                      index < currentStep ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <CurrentStepComponent
          onNext={handleNext}
          onBack={handleBack}
          onSkip={handleSkip}
          onComplete={handleComplete}
          currentStep={currentStep}
          isFirstStep={currentStep === 0}
          isLastStep={currentStep === STEPS.length - 1}
          tenant={tenant}
        />
      </div>
    </div>
  )
}
