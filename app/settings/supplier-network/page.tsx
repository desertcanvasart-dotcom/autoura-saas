'use client'

import SupplierSourcingSetting from '@/components/SupplierSourcingSetting'
import SupplierSignInRequests from '@/components/SupplierSignInRequests'
import { useRole } from '@/hooks/useRole'

// Settings › Supplier network: where this agency books suppliers from (its
// own list, the Autoura network, or both), and the suppliers waiting for the
// agency to confirm their sign-in. The approvals also show on Suppliers,
// where they are met day to day. Owners and admins change; managers read.
export default function SupplierNetworkSettingsPage() {
  const { isAdmin } = useRole()
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl space-y-6">
      <SupplierSourcingSetting canEdit={isAdmin} />
      <section>
        <h2 className="text-base font-semibold text-gray-900">Supplier sign-in requests</h2>
        <p className="text-sm text-gray-600 mt-0.5 mb-3">
          Suppliers who signed in with a phone number on your list, waiting for you to confirm it is them.
        </p>
        <SupplierSignInRequests isAdmin={isAdmin} emptyText="No supplier is waiting for you to confirm a sign-in." />
      </section>
    </div>
  )
}
