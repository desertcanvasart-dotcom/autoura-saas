import Link from 'next/link'
import { CATEGORIES } from './toc'

export default function DocsHub() {
  return (
    <>
      {/* Hero Section */}
      <section className="pt-16 pb-12 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            Documentation
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Everything you need to know about using Autoura. From getting started to advanced workflows, find step-by-step guides for every feature.
          </p>
        </div>
      </section>

      {/* Categorized Cards */}
      <section className="pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto space-y-10">
          {CATEGORIES.map((category) => (
            <div key={category.label}>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 px-1">
                {category.label}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {category.items.map((section) => {
                  const Icon = section.icon
                  return (
                    <Link
                      key={section.href}
                      href={section.href}
                      className="group border border-gray-200 rounded-xl p-5 hover:shadow-lg hover:border-primary-300 transition-all duration-200"
                    >
                      <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center mb-3 group-hover:bg-primary-100 transition-colors">
                        <Icon className="w-5 h-5 text-primary-600" />
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-1 group-hover:text-primary-700 transition-colors">
                        {section.title}
                      </h3>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        {section.description}
                      </p>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
