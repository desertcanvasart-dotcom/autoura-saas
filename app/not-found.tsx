import Link from 'next/link'
import BrandMark from '@/components/BrandMark'

export const metadata = { title: 'Page not found · Autoura' }

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F7F7F4] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center">
        <BrandMark />
        <p className="mt-6 text-sm font-semibold text-primary-500 tracking-wide">404</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">We can&apos;t find that page</h1>
        <p className="mt-2 text-gray-600">
          The link may be old, or the page may have moved. Nothing has been lost.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-[#263A29] text-white font-medium hover:bg-[#1D2B20] transition-colors"
          >
            Go to your dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-white transition-colors"
          >
            Autoura home
          </Link>
        </div>
      </div>
    </div>
  )
}
