'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Users, Globe, Target, Heart } from 'lucide-react'

export default function AboutPage() {
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

      {/* Hero Section */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            About Autoura
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            We're on a mission to transform how travel businesses operate, making it easier for tour operators to focus on what they do best — creating unforgettable experiences.
          </p>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="prose prose-lg max-w-none">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Our Story</h2>
            <p className="text-gray-600 mb-6">
              Autoura was born from firsthand experience in the travel industry. Our founders spent years running tour operations in Egypt, managing everything from WhatsApp inquiries to complex multi-day itineraries, supplier coordination, and client communications.
            </p>
            <p className="text-gray-600 mb-6">
              We experienced the chaos of scattered spreadsheets, endless email threads, and the constant struggle to keep track of bookings, payments, and team assignments. We knew there had to be a better way.
            </p>
            <p className="text-gray-600 mb-6">
              That's why we built Autoura — a comprehensive platform designed specifically for tour operators and travel agencies. We've combined modern technology with deep industry knowledge to create a solution that actually works for the way travel businesses operate.
            </p>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-12">Our Values</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center p-6">
              <div className="w-14 h-14 bg-[#2d3b2d] rounded-xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Customer First</h3>
              <p className="text-gray-600 text-sm">
                Every feature we build starts with understanding our customers' real needs and challenges.
              </p>
            </div>
            <div className="text-center p-6">
              <div className="w-14 h-14 bg-[#2d3b2d] rounded-xl flex items-center justify-center mx-auto mb-4">
                <Globe className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Global Perspective</h3>
              <p className="text-gray-600 text-sm">
                We build for tour operators worldwide, supporting multiple languages and currencies.
              </p>
            </div>
            <div className="text-center p-6">
              <div className="w-14 h-14 bg-[#2d3b2d] rounded-xl flex items-center justify-center mx-auto mb-4">
                <Target className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Simplicity</h3>
              <p className="text-gray-600 text-sm">
                Complex problems deserve elegant solutions. We strive for simplicity in everything we do.
              </p>
            </div>
            <div className="text-center p-6">
              <div className="w-14 h-14 bg-[#2d3b2d] rounded-xl flex items-center justify-center mx-auto mb-4">
                <Heart className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Passion for Travel</h3>
              <p className="text-gray-600 text-sm">
                We love travel and believe in the power of exploration to transform lives.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Built by Travel Experts</h2>
          <p className="text-gray-600 mb-8">
            Our team combines decades of experience in tour operations, travel technology, and software development. We understand the challenges you face because we've lived them.
          </p>
          <a
            href="https://calendly.com/autoura"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-[#2d3b2d] rounded-lg hover:bg-[#3d4b3d] transition-colors"
          >
            Schedule a Demo
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-[#2d3b2d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-gray-400 text-sm">© 2026 Autoura. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <Link href="/privacy" className="text-gray-400 hover:text-white text-sm transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="text-gray-400 hover:text-white text-sm transition-colors">
                Terms
              </Link>
              <Link href="/contact" className="text-gray-400 hover:text-white text-sm transition-colors">
                Contact
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}