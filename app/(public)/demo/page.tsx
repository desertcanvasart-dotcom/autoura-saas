import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, ArrowRight, MessageSquare, FileText, BarChart3 } from 'lucide-react'

// The campaign video lives in public/videos/ by default. Large files can be
// hosted elsewhere (Supabase Storage, a CDN) by setting NEXT_PUBLIC_DEMO_VIDEO_URL.
// .mp4/.webm are excluded from the middleware matcher, so the file is served
// to signed-out visitors without a login redirect.
const VIDEO_SRC = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL || '/videos/autoura-campaign.mp4'

const HIGHLIGHTS = [
  {
    icon: MessageSquare,
    title: 'Inquiries in one inbox',
    body: 'WhatsApp and email inquiries land in one place, ready to turn into trips.',
  },
  {
    icon: FileText,
    title: 'Itineraries & quotes in minutes',
    body: 'Build day-by-day programs and priced quotes straight from your own rates.',
  },
  {
    icon: BarChart3,
    title: 'Bookings to invoice',
    body: 'Track payments, suppliers and profit for every booking without spreadsheets.',
  },
]

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/get-autoura-logo.png"
                alt="Autoura"
                width={560}
                height={219}
                className="h-9 w-auto max-w-none"
                priority
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

      {/* Hero + video */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
              See Autoura in action
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              A quick look at how tour operators run their whole business — from the first
              WhatsApp message to the final invoice — in one place.
            </p>
          </div>

          <div className="rounded-2xl overflow-hidden shadow-2xl ring-1 ring-gray-200 bg-black">
            <video
              className="w-full h-auto aspect-video bg-black"
              src={VIDEO_SRC}
              poster="/og.png"
              controls
              playsInline
              preload="metadata"
            >
              Your browser does not support HTML5 video.{' '}
              <a href={VIDEO_SRC} className="underline">Download the video</a> instead.
            </video>
          </div>
        </div>
      </section>

      {/* Highlights */}
      <section className="py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="text-center p-6">
                <div className="w-14 h-14 bg-[#2d3b2d] rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-600 text-sm">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-[#2d3b2d]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to run your operation on Autoura?</h2>
          <p className="text-white/80 mb-8">
            Join the Assisted Pilot and we&apos;ll help you set up your tours, rates and team.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-white text-[#2d3b2d] font-semibold hover:bg-gray-100 transition-colors"
            >
              Apply for the Assisted Pilot
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-white/40 text-white font-semibold hover:bg-white/10 transition-colors"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
