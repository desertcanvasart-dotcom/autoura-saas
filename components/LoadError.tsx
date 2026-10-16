import { AlertTriangle } from 'lucide-react'

/**
 * A list that failed to load says so. It used to fall through to the empty
 * state ("No clients found — Add First Client"), which reads as data loss.
 */
export default function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="p-8 text-center">
      <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" aria-hidden="true" />
      <h3 className="text-base font-semibold text-gray-900 mb-1">Couldn&apos;t load {what}</h3>
      <p className="text-sm text-gray-600 mb-4">Nothing has been lost — this is a connection problem. Please try again.</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center px-4 py-2 rounded-lg bg-[#263A29] text-white text-sm font-medium hover:bg-[#1D2B20]"
      >
        Try again
      </button>
    </div>
  )
}
