'use client'

import { useState, useRef } from 'react'
import { ArrowRight, ArrowLeft, Palette, Image as ImageIcon, Upload, X } from 'lucide-react'
import { showToast } from '@/app/contexts/ToastContext'
import { createClient } from '@/app/supabase'
import Image from 'next/image'

interface BrandingStepProps {
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  currentStep: number
  tenant: any
}

const PRESET_COLORS = [
  { primary: '#2d3b2d', secondary: '#263A29', name: 'Forest Green' },
  { primary: '#1e3a8a', secondary: '#1e40af', name: 'Ocean Blue' },
  { primary: '#7c3aed', secondary: '#6d28d9', name: 'Royal Purple' },
  { primary: '#dc2626', secondary: '#b91c1c', name: 'Ruby Red' },
  { primary: '#ea580c', secondary: '#c2410c', name: 'Sunset Orange' },
  { primary: '#0891b2', secondary: '#0e7490', name: 'Turquoise' },
  { primary: '#4f46e5', secondary: '#4338ca', name: 'Indigo' },
  { primary: '#059669', secondary: '#047857', name: 'Emerald' }
]

export default function BrandingStep({ onNext, onBack, onSkip, currentStep, tenant }: BrandingStepProps) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [primaryColor, setPrimaryColor] = useState('#2d3b2d')
  const [secondaryColor, setSecondaryColor] = useState('#263A29')
  const [tagline, setTagline] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const selectPreset = (preset: typeof PRESET_COLORS[0]) => {
    setPrimaryColor(preset.primary)
    setSecondaryColor(preset.secondary)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error')
      return
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      showToast('Image must be less than 2MB', 'error')
      return
    }

    setLogoFile(file)

    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setLogoPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveLogo = () => {
    setLogoFile(null)
    setLogoPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile) return null

    setUploading(true)
    try {
      // Generate unique filename
      const fileExt = logoFile.name.split('.').pop()
      const fileName = `${tenant?.id || 'tenant'}-${Date.now()}.${fileExt}`

      console.log('📤 Uploading logo:', {
        fileName,
        fileSize: logoFile.size,
        fileType: logoFile.type,
        tenantId: tenant?.id
      })

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('tenant-logos')
        .upload(fileName, logoFile, {
          cacheControl: '3600',
          upsert: false
        })

      if (error) {
        console.error('❌ Upload error details:', {
          message: error.message,
          statusCode: error.statusCode,
          error: error
        })
        throw error
      }

      console.log('✅ Upload successful:', data)

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('tenant-logos')
        .getPublicUrl(fileName)

      console.log('🔗 Public URL:', publicUrl)

      return publicUrl
    } catch (error: any) {
      console.error('❌ Error uploading logo:', error)
      console.error('Error details:', {
        message: error?.message,
        statusCode: error?.statusCode,
        name: error?.name
      })
      showToast(`Failed to upload logo: ${error?.message || 'Unknown error'}`, 'error')
      return null
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)

    try {
      // Upload logo if selected
      let logoUrl = null
      if (logoFile) {
        logoUrl = await uploadLogo()
        if (!logoUrl && logoFile) {
          // Upload failed, but don't block onboarding
          showToast('Logo upload failed, but continuing...', 'warning')
        }
      }

      const response = await fetch('/api/onboarding/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          tagline: tagline,
          logo_url: logoUrl,
          current_step: currentStep
        })
      })

      if (response.ok) {
        showToast('Branding saved!', 'success')
        onNext()
      } else {
        showToast('Failed to save branding', 'error')
      }
    } catch (error) {
      console.error('Error saving branding:', error)
      showToast('An error occurred', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        {/* Title */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Palette className="w-6 h-6 text-purple-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Customize Your Branding
          </h2>
          <p className="text-gray-600">
            Make Autoura feel like your own (you can change these later)
          </p>
        </div>

        <div className="space-y-6">
          {/* Tagline */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Company Tagline (Optional)
            </label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2d3b2d] focus:border-transparent"
              placeholder="e.g., Your Gateway to Egypt"
              maxLength={100}
            />
            <p className="text-xs text-gray-500 mt-1">
              A short phrase that describes your company
            </p>
          </div>

          {/* Color Presets */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Choose Your Brand Colors
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {PRESET_COLORS.map((preset, index) => (
                <button
                  key={index}
                  onClick={() => selectPreset(preset)}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    primaryColor === preset.primary
                      ? 'border-gray-900 ring-2 ring-offset-2 ring-gray-900'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: preset.primary }}
                    />
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: preset.secondary }}
                    />
                  </div>
                  <div className="text-xs font-medium text-gray-900">
                    {preset.name}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Colors */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Primary Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-16 rounded border border-gray-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                  placeholder="#000000"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Secondary Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="h-10 w-16 rounded border border-gray-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                  placeholder="#000000"
                />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Preview</h4>
            <div className="space-y-3">
              <button
                className="px-6 py-2 rounded-lg text-white font-medium"
                style={{ backgroundColor: primaryColor }}
              >
                Primary Button
              </button>
              <button
                className="ml-3 px-6 py-2 rounded-lg text-white font-medium"
                style={{ backgroundColor: secondaryColor }}
              >
                Secondary Button
              </button>
              {tagline && (
                <p className="text-gray-600 italic mt-4">"{tagline}"</p>
              )}
            </div>
          </div>

          {/* Logo Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Company Logo (Optional)
            </label>

            {!logoPreview ? (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  aria-label="Upload company logo"
                />
                <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Upload Logo
                </button>
                <p className="text-xs text-gray-500 mt-2">
                  PNG, JPG or SVG (max 2MB)
                </p>
              </div>
            ) : (
              <div className="border-2 border-gray-300 rounded-lg p-4">
                <div className="flex items-center gap-4">
                  <div className="relative w-24 h-24 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                    <Image
                      src={logoPreview}
                      alt="Logo preview"
                      fill
                      className="object-contain p-2"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 mb-1">
                      {logoFile?.name}
                    </p>
                    <p className="text-sm text-gray-500 mb-3">
                      {logoFile ? `${(logoFile.size / 1024).toFixed(1)} KB` : ''}
                    </p>
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      <X className="w-4 h-4" />
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
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
              onClick={handleSave}
              disabled={saving}
              className="bg-[#2d3b2d] text-white py-2 px-6 rounded-lg hover:bg-[#3d4b3d] disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2 transition-colors"
            >
              {saving ? 'Saving...' : 'Continue'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
