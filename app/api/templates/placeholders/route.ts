import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'

// GET - List all placeholders
export async function GET(request: NextRequest) {
  try {
    // Use authenticated client - RLS automatically filters by tenant
    const supabase = await createAuthenticatedClient()

    const { data, error } = await supabase
      .from('template_placeholders')
      .select('*')
      .order('category')
      .order('placeholder')

    if (error) {
      console.error('Error fetching placeholders:', error)
      
      // Return hardcoded placeholders as fallback
      return NextResponse.json({ 
        success: true, 
        data: getDefaultPlaceholders()
      })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Placeholders GET error:', error)
    return NextResponse.json({ 
      success: true, 
      data: getDefaultPlaceholders()
    })
  }
}

// Default placeholders (fallback if table doesn't exist)
function getDefaultPlaceholders() {
  return [
    // Guest
    { placeholder: '{{GuestName}}', display_name: 'Guest Name', category: 'guest', example_value: 'John Smith' },
    { placeholder: '{{PaxCount}}', display_name: 'Number of Guests', category: 'guest', example_value: '4' },
    { placeholder: '{{Nationality}}', display_name: 'Nationality', category: 'guest', example_value: 'British' },
    { placeholder: '{{ClientPhone}}', display_name: 'Client Phone', category: 'guest', example_value: '+44 7700 900123' },
    { placeholder: '{{ClientEmail}}', display_name: 'Client Email', category: 'guest', example_value: 'john@example.com' },
    
    // Trip
    { placeholder: '{{TripDates}}', display_name: 'Trip Dates', category: 'trip', example_value: '15-22 March 2025' },
    { placeholder: '{{TripName}}', display_name: 'Trip Name', category: 'trip', example_value: 'Classic Egypt Explorer' },
    { placeholder: '{{BookingRef}}', display_name: 'Booking Reference', category: 'trip', example_value: 'T2E-2025-0342' },
    { placeholder: '{{Cities}}', display_name: 'Cities', category: 'trip', example_value: 'Cairo, Luxor, Aswan' },
    
    // Hotel
    { placeholder: '{{HotelName}}', display_name: 'Hotel Name', category: 'hotel', example_value: 'Marriott Mena House' },
    { placeholder: '{{RoomType}}', display_name: 'Room Type', category: 'hotel', example_value: 'Deluxe Pyramid View' },
    { placeholder: '{{MealPlan}}', display_name: 'Meal Plan', category: 'hotel', example_value: 'Breakfast included' },
    
    // Guide/Driver
    { placeholder: '{{GuideName}}', display_name: 'Guide Name', category: 'guide', example_value: 'Ahmed Hassan' },
    { placeholder: '{{GuidePhone}}', display_name: 'Guide Phone', category: 'guide', example_value: '+20 100 123 4567' },
    { placeholder: '{{DriverName}}', display_name: 'Driver Name', category: 'guide', example_value: 'Mohamed Ali' },
    { placeholder: '{{VehicleType}}', display_name: 'Vehicle Type', category: 'guide', example_value: 'Mercedes V-Class' },
    
    // Schedule
    { placeholder: '{{PickupTime}}', display_name: 'Pickup Time', category: 'schedule', example_value: '08:00' },
    { placeholder: '{{PickupPoint}}', display_name: 'Pickup Point', category: 'schedule', example_value: 'Hotel lobby' },
    { placeholder: '{{Date}}', display_name: 'Date', category: 'schedule', example_value: '16 March 2025' },
    
    // Financial
    { placeholder: '{{TotalPrice}}', display_name: 'Total Price', category: 'financial', example_value: '2,450' },
    { placeholder: '{{Currency}}', display_name: 'Currency', category: 'financial', example_value: 'USD' },
    { placeholder: '{{DepositAmount}}', display_name: 'Deposit Amount', category: 'financial', example_value: '490' },
    { placeholder: '{{DepositDeadline}}', display_name: 'Deposit Deadline', category: 'financial', example_value: '1 March 2025' },
    { placeholder: '{{PaymentLink}}', display_name: 'Payment Link', category: 'financial', example_value: 'https://pay.example.com/123' },
    
    // Operations
    { placeholder: '{{OpsManagerName}}', display_name: 'Ops Manager', category: 'ops', example_value: 'Sara Ahmed' },
    { placeholder: '{{OpsManagerPhone}}', display_name: 'Ops Phone', category: 'ops', example_value: '+20 100 999 8888' },
    { placeholder: '{{AgentName}}', display_name: 'Agent Name', category: 'ops', example_value: 'Islam Hussein' },
    { placeholder: '{{CompanyName}}', display_name: 'Company Name', category: 'ops', example_value: 'Travel2Egypt' },
  ]
}