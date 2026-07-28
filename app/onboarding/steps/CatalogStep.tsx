'use client'

import { useState } from 'react'
import { ArrowRight, ArrowLeft, BookOpen, Copy, Sparkles, Check } from 'lucide-react'
import { showToast } from '@/app/contexts/ToastContext'

interface CatalogStepProps {
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  currentStep: number
  tenant: unknown
}

type Choice = 'shared' | 'import' | 'clean'

const OPTIONS: {
  value: Choice
  title: string
  description: string
  detail: string
  icon: typeof BookOpen
}[] = [
  {
    value: 'shared',
    title: 'Use the shared catalog',
    description: 'Start with the built-in Egypt reference rates — entrance fees, train tickets, airport services and more.',
    detail: 'Shared rates are read-only. Add your own rates alongside them any time.',
    icon: BookOpen,
  },
  {
    value: 'import',
    title: 'Import it as my own',
    description: 'Copy the reference rates into your workspace as fully editable rates you can adjust to your contracts.',
    detail: 'Best if your prices differ from the published ones. One-time copy.',
    icon: Copy,
  },
  {
    value: 'clean',
    title: 'Start clean',
    description: 'Begin with an empty Rates Hub and enter every rate yourself.',
    detail: 'You can bulk-import from a spreadsheet later.',
    icon: Sparkles,
  },
]

export default function CatalogStep({ onNext, onBack, onSkip }: CatalogStepProps) {
  const [choice, setChoice] = useState<Choice>('shared')
  const [saving, setSaving] = useState(false)

  const handleContinue = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/onboarding/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice }),
      })
      const result = await response.json().catch(() => ({}))
      if (response.ok && result.success) {
        if (choice === 'import') {
          const total = Object.values(result.copied || {}).reduce(
            (a: number, b) => a + (typeof b === 'number' ? b : 0),
            0
          )
          showToast('success', `Catalog imported — ${total} rates are now yours to edit.`)
        }
        onNext()
      } else {
        showToast('error', result.error || 'Failed to save your catalog choice')
      }
    } catch (error) {
      showToast('error', `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        {/* Title */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-6 h-6 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Your Rates Catalog
          </h2>
          <p className="text-gray-600">
            Choose how to start your Rates Hub — you can change rates any time
          </p>
        </div>

        {/* Options */}
        <div className="space-y-4 mb-6">
          {OPTIONS.map((option) => {
            const Icon = option.icon
            const selected = choice === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setChoice(option.value)}
                className={`w-full text-left border-2 rounded-xl p-4 transition-colors flex items-start gap-4 ${
                  selected
                    ? 'border-[#2d3b2d] bg-[#2d3b2d]/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    selected ? 'bg-[#2d3b2d] text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {selected ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{option.title}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{option.description}</p>
                  <p className="text-xs text-gray-500 mt-1">{option.detail}</p>
                </div>
              </button>
            )
          })}
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
              className="px-6 py-2 text-gray-600 hover:text-gray-900 font-medium flex items-center gap-2 transition-colors"
            >
              Skip for Now
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={handleContinue}
              disabled={saving}
              className="bg-[#2d3b2d] text-white py-2 px-6 rounded-lg hover:bg-[#3d4b3d] disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2 transition-colors"
            >
              {saving ? (choice === 'import' ? 'Importing…' : 'Saving…') : 'Continue'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
