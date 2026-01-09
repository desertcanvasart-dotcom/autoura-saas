'use client'

import { useState } from 'react'
import { Tour, TourDay } from '../types'
import AccommodationSelector from './AccommodationSelector'
import MealSelector from './MealSelector'
import AdditionalServices from './AdditionalServices'
import ActivityBuilder from './ActivityBuilder'

interface DayPlannerProps {
  tour: Tour
  pax: number
  isEuroPassport: boolean
  onDayUpdate: (dayIndex: number, day: TourDay) => void
  onBack: () => void
  onNext: () => void
}

export default function DayPlanner({
  tour,
  pax,
  isEuroPassport,
  onDayUpdate,
  onBack,
  onNext
}: DayPlannerProps) {
  const [selectedDay, setSelectedDay] = useState(0)

  if (!tour.days || tour.days.length === 0) {
    return <div>No days to plan</div>
  }

  const currentDay = tour.days[selectedDay]

  console.log('📅 Current Day:', {
    dayNumber: currentDay.day_number,
    city: currentDay.city,
    hasAccommodation: !!currentDay.accommodation,
    hasLunchMeal: !!currentDay.lunch_meal,
    hasDinnerMeal: !!currentDay.dinner_meal
  })

  const handleFieldChange = (field: keyof TourDay, value: any) => {
    console.log('🔄 Field changed:', field, 'Value:', value)
    const updatedDay = {
      ...currentDay,
      [field]: value
    }
    onDayUpdate(selectedDay, updatedDay)
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        📅 Daily Planning
      </h2>
      <p className="text-gray-600 mb-6">
        Plan each day of your {tour.duration_days}-day tour
      </p>

      {/* Day Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {tour.days.map((day, index) => (
          <button
            key={index}
            onClick={() => setSelectedDay(index)}
            className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all ${
              selectedDay === index
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-white border border-gray-300 text-gray-700 hover:border-blue-300'
            }`}
          >
            Day {day.day_number}
            {day.city && (
              <span className="ml-2 text-xs opacity-75">
                {day.city}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Day Content */}
      <div className="bg-gray-50 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-900">
            Day {currentDay.day_number}
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedDay(Math.max(0, selectedDay - 1))}
              disabled={selectedDay === 0}
              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
            >
              ← Previous
            </button>
            <button
              onClick={() => setSelectedDay(Math.min(tour.days!.length - 1, selectedDay + 1))}
              disabled={selectedDay === tour.days!.length - 1}
              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
            >
              Next →
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {/* City */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              📍 City *
            </label>
            <select
              value={currentDay.city}
              onChange={(e) => handleFieldChange('city', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="">Select city...</option>
              {tour.cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          {/* Accommodation Selector */}
          {currentDay.city && (
            <AccommodationSelector
              city={currentDay.city}
              selectedAccommodation={currentDay.accommodation}
              pax={pax}
              isEuroPassport={isEuroPassport}
              onSelect={(accommodation) => handleFieldChange('accommodation', accommodation)}
            />
          )}

          {/* Meal Selectors */}
          {currentDay.city && (
            <div className="grid grid-cols-2 gap-4">
              <MealSelector
                city={currentDay.city}
                mealType="Lunch"
                selectedMeal={currentDay.lunch_meal}
                pax={pax}
                isEuroPassport={isEuroPassport}
                onSelect={(meal) => handleFieldChange('lunch_meal', meal)}
              />
              <MealSelector
                city={currentDay.city}
                mealType="Dinner"
                selectedMeal={currentDay.dinner_meal}
                pax={pax}
                isEuroPassport={isEuroPassport}
                onSelect={(meal) => handleFieldChange('dinner_meal', meal)}
              />
            </div>
          )}

          {/* Guide Required */}
          <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-gray-200">
            <div>
              <label className="font-medium text-gray-700">
                👨‍🏫 Guide Required
              </label>
              <p className="text-sm text-gray-500 mt-1">
                Toggle if this day requires a tour guide
              </p>
            </div>
            <button
              onClick={() => handleFieldChange('guide_required', !currentDay.guide_required)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                currentDay.guide_required ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  currentDay.guide_required ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Additional Services */}
          {currentDay.city && (
            <AdditionalServices
              city={currentDay.city}
              selectedServices={(currentDay as any).additional_services || []}
              pax={pax}
              isEuroPassport={isEuroPassport}
              onServicesChange={(services) => handleFieldChange('additional_services' as any, services)}
              />
          )}

          {/* Activities */}
          {currentDay.city && (
            <ActivityBuilder
              city={currentDay.city}
              activities={currentDay.activities || []}
              pax={pax}
              isEuroPassport={isEuroPassport}
              onActivitiesChange={(activities) => handleFieldChange('activities', activities)}
            />
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              📝 Notes (Optional)
            </label>
            <textarea
              value={currentDay.notes || ''}
              onChange={(e) => handleFieldChange('notes', e.target.value)}
              placeholder="Add any special notes for this day..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          ← Back to Setup
        </button>
        <button
          onClick={onNext}
          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
        >
          Continue to Review →
        </button>
      </div>

      {/* Quick Actions */}
      <div className="mt-6 flex gap-3">
        <button
          onClick={() => {
            if (confirm('Copy settings to all days?')) {
              tour.days?.forEach((_, index) => {
                if (index !== selectedDay) {
                  onDayUpdate(index, {
                    ...currentDay,
                    day_number: index + 1
                  })
                }
              })
            }
          }}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          📋 Copy to All Days
        </button>
        <button
          onClick={() => {
            if (confirm('Clear all settings for this day?')) {
              onDayUpdate(selectedDay, {
                day_number: currentDay.day_number,
                city: currentDay.city,
                breakfast_included: true,
                guide_required: true,
                activities: []
              })
            }
          }}
          className="text-sm text-red-600 hover:text-red-700 font-medium"
        >
          🗑️ Clear Day
        </button>
      </div>
    </div>
  )
}