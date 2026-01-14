'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-2">
              <Image 
                src="/autoura-logo.png" 
                alt="Autoura" 
                width={140} 
                height={36}
                className="h-9 w-auto"
              />
            </Link>
            <Link 
              href="/"
              className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <section className="pt-32 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Terms of Service</h1>
          <p className="text-gray-500 mb-12">Last updated: January 11, 2026</p>

          <div className="prose prose-lg max-w-none">
            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Agreement to Terms</h2>
              <p className="text-gray-600 mb-4">
                By accessing or using Autoura's travel operations management platform ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of these terms, you may not access the Service.
              </p>
              <p className="text-gray-600">
                These Terms apply to all visitors, users, and others who access or use the Service.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Description of Service</h2>
              <p className="text-gray-600 mb-4">
                Autoura provides a cloud-based travel operations management platform that enables tour operators and travel agencies to:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Create and manage travel itineraries</li>
                <li>Manage client relationships and bookings</li>
                <li>Generate invoices, contracts, and other documents</li>
                <li>Track team operations and assignments</li>
                <li>Integrate with communication channels</li>
                <li>Analyze business performance</li>
              </ul>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Account Registration</h2>
              <p className="text-gray-600 mb-4">
                To use the Service, you must:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Be at least 18 years old</li>
                <li>Complete the registration process</li>
                <li>Provide accurate and complete information</li>
                <li>Maintain the security of your account credentials</li>
                <li>Accept responsibility for all activities under your account</li>
              </ul>
              <p className="text-gray-600 mt-4">
                You must notify us immediately of any unauthorized access to your account.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Subscription and Payment</h2>
              
              <h3 className="text-lg font-semibold text-gray-900 mb-3">4.1 Pricing</h3>
              <p className="text-gray-600 mb-4">
                Our Service is offered on a subscription basis with the following plans:
              </p>
              <ul className="list-disc list-inside text-gray-600 mb-6 space-y-2">
                <li><strong>B2C Operations:</strong> $7 per member per month (minimum 5 members)</li>
                <li><strong>B2C + B2B Operations:</strong> $10 per member per month (minimum 5 members)</li>
              </ul>

              <h3 className="text-lg font-semibold text-gray-900 mb-3">4.2 Billing</h3>
              <p className="text-gray-600 mb-4">
                Subscriptions are billed in advance on a monthly or annual basis. Payment is due at the beginning of each billing period.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mb-3">4.3 Free Trial</h3>
              <p className="text-gray-600">
                New accounts may be eligible for a 14-day free trial. At the end of the trial period, your account will be automatically converted to a paid subscription unless cancelled.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Acceptable Use</h2>
              <p className="text-gray-600 mb-4">You agree not to:</p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Use the Service for any unlawful purpose</li>
                <li>Violate any applicable laws or regulations</li>
                <li>Infringe on intellectual property rights</li>
                <li>Transmit malicious code or interfere with the Service</li>
                <li>Attempt to gain unauthorized access to any systems</li>
                <li>Share your account credentials with third parties</li>
                <li>Use the Service to send spam or unsolicited communications</li>
                <li>Resell or redistribute the Service without authorization</li>
              </ul>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Data Ownership</h2>
              
              <h3 className="text-lg font-semibold text-gray-900 mb-3">6.1 Your Data</h3>
              <p className="text-gray-600 mb-4">
                You retain all rights to the data you input into the Service ("Your Data"). We do not claim ownership of Your Data.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mb-3">6.2 License to Us</h3>
              <p className="text-gray-600 mb-4">
                You grant us a limited license to use, process, and store Your Data solely for the purpose of providing the Service to you.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mb-3">6.3 Data Export</h3>
              <p className="text-gray-600">
                You may export Your Data at any time during your subscription period. Upon termination, you will have 30 days to export Your Data before it is deleted.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Intellectual Property</h2>
              <p className="text-gray-600">
                The Service, including its original content, features, and functionality, is owned by Autoura and protected by international copyright, trademark, and other intellectual property laws. You may not copy, modify, distribute, or create derivative works based on the Service without our express written consent.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Service Availability</h2>
              <p className="text-gray-600 mb-4">
                We strive to maintain 99.9% uptime for the Service. However, we do not guarantee uninterrupted access. The Service may be temporarily unavailable due to:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Scheduled maintenance (with advance notice when possible)</li>
                <li>Emergency maintenance</li>
                <li>Circumstances beyond our control</li>
              </ul>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Limitation of Liability</h2>
              <p className="text-gray-600 mb-4">
                To the maximum extent permitted by law, Autoura shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>Loss of profits or revenue</li>
                <li>Loss of data</li>
                <li>Business interruption</li>
                <li>Loss of goodwill</li>
              </ul>
              <p className="text-gray-600 mt-4">
                Our total liability shall not exceed the amount paid by you in the twelve (12) months preceding the claim.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Disclaimer of Warranties</h2>
              <p className="text-gray-600">
                The Service is provided "as is" and "as available" without warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Termination</h2>
              <p className="text-gray-600 mb-4">
                Either party may terminate the subscription:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li><strong>By You:</strong> At any time by cancelling your subscription through your account settings</li>
                <li><strong>By Us:</strong> If you violate these Terms or fail to pay subscription fees</li>
              </ul>
              <p className="text-gray-600 mt-4">
                Upon termination, your right to use the Service will cease immediately.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Indemnification</h2>
              <p className="text-gray-600">
                You agree to indemnify and hold harmless Autoura, its affiliates, and their respective officers, directors, employees, and agents from any claims, damages, losses, or expenses arising from your use of the Service or violation of these Terms.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">13. Changes to Terms</h2>
              <p className="text-gray-600">
                We reserve the right to modify these Terms at any time. We will provide notice of material changes by posting the updated Terms on our website and updating the "Last updated" date. Your continued use of the Service after such changes constitutes acceptance of the new Terms.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">14. Governing Law</h2>
              <p className="text-gray-600">
                These Terms shall be governed by and construed in accordance with the laws of Egypt, without regard to its conflict of law provisions.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">15. Contact Us</h2>
              <p className="text-gray-600 mb-4">
                If you have questions about these Terms of Service, please contact us:
              </p>
              <div className="bg-gray-50 rounded-xl p-6">
                <p className="text-gray-700">
                  <strong>Email:</strong> legal@autoura.net<br />
                  <strong>Address:</strong> Cairo, Egypt
                </p>
              </div>
            </section>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-[#2d3b2d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-gray-400 text-sm">© 2026 Autoura. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <Link href="/about" className="text-gray-400 hover:text-white text-sm transition-colors">
                About
              </Link>
              <Link href="/contact" className="text-gray-400 hover:text-white text-sm transition-colors">
                Contact
              </Link>
              <Link href="/privacy" className="text-gray-400 hover:text-white text-sm transition-colors">
                Privacy
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}