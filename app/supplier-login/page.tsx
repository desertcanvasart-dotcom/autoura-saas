import Image from 'next/image'
import Link from 'next/link'
import SignInForm from './SignInForm'

// Supplier sign-in (Phase 2B): phone → code by email → signed in. Suppliers
// are not app users; this page and its API are open, and the API answers the
// same whether or not a number is known. Laid out like the staff sign-in
// (/login): the brand's light background, the logo, one card (2026-11-01).

export const metadata = { title: 'Supplier sign-in' }

export default function SupplierLoginPage() {
  return (
    <main className="min-h-screen bg-[#F7F7F4] flex flex-col items-center justify-center px-4 py-10">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <Link href="/" aria-label="Autoura home" className="inline-block">
            <Image src="/get-autoura-logo.png" alt="Autoura" width={560} height={219} priority className="h-12 w-auto mx-auto" />
          </Link>
          <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-[#647C47]">For suppliers</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">Supplier sign-in</h1>
          <p className="mt-2 text-gray-600">Every request and booking from the agencies you work with, in one place.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-100">
          <SignInForm />
        </div>

        <div className="mt-6 text-center text-sm text-gray-600 space-y-1">
          <p>
            Work at an agency? <Link href="/login" className="font-medium text-[#263A29] hover:text-[#1D2B20]">Staff sign-in</Link>
          </p>
          <p className="text-gray-500">© {new Date().getFullYear()} Autoura by Online Era</p>
        </div>
      </div>
    </main>
  )
}
