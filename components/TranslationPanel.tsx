// components/TranslationPanel.tsx
// Translation panel for WhatsApp messages with language detection and translation

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Languages,
  Globe,
  ArrowRight,
  Loader2,
  Check,
  X,
  ChevronDown,
  RefreshCw,
  Eye,
  EyeOff,
  Sparkles,
  Copy,
  CheckCheck
} from 'lucide-react'

// Supported languages (matches lib/translate.ts)
const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'th', name: 'Thai', flag: '🇹🇭' },
  { code: 'vi', name: 'Vietnamese', flag: '🇻🇳' },
  { code: 'id', name: 'Indonesian', flag: '🇮🇩' },
  { code: 'ms', name: 'Malay', flag: '🇲🇾' },
  { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
  { code: 'da', name: 'Danish', flag: '🇩🇰' },
  { code: 'no', name: 'Norwegian', flag: '🇳🇴' },
  { code: 'fi', name: 'Finnish', flag: '🇫🇮' },
  { code: 'el', name: 'Greek', flag: '🇬🇷' },
  { code: 'cs', name: 'Czech', flag: '🇨🇿' },
  { code: 'ro', name: 'Romanian', flag: '🇷🇴' },
  { code: 'hu', name: 'Hungarian', flag: '🇭🇺' },
  { code: 'he', name: 'Hebrew', flag: '🇮🇱' },
  { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
]

interface TranslationPanelProps {
  // For outgoing messages
  messageText: string
  onTranslatedTextReady?: (translatedText: string, targetLanguage: string) => void
  
  // For incoming messages (optional)
  incomingMessage?: string
  onIncomingTranslation?: (originalText: string, translatedText: string, detectedLanguage: string) => void
  
  // Settings
  defaultTargetLanguage?: string
  autoTranslateIncoming?: boolean
  compact?: boolean
}

export default function TranslationPanel({
  messageText,
  onTranslatedTextReady,
  incomingMessage,
  onIncomingTranslation,
  defaultTargetLanguage = 'es',
  autoTranslateIncoming = true,
  compact = false
}: TranslationPanelProps) {
  // Translation state
  const [isEnabled, setIsEnabled] = useState(false)
  const [targetLanguage, setTargetLanguage] = useState(defaultTargetLanguage)
  const [translatedText, setTranslatedText] = useState('')
  const [isTranslating, setIsTranslating] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false)
  const [copied, setCopied] = useState(false)

  // Incoming message state
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null)
  const [incomingTranslation, setIncomingTranslation] = useState<string | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)

  // Get language info
  const getLanguageInfo = (code: string) => {
    return SUPPORTED_LANGUAGES.find(l => l.code === code)
  }

  const selectedLanguage = getLanguageInfo(targetLanguage)

  // Translate outgoing message
  const translateOutgoing = useCallback(async () => {
    if (!messageText.trim() || !isEnabled) {
      setTranslatedText('')
      return
    }

    setIsTranslating(true)
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: messageText,
          targetLanguage: targetLanguage,
          action: 'fromEnglish'
        })
      })

      const data = await response.json()
      
      if (data.success) {
        setTranslatedText(data.data.translatedText)
        onTranslatedTextReady?.(data.data.translatedText, targetLanguage)
      }
    } catch (error) {
      console.error('Translation error:', error)
    } finally {
      setIsTranslating(false)
    }
  }, [messageText, targetLanguage, isEnabled, onTranslatedTextReady])

  // Translate incoming message
  const translateIncoming = useCallback(async (text: string) => {
    if (!text.trim()) return

    try {
      // First detect language
      const detectResponse = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          action: 'detect'
        })
      })

      const detectData = await detectResponse.json()
      
      if (detectData.success) {
        setDetectedLanguage(detectData.data.languageCode)

        // If not English, translate to English
        if (detectData.data.languageCode !== 'en') {
          const translateResponse = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: text,
              action: 'toEnglish'
            })
          })

          const translateData = await translateResponse.json()
          
          if (translateData.success) {
            setIncomingTranslation(translateData.data.translatedText)
            onIncomingTranslation?.(
              text,
              translateData.data.translatedText,
              detectData.data.detectedLanguage
            )
          }
        }
      }
    } catch (error) {
      console.error('Incoming translation error:', error)
    }
  }, [onIncomingTranslation])

  // Auto-translate outgoing when enabled and text changes
  useEffect(() => {
    if (isEnabled && messageText) {
      const debounce = setTimeout(() => {
        translateOutgoing()
      }, 500)
      return () => clearTimeout(debounce)
    } else {
      setTranslatedText('')
    }
  }, [messageText, targetLanguage, isEnabled, translateOutgoing])

  // Auto-translate incoming messages
  useEffect(() => {
    if (autoTranslateIncoming && incomingMessage) {
      translateIncoming(incomingMessage)
    }
  }, [incomingMessage, autoTranslateIncoming, translateIncoming])

  // Copy translation
  const copyTranslation = () => {
    navigator.clipboard.writeText(translatedText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Use translation (callback to parent)
  const useTranslation = () => {
    if (translatedText && onTranslatedTextReady) {
      onTranslatedTextReady(translatedText, targetLanguage)
    }
  }

  if (compact) {
    // Compact mode - just a toggle and language selector inline
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsEnabled(!isEnabled)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
            isEnabled 
              ? 'bg-blue-100 text-blue-700 border border-blue-200' 
              : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
          }`}
        >
          <Languages className="w-3.5 h-3.5" />
          <span>{isEnabled ? 'ON' : 'Translate'}</span>
        </button>

        {isEnabled && (
          <div className="relative">
            <button
              onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
              className="flex items-center gap-1 px-2 py-1 bg-white border border-gray-300 rounded-lg text-xs hover:bg-gray-50"
            >
              <span>{selectedLanguage?.flag}</span>
              <span>{selectedLanguage?.name}</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {showLanguageDropdown && (
              <div className="absolute bottom-full left-0 mb-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                {SUPPORTED_LANGUAGES.filter(l => l.code !== 'en').map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setTargetLanguage(lang.code)
                      setShowLanguageDropdown(false)
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${
                      targetLanguage === lang.code ? 'bg-blue-50 text-blue-700' : ''
                    }`}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.name}</span>
                    {targetLanguage === lang.code && <Check className="w-4 h-4 ml-auto" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {isEnabled && isTranslating && (
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
        )}
      </div>
    )
  }

  // Full panel mode
  return (
    <div className="bg-gradient-to-r from-blue-50 to-primary-50 border border-blue-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-blue-200 bg-white/50">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-blue-100 rounded-lg">
            <Languages className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Message Translation</h3>
            <p className="text-xs text-gray-500">Powered by OpenAI</p>
          </div>
        </div>

        <button
          onClick={() => setIsEnabled(!isEnabled)}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            isEnabled ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              isEnabled ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {isEnabled && (
        <div className="p-4 space-y-4">
          {/* Language Selection */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg">
              <span className="text-lg">🇬🇧</span>
              <span className="text-sm font-medium">English</span>
            </div>

            <ArrowRight className="w-4 h-4 text-gray-400" />

            <div className="relative flex-1">
              <button
                onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{selectedLanguage?.flag}</span>
                  <span className="text-sm font-medium">{selectedLanguage?.name}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showLanguageDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showLanguageDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                  {SUPPORTED_LANGUAGES.filter(l => l.code !== 'en').map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        setTargetLanguage(lang.code)
                        setShowLanguageDropdown(false)
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                        targetLanguage === lang.code ? 'bg-blue-50 text-blue-700' : ''
                      }`}
                    >
                      <span className="text-lg">{lang.flag}</span>
                      <span className="font-medium">{lang.name}</span>
                      {targetLanguage === lang.code && (
                        <Check className="w-4 h-4 ml-auto text-blue-600" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Translation Preview */}
          {messageText && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Translation Preview
                </span>
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {showPreview && (
                <div className="relative">
                  {isTranslating ? (
                    <div className="flex items-center justify-center py-8 bg-white rounded-lg border border-gray-200">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-600 mr-2" />
                      <span className="text-sm text-gray-500">Translating...</span>
                    </div>
                  ) : translatedText ? (
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap flex-1">
                          {translatedText}
                        </p>
                        <button
                          onClick={copyTranslation}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                          title="Copy translation"
                        >
                          {copied ? (
                            <CheckCheck className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                          <span className="text-xs text-gray-500">
                            Will be sent in {selectedLanguage?.name}
                          </span>
                        </div>
                        <button
                          onClick={translateOutgoing}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Re-translate
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-8 bg-white rounded-lg border border-dashed border-gray-300">
                      <span className="text-sm text-gray-400">
                        Type a message to see translation
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Info */}
          <div className="flex items-start gap-2 p-3 bg-blue-100/50 rounded-lg">
            <Globe className="w-4 h-4 text-blue-600 mt-0.5" />
            <p className="text-xs text-blue-700">
              Your message will be automatically translated to {selectedLanguage?.name} before sending.
              The customer will receive the translated version.
            </p>
          </div>
        </div>
      )}

      {/* Incoming Message Translation (if provided) */}
      {incomingMessage && detectedLanguage && detectedLanguage !== 'en' && (
        <div className="px-4 py-3 bg-amber-50 border-t border-amber-200">
          <div className="flex items-start gap-2">
            <Languages className="w-4 h-4 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-amber-700">
                  Detected: {getLanguageInfo(detectedLanguage)?.name || detectedLanguage}
                </span>
                <span>{getLanguageInfo(detectedLanguage)?.flag}</span>
                <button
                  onClick={() => setShowOriginal(!showOriginal)}
                  className="text-xs text-amber-600 hover:text-amber-700 underline ml-auto"
                >
                  {showOriginal ? 'Show Translation' : 'Show Original'}
                </button>
              </div>
              <p className="text-sm text-gray-700">
                {showOriginal ? incomingMessage : (incomingTranslation || incomingMessage)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Export a simpler hook for use in other components
export function useTranslation() {
  const [isTranslating, setIsTranslating] = useState(false)

  const translate = async (
    text: string,
    targetLanguage: string,
    sourceLanguage?: string
  ) => {
    setIsTranslating(true)
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          targetLanguage,
          sourceLanguage,
          action: 'translate'
        })
      })

      const data = await response.json()
      return data.success ? data.data : null
    } catch (error) {
      console.error('Translation error:', error)
      return null
    } finally {
      setIsTranslating(false)
    }
  }

  const detectLanguage = async (text: string) => {
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          action: 'detect'
        })
      })

      const data = await response.json()
      return data.success ? data.data : null
    } catch (error) {
      console.error('Detection error:', error)
      return null
    }
  }

  return { translate, detectLanguage, isTranslating }
}