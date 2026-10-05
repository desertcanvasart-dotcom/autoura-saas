import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import {
  assignableRestaurants,
  type MealRateRow,
  type RestaurantContactRow,
} from '@/lib/resources/assignable'

// GET /api/resources/restaurants/assignable — every restaurant an itinerary
// can be assigned: the Restaurants directory AND Rates → Meals, merged one per
// restaurant per city (lib/resources/assignable.ts). RLS scopes
// both reads to the caller's tenant. One source failing still returns the
// other — a short list beats an empty picker.

export async function GET() {
  const auth = await requireAuth()
  if (auth.error !== null) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }
  const supabase = auth.supabase!

  const [contacts, mealRates] = await Promise.all([
    supabase
      .from('restaurant_contacts')
      .select('id, name, city, cuisine_type, phone, whatsapp, is_active'),
    supabase
      .from('meal_rates')
      .select('id, restaurant_name, supplier_id, supplier_name, city, cuisine_type, is_active'),
  ])

  if (contacts.error) console.error('assignable restaurants: contacts read failed:', contacts.error.message)
  if (mealRates.error) console.error('assignable restaurants: meal_rates read failed:', mealRates.error.message)
  if (contacts.error && mealRates.error) {
    return NextResponse.json({ success: false, error: 'Could not load restaurants' }, { status: 500 })
  }

  const data = assignableRestaurants(
    (contacts.data ?? []) as RestaurantContactRow[],
    (mealRates.data ?? []) as MealRateRow[]
  )
  return NextResponse.json({ success: true, data })
}
