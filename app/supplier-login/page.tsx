import SignInForm from './SignInForm'

// Supplier sign-in (Phase 2B): phone → code by email → signed in. Suppliers
// are not app users; this page and its API are open, and the API answers the
// same whether or not a number is known.

export const metadata = { title: 'Supplier sign-in' }

export default function SupplierLoginPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-5 py-6">
        <p className="text-xs uppercase tracking-widest text-gray-400">Autoura for suppliers</p>
        <h1 className="text-xl font-semibold mt-1 text-white">Sign in</h1>
        <p className="text-sm text-gray-300 mt-1">See every booking from the agencies you work with, in one place.</p>
      </header>
      <div className="max-w-md mx-auto px-4 py-6">
        <SignInForm />
      </div>
    </main>
  )
}
