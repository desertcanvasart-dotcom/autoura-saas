/** The RATES block a copilot draft was written from, collapsed — what a reviewer checks the prices against. */
export default function PricesUsed({ rates }: { rates: string }) {
  return (
    <details className="mb-2 rounded border border-gray-200 bg-gray-50 text-xs">
      <summary className="cursor-pointer select-none px-2 py-1 font-medium text-gray-600">Prices used</summary>
      <pre className="whitespace-pre-wrap px-2 pb-2 font-mono text-[11px] leading-relaxed text-gray-700">
        {rates.trim() || 'None — no tour with an approved public rate matched this enquiry.'}
      </pre>
    </details>
  )
}

/** `context_used.rates` when the draft has one (company system prompt only). */
export function ratesOf(d: { context_used?: { rates?: string | null } | null }): string | null {
  return typeof d.context_used?.rates === 'string' ? d.context_used.rates : null
}
