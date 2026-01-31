'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react'
import { AlertTriangle, X, Trash2, Info, HelpCircle, CheckCircle } from 'lucide-react'

// ============================================
// TYPES
// ============================================

type DialogType = 'confirm' | 'alert' | 'prompt'

interface DialogOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info' | 'success'
  placeholder?: string
  defaultValue?: string
}

interface DialogState extends DialogOptions {
  type: DialogType
  isOpen: boolean
  resolve: ((value: boolean | string | null) => void) | null
}

interface ConfirmDialogContextType {
  confirm: (options: DialogOptions) => Promise<boolean>
  alert: (title: string, message: string, variant?: 'info' | 'success' | 'warning') => Promise<boolean>
  prompt: (title: string, message: string, options?: Partial<DialogOptions>) => Promise<string | null>
  confirmDelete: (itemName: string, customMessage?: string) => Promise<boolean>
}

// ============================================
// CONTEXT
// ============================================

const ConfirmDialogContext = createContext<ConfirmDialogContextType | null>(null)

// No-op fallback for SSR/prerendering when ConfirmDialogProvider isn't available
const noopConfirmDialogContext: ConfirmDialogContextType = {
  confirm: async () => false,
  alert: async () => true,
  prompt: async () => null,
  confirmDelete: async () => false,
}

export function useConfirmDialog() {
  const context = useContext(ConfirmDialogContext)

  // During SSR/prerendering, context won't be available
  // Return a no-op fallback to allow initial render to complete
  if (!context) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn('useConfirmDialog: ConfirmDialogProvider not found, using no-op fallback')
    }
    return noopConfirmDialogContext
  }

  return context
}

// ============================================
// PROVIDER
// ============================================

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>({
    type: 'confirm',
    isOpen: false,
    message: '',
    resolve: null,
  })
  const [inputValue, setInputValue] = useState('')
  
  const overlayRef = useRef<HTMLDivElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ============================================
  // FOCUS & KEYBOARD HANDLING
  // ============================================

  useEffect(() => {
    if (state.isOpen) {
      // Focus appropriate element
      if (state.type === 'prompt' && inputRef.current) {
        inputRef.current.focus()
        inputRef.current.select()
      } else if (confirmButtonRef.current) {
        confirmButtonRef.current.focus()
      }

      // Prevent body scroll
      document.body.style.overflow = 'hidden'
      
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [state.isOpen, state.type])

  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.isOpen) {
        handleCancel()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [state.isOpen, state.type])

  // ============================================
  // HANDLERS
  // ============================================

  const handleConfirm = () => {
    if (state.type === 'prompt') {
      state.resolve?.(inputValue)
    } else {
      state.resolve?.(true)
    }
    setState(prev => ({ ...prev, isOpen: false, resolve: null }))
  }

  const handleCancel = () => {
    if (state.type === 'prompt') {
      state.resolve?.(null)
    } else {
      state.resolve?.(false)
    }
    setState(prev => ({ ...prev, isOpen: false, resolve: null }))
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      handleCancel()
    }
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm()
    }
  }

  // ============================================
  // API METHODS
  // ============================================

  const confirm = useCallback((options: DialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        type: 'confirm',
        isOpen: true,
        resolve: resolve as (value: boolean | string | null) => void,
        ...options,
      })
    })
  }, [])

  const alert = useCallback((
    title: string, 
    message: string, 
    variant: 'info' | 'success' | 'warning' = 'info'
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        type: 'alert',
        isOpen: true,
        title,
        message,
        variant,
        confirmText: 'OK',
        resolve: resolve as (value: boolean | string | null) => void,
      })
    })
  }, [])

  const prompt = useCallback((
    title: string,
    message: string,
    options?: Partial<DialogOptions>
  ): Promise<string | null> => {
    setInputValue(options?.defaultValue || '')
    return new Promise((resolve) => {
      setState({
        type: 'prompt',
        isOpen: true,
        title,
        message,
        variant: 'info',
        confirmText: options?.confirmText || 'OK',
        cancelText: options?.cancelText || 'Cancel',
        placeholder: options?.placeholder,
        defaultValue: options?.defaultValue,
        resolve: resolve as (value: boolean | string | null) => void,
      })
    })
  }, [])

  const confirmDelete = useCallback((itemName: string, customMessage?: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        type: 'confirm',
        isOpen: true,
        title: `Delete ${itemName}?`,
        message: customMessage || `Are you sure you want to delete this ${itemName.toLowerCase()}? This action cannot be undone.`,
        variant: 'danger',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        resolve: resolve as (value: boolean | string | null) => void,
      })
    })
  }, [])

  // ============================================
  // STYLING
  // ============================================

  const variantStyles = {
    danger: {
      icon: 'bg-red-100',
      iconColor: 'text-red-600',
      button: 'bg-red-600 hover:bg-red-700 focus:ring-red-300 text-white',
      IconComponent: Trash2,
    },
    warning: {
      icon: 'bg-amber-100',
      iconColor: 'text-amber-600',
      button: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-300 text-white',
      IconComponent: AlertTriangle,
    },
    info: {
      icon: 'bg-blue-100',
      iconColor: 'text-blue-600',
      button: 'bg-[#647C47] hover:bg-[#4f6238] focus:ring-[#647C47]/30 text-white',
      IconComponent: Info,
    },
    success: {
      icon: 'bg-green-100',
      iconColor: 'text-green-600',
      button: 'bg-[#647C47] hover:bg-[#4f6238] focus:ring-[#647C47]/30 text-white',
      IconComponent: CheckCircle,
    },
  }

  const variant = state.variant || 'danger'
  const styles = variantStyles[variant]
  const IconComponent = state.type === 'prompt' ? HelpCircle : styles.IconComponent
  const isAlert = state.type === 'alert'
  const isPrompt = state.type === 'prompt'
  const isDestructive = variant === 'danger'

  return (
    <ConfirmDialogContext.Provider value={{ confirm, alert, prompt, confirmDelete }}>
      {children}
      
      {state.isOpen && (
        <div 
          ref={overlayRef}
          onClick={handleOverlayClick}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
          aria-describedby="dialog-description"
        >
          {/* Dialog */}
          <div 
            className="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in zoom-in-95 duration-200"
            role="document"
          >
            {/* Close button */}
            <button
              onClick={handleCancel}
              className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors z-10"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Content */}
            <div className="p-6">
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${styles.icon}`}>
                  <IconComponent className={`w-6 h-6 ${isPrompt ? 'text-[#647C47]' : styles.iconColor}`} />
                </div>
                
                {/* Text */}
                <div className="flex-1 pt-1">
                  <h3 
                    id="dialog-title"
                    className={`text-lg font-semibold ${isDestructive ? 'text-red-900' : 'text-gray-900'}`}
                  >
                    {state.title || 'Confirm Action'}
                  </h3>
                  <p 
                    id="dialog-description"
                    className="mt-2 text-sm text-gray-600 leading-relaxed"
                  >
                    {state.message}
                  </p>
                </div>
              </div>

              {/* Prompt Input */}
              {isPrompt && (
                <div className="mt-4 ml-16">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder={state.placeholder || ''}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-transparent"
                  />
                </div>
              )}

              {/* Destructive Warning */}
              {isDestructive && !isAlert && (
                <div className="mt-4 ml-16 p-3 bg-red-50 border border-red-100 rounded-lg">
                  <p className="text-xs text-red-700">
                    <strong>Warning:</strong> This action cannot be undone.
                  </p>
                </div>
              )}
            </div>
            
            {/* Actions */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
              {!isAlert && (
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors"
                >
                  {state.cancelText || 'Cancel'}
                </button>
              )}
              <button
                ref={confirmButtonRef}
                onClick={handleConfirm}
                className={`px-4 py-2 text-sm font-medium rounded-lg focus:outline-none focus:ring-2 transition-colors ${styles.button}`}
              >
                {state.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmDialogContext.Provider>
  )
}