// Header and footer for the public blog pages, in the landing page's style.
// A super admin also sees a way into the editor (adminHref).

import Link from 'next/link'
import { PenSquare } from 'lucide-react'

export function BlogHeader({ adminHref, adminLabel }: { adminHref?: string | null; adminLabel?: string }) {
  return (
    <header className="sticky top-0 z-40 bg-[#F5F3EF]/95 backdrop-blur-sm border-b border-[#E8E5DF]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/get-autoura-logo.png" alt="Autoura" className="h-8 w-auto max-w-none object-contain" />
          <span className="hidden sm:inline text-[17px] font-medium text-gray-400">Blog</span>
        </Link>
        <nav className="flex items-center gap-4 sm:gap-6 text-sm font-medium text-[#555]">
          <Link href="/blog" className="hover:text-[#111710]">All posts</Link>
          <Link href="/docs" className="hidden sm:inline hover:text-[#111710]">Docs</Link>
                    {adminHref && (
            <Link href={adminHref} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#647C47]/30 text-[#647C47] hover:bg-[#647C47]/5" data-testid="blog-admin-link">
              <PenSquare className="w-4 h-4" /> {adminLabel ?? 'Manage posts'}
            </Link>
          )}
          <Link href="/pricing" className="hidden sm:inline hover:text-[#111710]">Pricing</Link>
          <Link href="/contact"
            className="hidden md:inline px-4 py-2 bg-[#647C47] text-white font-semibold rounded-[9px] hover:bg-[#4f6339]">
            Apply for the pilot
          </Link>
        </nav>
      </div>
    </header>
  )
}

export function BlogFooter() {
  return (
    <footer className="border-t border-[#E8E5DF] mt-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-stone-500">
        <p>© {new Date().getFullYear()} Autoura — operations software for tour operators.</p>
        <nav className="flex flex-wrap justify-center gap-5">
          <Link href="/" className="hover:text-stone-700">Home</Link>
          <Link href="/blog" className="hover:text-stone-700">Blog</Link>
          <Link href="/pricing" className="hover:text-stone-700">Pricing</Link>
          <Link href="/docs" className="hover:text-stone-700">Docs</Link>
          <Link href="/privacy" className="hover:text-stone-700">Privacy</Link>
          <Link href="/terms" className="hover:text-stone-700">Terms</Link>
          <Link href="/contact" className="hover:text-stone-700">Contact</Link>
        </nav>
      </div>
    </footer>
  )
}

export const fmtPostDate = (iso: string | null, language: string) =>
  iso
    ? new Date(iso).toLocaleDateString(language === 'ja' ? 'ja-JP' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
    : ''
