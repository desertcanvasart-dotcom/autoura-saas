'use client'

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { X, AlertTriangle, Info, HelpCircle, Trash2, CheckCircle } from 'lucide-react'

// ============================================
// TYPES
// ============================================

type ModalType = 'alert' | 'confirm' | 'prompt' | 'destructive'

interface ModalConfig {
  type: ModalType
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  placeholder?: string
  defaultValue?: string
  icon?: React.ReactNode
}

interface ModalState extends ModalConfig {
  isOpen: boolean
  resolve: ((value: boolean | string | null) => void) | null
}

interface ModalContextType {
  // Core methods
  alert: (title: string, message: string) => Promise<boolean>
  confirm: (title: string, message: string, options?: Partial<ModalConfig>) => Promise<boolean>
  prompt: (title: string, message: string, options?: Partial<ModalConfig>) => Promise<string | null>
  confirmDelete: (itemName: string, options?: Partial<ModalConfig>) => Promise<boolean>
  confirmDestructive: (title: string, message: string, options?: Partial<ModalConfig>) => Promise<boolean>
}

// ============================================
// CONTEXT
// ============================================

const ModalContext = createContext<ModalContextType | null>(null)

// ============================================
// HOOK
// ============================================

// No-op fallback for SSR/prerendering when ModalProvider isn't available
const noopModalContext: ModalContextType = {
  alert: async () => true,
  confirm: async () => false,
  prompt: async () => null,
  confirmDelete: async () => false,
  confirmDestructive: async () => false,
}

export function useModal() {
  const context = useContext(ModalContext)

  // During SSR/prerendering, context won't be available
  // Return a no-op fallback to allow initial render to complete
  if (!context) {
    // Only warn in development if we're in a browser (actual bug)
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn('useModal: ModalProvider not found, using no-op fallback')
    }
    return noopModalContext
  }

  return context
}

// ============================================
// MODAL COMPONENT
// ============================================

interface ModalComponentProps {
  state: ModalState
  onClose: (result: boolean | string | null) => void
  inputValue: string
  setInputValue: (value: string) => void
}

function ModalComponent({ state, onClose, inputValue, setInputValue }: ModalComponentProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus trap and initial focus
  useEffect(() => {
    if (state.isOpen) {
      // Focus the appropriate element
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

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.isOpen) {
        onClose(state.type === 'prompt' ? null : false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [state.isOpen, state.type, onClose])

  // Handle click outside
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose(state.type === 'prompt' ? null : false)
    }
  }

  // Handle confirm
  const handleConfirm = () => {
    if (state.type === 'prompt') {
      onClose(inputValue)
    } else {
      onClose(true)
    }
  }

  // Handle cancel
  const handleCancel = () => {
    onClose(state.type === 'prompt' ? null : false)
  }

  // Handle Enter key in prompt
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm()
    }
  }

  if (!state.isOpen) return null

  const isDestructive = state.type === 'destructive'
  const isAlert = state.type === 'alert'
  const isPrompt = state.type === 'prompt'

  // Default icon based on type
  const getIcon = () => {
    if (state.icon) return state.icon
    switch (state.type) {
      case 'destructive':
        return <Trash2 className="w-6 h-6 text-red-500" />
      case 'alert':
        return <Info className="w-6 h-6 text-blue-500" />
      case 'prompt':
        return <HelpCircle className="w-6 h-6 text-[#647C47]" />
      default:
        return <AlertTriangle className="w-6 h-6 text-amber-500" />
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby="modal-description"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-md mx-4 bg-white rounded-xl shadow-2xl animate-in zoom-in-95 duration-200"
        role="document"
      >
        {/* Close button */}
        <button
          onClick={handleCancel}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="p-6">
          {/* Icon & Title */}
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
              isDestructive ? 'bg-red-50' : 
              isAlert ? 'bg-blue-50' : 
              'bg-gray-100'
            }`}>
              {getIcon()}
            </div>
            <div className="flex-1 pt-1">
              <h3 
                id="modal-title" 
                className={`text-lg font-semibold ${isDestructive ? 'text-red-900' : 'text-gray-900'}`}
              >
                {state.title}
              </h3>
              <p 
                id="modal-description" 
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
          {isDestructive && (
            <div className="mt-4 ml-16 p-3 bg-red-50 border border-red-100 rounded-lg">
              <p className="text-xs text-red-700">
                <strong>Warning:</strong> This action cannot be undone.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100 rounded-b-xl">
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
            className={`px-4 py-2 text-sm font-medium rounded-lg focus:outline-none focus:ring-2 transition-colors ${
              isDestructive
                ? 'text-white bg-red-600 hover:bg-red-700 focus:ring-red-300'
                : 'text-white bg-[#647C47] hover:bg-[#4f6238] focus:ring-[#647C47]/30'
            }`}
          >
            {state.confirmText || (isDestructive ? 'Delete' : isAlert ? 'OK' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// PROVIDER
// ============================================

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    type: 'confirm',
    title: '',
    message: '',
    resolve: null,
  })
  const [inputValue, setInputValue] = useState('')

  const openModal = useCallback((config: ModalConfig): Promise<boolean | string | null> => {
    return new Promise((resolve) => {
      setInputValue(config.defaultValue || '')
      setModalState({
        ...config,
        isOpen: true,
        resolve,
      })
    })
  }, [])

  const closeModal = useCallback((result: boolean | string | null) => {
    if (modalState.resolve) {
      modalState.resolve(result)
    }
    setModalState((prev) => ({ ...prev, isOpen: false, resolve: null }))
  }, [modalState.resolve])

  // API Methods
  const alert = useCallback(
    (title: string, message: string): Promise<boolean> => {
      return openModal({
        type: 'alert',
        title,
        message,
        confirmText: 'OK',
      }) as Promise<boolean>
    },
    [openModal]
  )

  const confirm = useCallback(
    (title: string, message: string, options?: Partial<ModalConfig>): Promise<boolean> => {
      return openModal({
        type: 'confirm',
        title,
        message,
        ...options,
      }) as Promise<boolean>
    },
    [openModal]
  )

  const prompt = useCallback(
    (title: string, message: string, options?: Partial<ModalConfig>): Promise<string | null> => {
      return openModal({
        type: 'prompt',
        title,
        message,
        ...options,
      }) as Promise<string | null>
    },
    [openModal]
  )

  const confirmDelete = useCallback(
    (itemName: string, options?: Partial<ModalConfig>): Promise<boolean> => {
      return openModal({
        type: 'destructive',
        title: `Delete ${itemName}?`,
        message: `Are you sure you want to delete this ${itemName.toLowerCase()}? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        ...options,
      }) as Promise<boolean>
    },
    [openModal]
  )

  const confirmDestructive = useCallback(
    (title: string, message: string, options?: Partial<ModalConfig>): Promise<boolean> => {
      return openModal({
        type: 'destructive',
        title,
        message,
        ...options,
      }) as Promise<boolean>
    },
    [openModal]
  )

  const contextValue: ModalContextType = {
    alert,
    confirm,
    prompt,
    confirmDelete,
    confirmDestructive,
  }

  return (
    <ModalContext.Provider value={contextValue}>
      {children}
      <ModalComponent
        state={modalState}
        onClose={closeModal}
        inputValue={inputValue}
        setInputValue={setInputValue}
      />
    </ModalContext.Provider>
  )
}

export default ModalContext