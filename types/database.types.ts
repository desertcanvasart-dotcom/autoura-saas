/**
 * GENERATED FILE — do not edit by hand.
 *
 * Regenerate with: npm run types:generate
 * Drift check:     npm run types:check
 *
 * Source: live production schema via PostgREST OpenAPI
 * (see scripts/generate-db-types.mjs for why not `supabase gen types`).
 * Tables: 128
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      accommodation_rates: {
        Row: {
          rate_currency: string | null
          id: string
          tenant_id: string
          hotel_name: string | null
          city: string | null
          room_type: string | null
          tier: string | null
          rate_low_season_sgl: number | null
          rate_high_season_sgl: number | null
          rate_peak_season_sgl: number | null
          rate_low_season_dbl: number | null
          rate_high_season_dbl: number | null
          rate_peak_season_dbl: number | null
          created_at: string | null
          ppd_eur: number | null
          ppd_non_eur: number | null
          single_supplement_eur: number | null
          single_supplement_non_eur: number | null
          triple_reduction_eur: number | null
          triple_reduction_non_eur: number | null
          high_season_ppd_eur: number | null
          high_season_ppd_non_eur: number | null
          high_season_single_supplement_eur: number | null
          high_season_single_supplement_non_eur: number | null
          high_season_triple_reduction_eur: number | null
          high_season_triple_reduction_non_eur: number | null
          peak_season_ppd_eur: number | null
          peak_season_ppd_non_eur: number | null
          peak_season_single_supplement_eur: number | null
          peak_season_single_supplement_non_eur: number | null
          peak_season_triple_reduction_eur: number | null
          peak_season_triple_reduction_non_eur: number | null
          supplements: Json | null
          service_code: string | null
          property_name: string | null
          property_type: string | null
          board_basis: string | null
          supplier_id: string | null
          supplier_name: string | null
          contact_name: string | null
          contact_email: string | null
          contact_phone: string | null
          reservations_email: string | null
          reservations_phone: string | null
          low_season_from: string | null
          low_season_to: string | null
          high_season_from: string | null
          high_season_to: string | null
          peak_season_from: string | null
          peak_season_to: string | null
          peak_season_2_from: string | null
          peak_season_2_to: string | null
          single_rate_eur: number | null
          double_rate_eur: number | null
          triple_rate_eur: number | null
          suite_rate_eur: number | null
          single_rate_non_eur: number | null
          double_rate_non_eur: number | null
          triple_rate_non_eur: number | null
          suite_rate_non_eur: number | null
          high_season_single_eur: number | null
          high_season_double_eur: number | null
          high_season_triple_eur: number | null
          high_season_suite_eur: number | null
          high_season_single_non_eur: number | null
          high_season_double_non_eur: number | null
          high_season_triple_non_eur: number | null
          high_season_suite_non_eur: number | null
          peak_season_single_eur: number | null
          peak_season_double_eur: number | null
          peak_season_triple_eur: number | null
          peak_season_suite_eur: number | null
          peak_season_single_non_eur: number | null
          peak_season_double_non_eur: number | null
          peak_season_triple_non_eur: number | null
          peak_season_suite_non_eur: number | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          notes: string | null
          is_active: boolean | null
          updated_at: string | null
          hotel_id: string | null
          star_rating: number | null
          base_rate_eur: number | null
          base_rate_non_eur: number | null
          season: string | null
          pp_double_eur: number | null
          single_supp_eur: number | null
          triple_red_eur: number | null
          pp_double_non_eur: number | null
          single_supp_non_eur: number | null
          triple_red_non_eur: number | null
          high_pp_double_eur: number | null
          high_single_supp_eur: number | null
          high_triple_red_eur: number | null
          high_pp_double_non_eur: number | null
          high_single_supp_non_eur: number | null
          high_triple_red_non_eur: number | null
          peak_pp_double_eur: number | null
          peak_single_supp_eur: number | null
          peak_triple_red_eur: number | null
          peak_pp_double_non_eur: number | null
          peak_single_supp_non_eur: number | null
          peak_triple_red_non_eur: number | null
          high_season_rate_eur: number | null
          high_season_rate_non_eur: number | null
          low_season_rate_eur: number | null
          low_season_rate_non_eur: number | null
        }
        Insert: {
          rate_currency?: string | null
          id?: string
          tenant_id: string
          hotel_name?: string | null
          city?: string | null
          room_type?: string | null
          tier?: string | null
          rate_low_season_sgl?: number | null
          rate_high_season_sgl?: number | null
          rate_peak_season_sgl?: number | null
          rate_low_season_dbl?: number | null
          rate_high_season_dbl?: number | null
          rate_peak_season_dbl?: number | null
          created_at?: string | null
          ppd_eur?: number | null
          ppd_non_eur?: number | null
          single_supplement_eur?: number | null
          single_supplement_non_eur?: number | null
          triple_reduction_eur?: number | null
          triple_reduction_non_eur?: number | null
          high_season_ppd_eur?: number | null
          high_season_ppd_non_eur?: number | null
          high_season_single_supplement_eur?: number | null
          high_season_single_supplement_non_eur?: number | null
          high_season_triple_reduction_eur?: number | null
          high_season_triple_reduction_non_eur?: number | null
          peak_season_ppd_eur?: number | null
          peak_season_ppd_non_eur?: number | null
          peak_season_single_supplement_eur?: number | null
          peak_season_single_supplement_non_eur?: number | null
          peak_season_triple_reduction_eur?: number | null
          peak_season_triple_reduction_non_eur?: number | null
          supplements?: Json | null
          service_code?: string | null
          property_name?: string | null
          property_type?: string | null
          board_basis?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          reservations_email?: string | null
          reservations_phone?: string | null
          low_season_from?: string | null
          low_season_to?: string | null
          high_season_from?: string | null
          high_season_to?: string | null
          peak_season_from?: string | null
          peak_season_to?: string | null
          peak_season_2_from?: string | null
          peak_season_2_to?: string | null
          single_rate_eur?: number | null
          double_rate_eur?: number | null
          triple_rate_eur?: number | null
          suite_rate_eur?: number | null
          single_rate_non_eur?: number | null
          double_rate_non_eur?: number | null
          triple_rate_non_eur?: number | null
          suite_rate_non_eur?: number | null
          high_season_single_eur?: number | null
          high_season_double_eur?: number | null
          high_season_triple_eur?: number | null
          high_season_suite_eur?: number | null
          high_season_single_non_eur?: number | null
          high_season_double_non_eur?: number | null
          high_season_triple_non_eur?: number | null
          high_season_suite_non_eur?: number | null
          peak_season_single_eur?: number | null
          peak_season_double_eur?: number | null
          peak_season_triple_eur?: number | null
          peak_season_suite_eur?: number | null
          peak_season_single_non_eur?: number | null
          peak_season_double_non_eur?: number | null
          peak_season_triple_non_eur?: number | null
          peak_season_suite_non_eur?: number | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          notes?: string | null
          is_active?: boolean | null
          updated_at?: string | null
          hotel_id?: string | null
          star_rating?: number | null
          base_rate_eur?: number | null
          base_rate_non_eur?: number | null
          season?: string | null
          pp_double_eur?: number | null
          single_supp_eur?: number | null
          triple_red_eur?: number | null
          pp_double_non_eur?: number | null
          single_supp_non_eur?: number | null
          triple_red_non_eur?: number | null
          high_pp_double_eur?: number | null
          high_single_supp_eur?: number | null
          high_triple_red_eur?: number | null
          high_pp_double_non_eur?: number | null
          high_single_supp_non_eur?: number | null
          high_triple_red_non_eur?: number | null
          peak_pp_double_eur?: number | null
          peak_single_supp_eur?: number | null
          peak_triple_red_eur?: number | null
          peak_pp_double_non_eur?: number | null
          peak_single_supp_non_eur?: number | null
          peak_triple_red_non_eur?: number | null
          high_season_rate_eur?: number | null
          high_season_rate_non_eur?: number | null
          low_season_rate_eur?: number | null
          low_season_rate_non_eur?: number | null
        }
        Update: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string
          hotel_name?: string | null
          city?: string | null
          room_type?: string | null
          tier?: string | null
          rate_low_season_sgl?: number | null
          rate_high_season_sgl?: number | null
          rate_peak_season_sgl?: number | null
          rate_low_season_dbl?: number | null
          rate_high_season_dbl?: number | null
          rate_peak_season_dbl?: number | null
          created_at?: string | null
          ppd_eur?: number | null
          ppd_non_eur?: number | null
          single_supplement_eur?: number | null
          single_supplement_non_eur?: number | null
          triple_reduction_eur?: number | null
          triple_reduction_non_eur?: number | null
          high_season_ppd_eur?: number | null
          high_season_ppd_non_eur?: number | null
          high_season_single_supplement_eur?: number | null
          high_season_single_supplement_non_eur?: number | null
          high_season_triple_reduction_eur?: number | null
          high_season_triple_reduction_non_eur?: number | null
          peak_season_ppd_eur?: number | null
          peak_season_ppd_non_eur?: number | null
          peak_season_single_supplement_eur?: number | null
          peak_season_single_supplement_non_eur?: number | null
          peak_season_triple_reduction_eur?: number | null
          peak_season_triple_reduction_non_eur?: number | null
          supplements?: Json | null
          service_code?: string | null
          property_name?: string | null
          property_type?: string | null
          board_basis?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          reservations_email?: string | null
          reservations_phone?: string | null
          low_season_from?: string | null
          low_season_to?: string | null
          high_season_from?: string | null
          high_season_to?: string | null
          peak_season_from?: string | null
          peak_season_to?: string | null
          peak_season_2_from?: string | null
          peak_season_2_to?: string | null
          single_rate_eur?: number | null
          double_rate_eur?: number | null
          triple_rate_eur?: number | null
          suite_rate_eur?: number | null
          single_rate_non_eur?: number | null
          double_rate_non_eur?: number | null
          triple_rate_non_eur?: number | null
          suite_rate_non_eur?: number | null
          high_season_single_eur?: number | null
          high_season_double_eur?: number | null
          high_season_triple_eur?: number | null
          high_season_suite_eur?: number | null
          high_season_single_non_eur?: number | null
          high_season_double_non_eur?: number | null
          high_season_triple_non_eur?: number | null
          high_season_suite_non_eur?: number | null
          peak_season_single_eur?: number | null
          peak_season_double_eur?: number | null
          peak_season_triple_eur?: number | null
          peak_season_suite_eur?: number | null
          peak_season_single_non_eur?: number | null
          peak_season_double_non_eur?: number | null
          peak_season_triple_non_eur?: number | null
          peak_season_suite_non_eur?: number | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          notes?: string | null
          is_active?: boolean | null
          updated_at?: string | null
          hotel_id?: string | null
          star_rating?: number | null
          base_rate_eur?: number | null
          base_rate_non_eur?: number | null
          season?: string | null
          pp_double_eur?: number | null
          single_supp_eur?: number | null
          triple_red_eur?: number | null
          pp_double_non_eur?: number | null
          single_supp_non_eur?: number | null
          triple_red_non_eur?: number | null
          high_pp_double_eur?: number | null
          high_single_supp_eur?: number | null
          high_triple_red_eur?: number | null
          high_pp_double_non_eur?: number | null
          high_single_supp_non_eur?: number | null
          high_triple_red_non_eur?: number | null
          peak_pp_double_eur?: number | null
          peak_single_supp_eur?: number | null
          peak_triple_red_eur?: number | null
          peak_pp_double_non_eur?: number | null
          peak_single_supp_non_eur?: number | null
          peak_triple_red_non_eur?: number | null
          high_season_rate_eur?: number | null
          high_season_rate_non_eur?: number | null
          low_season_rate_eur?: number | null
          low_season_rate_non_eur?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accommodation_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_rates: {
        Row: {
          rate_currency: string | null
          id: string
          tenant_id: string
          activity_name: string
          activity_category: string | null
          city: string | null
          base_rate_eur: number | null
          base_rate_non_eur: number | null
          created_at: string | null
          service_code: string | null
          activity_type: string | null
          duration: string | null
          pricing_type: string | null
          unit_label: string | null
          min_capacity: number | null
          max_capacity: number | null
          season: string | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          supplier_id: string | null
          supplier_name: string | null
          notes: string | null
          is_active: boolean | null
          updated_at: string | null
          is_addon: boolean | null
          addon_note: string | null
        }
        Insert: {
          rate_currency?: string | null
          id?: string
          tenant_id: string
          activity_name: string
          activity_category?: string | null
          city?: string | null
          base_rate_eur?: number | null
          base_rate_non_eur?: number | null
          created_at?: string | null
          service_code?: string | null
          activity_type?: string | null
          duration?: string | null
          pricing_type?: string | null
          unit_label?: string | null
          min_capacity?: number | null
          max_capacity?: number | null
          season?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          notes?: string | null
          is_active?: boolean | null
          updated_at?: string | null
          is_addon?: boolean | null
          addon_note?: string | null
        }
        Update: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string
          activity_name?: string
          activity_category?: string | null
          city?: string | null
          base_rate_eur?: number | null
          base_rate_non_eur?: number | null
          created_at?: string | null
          service_code?: string | null
          activity_type?: string | null
          duration?: string | null
          pricing_type?: string | null
          unit_label?: string | null
          min_capacity?: number | null
          max_capacity?: number | null
          season?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          notes?: string | null
          is_active?: boolean | null
          updated_at?: string | null
          is_addon?: boolean | null
          addon_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_memory: {
        Row: {
          id: string
          tenant_id: string
          memory_type: string
          subject_id: string | null
          subject_type: string | null
          subject_name: string | null
          content: string
          confidence: number | null
          observation_count: number | null
          expires_at: string | null
          created_at: string | null
          updated_at: string | null
          last_accessed_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          memory_type: string
          subject_id?: string | null
          subject_type?: string | null
          subject_name?: string | null
          content: string
          confidence?: number | null
          observation_count?: number | null
          expires_at?: string | null
          created_at?: string | null
          updated_at?: string | null
          last_accessed_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          memory_type?: string
          subject_id?: string | null
          subject_type?: string | null
          subject_name?: string | null
          content?: string
          confidence?: number | null
          observation_count?: number | null
          expires_at?: string | null
          created_at?: string | null
          updated_at?: string | null
          last_accessed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_memory_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          id: string
          tenant_id: string
          agent_type: string
          triggered_by: string | null
          input_summary: string | null
          output_summary: string | null
          tokens_used: number | null
          duration_ms: number | null
          status: string | null
          itinerary_id: string | null
          memories_injected: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          agent_type: string
          triggered_by?: string | null
          input_summary?: string | null
          output_summary?: string | null
          tokens_used?: number | null
          duration_ms?: number | null
          status?: string | null
          itinerary_id?: string | null
          memories_injected?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          agent_type?: string
          triggered_by?: string | null
          input_summary?: string | null
          output_summary?: string | null
          tokens_used?: number | null
          duration_ms?: number | null
          status?: string | null
          itinerary_id?: string | null
          memories_injected?: number | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
        ]
      }
      airport_staff: {
        Row: {
          id: string
          tenant_id: string
          name: string
          role: string | null
          airport_location: string
          phone: string
          whatsapp: string | null
          email: string | null
          languages: string[] | null
          shift_times: string | null
          emergency_contact: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          team_member_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          role?: string | null
          airport_location: string
          phone: string
          whatsapp?: string | null
          email?: string | null
          languages?: string[] | null
          shift_times?: string | null
          emergency_contact?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          team_member_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          role?: string | null
          airport_location?: string
          phone?: string
          whatsapp?: string | null
          email?: string | null
          languages?: string[] | null
          shift_times?: string | null
          emergency_contact?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          team_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "airport_staff_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "airport_staff_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      airport_staff_rates: {
        Row: {
          rate_currency: string | null
          id: string
          tenant_id: string | null
          service_code: string | null
          airport_code: string
          service_type: string
          direction: string | null
          rate_eur: number
          description: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          airport_name: string | null
          supplier_name: string | null
        }
        Insert: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string | null
          service_code?: string | null
          airport_code: string
          service_type?: string
          direction?: string | null
          rate_eur?: number
          description?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          airport_name?: string | null
          supplier_name?: string | null
        }
        Update: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string | null
          service_code?: string | null
          airport_code?: string
          service_type?: string
          direction?: string | null
          rate_eur?: number
          description?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          airport_name?: string | null
          supplier_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "airport_staff_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_partner_pricing: {
        Row: {
          id: string
          partner_id: string
          variation_id: string
          margin_percent_override: number | null
          fixed_price_per_pax: number | null
          price_1_pax: number | null
          price_2_pax: number | null
          price_3_pax: number | null
          price_4_pax: number | null
          price_5_pax: number | null
          price_6_pax: number | null
          price_7_plus_pax: number | null
          valid_from: string | null
          valid_to: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          tenant_id: string | null
        }
        Insert: {
          id?: string
          partner_id: string
          variation_id: string
          margin_percent_override?: number | null
          fixed_price_per_pax?: number | null
          price_1_pax?: number | null
          price_2_pax?: number | null
          price_3_pax?: number | null
          price_4_pax?: number | null
          price_5_pax?: number | null
          price_6_pax?: number | null
          price_7_plus_pax?: number | null
          valid_from?: string | null
          valid_to?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          tenant_id?: string | null
        }
        Update: {
          id?: string
          partner_id?: string
          variation_id?: string
          margin_percent_override?: number | null
          fixed_price_per_pax?: number | null
          price_1_pax?: number | null
          price_2_pax?: number | null
          price_3_pax?: number | null
          price_4_pax?: number | null
          price_5_pax?: number | null
          price_6_pax?: number | null
          price_7_plus_pax?: number | null
          valid_from?: string | null
          valid_to?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_partner_pricing_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_partners: {
        Row: {
          id: string
          partner_code: string
          company_name: string
          contact_name: string | null
          email: string | null
          phone: string | null
          address: string | null
          city: string | null
          country: string | null
          partner_type: string | null
          commission_percent: number | null
          payment_terms: string | null
          default_margin_percent: number | null
          is_active: boolean | null
          status: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          tenant_id: string
          currency: string | null
          show_net_rates: boolean | null
          show_cost_breakdown: boolean | null
          pricing_model: string | null
          credit_limit: number | null
          created_by: string | null
        }
        Insert: {
          id?: string
          partner_code: string
          company_name: string
          contact_name?: string | null
          email?: string | null
          phone?: string | null
          address?: string | null
          city?: string | null
          country?: string | null
          partner_type?: string | null
          commission_percent?: number | null
          payment_terms?: string | null
          default_margin_percent?: number | null
          is_active?: boolean | null
          status?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          tenant_id: string
          currency?: string | null
          show_net_rates?: boolean | null
          show_cost_breakdown?: boolean | null
          pricing_model?: string | null
          credit_limit?: number | null
          created_by?: string | null
        }
        Update: {
          id?: string
          partner_code?: string
          company_name?: string
          contact_name?: string | null
          email?: string | null
          phone?: string | null
          address?: string | null
          city?: string | null
          country?: string | null
          partner_type?: string | null
          commission_percent?: number | null
          payment_terms?: string | null
          default_margin_percent?: number | null
          is_active?: boolean | null
          status?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          tenant_id?: string
          currency?: string | null
          show_net_rates?: boolean | null
          show_cost_breakdown?: boolean | null
          pricing_model?: string | null
          credit_limit?: number | null
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_partners_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_pricing_rules: {
        Row: {
          id: string
          rate_table: string | null
          rate_id: string | null
          service_name: string | null
          service_category: string | null
          pricing_model: string
          unit_type: string | null
          unit_capacity: number | null
          tier1_min_pax: number | null
          tier1_max_pax: number | null
          tier1_rate_eur: number | null
          tier1_label: string | null
          tier2_min_pax: number | null
          tier2_max_pax: number | null
          tier2_rate_eur: number | null
          tier2_label: string | null
          tier3_min_pax: number | null
          tier3_max_pax: number | null
          tier3_rate_eur: number | null
          tier3_label: string | null
          tier4_min_pax: number | null
          tier4_max_pax: number | null
          tier4_rate_eur: number | null
          tier4_label: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          applies_to: string | null
          tenant_id: string | null
        }
        Insert: {
          id?: string
          rate_table?: string | null
          rate_id?: string | null
          service_name?: string | null
          service_category?: string | null
          pricing_model?: string
          unit_type?: string | null
          unit_capacity?: number | null
          tier1_min_pax?: number | null
          tier1_max_pax?: number | null
          tier1_rate_eur?: number | null
          tier1_label?: string | null
          tier2_min_pax?: number | null
          tier2_max_pax?: number | null
          tier2_rate_eur?: number | null
          tier2_label?: string | null
          tier3_min_pax?: number | null
          tier3_max_pax?: number | null
          tier3_rate_eur?: number | null
          tier3_label?: string | null
          tier4_min_pax?: number | null
          tier4_max_pax?: number | null
          tier4_rate_eur?: number | null
          tier4_label?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          applies_to?: string | null
          tenant_id?: string | null
        }
        Update: {
          id?: string
          rate_table?: string | null
          rate_id?: string | null
          service_name?: string | null
          service_category?: string | null
          pricing_model?: string
          unit_type?: string | null
          unit_capacity?: number | null
          tier1_min_pax?: number | null
          tier1_max_pax?: number | null
          tier1_rate_eur?: number | null
          tier1_label?: string | null
          tier2_min_pax?: number | null
          tier2_max_pax?: number | null
          tier2_rate_eur?: number | null
          tier2_label?: string | null
          tier3_min_pax?: number | null
          tier3_max_pax?: number | null
          tier3_rate_eur?: number | null
          tier3_label?: string | null
          tier4_min_pax?: number | null
          tier4_max_pax?: number | null
          tier4_rate_eur?: number | null
          tier4_label?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          applies_to?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_pricing_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_quotes: {
        Row: {
          id: string
          tenant_id: string
          itinerary_id: string | null
          partner_id: string | null
          quote_number: string
          tier: string
          tour_leader_included: boolean
          currency: string
          ppd_accommodation: number
          ppd_cruise: number
          single_supplement: number
          fixed_transport: number
          fixed_guide: number
          fixed_other: number
          pp_entrance_fees: number
          pp_meals: number
          pp_tips: number
          pp_domestic_flights: number
          pricing_table: Json
          tour_leader_cost: number | null
          status: string
          valid_from: string | null
          valid_until: string | null
          season: string | null
          pdf_url: string | null
          internal_notes: string | null
          terms_and_conditions: string | null
          created_at: string | null
          updated_at: string | null
          version: number | null
          last_modified_by: string | null
          last_modified_at: string | null
          pdf_generated_at: string | null
          variation_id: string | null
          trip_name: string | null
          client_name: string | null
          client_email: string | null
          client_phone: string | null
          client_nationality: string | null
          travel_date: string | null
          num_adults: number | null
          num_children: number | null
          is_eur_passport: boolean | null
          services_snapshot: Json | null
          total_cost: number | null
          margin_percent: number | null
          margin_amount: number | null
          selling_price: number | null
          price_per_person: number | null
          source: string | null
          notes: string | null
          converted_to_itinerary_id: string | null
          converted_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          itinerary_id?: string | null
          partner_id?: string | null
          quote_number: string
          tier?: string
          tour_leader_included?: boolean
          currency?: string
          ppd_accommodation?: number
          ppd_cruise?: number
          single_supplement?: number
          fixed_transport?: number
          fixed_guide?: number
          fixed_other?: number
          pp_entrance_fees?: number
          pp_meals?: number
          pp_tips?: number
          pp_domestic_flights?: number
          pricing_table: Json
          tour_leader_cost?: number | null
          status?: string
          valid_from?: string | null
          valid_until?: string | null
          season?: string | null
          pdf_url?: string | null
          internal_notes?: string | null
          terms_and_conditions?: string | null
          created_at?: string | null
          updated_at?: string | null
          version?: number | null
          last_modified_by?: string | null
          last_modified_at?: string | null
          pdf_generated_at?: string | null
          variation_id?: string | null
          trip_name?: string | null
          client_name?: string | null
          client_email?: string | null
          client_phone?: string | null
          client_nationality?: string | null
          travel_date?: string | null
          num_adults?: number | null
          num_children?: number | null
          is_eur_passport?: boolean | null
          services_snapshot?: Json | null
          total_cost?: number | null
          margin_percent?: number | null
          margin_amount?: number | null
          selling_price?: number | null
          price_per_person?: number | null
          source?: string | null
          notes?: string | null
          converted_to_itinerary_id?: string | null
          converted_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          itinerary_id?: string | null
          partner_id?: string | null
          quote_number?: string
          tier?: string
          tour_leader_included?: boolean
          currency?: string
          ppd_accommodation?: number
          ppd_cruise?: number
          single_supplement?: number
          fixed_transport?: number
          fixed_guide?: number
          fixed_other?: number
          pp_entrance_fees?: number
          pp_meals?: number
          pp_tips?: number
          pp_domestic_flights?: number
          pricing_table?: Json
          tour_leader_cost?: number | null
          status?: string
          valid_from?: string | null
          valid_until?: string | null
          season?: string | null
          pdf_url?: string | null
          internal_notes?: string | null
          terms_and_conditions?: string | null
          created_at?: string | null
          updated_at?: string | null
          version?: number | null
          last_modified_by?: string | null
          last_modified_at?: string | null
          pdf_generated_at?: string | null
          variation_id?: string | null
          trip_name?: string | null
          client_name?: string | null
          client_email?: string | null
          client_phone?: string | null
          client_nationality?: string | null
          travel_date?: string | null
          num_adults?: number | null
          num_children?: number | null
          is_eur_passport?: boolean | null
          services_snapshot?: Json | null
          total_cost?: number | null
          margin_percent?: number | null
          margin_amount?: number | null
          selling_price?: number | null
          price_per_person?: number | null
          source?: string | null
          notes?: string | null
          converted_to_itinerary_id?: string | null
          converted_at?: string | null
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_quotes_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_quotes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "b2b_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_quotes_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "tour_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_transport_packages: {
        Row: {
          rate_currency: string | null
          id: string
          package_code: string
          package_name: string
          package_type: string
          origin_city: string | null
          destination_city: string | null
          duration_days: number | null
          sedan_rate: number | null
          sedan_capacity: number | null
          minivan_rate: number | null
          minivan_capacity: number | null
          van_rate: number | null
          van_capacity: number | null
          minibus_rate: number | null
          minibus_capacity: number | null
          bus_rate: number | null
          bus_capacity: number | null
          description: string | null
          includes: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          tenant_id: string | null
        }
        Insert: {
          rate_currency?: string | null
          id?: string
          package_code: string
          package_name: string
          package_type: string
          origin_city?: string | null
          destination_city?: string | null
          duration_days?: number | null
          sedan_rate?: number | null
          sedan_capacity?: number | null
          minivan_rate?: number | null
          minivan_capacity?: number | null
          van_rate?: number | null
          van_capacity?: number | null
          minibus_rate?: number | null
          minibus_capacity?: number | null
          bus_rate?: number | null
          bus_capacity?: number | null
          description?: string | null
          includes?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          tenant_id?: string | null
        }
        Update: {
          rate_currency?: string | null
          id?: string
          package_code?: string
          package_name?: string
          package_type?: string
          origin_city?: string | null
          destination_city?: string | null
          duration_days?: number | null
          sedan_rate?: number | null
          sedan_capacity?: number | null
          minivan_rate?: number | null
          minivan_capacity?: number | null
          van_rate?: number | null
          van_capacity?: number | null
          minibus_rate?: number | null
          minibus_capacity?: number | null
          bus_rate?: number | null
          bus_capacity?: number | null
          description?: string | null
          includes?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2b_transport_packages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      b2c_quotes: {
        Row: {
          id: string
          tenant_id: string
          itinerary_id: string | null
          client_id: string | null
          quote_number: string
          num_travelers: number
          tier: string
          total_cost: number
          margin_percent: number
          selling_price: number
          price_per_person: number
          currency: string
          cost_breakdown: Json | null
          status: string
          valid_until: string | null
          sent_via: string | null
          sent_at: string | null
          viewed_at: string | null
          pdf_url: string | null
          internal_notes: string | null
          client_notes: string | null
          created_at: string | null
          updated_at: string | null
          version: number | null
          last_modified_by: string | null
          last_modified_at: string | null
          pdf_generated_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          itinerary_id?: string | null
          client_id?: string | null
          quote_number: string
          num_travelers?: number
          tier?: string
          total_cost: number
          margin_percent: number
          selling_price: number
          price_per_person: number
          currency?: string
          cost_breakdown?: Json | null
          status?: string
          valid_until?: string | null
          sent_via?: string | null
          sent_at?: string | null
          viewed_at?: string | null
          pdf_url?: string | null
          internal_notes?: string | null
          client_notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          version?: number | null
          last_modified_by?: string | null
          last_modified_at?: string | null
          pdf_generated_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          itinerary_id?: string | null
          client_id?: string | null
          quote_number?: string
          num_travelers?: number
          tier?: string
          total_cost?: number
          margin_percent?: number
          selling_price?: number
          price_per_person?: number
          currency?: string
          cost_breakdown?: Json | null
          status?: string
          valid_until?: string | null
          sent_via?: string | null
          sent_at?: string | null
          viewed_at?: string | null
          pdf_url?: string | null
          internal_notes?: string | null
          client_notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          version?: number | null
          last_modified_by?: string | null
          last_modified_at?: string | null
          pdf_generated_at?: string | null
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2c_quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2c_quotes_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2c_quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_invoices: {
        Row: {
          id: string
          tenant_id: string
          subscription_id: string
          stripe_invoice_id: string
          stripe_payment_intent_id: string | null
          invoice_number: string | null
          amount_due: number
          amount_paid: number | null
          currency: string
          tax: number | null
          total: number
          status: string
          invoice_date: string
          due_date: string | null
          paid_at: string | null
          invoice_pdf_url: string | null
          hosted_invoice_url: string | null
          line_items: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          subscription_id: string
          stripe_invoice_id: string
          stripe_payment_intent_id?: string | null
          invoice_number?: string | null
          amount_due: number
          amount_paid?: number | null
          currency?: string
          tax?: number | null
          total: number
          status: string
          invoice_date: string
          due_date?: string | null
          paid_at?: string | null
          invoice_pdf_url?: string | null
          hosted_invoice_url?: string | null
          line_items?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          subscription_id?: string
          stripe_invoice_id?: string
          stripe_payment_intent_id?: string | null
          invoice_number?: string | null
          amount_due?: number
          amount_paid?: number | null
          currency?: string
          tax?: number | null
          total?: number
          status?: string
          invoice_date?: string
          due_date?: string | null
          paid_at?: string | null
          invoice_pdf_url?: string | null
          hosted_invoice_url?: string | null
          line_items?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "tenant_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_passengers: {
        Row: {
          id: string
          tenant_id: string
          booking_id: string
          title: string | null
          first_name: string
          last_name: string
          full_name: string | null
          date_of_birth: string | null
          gender: string | null
          nationality: string | null
          email: string | null
          phone: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          passport_number: string | null
          passport_expiry: string | null
          passport_issuing_country: string | null
          visa_required: boolean | null
          passenger_type: string
          is_lead_passenger: boolean | null
          room_type: string | null
          roommate_id: string | null
          meal_preference: string | null
          mobility_requirements: string | null
          medical_conditions: string | null
          special_requests: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          booking_id: string
          title?: string | null
          first_name: string
          last_name: string
          full_name?: string | null
          date_of_birth?: string | null
          gender?: string | null
          nationality?: string | null
          email?: string | null
          phone?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          passport_number?: string | null
          passport_expiry?: string | null
          passport_issuing_country?: string | null
          visa_required?: boolean | null
          passenger_type?: string
          is_lead_passenger?: boolean | null
          room_type?: string | null
          roommate_id?: string | null
          meal_preference?: string | null
          mobility_requirements?: string | null
          medical_conditions?: string | null
          special_requests?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          booking_id?: string
          title?: string | null
          first_name?: string
          last_name?: string
          full_name?: string | null
          date_of_birth?: string | null
          gender?: string | null
          nationality?: string | null
          email?: string | null
          phone?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          passport_number?: string | null
          passport_expiry?: string | null
          passport_issuing_country?: string | null
          visa_required?: boolean | null
          passenger_type?: string
          is_lead_passenger?: boolean | null
          room_type?: string | null
          roommate_id?: string | null
          meal_preference?: string | null
          mobility_requirements?: string | null
          medical_conditions?: string | null
          special_requests?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_passengers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_passengers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_passengers_roommate_id_fkey"
            columns: ["roommate_id"]
            isOneToOne: false
            referencedRelation: "booking_passengers"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_portal_links: {
        Row: {
          id: string
          tenant_id: string
          booking_id: string
          passenger_id: string | null
          token: string
          created_by: string | null
          created_at: string
          revoked_at: string | null
          expires_at: string | null
          last_sent_at: string | null
          form_locked: boolean
        }
        Insert: {
          id?: string
          tenant_id: string
          booking_id: string
          passenger_id?: string | null
          token: string
          created_by?: string | null
          created_at?: string
          revoked_at?: string | null
          expires_at?: string | null
          last_sent_at?: string | null
          form_locked?: boolean
        }
        Update: {
          id?: string
          tenant_id?: string
          booking_id?: string
          passenger_id?: string | null
          token?: string
          created_by?: string | null
          created_at?: string
          revoked_at?: string | null
          expires_at?: string | null
          last_sent_at?: string | null
          form_locked?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "booking_portal_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_portal_links_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_portal_links_passenger_id_fkey"
            columns: ["passenger_id"]
            isOneToOne: false
            referencedRelation: "booking_passengers"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_payments: {
        Row: {
          id: string
          tenant_id: string
          booking_id: string
          payment_number: string
          amount: number
          currency: string
          payment_type: string
          payment_method: string | null
          status: string
          payment_date: string | null
          due_date: string | null
          cleared_date: string | null
          refund_date: string | null
          transaction_reference: string | null
          invoice_number: string | null
          receipt_number: string | null
          bank_name: string | null
          account_last4: string | null
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          booking_id: string
          payment_number: string
          amount: number
          currency?: string
          payment_type?: string
          payment_method?: string | null
          status?: string
          payment_date?: string | null
          due_date?: string | null
          cleared_date?: string | null
          refund_date?: string | null
          transaction_reference?: string | null
          invoice_number?: string | null
          receipt_number?: string | null
          bank_name?: string | null
          account_last4?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          booking_id?: string
          payment_number?: string
          amount?: number
          currency?: string
          payment_type?: string
          payment_method?: string | null
          status?: string
          payment_date?: string | null
          due_date?: string | null
          cleared_date?: string | null
          refund_date?: string | null
          transaction_reference?: string | null
          invoice_number?: string | null
          receipt_number?: string | null
          bank_name?: string | null
          account_last4?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_supplier_status: {
        Row: {
          id: string
          tenant_id: string
          booking_id: string
          supplier_id: string | null
          supplier_type: string
          supplier_name: string
          service_description: string | null
          service_date: string | null
          contact_name: string | null
          contact_email: string | null
          contact_phone: string | null
          quoted_cost: number | null
          confirmed_cost: number | null
          confirmation_number: string | null
          confirmation_notes: string | null
          status: string | null
          confirmed_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          booking_id: string
          supplier_id?: string | null
          supplier_type: string
          supplier_name: string
          service_description?: string | null
          service_date?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          quoted_cost?: number | null
          confirmed_cost?: number | null
          confirmation_number?: string | null
          confirmation_notes?: string | null
          status?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          booking_id?: string
          supplier_id?: string | null
          supplier_type?: string
          supplier_name?: string
          service_description?: string | null
          service_date?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          quoted_cost?: number | null
          confirmed_cost?: number | null
          confirmation_number?: string | null
          confirmation_notes?: string | null
          status?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_supplier_status_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_supplier_status_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          id: string
          tenant_id: string
          itinerary_id: string
          quote_id: string
          quote_type: string
          client_id: string | null
          partner_id: string | null
          booking_number: string
          booking_date: string
          trip_name: string
          start_date: string
          end_date: string
          total_days: number
          num_travelers: number
          total_amount: number
          currency: string
          payment_terms: string | null
          deposit_amount: number
          deposit_percent: number | null
          total_paid: number
          balance_due: number
          status: string
          confirmation_date: string | null
          payment_deadline: string | null
          full_payment_date: string | null
          cancellation_date: string | null
          confirmation_pdf_url: string | null
          voucher_urls: Json | null
          special_requests: string | null
          dietary_requirements: string | null
          internal_notes: string | null
          cancellation_reason: string | null
          created_by: string | null
          confirmed_by: string | null
          cancelled_by: string | null
          created_at: string
          updated_at: string
          assigned_to: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          itinerary_id: string
          quote_id: string
          quote_type: string
          client_id?: string | null
          partner_id?: string | null
          booking_number: string
          booking_date?: string
          trip_name: string
          start_date: string
          end_date: string
          total_days: number
          num_travelers: number
          total_amount: number
          currency?: string
          payment_terms?: string | null
          deposit_amount?: number
          deposit_percent?: number | null
          total_paid?: number
          balance_due: number
          status?: string
          confirmation_date?: string | null
          payment_deadline?: string | null
          full_payment_date?: string | null
          cancellation_date?: string | null
          confirmation_pdf_url?: string | null
          voucher_urls?: Json | null
          special_requests?: string | null
          dietary_requirements?: string | null
          internal_notes?: string | null
          cancellation_reason?: string | null
          created_by?: string | null
          confirmed_by?: string | null
          cancelled_by?: string | null
          created_at?: string
          updated_at?: string
          assigned_to?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          itinerary_id?: string
          quote_id?: string
          quote_type?: string
          client_id?: string | null
          partner_id?: string | null
          booking_number?: string
          booking_date?: string
          trip_name?: string
          start_date?: string
          end_date?: string
          total_days?: number
          num_travelers?: number
          total_amount?: number
          currency?: string
          payment_terms?: string | null
          deposit_amount?: number
          deposit_percent?: number | null
          total_paid?: number
          balance_due?: number
          status?: string
          confirmation_date?: string | null
          payment_deadline?: string | null
          full_payment_date?: string | null
          cancellation_date?: string | null
          confirmation_pdf_url?: string | null
          voucher_urls?: Json | null
          special_requests?: string | null
          dietary_requirements?: string | null
          internal_notes?: string | null
          cancellation_reason?: string | null
          created_by?: string | null
          confirmed_by?: string | null
          cancelled_by?: string | null
          created_at?: string
          updated_at?: string
          assigned_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "b2b_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      client_followups: {
        Row: {
          id: string
          tenant_id: string
          client_id: string
          description: string
          due_date: string
          priority: string
          notes: string | null
          assigned_to: string | null
          status: string
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          updated_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          client_id: string
          description: string
          due_date: string
          priority?: string
          notes?: string | null
          assigned_to?: string | null
          status?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          client_id?: string
          description?: string
          due_date?: string
          priority?: string
          notes?: string | null
          assigned_to?: string | null
          status?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_followups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_followups_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notes: {
        Row: {
          id: string
          tenant_id: string
          client_id: string
          note_text: string
          note_type: string
          is_internal: boolean
          created_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          client_id: string
          note_text: string
          note_type?: string
          is_internal?: boolean
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          client_id?: string
          note_text?: string
          note_type?: string
          is_internal?: boolean
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_preferences: {
        Row: {
          id: string
          tenant_id: string
          client_id: string
          preferred_accommodation_type: string | null
          tour_pace_preference: string | null
          interests: string | null
          special_needs: string | null
          preferred_tier: string | null
          dietary_requirements: string | null
          mobility_requirements: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          client_id: string
          preferred_accommodation_type?: string | null
          tour_pace_preference?: string | null
          interests?: string | null
          special_needs?: string | null
          preferred_tier?: string | null
          dietary_requirements?: string | null
          mobility_requirements?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          client_id?: string
          preferred_accommodation_type?: string | null
          tour_pace_preference?: string | null
          interests?: string | null
          special_needs?: string | null
          preferred_tier?: string | null
          dietary_requirements?: string | null
          mobility_requirements?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_preferences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          id: string
          client_code: string | null
          full_name: string | null
          email: string | null
          phone: string | null
          whatsapp: string | null
          nationality: string | null
          language: string | null
          address: string | null
          city: string | null
          country: string | null
          status: string | null
          source: string | null
          notes: string | null
          preferences: Json | null
          created_at: string | null
          updated_at: string | null
          tenant_id: string
          first_name: string | null
          last_name: string | null
          client_type: string | null
          passport_type: string | null
          preferred_language: string | null
          client_source: string | null
          vip_status: boolean | null
          lead_source: string | null
          alternative_phone: string | null
          date_of_birth: string | null
          address_line1: string | null
          address_line2: string | null
          postal_code: string | null
          preferred_contact_method: string | null
          best_time_to_contact: string | null
          timezone: string | null
          preferred_accommodation_level: string | null
          dietary_restrictions: string[] | null
          accessibility_needs: string[] | null
          special_interests: string[] | null
          company_name: string | null
          job_title: string | null
          is_travel_agent: boolean | null
          agent_commission_rate: number | null
          referred_by_client_id: string | null
          marketing_consent: boolean | null
          newsletter_subscribed: boolean | null
          sms_consent: boolean | null
          total_bookings_count: number | null
          total_revenue_generated: number | null
          currency_preference: string | null
          average_booking_value: number | null
          tags: string[] | null
          rating: number | null
          created_by: string | null
          last_contacted_at: string | null
          internal_notes: string | null
        }
        Insert: {
          id?: string
          client_code?: string | null
          full_name?: string | null
          email?: string | null
          phone?: string | null
          whatsapp?: string | null
          nationality?: string | null
          language?: string | null
          address?: string | null
          city?: string | null
          country?: string | null
          status?: string | null
          source?: string | null
          notes?: string | null
          preferences?: Json | null
          created_at?: string | null
          updated_at?: string | null
          tenant_id: string
          first_name?: string | null
          last_name?: string | null
          client_type?: string | null
          passport_type?: string | null
          preferred_language?: string | null
          client_source?: string | null
          vip_status?: boolean | null
          lead_source?: string | null
          alternative_phone?: string | null
          date_of_birth?: string | null
          address_line1?: string | null
          address_line2?: string | null
          postal_code?: string | null
          preferred_contact_method?: string | null
          best_time_to_contact?: string | null
          timezone?: string | null
          preferred_accommodation_level?: string | null
          dietary_restrictions?: string[] | null
          accessibility_needs?: string[] | null
          special_interests?: string[] | null
          company_name?: string | null
          job_title?: string | null
          is_travel_agent?: boolean | null
          agent_commission_rate?: number | null
          referred_by_client_id?: string | null
          marketing_consent?: boolean | null
          newsletter_subscribed?: boolean | null
          sms_consent?: boolean | null
          total_bookings_count?: number | null
          total_revenue_generated?: number | null
          currency_preference?: string | null
          average_booking_value?: number | null
          tags?: string[] | null
          rating?: number | null
          created_by?: string | null
          last_contacted_at?: string | null
          internal_notes?: string | null
        }
        Update: {
          id?: string
          client_code?: string | null
          full_name?: string | null
          email?: string | null
          phone?: string | null
          whatsapp?: string | null
          nationality?: string | null
          language?: string | null
          address?: string | null
          city?: string | null
          country?: string | null
          status?: string | null
          source?: string | null
          notes?: string | null
          preferences?: Json | null
          created_at?: string | null
          updated_at?: string | null
          tenant_id?: string
          first_name?: string | null
          last_name?: string | null
          client_type?: string | null
          passport_type?: string | null
          preferred_language?: string | null
          client_source?: string | null
          vip_status?: boolean | null
          lead_source?: string | null
          alternative_phone?: string | null
          date_of_birth?: string | null
          address_line1?: string | null
          address_line2?: string | null
          postal_code?: string | null
          preferred_contact_method?: string | null
          best_time_to_contact?: string | null
          timezone?: string | null
          preferred_accommodation_level?: string | null
          dietary_restrictions?: string[] | null
          accessibility_needs?: string[] | null
          special_interests?: string[] | null
          company_name?: string | null
          job_title?: string | null
          is_travel_agent?: boolean | null
          agent_commission_rate?: number | null
          referred_by_client_id?: string | null
          marketing_consent?: boolean | null
          newsletter_subscribed?: boolean | null
          sms_consent?: boolean | null
          total_bookings_count?: number | null
          total_revenue_generated?: number | null
          currency_preference?: string | null
          average_booking_value?: number | null
          tags?: string[] | null
          rating?: number | null
          created_by?: string | null
          last_contacted_at?: string | null
          internal_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          id: string
          tenant_id: string
          itinerary_id: string | null
          supplier_id: string | null
          client_id: string | null
          commission_type: string
          category: string
          source_name: string | null
          source_contact: string | null
          description: string | null
          base_amount: number | null
          commission_rate: number | null
          commission_amount: number
          currency: string
          status: string
          transaction_date: string
          due_date: string | null
          paid_date: string | null
          payment_method: string | null
          payment_reference: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          itinerary_id?: string | null
          supplier_id?: string | null
          client_id?: string | null
          commission_type: string
          category: string
          source_name?: string | null
          source_contact?: string | null
          description?: string | null
          base_amount?: number | null
          commission_rate?: number | null
          commission_amount: number
          currency?: string
          status?: string
          transaction_date: string
          due_date?: string | null
          paid_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          itinerary_id?: string | null
          supplier_id?: string | null
          client_id?: string | null
          commission_type?: string
          category?: string
          source_name?: string | null
          source_contact?: string | null
          description?: string | null
          base_amount?: number | null
          commission_rate?: number | null
          commission_amount?: number
          currency?: string
          status?: string
          transaction_date?: string
          due_date?: string | null
          paid_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_drafts: {
        Row: {
          id: string
          tenant_id: string
          thread_id: string
          inbox_message_id: string
          parent_draft_id: string | null
          draft_body: string
          edited_body: string | null
          was_edited: boolean
          operator_notes: string | null
          ai_model: string | null
          ai_confidence: string | null
          ai_flags: Json | null
          context_used: Json | null
          generation_time_ms: number | null
          status: string
          reviewed_by: string | null
          reviewed_at: string | null
          sent_at: string | null
          send_channel: string | null
          send_message_id: string | null
          send_error: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          thread_id: string
          inbox_message_id: string
          parent_draft_id?: string | null
          draft_body: string
          edited_body?: string | null
          was_edited?: boolean
          operator_notes?: string | null
          ai_model?: string | null
          ai_confidence?: string | null
          ai_flags?: Json | null
          context_used?: Json | null
          generation_time_ms?: number | null
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          sent_at?: string | null
          send_channel?: string | null
          send_message_id?: string | null
          send_error?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          thread_id?: string
          inbox_message_id?: string
          parent_draft_id?: string | null
          draft_body?: string
          edited_body?: string | null
          was_edited?: boolean
          operator_notes?: string | null
          ai_model?: string | null
          ai_confidence?: string | null
          ai_flags?: Json | null
          context_used?: Json | null
          generation_time_ms?: number | null
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          sent_at?: string | null
          send_channel?: string | null
          send_message_id?: string | null
          send_error?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_drafts_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "communication_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_drafts_inbox_message_id_fkey"
            columns: ["inbox_message_id"]
            isOneToOne: false
            referencedRelation: "communication_inbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_drafts_parent_draft_id_fkey"
            columns: ["parent_draft_id"]
            isOneToOne: false
            referencedRelation: "communication_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_history: {
        Row: {
          id: string
          tenant_id: string
          client_id: string
          communication_type: string
          direction: string
          subject: string | null
          content: string
          communication_date: string
          status: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          client_id: string
          communication_type: string
          direction: string
          subject?: string | null
          content: string
          communication_date?: string
          status?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          client_id?: string
          communication_type?: string
          direction?: string
          subject?: string | null
          content?: string
          communication_date?: string
          status?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_inbox: {
        Row: {
          id: string
          tenant_id: string
          thread_id: string
          channel: string
          source_message_id: string
          sender_name: string | null
          sender_contact: string
          message_body: string
          message_snippet: string | null
          subject: string | null
          status: string
          received_at: string
          processed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          thread_id: string
          channel: string
          source_message_id: string
          sender_name?: string | null
          sender_contact: string
          message_body: string
          message_snippet?: string | null
          subject?: string | null
          status?: string
          received_at?: string
          processed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          thread_id?: string
          channel?: string
          source_message_id?: string
          sender_name?: string | null
          sender_contact?: string
          message_body?: string
          message_snippet?: string | null
          subject?: string | null
          status?: string
          received_at?: string
          processed_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_inbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_inbox_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "communication_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_threads: {
        Row: {
          id: string
          tenant_id: string
          channel: string
          whatsapp_conversation_id: string | null
          email_conversation_id: string | null
          client_id: string | null
          client_name: string | null
          contact_info: string
          subject: string | null
          status: string
          urgency: string
          last_message_at: string | null
          last_draft_at: string | null
          message_count: number
          created_at: string
          updated_at: string
          unified_conversation_id: string | null
          brief_id: string | null
          origin: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          channel: string
          whatsapp_conversation_id?: string | null
          email_conversation_id?: string | null
          client_id?: string | null
          client_name?: string | null
          contact_info: string
          subject?: string | null
          status?: string
          urgency?: string
          last_message_at?: string | null
          last_draft_at?: string | null
          message_count?: number
          created_at?: string
          updated_at?: string
          unified_conversation_id?: string | null
          brief_id?: string | null
          origin?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          channel?: string
          whatsapp_conversation_id?: string | null
          email_conversation_id?: string | null
          client_id?: string | null
          client_name?: string | null
          contact_info?: string
          subject?: string | null
          status?: string
          urgency?: string
          last_message_at?: string | null
          last_draft_at?: string | null
          message_count?: number
          created_at?: string
          updated_at?: string
          unified_conversation_id?: string | null
          brief_id?: string | null
          origin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_threads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_threads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_threads_unified_conversation_id_fkey"
            columns: ["unified_conversation_id"]
            isOneToOne: false
            referencedRelation: "unified_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_threads_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "concierge_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      concierge_brand_mappings: {
        Row: {
          id: string
          brand_key: string
          tenant_id: string
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          brand_key: string
          tenant_id: string
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          brand_key?: string
          tenant_id?: string
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "concierge_brand_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      concierge_brief_revisions: {
        Row: {
          id: string
          tenant_id: string | null
          brief_id: string
          conversation_id: string
          brief_revision: number
          is_update: boolean | null
          payload: Json
          request_id: string | null
          received_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          brief_id: string
          conversation_id: string
          brief_revision: number
          is_update?: boolean | null
          payload: Json
          request_id?: string | null
          received_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string | null
          brief_id?: string
          conversation_id?: string
          brief_revision?: number
          is_update?: boolean | null
          payload?: Json
          request_id?: string | null
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "concierge_brief_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concierge_brief_revisions_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "concierge_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      concierge_briefs: {
        Row: {
          id: string
          tenant_id: string | null
          conversation_id: string
          session_id: string | null
          brief_revision: number
          is_update: boolean
          prompt_version: string | null
          language: string | null
          submitted_at: string | null
          received_at: string
          visitor_name: string | null
          visitor_email: string | null
          visitor_phone: string | null
          preferred_contact: string | null
          visitor_timezone: string | null
          travelers_count: number | null
          travelers_detail: string | null
          dates_specific: string | null
          dates_window: string | null
          trip_length_days: number | null
          origin_city: string | null
          nationality: string | null
          international_flights: boolean | null
          destinations: Json | null
          comfort_level: string | null
          interests: Json | null
          must_see: Json | null
          must_avoid: Json | null
          constraint_dietary: string | null
          constraint_mobility: string | null
          constraint_religious: string | null
          constraint_medical: string | null
          brief_summary: string | null
          full_transcript: Json | null
          committed_response_by: string | null
          cairo_time_label: string | null
          visitor_local_label: string | null
          client_id: string | null
          review_status: string
          is_actionable: boolean
          flags: string[]
          raw_payload: Json
          request_id: string | null
          created_at: string
          updated_at: string
          brand: string | null
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          conversation_id: string
          session_id?: string | null
          brief_revision?: number
          is_update?: boolean
          prompt_version?: string | null
          language?: string | null
          submitted_at?: string | null
          received_at?: string
          visitor_name?: string | null
          visitor_email?: string | null
          visitor_phone?: string | null
          preferred_contact?: string | null
          visitor_timezone?: string | null
          travelers_count?: number | null
          travelers_detail?: string | null
          dates_specific?: string | null
          dates_window?: string | null
          trip_length_days?: number | null
          origin_city?: string | null
          nationality?: string | null
          international_flights?: boolean | null
          destinations?: Json | null
          comfort_level?: string | null
          interests?: Json | null
          must_see?: Json | null
          must_avoid?: Json | null
          constraint_dietary?: string | null
          constraint_mobility?: string | null
          constraint_religious?: string | null
          constraint_medical?: string | null
          brief_summary?: string | null
          full_transcript?: Json | null
          committed_response_by?: string | null
          cairo_time_label?: string | null
          visitor_local_label?: string | null
          client_id?: string | null
          review_status?: string
          is_actionable?: boolean
          flags: string[]
          raw_payload: Json
          request_id?: string | null
          created_at?: string
          updated_at?: string
          brand?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string | null
          conversation_id?: string
          session_id?: string | null
          brief_revision?: number
          is_update?: boolean
          prompt_version?: string | null
          language?: string | null
          submitted_at?: string | null
          received_at?: string
          visitor_name?: string | null
          visitor_email?: string | null
          visitor_phone?: string | null
          preferred_contact?: string | null
          visitor_timezone?: string | null
          travelers_count?: number | null
          travelers_detail?: string | null
          dates_specific?: string | null
          dates_window?: string | null
          trip_length_days?: number | null
          origin_city?: string | null
          nationality?: string | null
          international_flights?: boolean | null
          destinations?: Json | null
          comfort_level?: string | null
          interests?: Json | null
          must_see?: Json | null
          must_avoid?: Json | null
          constraint_dietary?: string | null
          constraint_mobility?: string | null
          constraint_religious?: string | null
          constraint_medical?: string | null
          brief_summary?: string | null
          full_transcript?: Json | null
          committed_response_by?: string | null
          cairo_time_label?: string | null
          visitor_local_label?: string | null
          client_id?: string | null
          review_status?: string
          is_actionable?: boolean
          flags?: string[]
          raw_payload?: Json
          request_id?: string | null
          created_at?: string
          updated_at?: string
          brand?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "concierge_briefs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concierge_briefs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      content_categories: {
        Row: {
          id: string
          tenant_id: string
          name: string
          slug: string
          icon: string | null
          created_at: string | null
          is_active: boolean | null
          sort_order: number | null
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          slug: string
          icon?: string | null
          created_at?: string | null
          is_active?: boolean | null
          sort_order?: number | null
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          slug?: string
          icon?: string | null
          created_at?: string | null
          is_active?: boolean | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      content_library: {
        Row: {
          id: string
          tenant_id: string
          category_id: string | null
          name: string
          slug: string | null
          short_description: string | null
          long_description: string | null
          location: string | null
          duration: string | null
          tags: string[] | null
          created_at: string | null
          updated_at: string | null
          is_active: boolean | null
          metadata: Json | null
          created_by: string | null
          updated_by: string | null
          is_cruise: boolean | null
          route: string | null
          tour_type: string | null
          duration_days: number | null
          start_city: string | null
          end_city: string | null
          content_type: string | null
          language: string | null
          title: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          category_id?: string | null
          name: string
          slug?: string | null
          short_description?: string | null
          long_description?: string | null
          location?: string | null
          duration?: string | null
          tags?: string[] | null
          created_at?: string | null
          updated_at?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          created_by?: string | null
          updated_by?: string | null
          is_cruise?: boolean | null
          route?: string | null
          tour_type?: string | null
          duration_days?: number | null
          start_city?: string | null
          end_city?: string | null
          content_type?: string | null
          language?: string | null
          title?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          category_id?: string | null
          name?: string
          slug?: string | null
          short_description?: string | null
          long_description?: string | null
          location?: string | null
          duration?: string | null
          tags?: string[] | null
          created_at?: string | null
          updated_at?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          created_by?: string | null
          updated_by?: string | null
          is_cruise?: boolean | null
          route?: string | null
          tour_type?: string | null
          duration_days?: number | null
          start_city?: string | null
          end_city?: string | null
          content_type?: string | null
          language?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_library_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_library_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "content_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      content_usage_log: {
        Row: {
          id: string
          tenant_id: string | null
          content_id: string
          variation_id: string | null
          itinerary_id: string | null
          context: string
          used_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          content_id: string
          variation_id?: string | null
          itinerary_id?: string | null
          context?: string
          used_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string | null
          content_id?: string
          variation_id?: string | null
          itinerary_id?: string | null
          context?: string
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_usage_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_usage_log_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_usage_log_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "content_variations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_usage_log_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
        ]
      }
      content_variations: {
        Row: {
          id: string
          content_id: string
          tier: string
          title: string | null
          description: string | null
          highlights: string[] | null
          inclusions: string[] | null
          internal_notes: string | null
          is_active: boolean | null
          created_by: string | null
          updated_by: string | null
          created_at: string | null
          updated_at: string | null
          day_by_day: Json | null
          recommended_suppliers: string[] | null
        }
        Insert: {
          id?: string
          content_id: string
          tier: string
          title?: string | null
          description?: string | null
          highlights?: string[] | null
          inclusions?: string[] | null
          internal_notes?: string | null
          is_active?: boolean | null
          created_by?: string | null
          updated_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          day_by_day?: Json | null
          recommended_suppliers?: string[] | null
        }
        Update: {
          id?: string
          content_id?: string
          tier?: string
          title?: string | null
          description?: string | null
          highlights?: string[] | null
          inclusions?: string[] | null
          internal_notes?: string | null
          is_active?: boolean | null
          created_by?: string | null
          updated_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          day_by_day?: Json | null
          recommended_suppliers?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "content_variations_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_library"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_activity: {
        Row: {
          id: string
          conversation_id: string | null
          agent_id: string | null
          team_member_id: string | null
          action_type: string
          action_details: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          conversation_id?: string | null
          agent_id?: string | null
          team_member_id?: string | null
          action_type: string
          action_details?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          conversation_id?: string | null
          agent_id?: string | null
          team_member_id?: string | null
          action_type?: string
          action_details?: Json | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_activity_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "email_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_knowledge: {
        Row: {
          id: string
          tenant_id: string
          source_type: string
          source_whatsapp_message_id: string | null
          metadata: Json
          title: string | null
          query_text: string
          answer_text: string
          parent_id: string | null
          chunk_index: number
          embedding: string | null
          embedding_model: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          source_type: string
          source_whatsapp_message_id?: string | null
          metadata: Json
          title?: string | null
          query_text: string
          answer_text: string
          parent_id?: string | null
          chunk_index?: number
          embedding?: string | null
          embedding_model?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          source_type?: string
          source_whatsapp_message_id?: string | null
          metadata?: Json
          title?: string | null
          query_text?: string
          answer_text?: string
          parent_id?: string | null
          chunk_index?: number
          embedding?: string | null
          embedding_model?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_knowledge_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_knowledge_source_whatsapp_message_id_fkey"
            columns: ["source_whatsapp_message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_knowledge_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "copilot_knowledge"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_settings: {
        Row: {
          id: string
          tenant_id: string
          user_id: string
          tone: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          user_id: string
          tone?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          user_id?: string
          tone?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          id: string
          tenant_id: string | null
          name: string
          description: string | null
          service_types: string[] | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          name: string
          description?: string | null
          service_types?: string[] | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string | null
          name?: string
          description?: string | null
          service_types?: string[] | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      departure_bookings: {
        Row: {
          id: string
          tenant_id: string
          departure_id: string
          client_id: string | null
          booking_name: string | null
          num_adults: number
          num_children: number | null
          status: string
          total_price: number | null
          deposit_paid: number | null
          balance_due: number | null
          special_requests: string | null
          internal_notes: string | null
          booked_at: string | null
          confirmed_at: string | null
          cancelled_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          departure_id: string
          client_id?: string | null
          booking_name?: string | null
          num_adults?: number
          num_children?: number | null
          status?: string
          total_price?: number | null
          deposit_paid?: number | null
          balance_due?: number | null
          special_requests?: string | null
          internal_notes?: string | null
          booked_at?: string | null
          confirmed_at?: string | null
          cancelled_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          departure_id?: string
          client_id?: string | null
          booking_name?: string | null
          num_adults?: number
          num_children?: number | null
          status?: string
          total_price?: number | null
          deposit_paid?: number | null
          balance_due?: number | null
          special_requests?: string | null
          internal_notes?: string | null
          booked_at?: string | null
          confirmed_at?: string | null
          cancelled_at?: string | null
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departure_bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departure_bookings_departure_id_fkey"
            columns: ["departure_id"]
            isOneToOne: false
            referencedRelation: "tour_departures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departure_bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      destination_catalog: {
        Row: {
          id: string
          country_code: string
          name: string
          name_ja: string | null
          is_active: boolean
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          country_code: string
          name: string
          name_ja?: string | null
          is_active?: boolean
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          country_code?: string
          name?: string
          name_ja?: string | null
          is_active?: boolean
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      destination_cities: {
        Row: {
          id: string
          catalog_id: string
          name: string
          name_ja: string | null
          aliases: string[] | null
          lat: number | null
          lng: number | null
          airport_codes: string[] | null
          timezone: string | null
          sort_order: number
          is_active: boolean
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          catalog_id: string
          name: string
          name_ja?: string | null
          aliases?: string[] | null
          lat?: number | null
          lng?: number | null
          airport_codes?: string[] | null
          timezone?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          catalog_id?: string
          name?: string
          name_ja?: string | null
          aliases?: string[] | null
          lat?: number | null
          lng?: number | null
          airport_codes?: string[] | null
          timezone?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "destination_cities_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "destination_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      destinations: {
        Row: {
          id: string
          tenant_id: string
          destination_name: string
          slug: string
          country: string | null
          description: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          destination_name: string
          slug: string
          country?: string | null
          description?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          destination_name?: string
          slug?: string
          country?: string | null
          description?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "destinations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_client_links: {
        Row: {
          id: string
          user_id: string
          message_id: string
          thread_id: string | null
          client_id: string
          email_address: string | null
          auto_linked: boolean
          created_at: string
          updated_at: string
          subject: string | null
          snippet: string | null
          sent_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          message_id: string
          thread_id?: string | null
          client_id: string
          email_address?: string | null
          auto_linked?: boolean
          created_at?: string
          updated_at?: string
          subject?: string | null
          snippet?: string | null
          sent_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          message_id?: string
          thread_id?: string | null
          client_id?: string
          email_address?: string | null
          auto_linked?: boolean
          created_at?: string
          updated_at?: string
          subject?: string | null
          snippet?: string | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_client_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      email_conversations: {
        Row: {
          id: string
          tenant_id: string | null
          thread_id: string
          user_id: string
          client_id: string | null
          client_email: string | null
          client_name: string | null
          subject: string | null
          last_message_snippet: string | null
          last_message_at: string | null
          message_count: number | null
          unread_count: number | null
          status: string | null
          assigned_team_member_id: string | null
          assigned_at: string | null
          is_hidden: boolean | null
          hidden_at: string | null
          hidden_by: string | null
          gmail_history_id: string | null
          emails_synced: number | null
          error_message: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          thread_id: string
          user_id: string
          client_id?: string | null
          client_email?: string | null
          client_name?: string | null
          subject?: string | null
          last_message_snippet?: string | null
          last_message_at?: string | null
          message_count?: number | null
          unread_count?: number | null
          status?: string | null
          assigned_team_member_id?: string | null
          assigned_at?: string | null
          is_hidden?: boolean | null
          hidden_at?: string | null
          hidden_by?: string | null
          gmail_history_id?: string | null
          emails_synced?: number | null
          error_message?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string | null
          thread_id?: string
          user_id?: string
          client_id?: string | null
          client_email?: string | null
          client_name?: string | null
          subject?: string | null
          last_message_snippet?: string | null
          last_message_at?: string | null
          message_count?: number | null
          unread_count?: number | null
          status?: string | null
          assigned_team_member_id?: string | null
          assigned_at?: string | null
          is_hidden?: boolean | null
          hidden_at?: string | null
          hidden_by?: string | null
          gmail_history_id?: string | null
          emails_synced?: number | null
          error_message?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          id: string
          tenant_id: string
          unified_conversation_id: string | null
          gmail_message_id: string
          gmail_thread_id: string | null
          from_email: string
          from_name: string | null
          to_email: string
          to_name: string | null
          cc_emails: string[] | null
          bcc_emails: string[] | null
          subject: string | null
          body_text: string | null
          body_html: string | null
          snippet: string | null
          direction: string
          attachments: Json | null
          labels: string[] | null
          is_read: boolean | null
          is_starred: boolean | null
          is_important: boolean | null
          sent_at: string
          received_at: string | null
          created_at: string | null
          conversation_id: string | null
          message_id: string | null
          thread_id: string | null
          from_address: string | null
          to_addresses: string[] | null
          cc_addresses: string[] | null
          bcc_addresses: string[] | null
          sent_by: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          unified_conversation_id?: string | null
          gmail_message_id: string
          gmail_thread_id?: string | null
          from_email: string
          from_name?: string | null
          to_email: string
          to_name?: string | null
          cc_emails?: string[] | null
          bcc_emails?: string[] | null
          subject?: string | null
          body_text?: string | null
          body_html?: string | null
          snippet?: string | null
          direction: string
          attachments?: Json | null
          labels?: string[] | null
          is_read?: boolean | null
          is_starred?: boolean | null
          is_important?: boolean | null
          sent_at: string
          received_at?: string | null
          created_at?: string | null
          conversation_id?: string | null
          message_id?: string | null
          thread_id?: string | null
          from_address?: string | null
          to_addresses?: string[] | null
          cc_addresses?: string[] | null
          bcc_addresses?: string[] | null
          sent_by?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          unified_conversation_id?: string | null
          gmail_message_id?: string
          gmail_thread_id?: string | null
          from_email?: string
          from_name?: string | null
          to_email?: string
          to_name?: string | null
          cc_emails?: string[] | null
          bcc_emails?: string[] | null
          subject?: string | null
          body_text?: string | null
          body_html?: string | null
          snippet?: string | null
          direction?: string
          attachments?: Json | null
          labels?: string[] | null
          is_read?: boolean | null
          is_starred?: boolean | null
          is_important?: boolean | null
          sent_at?: string
          received_at?: string | null
          created_at?: string | null
          conversation_id?: string | null
          message_id?: string | null
          thread_id?: string | null
          from_address?: string | null
          to_addresses?: string[] | null
          cc_addresses?: string[] | null
          bcc_addresses?: string[] | null
          sent_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_unified_conversation_id_fkey"
            columns: ["unified_conversation_id"]
            isOneToOne: false
            referencedRelation: "unified_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "email_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_signatures: {
        Row: {
          id: string
          tenant_id: string
          user_id: string
          name: string
          content: string
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          user_id: string
          name: string
          content: string
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          user_id?: string
          name?: string
          content?: string
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_signatures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sync_state: {
        Row: {
          id: string
          user_id: string
          sync_status: string | null
          last_history_id: string | null
          last_full_sync_at: string | null
          last_incremental_sync_at: string | null
          emails_synced: number | null
          error_message: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          sync_status?: string | null
          last_history_id?: string | null
          last_full_sync_at?: string | null
          last_incremental_sync_at?: string | null
          emails_synced?: number | null
          error_message?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          sync_status?: string | null
          last_history_id?: string | null
          last_full_sync_at?: string | null
          last_incremental_sync_at?: string | null
          emails_synced?: number | null
          error_message?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      entrance_fees: {
        Row: {
          rate_currency: string | null
          id: string
          tenant_id: string | null
          service_code: string | null
          attraction_name: string
          city: string
          category: string | null
          fee_type: string | null
          eur_rate: number | null
          non_eur_rate: number | null
          egyptian_rate: number | null
          student_discount_percentage: number | null
          child_discount_percent: number | null
          season: string | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          notes: string | null
          is_active: boolean | null
          is_addon: boolean | null
          addon_note: string | null
          supplier_id: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string | null
          service_code?: string | null
          attraction_name: string
          city: string
          category?: string | null
          fee_type?: string | null
          eur_rate?: number | null
          non_eur_rate?: number | null
          egyptian_rate?: number | null
          student_discount_percentage?: number | null
          child_discount_percent?: number | null
          season?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          notes?: string | null
          is_active?: boolean | null
          is_addon?: boolean | null
          addon_note?: string | null
          supplier_id?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string | null
          service_code?: string | null
          attraction_name?: string
          city?: string
          category?: string | null
          fee_type?: string | null
          eur_rate?: number | null
          non_eur_rate?: number | null
          egyptian_rate?: number | null
          student_discount_percentage?: number | null
          child_discount_percent?: number | null
          season?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          notes?: string | null
          is_active?: boolean | null
          is_addon?: boolean | null
          addon_note?: string | null
          supplier_id?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entrance_fees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrance_fees_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rate_snapshots: {
        Row: {
          id: string
          base_currency: string
          target_currency: string
          rate: number
          source: string
          captured_at: string
          created_at: string | null
        }
        Insert: {
          id?: string
          base_currency: string
          target_currency: string
          rate: number
          source?: string
          captured_at?: string
          created_at?: string | null
        }
        Update: {
          id?: string
          base_currency?: string
          target_currency?: string
          rate?: number
          source?: string
          captured_at?: string
          created_at?: string | null
        }
        Relationships: []
      }
      exchange_rates: {
        Row: {
          id: string
          tenant_id: string | null
          base_currency: string
          target_currency: string
          rate: number
          is_active: boolean | null
          last_updated_at: string | null
          created_at: string | null
          updated_at: string | null
          source: string | null
          api_fetched_at: string | null
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          base_currency?: string
          target_currency: string
          rate: number
          is_active?: boolean | null
          last_updated_at?: string | null
          created_at?: string | null
          updated_at?: string | null
          source?: string | null
          api_fetched_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string | null
          base_currency?: string
          target_currency?: string
          rate?: number
          is_active?: boolean | null
          last_updated_at?: string | null
          created_at?: string | null
          updated_at?: string | null
          source?: string | null
          api_fetched_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          id: string
          tenant_id: string
          expense_number: string
          itinerary_id: string | null
          supplier_id: string | null
          category: string
          description: string | null
          amount: number
          currency: string
          expense_date: string
          supplier_name: string | null
          supplier_type: string | null
          receipt_url: string | null
          receipt_filename: string | null
          status: string
          payment_method: string | null
          payment_date: string | null
          payment_reference: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          expense_number: string
          itinerary_id?: string | null
          supplier_id?: string | null
          category: string
          description?: string | null
          amount: number
          currency?: string
          expense_date: string
          supplier_name?: string | null
          supplier_type?: string | null
          receipt_url?: string | null
          receipt_filename?: string | null
          status?: string
          payment_method?: string | null
          payment_date?: string | null
          payment_reference?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          expense_number?: string
          itinerary_id?: string | null
          supplier_id?: string | null
          category?: string
          description?: string | null
          amount?: number
          currency?: string
          expense_date?: string
          supplier_name?: string | null
          supplier_type?: string | null
          receipt_url?: string | null
          receipt_filename?: string | null
          status?: string
          payment_method?: string | null
          payment_date?: string | null
          payment_reference?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      fail_open_events: {
        Row: {
          id: string
          tenant_id: string | null
          metric: string
          reason: string
          detail: string | null
          occurred_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          metric: string
          reason: string
          detail?: string | null
          occurred_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string | null
          metric?: string
          reason?: string
          detail?: string | null
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fail_open_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_daily_costs: {
        Row: {
          rate_currency: string | null
          id: string
          tenant_id: string | null
          cost_type: string
          cost_per_person_per_day: number
          description: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string | null
          cost_type: string
          cost_per_person_per_day?: number
          description?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string | null
          cost_type?: string
          cost_per_person_per_day?: number
          description?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_daily_costs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_rates: {
        Row: {
          rate_currency: string | null
          id: string
          tenant_id: string | null
          service_code: string | null
          route_from: string
          route_to: string
          route_name: string | null
          airline: string
          airline_code: string | null
          flight_number: string | null
          flight_type: string | null
          cabin_class: string | null
          departure_time: string | null
          arrival_time: string | null
          duration_minutes: number | null
          frequency: string | null
          base_rate_eur: number
          tax_eur: number | null
          base_rate_non_eur: number | null
          tax_non_eur: number | null
          baggage_kg: number | null
          carry_on_kg: number | null
          season: string | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          supplier_id: string | null
          supplier_name: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string | null
          service_code?: string | null
          route_from: string
          route_to: string
          route_name?: string | null
          airline: string
          airline_code?: string | null
          flight_number?: string | null
          flight_type?: string | null
          cabin_class?: string | null
          departure_time?: string | null
          arrival_time?: string | null
          duration_minutes?: number | null
          frequency?: string | null
          base_rate_eur?: number
          tax_eur?: number | null
          base_rate_non_eur?: number | null
          tax_non_eur?: number | null
          baggage_kg?: number | null
          carry_on_kg?: number | null
          season?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string | null
          service_code?: string | null
          route_from?: string
          route_to?: string
          route_name?: string | null
          airline?: string
          airline_code?: string | null
          flight_number?: string | null
          flight_type?: string | null
          cabin_class?: string | null
          departure_time?: string | null
          arrival_time?: string | null
          duration_minutes?: number | null
          frequency?: string | null
          base_rate_eur?: number
          tax_eur?: number | null
          base_rate_non_eur?: number | null
          tax_non_eur?: number | null
          baggage_kg?: number | null
          carry_on_kg?: number | null
          season?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flight_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          id: string
          tenant_id: string
          client_id: string
          title: string
          description: string | null
          due_date: string
          priority: string
          status: string
          assigned_to: string | null
          completed_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          client_id: string
          title: string
          description?: string | null
          due_date: string
          priority?: string
          status?: string
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          client_id?: string
          title?: string
          description?: string | null
          due_date?: string
          priority?: string
          status?: string
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_tokens: {
        Row: {
          id: string
          tenant_id: string | null
          user_id: string | null
          access_token: string
          refresh_token: string | null
          token_type: string | null
          expiry_date: string | null
          email_address: string | null
          created_at: string | null
          updated_at: string | null
          email: string | null
          token_expiry: string | null
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          user_id?: string | null
          access_token: string
          refresh_token?: string | null
          token_type?: string | null
          expiry_date?: string | null
          email_address?: string | null
          created_at?: string | null
          updated_at?: string | null
          email?: string | null
          token_expiry?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string | null
          user_id?: string | null
          access_token?: string
          refresh_token?: string | null
          token_type?: string | null
          expiry_date?: string | null
          email_address?: string | null
          created_at?: string | null
          updated_at?: string | null
          email?: string | null
          token_expiry?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gmail_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      guide_rates: {
        Row: {
          rate_currency: string | null
          id: string
          tenant_id: string
          guide_type: string | null
          city: string | null
          half_day_rate: number | null
          full_day_rate: number | null
          created_at: string | null
          service_code: string | null
          guide_language: string | null
          tour_duration: string | null
          base_rate_eur: number | null
          base_rate_non_eur: number | null
          season: string | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          supplier_id: string | null
          notes: string | null
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          rate_currency?: string | null
          id?: string
          tenant_id: string
          guide_type?: string | null
          city?: string | null
          half_day_rate?: number | null
          full_day_rate?: number | null
          created_at?: string | null
          service_code?: string | null
          guide_language?: string | null
          tour_duration?: string | null
          base_rate_eur?: number | null
          base_rate_non_eur?: number | null
          season?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          supplier_id?: string | null
          notes?: string | null
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string
          guide_type?: string | null
          city?: string | null
          half_day_rate?: number | null
          full_day_rate?: number | null
          created_at?: string | null
          service_code?: string | null
          guide_language?: string | null
          tour_duration?: string | null
          base_rate_eur?: number | null
          base_rate_non_eur?: number | null
          season?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          supplier_id?: string | null
          notes?: string | null
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guide_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guide_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      guides: {
        Row: {
          rate_currency: string | null
          id: string
          guide_code: string | null
          full_name: string
          email: string | null
          phone: string | null
          whatsapp: string | null
          languages: string[] | null
          license_number: string | null
          specializations: string[] | null
          daily_rate: number | null
          half_day_rate: number | null
          is_active: boolean | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          tenant_id: string
          name: string | null
          specialties: string[] | null
          certification_number: string | null
          license_expiry: string | null
          max_group_size: number | null
          hourly_rate: number | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          address: string | null
          profile_photo_url: string | null
          tier: string | null
          is_preferred: boolean | null
          city: string | null
          team_member_id: string | null
        }
        Insert: {
          rate_currency?: string | null
          id?: string
          guide_code?: string | null
          full_name: string
          email?: string | null
          phone?: string | null
          whatsapp?: string | null
          languages?: string[] | null
          license_number?: string | null
          specializations?: string[] | null
          daily_rate?: number | null
          half_day_rate?: number | null
          is_active?: boolean | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          tenant_id: string
          name?: string | null
          specialties?: string[] | null
          certification_number?: string | null
          license_expiry?: string | null
          max_group_size?: number | null
          hourly_rate?: number | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          address?: string | null
          profile_photo_url?: string | null
          tier?: string | null
          is_preferred?: boolean | null
          city?: string | null
          team_member_id?: string | null
        }
        Update: {
          rate_currency?: string | null
          id?: string
          guide_code?: string | null
          full_name?: string
          email?: string | null
          phone?: string | null
          whatsapp?: string | null
          languages?: string[] | null
          license_number?: string | null
          specializations?: string[] | null
          daily_rate?: number | null
          half_day_rate?: number | null
          is_active?: boolean | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          tenant_id?: string
          name?: string | null
          specialties?: string[] | null
          certification_number?: string | null
          license_expiry?: string | null
          max_group_size?: number | null
          hourly_rate?: number | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          address?: string | null
          profile_photo_url?: string | null
          tier?: string | null
          is_preferred?: boolean | null
          city?: string | null
          team_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guides_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_contacts: {
        Row: {
          id: string
          tenant_id: string
          name: string
          city: string | null
          address: string | null
          contact_phone: string | null
          contact_email: string | null
          contact_person: string | null
          star_rating: string | null
          tier: string | null
          property_type: string | null
          is_preferred: boolean | null
          is_active: boolean | null
          amenities: string[] | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          capacity: number | null
          rate_single_eur: number | null
          rate_double_eur: number | null
          rate_triple_eur: number | null
          rate_single_non_eur: number | null
          rate_double_non_eur: number | null
          rate_triple_non_eur: number | null
          rate_suite_eur: number | null
          rate_suite_non_eur: number | null
          high_season_markup_percent: number | null
          peak_season_markup_percent: number | null
          breakfast_included: boolean | null
          breakfast_rate_eur: number | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          meal_plan: string | null
          child_policy: string | null
          low_season_from: string | null
          low_season_to: string | null
          high_season_from: string | null
          high_season_to: string | null
          peak_season_from: string | null
          peak_season_to: string | null
          peak_season_2_from: string | null
          peak_season_2_to: string | null
          contact_name: string | null
          reservations_email: string | null
          reservations_phone: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          city?: string | null
          address?: string | null
          contact_phone?: string | null
          contact_email?: string | null
          contact_person?: string | null
          star_rating?: string | null
          tier?: string | null
          property_type?: string | null
          is_preferred?: boolean | null
          is_active?: boolean | null
          amenities?: string[] | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          capacity?: number | null
          rate_single_eur?: number | null
          rate_double_eur?: number | null
          rate_triple_eur?: number | null
          rate_single_non_eur?: number | null
          rate_double_non_eur?: number | null
          rate_triple_non_eur?: number | null
          rate_suite_eur?: number | null
          rate_suite_non_eur?: number | null
          high_season_markup_percent?: number | null
          peak_season_markup_percent?: number | null
          breakfast_included?: boolean | null
          breakfast_rate_eur?: number | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          meal_plan?: string | null
          child_policy?: string | null
          low_season_from?: string | null
          low_season_to?: string | null
          high_season_from?: string | null
          high_season_to?: string | null
          peak_season_from?: string | null
          peak_season_to?: string | null
          peak_season_2_from?: string | null
          peak_season_2_to?: string | null
          contact_name?: string | null
          reservations_email?: string | null
          reservations_phone?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          city?: string | null
          address?: string | null
          contact_phone?: string | null
          contact_email?: string | null
          contact_person?: string | null
          star_rating?: string | null
          tier?: string | null
          property_type?: string | null
          is_preferred?: boolean | null
          is_active?: boolean | null
          amenities?: string[] | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          capacity?: number | null
          rate_single_eur?: number | null
          rate_double_eur?: number | null
          rate_triple_eur?: number | null
          rate_single_non_eur?: number | null
          rate_double_non_eur?: number | null
          rate_triple_non_eur?: number | null
          rate_suite_eur?: number | null
          rate_suite_non_eur?: number | null
          high_season_markup_percent?: number | null
          peak_season_markup_percent?: number | null
          breakfast_included?: boolean | null
          breakfast_rate_eur?: number | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          meal_plan?: string | null
          child_policy?: string | null
          low_season_from?: string | null
          low_season_to?: string | null
          high_season_from?: string | null
          high_season_to?: string | null
          peak_season_from?: string | null
          peak_season_to?: string | null
          peak_season_2_from?: string | null
          peak_season_2_to?: string | null
          contact_name?: string | null
          reservations_email?: string | null
          reservations_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_staff: {
        Row: {
          id: string
          tenant_id: string
          name: string
          role: string | null
          hotel_id: string | null
          phone: string
          whatsapp: string | null
          email: string | null
          languages: string[] | null
          shift_times: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          team_member_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          role?: string | null
          hotel_id?: string | null
          phone: string
          whatsapp?: string | null
          email?: string | null
          languages?: string[] | null
          shift_times?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          team_member_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          role?: string | null
          hotel_id?: string | null
          phone?: string
          whatsapp?: string | null
          email?: string | null
          languages?: string[] | null
          shift_times?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          team_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_staff_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_staff_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotel_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_staff_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_staff_rates: {
        Row: {
          rate_currency: string | null
          id: string
          tenant_id: string | null
          service_code: string | null
          service_type: string
          hotel_category: string | null
          rate_eur: number
          description: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          destination: string | null
        }
        Insert: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string | null
          service_code?: string | null
          service_type?: string
          hotel_category?: string | null
          rate_eur?: number
          description?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          destination?: string | null
        }
        Update: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string | null
          service_code?: string | null
          service_type?: string
          hotel_category?: string | null
          rate_eur?: number
          description?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          destination?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_staff_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          id: string
          tenant_id: string
          invoice_id: string
          amount: number
          currency: string
          payment_method: string
          payment_date: string
          transaction_reference: string | null
          notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          invoice_id: string
          amount: number
          currency?: string
          payment_method?: string
          payment_date: string
          transaction_reference?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          invoice_id?: string
          amount?: number
          currency?: string
          payment_method?: string
          payment_date?: string
          transaction_reference?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reminders: {
        Row: {
          id: string
          tenant_id: string
          invoice_id: string
          reminder_type: string
          recipient_email: string
          subject: string
          status: string
          error_message: string | null
          sent_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          invoice_id: string
          reminder_type: string
          recipient_email: string
          subject: string
          status?: string
          error_message?: string | null
          sent_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          invoice_id?: string
          reminder_type?: string
          recipient_email?: string
          subject?: string
          status?: string
          error_message?: string | null
          sent_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reminders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          id: string
          tenant_id: string
          invoice_number: string
          invoice_type: string
          deposit_percent: number | null
          parent_invoice_id: string | null
          client_id: string | null
          itinerary_id: string | null
          client_name: string
          client_email: string | null
          line_items: Json
          subtotal: number
          tax_rate: number | null
          tax_amount: number | null
          discount_amount: number | null
          total_amount: number
          currency: string
          amount_paid: number
          balance_due: number
          status: string
          issue_date: string
          due_date: string | null
          sent_at: string | null
          paid_at: string | null
          payment_terms: string | null
          payment_instructions: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          last_reminder_sent: string | null
          reminder_count: number | null
          next_reminder_date: string | null
          reminder_paused: boolean | null
          created_by: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          invoice_number: string
          invoice_type?: string
          deposit_percent?: number | null
          parent_invoice_id?: string | null
          client_id?: string | null
          itinerary_id?: string | null
          client_name: string
          client_email?: string | null
          line_items: Json
          subtotal?: number
          tax_rate?: number | null
          tax_amount?: number | null
          discount_amount?: number | null
          total_amount: number
          currency?: string
          amount_paid?: number
          balance_due: number
          status?: string
          issue_date: string
          due_date?: string | null
          sent_at?: string | null
          paid_at?: string | null
          payment_terms?: string | null
          payment_instructions?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          last_reminder_sent?: string | null
          reminder_count?: number | null
          next_reminder_date?: string | null
          reminder_paused?: boolean | null
          created_by?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          invoice_number?: string
          invoice_type?: string
          deposit_percent?: number | null
          parent_invoice_id?: string | null
          client_id?: string | null
          itinerary_id?: string | null
          client_name?: string
          client_email?: string | null
          line_items?: Json
          subtotal?: number
          tax_rate?: number | null
          tax_amount?: number | null
          discount_amount?: number | null
          total_amount?: number
          currency?: string
          amount_paid?: number
          balance_due?: number
          status?: string
          issue_date?: string
          due_date?: string | null
          sent_at?: string | null
          paid_at?: string | null
          payment_terms?: string | null
          payment_instructions?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          last_reminder_sent?: string | null
          reminder_count?: number | null
          next_reminder_date?: string | null
          reminder_paused?: boolean | null
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
        ]
      }
      itineraries: {
        Row: {
          fx_frozen: Json | null
          id: string
          itinerary_code: string
          client_id: string | null
          client_name: string | null
          client_email: string | null
          client_phone: string | null
          trip_name: string | null
          travel_date: string | null
          start_date: string | null
          end_date: string | null
          total_days: number | null
          num_adults: number | null
          num_children: number | null
          package_type: string | null
          tier: string | null
          total_cost: number | null
          supplier_cost: number | null
          profit: number | null
          margin_percent: number | null
          selling_price: number | null
          currency: string | null
          status: string | null
          notes: string | null
          internal_notes: string | null
          pdf_url: string | null
          created_at: string | null
          updated_at: string | null
          tenant_id: string
          source: string | null
          source_conversation: string | null
          ai_model: string | null
          generation_mode: string | null
          cost_mode: string | null
          total_revenue: number | null
          cabin_allocation: Json | null
          nationality: string | null
          language: string | null
          is_euro_passport: boolean | null
          num_infants: number | null
          cancelled_at: string | null
          cancellation_reason: string | null
          user_id: string | null
          payment_status: string | null
          total_paid: number | null
          deposit_amount: number | null
          balance_due: number | null
          assigned_guide_id: string | null
          assigned_vehicle_id: string | null
          guide_notes: string | null
          vehicle_notes: string | null
          pickup_location: string | null
          pickup_time: string | null
          destinations: string[] | null
          num_travelers: number | null
          assigned_hotel_id: string | null
          assigned_restaurant_id: string | null
          assigned_airport_staff_id: string | null
          assigned_hotel_staff_id: string | null
          hotel_notes: string | null
          restaurant_notes: string | null
          airport_staff_notes: string | null
          hotel_staff_notes: string | null
          partner_id: string | null
          partner_commission_percent: number | null
          partner_commission_amount: number | null
          inclusions: string[] | null
          exclusions: string[] | null
          idempotency_key: string | null
          generation_warnings: Json | null
          thread_id: string | null
          assigned_to: string | null
        }
        Insert: {
          fx_frozen?: Json | null
          id?: string
          itinerary_code: string
          client_id?: string | null
          client_name?: string | null
          client_email?: string | null
          client_phone?: string | null
          trip_name?: string | null
          travel_date?: string | null
          start_date?: string | null
          end_date?: string | null
          total_days?: number | null
          num_adults?: number | null
          num_children?: number | null
          package_type?: string | null
          tier?: string | null
          total_cost?: number | null
          supplier_cost?: number | null
          profit?: number | null
          margin_percent?: number | null
          selling_price?: number | null
          currency?: string | null
          status?: string | null
          notes?: string | null
          internal_notes?: string | null
          pdf_url?: string | null
          created_at?: string | null
          updated_at?: string | null
          tenant_id: string
          source?: string | null
          source_conversation?: string | null
          ai_model?: string | null
          generation_mode?: string | null
          cost_mode?: string | null
          total_revenue?: number | null
          cabin_allocation?: Json | null
          nationality?: string | null
          language?: string | null
          is_euro_passport?: boolean | null
          num_infants?: number | null
          cancelled_at?: string | null
          cancellation_reason?: string | null
          user_id?: string | null
          payment_status?: string | null
          total_paid?: number | null
          deposit_amount?: number | null
          balance_due?: number | null
          assigned_guide_id?: string | null
          assigned_vehicle_id?: string | null
          guide_notes?: string | null
          vehicle_notes?: string | null
          pickup_location?: string | null
          pickup_time?: string | null
          destinations?: string[] | null
          num_travelers?: number | null
          assigned_hotel_id?: string | null
          assigned_restaurant_id?: string | null
          assigned_airport_staff_id?: string | null
          assigned_hotel_staff_id?: string | null
          hotel_notes?: string | null
          restaurant_notes?: string | null
          airport_staff_notes?: string | null
          hotel_staff_notes?: string | null
          partner_id?: string | null
          partner_commission_percent?: number | null
          partner_commission_amount?: number | null
          inclusions?: string[] | null
          exclusions?: string[] | null
          idempotency_key?: string | null
          generation_warnings?: Json | null
          thread_id?: string | null
          assigned_to?: string | null
        }
        Update: {
          fx_frozen?: Json | null
          id?: string
          itinerary_code?: string
          client_id?: string | null
          client_name?: string | null
          client_email?: string | null
          client_phone?: string | null
          trip_name?: string | null
          travel_date?: string | null
          start_date?: string | null
          end_date?: string | null
          total_days?: number | null
          num_adults?: number | null
          num_children?: number | null
          package_type?: string | null
          tier?: string | null
          total_cost?: number | null
          supplier_cost?: number | null
          profit?: number | null
          margin_percent?: number | null
          selling_price?: number | null
          currency?: string | null
          status?: string | null
          notes?: string | null
          internal_notes?: string | null
          pdf_url?: string | null
          created_at?: string | null
          updated_at?: string | null
          tenant_id?: string
          source?: string | null
          source_conversation?: string | null
          ai_model?: string | null
          generation_mode?: string | null
          cost_mode?: string | null
          total_revenue?: number | null
          cabin_allocation?: Json | null
          nationality?: string | null
          language?: string | null
          is_euro_passport?: boolean | null
          num_infants?: number | null
          cancelled_at?: string | null
          cancellation_reason?: string | null
          user_id?: string | null
          payment_status?: string | null
          total_paid?: number | null
          deposit_amount?: number | null
          balance_due?: number | null
          assigned_guide_id?: string | null
          assigned_vehicle_id?: string | null
          guide_notes?: string | null
          vehicle_notes?: string | null
          pickup_location?: string | null
          pickup_time?: string | null
          destinations?: string[] | null
          num_travelers?: number | null
          assigned_hotel_id?: string | null
          assigned_restaurant_id?: string | null
          assigned_airport_staff_id?: string | null
          assigned_hotel_staff_id?: string | null
          hotel_notes?: string | null
          restaurant_notes?: string | null
          airport_staff_notes?: string | null
          hotel_staff_notes?: string | null
          partner_id?: string | null
          partner_commission_percent?: number | null
          partner_commission_amount?: number | null
          inclusions?: string[] | null
          exclusions?: string[] | null
          idempotency_key?: string | null
          generation_warnings?: Json | null
          thread_id?: string | null
          assigned_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itineraries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itineraries_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "communication_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itineraries_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_days: {
        Row: {
          id: string
          itinerary_id: string
          day_number: number
          date: string | null
          title: string | null
          description: string | null
          city: string | null
          overnight_city: string | null
          is_arrival: boolean | null
          is_departure: boolean | null
          is_free_day: boolean | null
          guide_required: boolean | null
          transport_type: string | null
          accommodation_type: string | null
          hotel_id: string | null
          hotel_name: string | null
          created_at: string | null
          updated_at: string | null
          tenant_id: string
          attractions: string[] | null
          lunch_included: boolean | null
          dinner_included: boolean | null
          hotel_included: boolean | null
          flight_from: string | null
          is_cruise_day: boolean | null
          is_sailing_day: boolean | null
          is_transfer_only: boolean | null
          flight_to: string | null
        }
        Insert: {
          id?: string
          itinerary_id: string
          day_number: number
          date?: string | null
          title?: string | null
          description?: string | null
          city?: string | null
          overnight_city?: string | null
          is_arrival?: boolean | null
          is_departure?: boolean | null
          is_free_day?: boolean | null
          guide_required?: boolean | null
          transport_type?: string | null
          accommodation_type?: string | null
          hotel_id?: string | null
          hotel_name?: string | null
          created_at?: string | null
          updated_at?: string | null
          tenant_id: string
          attractions?: string[] | null
          lunch_included?: boolean | null
          dinner_included?: boolean | null
          hotel_included?: boolean | null
          flight_from?: string | null
          is_cruise_day?: boolean | null
          is_sailing_day?: boolean | null
          is_transfer_only?: boolean | null
          flight_to?: string | null
        }
        Update: {
          id?: string
          itinerary_id?: string
          day_number?: number
          date?: string | null
          title?: string | null
          description?: string | null
          city?: string | null
          overnight_city?: string | null
          is_arrival?: boolean | null
          is_departure?: boolean | null
          is_free_day?: boolean | null
          guide_required?: boolean | null
          transport_type?: string | null
          accommodation_type?: string | null
          hotel_id?: string | null
          hotel_name?: string | null
          created_at?: string | null
          updated_at?: string | null
          tenant_id?: string
          attractions?: string[] | null
          lunch_included?: boolean | null
          dinner_included?: boolean | null
          hotel_included?: boolean | null
          flight_from?: string | null
          is_cruise_day?: boolean | null
          is_sailing_day?: boolean | null
          is_transfer_only?: boolean | null
          flight_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_days_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_days_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_resources: {
        Row: {
          id: string
          tenant_id: string
          itinerary_id: string
          itinerary_day_id: string | null
          resource_type: string
          resource_id: string
          resource_name: string | null
          start_date: string
          end_date: string
          notes: string | null
          quantity: number
          cost_eur: number | null
          cost_non_eur: number | null
          status: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          itinerary_id: string
          itinerary_day_id?: string | null
          resource_type: string
          resource_id: string
          resource_name?: string | null
          start_date: string
          end_date: string
          notes?: string | null
          quantity?: number
          cost_eur?: number | null
          cost_non_eur?: number | null
          status?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          itinerary_id?: string
          itinerary_day_id?: string | null
          resource_type?: string
          resource_id?: string
          resource_name?: string | null
          start_date?: string
          end_date?: string
          notes?: string | null
          quantity?: number
          cost_eur?: number | null
          cost_non_eur?: number | null
          status?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_resources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_resources_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_services: {
        Row: {
          id: string
          itinerary_id: string | null
          day_id: string | null
          service_type: string | null
          service_name: string
          description: string | null
          supplier_id: string | null
          supplier_name: string | null
          quantity: number | null
          unit_cost: number | null
          total_cost: number | null
          service_date: string | null
          is_included: boolean | null
          created_at: string | null
          updated_at: string | null
          tenant_id: string
          client_price: number | null
          rate_eur: number | null
          rate_non_eur: number | null
          notes: string | null
          itinerary_day_id: string | null
          commission_percent: number | null
          commission_amount: number | null
          commission_status: string | null
          is_preferred_supplier: boolean | null
          vehicle_type: string | null
          is_optional: boolean | null
          service_code: string | null
          selling_price: number | null
          cost: number | null
          currency: string | null
          commission_rate: number | null
          pickup_location: string | null
          dropoff_location: string | null
          pickup_time: string | null
          supplier_currency: string | null
          supplier_cost_original: number | null
          exchange_rate_used: number | null
          cost_per_unit: number | null
        }
        Insert: {
          id?: string
          itinerary_id?: string | null
          day_id?: string | null
          service_type?: string | null
          service_name: string
          description?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          quantity?: number | null
          unit_cost?: number | null
          total_cost?: number | null
          service_date?: string | null
          is_included?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          tenant_id: string
          client_price?: number | null
          rate_eur?: number | null
          rate_non_eur?: number | null
          notes?: string | null
          itinerary_day_id?: string | null
          commission_percent?: number | null
          commission_amount?: number | null
          commission_status?: string | null
          is_preferred_supplier?: boolean | null
          vehicle_type?: string | null
          is_optional?: boolean | null
          service_code?: string | null
          selling_price?: number | null
          cost?: number | null
          currency?: string | null
          commission_rate?: number | null
          pickup_location?: string | null
          dropoff_location?: string | null
          pickup_time?: string | null
          supplier_currency?: string | null
          supplier_cost_original?: number | null
          exchange_rate_used?: number | null
          cost_per_unit?: number | null
        }
        Update: {
          id?: string
          itinerary_id?: string | null
          day_id?: string | null
          service_type?: string | null
          service_name?: string
          description?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          quantity?: number | null
          unit_cost?: number | null
          total_cost?: number | null
          service_date?: string | null
          is_included?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          tenant_id?: string
          client_price?: number | null
          rate_eur?: number | null
          rate_non_eur?: number | null
          notes?: string | null
          itinerary_day_id?: string | null
          commission_percent?: number | null
          commission_amount?: number | null
          commission_status?: string | null
          is_preferred_supplier?: boolean | null
          vehicle_type?: string | null
          is_optional?: boolean | null
          service_code?: string | null
          selling_price?: number | null
          cost?: number | null
          currency?: string | null
          commission_rate?: number | null
          pickup_location?: string | null
          dropoff_location?: string | null
          pickup_time?: string | null
          supplier_currency?: string | null
          supplier_cost_original?: number | null
          exchange_rate_used?: number | null
          cost_per_unit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_services_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_services_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "itinerary_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_services_itinerary_day_id_fkey"
            columns: ["itinerary_day_id"]
            isOneToOne: false
            referencedRelation: "itinerary_days"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_shares: {
        Row: {
          id: string
          tenant_id: string
          itinerary_id: string
          token: string
          created_by: string | null
          created_at: string
          revoked_at: string | null
          view_count: number
          last_viewed_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          itinerary_id: string
          token: string
          created_by?: string | null
          created_at?: string
          revoked_at?: string | null
          view_count?: number
          last_viewed_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          itinerary_id?: string
          token?: string
          created_by?: string | null
          created_at?: string
          revoked_at?: string | null
          view_count?: number
          last_viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_shares_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_shares_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_rates: {
        Row: {
          rate_currency: string | null
          id: string
          tenant_id: string
          restaurant_name: string | null
          meal_type: string | null
          tier: string | null
          city: string | null
          base_rate_eur: number | null
          base_rate_non_eur: number | null
          created_at: string | null
          service_code: string | null
          cuisine_type: string | null
          restaurant_type: string | null
          season: string | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          supplier_id: string | null
          supplier_name: string | null
          meal_category: string | null
          dietary_options: Json | null
          per_person_rate: boolean | null
          minimum_pax: number | null
          notes: string | null
          is_active: boolean | null
          updated_at: string | null
          is_preferred: boolean | null
        }
        Insert: {
          rate_currency?: string | null
          id?: string
          tenant_id: string
          restaurant_name?: string | null
          meal_type?: string | null
          tier?: string | null
          city?: string | null
          base_rate_eur?: number | null
          base_rate_non_eur?: number | null
          created_at?: string | null
          service_code?: string | null
          cuisine_type?: string | null
          restaurant_type?: string | null
          season?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          meal_category?: string | null
          dietary_options?: Json | null
          per_person_rate?: boolean | null
          minimum_pax?: number | null
          notes?: string | null
          is_active?: boolean | null
          updated_at?: string | null
          is_preferred?: boolean | null
        }
        Update: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string
          restaurant_name?: string | null
          meal_type?: string | null
          tier?: string | null
          city?: string | null
          base_rate_eur?: number | null
          base_rate_non_eur?: number | null
          created_at?: string | null
          service_code?: string | null
          cuisine_type?: string | null
          restaurant_type?: string | null
          season?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          meal_category?: string | null
          dietary_options?: Json | null
          per_person_rate?: boolean | null
          minimum_pax?: number | null
          notes?: string | null
          is_active?: boolean | null
          updated_at?: string | null
          is_preferred?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          id: string
          tenant_id: string
          name: string
          category: string | null
          channel: string | null
          subject: string | null
          body: string
          variables: Json | null
          is_active: boolean | null
          usage_count: number | null
          last_used_at: string | null
          created_at: string | null
          updated_at: string | null
          description: string | null
          subcategory: string | null
          placeholders: string[] | null
          version: number | null
          last_modified_by: string | null
          language: string | null
          parent_template_id: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          category?: string | null
          channel?: string | null
          subject?: string | null
          body: string
          variables?: Json | null
          is_active?: boolean | null
          usage_count?: number | null
          last_used_at?: string | null
          created_at?: string | null
          updated_at?: string | null
          description?: string | null
          subcategory?: string | null
          placeholders?: string[] | null
          version?: number | null
          last_modified_by?: string | null
          language?: string | null
          parent_template_id?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          category?: string | null
          channel?: string | null
          subject?: string | null
          body?: string
          variables?: Json | null
          is_active?: boolean | null
          usage_count?: number | null
          last_used_at?: string | null
          created_at?: string | null
          updated_at?: string | null
          description?: string | null
          subcategory?: string | null
          placeholders?: string[] | null
          version?: number | null
          last_modified_by?: string | null
          language?: string | null
          parent_template_id?: string | null
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_templates_parent_template_id_fkey"
            columns: ["parent_template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      nile_cruises: {
        Row: {
          rate_currency: string | null
          id: string
          tenant_id: string
          ship_name: string
          cabin_type: string | null
          rate_low_season: number | null
          rate_high_season: number | null
          rate_peak_season: number | null
          created_at: string | null
          ppd_eur: number | null
          ppd_non_eur: number | null
          single_supplement_eur: number | null
          single_supplement_non_eur: number | null
          triple_reduction_eur: number | null
          triple_reduction_non_eur: number | null
          supplements: Json | null
          high_season_ppd_eur: number | null
          high_season_ppd_non_eur: number | null
          high_season_single_supplement_eur: number | null
          high_season_single_supplement_non_eur: number | null
          high_season_triple_reduction_eur: number | null
          high_season_triple_reduction_non_eur: number | null
          peak_season_ppd_eur: number | null
          peak_season_ppd_non_eur: number | null
          peak_season_single_supplement_eur: number | null
          peak_season_single_supplement_non_eur: number | null
          peak_season_triple_reduction_eur: number | null
          peak_season_triple_reduction_non_eur: number | null
          supplier_id: string | null
          cruise_code: string | null
          ship_category: string | null
          route_name: string | null
          embark_city: string | null
          disembark_city: string | null
          duration_nights: Json | null
          tier: string | null
          is_preferred: boolean | null
          is_active: boolean | null
          rate_single_eur: number | null
          rate_double_eur: number | null
          rate_triple_eur: number | null
          low_season_start: string | null
          low_season_end: string | null
          high_season_start: string | null
          high_season_end: string | null
          peak_season_1_start: string | null
          peak_season_1_end: string | null
          peak_season_2_start: string | null
          peak_season_2_end: string | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          meals_included: string | null
          sightseeing_included: boolean | null
          description: string | null
          notes: string | null
          updated_at: string | null
          season: string | null
          season_start: string | null
          season_end: string | null
          supplier_name: string | null
          rate_double_eur_low: number | null
          rate_double_eur_high: number | null
          rate_double_eur_peak: number | null
          rate_low_single_eur: number | null
          rate_low_double_eur: number | null
          rate_low_triple_eur: number | null
          rate_low_suite_eur: number | null
          rate_low_single_non_eur: number | null
          rate_low_double_non_eur: number | null
          rate_low_triple_non_eur: number | null
          rate_low_suite_non_eur: number | null
          rate_high_single_eur: number | null
          rate_high_double_eur: number | null
          rate_high_triple_eur: number | null
          rate_high_suite_eur: number | null
          rate_high_single_non_eur: number | null
          rate_high_double_non_eur: number | null
          rate_high_triple_non_eur: number | null
          rate_high_suite_non_eur: number | null
          rate_peak_single_eur: number | null
          rate_peak_double_eur: number | null
          rate_peak_triple_eur: number | null
          rate_peak_suite_eur: number | null
          rate_peak_single_non_eur: number | null
          rate_peak_double_non_eur: number | null
          rate_peak_triple_non_eur: number | null
          rate_peak_suite_non_eur: number | null
        }
        Insert: {
          rate_currency?: string | null
          id?: string
          tenant_id: string
          ship_name: string
          cabin_type?: string | null
          rate_low_season?: number | null
          rate_high_season?: number | null
          rate_peak_season?: number | null
          created_at?: string | null
          ppd_eur?: number | null
          ppd_non_eur?: number | null
          single_supplement_eur?: number | null
          single_supplement_non_eur?: number | null
          triple_reduction_eur?: number | null
          triple_reduction_non_eur?: number | null
          supplements?: Json | null
          high_season_ppd_eur?: number | null
          high_season_ppd_non_eur?: number | null
          high_season_single_supplement_eur?: number | null
          high_season_single_supplement_non_eur?: number | null
          high_season_triple_reduction_eur?: number | null
          high_season_triple_reduction_non_eur?: number | null
          peak_season_ppd_eur?: number | null
          peak_season_ppd_non_eur?: number | null
          peak_season_single_supplement_eur?: number | null
          peak_season_single_supplement_non_eur?: number | null
          peak_season_triple_reduction_eur?: number | null
          peak_season_triple_reduction_non_eur?: number | null
          supplier_id?: string | null
          cruise_code?: string | null
          ship_category?: string | null
          route_name?: string | null
          embark_city?: string | null
          disembark_city?: string | null
          duration_nights?: Json | null
          tier?: string | null
          is_preferred?: boolean | null
          is_active?: boolean | null
          rate_single_eur?: number | null
          rate_double_eur?: number | null
          rate_triple_eur?: number | null
          low_season_start?: string | null
          low_season_end?: string | null
          high_season_start?: string | null
          high_season_end?: string | null
          peak_season_1_start?: string | null
          peak_season_1_end?: string | null
          peak_season_2_start?: string | null
          peak_season_2_end?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          meals_included?: string | null
          sightseeing_included?: boolean | null
          description?: string | null
          notes?: string | null
          updated_at?: string | null
          season?: string | null
          season_start?: string | null
          season_end?: string | null
          supplier_name?: string | null
          rate_double_eur_low?: number | null
          rate_double_eur_high?: number | null
          rate_double_eur_peak?: number | null
          rate_low_single_eur?: number | null
          rate_low_double_eur?: number | null
          rate_low_triple_eur?: number | null
          rate_low_suite_eur?: number | null
          rate_low_single_non_eur?: number | null
          rate_low_double_non_eur?: number | null
          rate_low_triple_non_eur?: number | null
          rate_low_suite_non_eur?: number | null
          rate_high_single_eur?: number | null
          rate_high_double_eur?: number | null
          rate_high_triple_eur?: number | null
          rate_high_suite_eur?: number | null
          rate_high_single_non_eur?: number | null
          rate_high_double_non_eur?: number | null
          rate_high_triple_non_eur?: number | null
          rate_high_suite_non_eur?: number | null
          rate_peak_single_eur?: number | null
          rate_peak_double_eur?: number | null
          rate_peak_triple_eur?: number | null
          rate_peak_suite_eur?: number | null
          rate_peak_single_non_eur?: number | null
          rate_peak_double_non_eur?: number | null
          rate_peak_triple_non_eur?: number | null
          rate_peak_suite_non_eur?: number | null
        }
        Update: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string
          ship_name?: string
          cabin_type?: string | null
          rate_low_season?: number | null
          rate_high_season?: number | null
          rate_peak_season?: number | null
          created_at?: string | null
          ppd_eur?: number | null
          ppd_non_eur?: number | null
          single_supplement_eur?: number | null
          single_supplement_non_eur?: number | null
          triple_reduction_eur?: number | null
          triple_reduction_non_eur?: number | null
          supplements?: Json | null
          high_season_ppd_eur?: number | null
          high_season_ppd_non_eur?: number | null
          high_season_single_supplement_eur?: number | null
          high_season_single_supplement_non_eur?: number | null
          high_season_triple_reduction_eur?: number | null
          high_season_triple_reduction_non_eur?: number | null
          peak_season_ppd_eur?: number | null
          peak_season_ppd_non_eur?: number | null
          peak_season_single_supplement_eur?: number | null
          peak_season_single_supplement_non_eur?: number | null
          peak_season_triple_reduction_eur?: number | null
          peak_season_triple_reduction_non_eur?: number | null
          supplier_id?: string | null
          cruise_code?: string | null
          ship_category?: string | null
          route_name?: string | null
          embark_city?: string | null
          disembark_city?: string | null
          duration_nights?: Json | null
          tier?: string | null
          is_preferred?: boolean | null
          is_active?: boolean | null
          rate_single_eur?: number | null
          rate_double_eur?: number | null
          rate_triple_eur?: number | null
          low_season_start?: string | null
          low_season_end?: string | null
          high_season_start?: string | null
          high_season_end?: string | null
          peak_season_1_start?: string | null
          peak_season_1_end?: string | null
          peak_season_2_start?: string | null
          peak_season_2_end?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          meals_included?: string | null
          sightseeing_included?: boolean | null
          description?: string | null
          notes?: string | null
          updated_at?: string | null
          season?: string | null
          season_start?: string | null
          season_end?: string | null
          supplier_name?: string | null
          rate_double_eur_low?: number | null
          rate_double_eur_high?: number | null
          rate_double_eur_peak?: number | null
          rate_low_single_eur?: number | null
          rate_low_double_eur?: number | null
          rate_low_triple_eur?: number | null
          rate_low_suite_eur?: number | null
          rate_low_single_non_eur?: number | null
          rate_low_double_non_eur?: number | null
          rate_low_triple_non_eur?: number | null
          rate_low_suite_non_eur?: number | null
          rate_high_single_eur?: number | null
          rate_high_double_eur?: number | null
          rate_high_triple_eur?: number | null
          rate_high_suite_eur?: number | null
          rate_high_single_non_eur?: number | null
          rate_high_double_non_eur?: number | null
          rate_high_triple_non_eur?: number | null
          rate_high_suite_non_eur?: number | null
          rate_peak_single_eur?: number | null
          rate_peak_double_eur?: number | null
          rate_peak_triple_eur?: number | null
          rate_peak_suite_eur?: number | null
          rate_peak_single_non_eur?: number | null
          rate_peak_double_non_eur?: number | null
          rate_peak_triple_non_eur?: number | null
          rate_peak_suite_non_eur?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nile_cruises_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nile_cruises_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          team_member_id: string
          type: string
          title: string
          message: string | null
          link: string | null
          related_task_id: string | null
          is_read: boolean
          email_sent: boolean
          created_at: string
        }
        Insert: {
          id?: string
          team_member_id: string
          type: string
          title: string
          message?: string | null
          link?: string | null
          related_task_id?: string | null
          is_read?: boolean
          email_sent?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          team_member_id?: string
          type?: string
          title?: string
          message?: string | null
          link?: string | null
          related_task_id?: string | null
          is_read?: boolean
          email_sent?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_capacity: {
        Row: {
          id: string
          tenant_id: string
          date: string
          status: string
          max_groups: number
          booked_groups: number
          max_guides: number | null
          booked_guides: number | null
          max_vehicles: number | null
          booked_vehicles: number | null
          notes: string | null
          internal_notes: string | null
          reason: string | null
          created_at: string | null
          updated_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          date: string
          status?: string
          max_groups?: number
          booked_groups?: number
          max_guides?: number | null
          booked_guides?: number | null
          max_vehicles?: number | null
          booked_vehicles?: number | null
          notes?: string | null
          internal_notes?: string | null
          reason?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          date?: string
          status?: string
          max_groups?: number
          booked_groups?: number
          max_guides?: number | null
          booked_guides?: number | null
          max_vehicles?: number | null
          booked_vehicles?: number | null
          notes?: string | null
          internal_notes?: string | null
          reason?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operator_capacity_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          id: string
          tenant_id: string
          itinerary_id: string | null
          client_id: string | null
          amount: number
          currency: string
          payment_method: string
          payment_date: string
          transaction_reference: string | null
          status: string
          notes: string | null
          created_at: string | null
          updated_at: string | null
          payment_type: string
          due_date: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          itinerary_id?: string | null
          client_id?: string | null
          amount: number
          currency?: string
          payment_method: string
          payment_date: string
          transaction_reference?: string | null
          status?: string
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          payment_type?: string
          due_date?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          itinerary_id?: string | null
          client_id?: string | null
          amount?: number
          currency?: string
          payment_method?: string
          payment_date?: string
          transaction_reference?: string | null
          status?: string
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          payment_type?: string
          due_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_templates: {
        Row: {
          id: string
          tenant_id: string
          name: string
          purpose: string
          description: string | null
          system_prompt: string | null
          user_prompt_template: string
          variables: Json
          model: string
          temperature: number | null
          max_tokens: number
          is_default: boolean
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          purpose: string
          description?: string | null
          system_prompt?: string | null
          user_prompt_template: string
          variables: Json
          model?: string
          temperature?: number | null
          max_tokens?: number
          is_default?: boolean
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          purpose?: string
          description?: string | null
          system_prompt?: string | null
          user_prompt_template?: string
          variables?: Json
          model?: string
          temperature?: number | null
          max_tokens?: number
          is_default?: boolean
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          id: string
          tenant_id: string
          user_id: string | null
          endpoint: string
          p256dh: string
          auth: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          user_id?: string | null
          endpoint: string
          p256dh: string
          auth: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          user_id?: string | null
          endpoint?: string
          p256dh?: string
          auth?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_versions: {
        Row: {
          id: string
          quote_type: string
          quote_id: string
          tenant_id: string
          version_number: number
          is_current: boolean | null
          quote_data: Json
          changed_by: string | null
          changed_at: string | null
          change_reason: string | null
          change_summary: string | null
          changes_diff: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          quote_type: string
          quote_id: string
          tenant_id: string
          version_number: number
          is_current?: boolean | null
          quote_data: Json
          changed_by?: string | null
          changed_at?: string | null
          change_reason?: string | null
          change_summary?: string | null
          changes_diff?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          quote_type?: string
          quote_id?: string
          tenant_id?: string
          version_number?: number
          is_current?: boolean | null
          quote_data?: Json
          changed_by?: string | null
          changed_at?: string | null
          change_reason?: string | null
          change_summary?: string | null
          changes_diff?: Json | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_audit_log: {
        Row: {
          id: string
          table_name: string
          record_id: string | null
          action: string
          changed_by: string | null
          tenant_id: string | null
          old_data: Json | null
          new_data: Json | null
          changed_at: string
        }
        Insert: {
          id?: string
          table_name: string
          record_id?: string | null
          action: string
          changed_by?: string | null
          tenant_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          changed_at?: string
        }
        Update: {
          id?: string
          table_name?: string
          record_id?: string | null
          action?: string
          changed_by?: string | null
          tenant_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          changed_at?: string
        }
        Relationships: []
      }
      restaurant_contacts: {
        Row: {
          id: string
          tenant_id: string
          name: string
          restaurant_type: string | null
          cuisine_type: string | null
          city: string
          address: string | null
          contact_person: string | null
          phone: string | null
          email: string | null
          whatsapp: string | null
          capacity: number | null
          meal_types: string[] | null
          dietary_options: string[] | null
          notes: string | null
          is_active: boolean | null
          tier: string | null
          is_preferred: boolean | null
          rate_per_person_eur: number | null
          rate_breakfast_eur: number | null
          rate_lunch_eur: number | null
          rate_dinner_eur: number | null
          rate_per_person_non_eur: number | null
          rate_breakfast_non_eur: number | null
          rate_lunch_non_eur: number | null
          rate_dinner_non_eur: number | null
          drinks_included: boolean | null
          tip_included: boolean | null
          child_discount_percent: number | null
          group_discount_percent: number | null
          group_min_size: number | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          restaurant_type?: string | null
          cuisine_type?: string | null
          city: string
          address?: string | null
          contact_person?: string | null
          phone?: string | null
          email?: string | null
          whatsapp?: string | null
          capacity?: number | null
          meal_types?: string[] | null
          dietary_options?: string[] | null
          notes?: string | null
          is_active?: boolean | null
          tier?: string | null
          is_preferred?: boolean | null
          rate_per_person_eur?: number | null
          rate_breakfast_eur?: number | null
          rate_lunch_eur?: number | null
          rate_dinner_eur?: number | null
          rate_per_person_non_eur?: number | null
          rate_breakfast_non_eur?: number | null
          rate_lunch_non_eur?: number | null
          rate_dinner_non_eur?: number | null
          drinks_included?: boolean | null
          tip_included?: boolean | null
          child_discount_percent?: number | null
          group_discount_percent?: number | null
          group_min_size?: number | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          restaurant_type?: string | null
          cuisine_type?: string | null
          city?: string
          address?: string | null
          contact_person?: string | null
          phone?: string | null
          email?: string | null
          whatsapp?: string | null
          capacity?: number | null
          meal_types?: string[] | null
          dietary_options?: string[] | null
          notes?: string | null
          is_active?: boolean | null
          tier?: string | null
          is_preferred?: boolean | null
          rate_per_person_eur?: number | null
          rate_breakfast_eur?: number | null
          rate_lunch_eur?: number | null
          rate_dinner_eur?: number | null
          rate_per_person_non_eur?: number | null
          rate_breakfast_non_eur?: number | null
          rate_lunch_non_eur?: number | null
          rate_dinner_non_eur?: number | null
          drinks_included?: boolean | null
          tip_included?: boolean | null
          child_discount_percent?: number | null
          group_discount_percent?: number | null
          group_min_size?: number | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_sends: {
        Row: {
          id: string
          tenant_id: string
          template_id: string
          recipient_type: string
          recipient_id: string
          recipient_contact: string
          channel: string
          subject: string | null
          body: string
          scheduled_for: string
          timezone: string | null
          status: string
          sent_at: string | null
          error_message: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          template_id: string
          recipient_type: string
          recipient_id: string
          recipient_contact: string
          channel: string
          subject?: string | null
          body: string
          scheduled_for: string
          timezone?: string | null
          status?: string
          sent_at?: string | null
          error_message?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          template_id?: string
          recipient_type?: string
          recipient_id?: string
          recipient_contact?: string
          channel?: string
          subject?: string | null
          body?: string
          scheduled_for?: string
          timezone?: string | null
          status?: string
          sent_at?: string | null
          error_message?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_sends_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_sends_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_migrations: {
        Row: {
          name: string
          applied_at: string
        }
        Insert: {
          name: string
          applied_at?: string
        }
        Update: {
          name?: string
          applied_at?: string
        }
        Relationships: []
      }
      sleeping_train_rates: {
        Row: {
          rate_currency: string | null
          id: string
          tenant_id: string | null
          service_code: string | null
          origin_city: string
          destination_city: string
          cabin_type: string
          rate_oneway_eur: number
          rate_roundtrip_eur: number | null
          rate_oneway_non_eur: number | null
          rate_roundtrip_non_eur: number | null
          departure_time: string | null
          arrival_time: string | null
          departure_days: string | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          season: string | null
          operator_name: string | null
          supplier_id: string | null
          description: string | null
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string | null
          service_code?: string | null
          origin_city: string
          destination_city: string
          cabin_type?: string
          rate_oneway_eur?: number
          rate_roundtrip_eur?: number | null
          rate_oneway_non_eur?: number | null
          rate_roundtrip_non_eur?: number | null
          departure_time?: string | null
          arrival_time?: string | null
          departure_days?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          season?: string | null
          operator_name?: string | null
          supplier_id?: string | null
          description?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string | null
          service_code?: string | null
          origin_city?: string
          destination_city?: string
          cabin_type?: string
          rate_oneway_eur?: number
          rate_roundtrip_eur?: number | null
          rate_oneway_non_eur?: number | null
          rate_roundtrip_non_eur?: number | null
          departure_time?: string | null
          arrival_time?: string | null
          departure_days?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          season?: string | null
          operator_name?: string | null
          supplier_id?: string | null
          description?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sleeping_train_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sleeping_train_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_links: {
        Row: {
          id: string
          tenant_id: string
          itinerary_id: string
          itinerary_resource_id: string
          token: string
          created_by: string | null
          created_at: string
          revoked_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          itinerary_id: string
          itinerary_resource_id: string
          token: string
          created_by?: string | null
          created_at?: string
          revoked_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          itinerary_id?: string
          itinerary_resource_id?: string
          token?: string
          created_by?: string | null
          created_at?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_links_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_links_itinerary_resource_id_fkey"
            columns: ["itinerary_resource_id"]
            isOneToOne: false
            referencedRelation: "itinerary_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          received_at: string
          processed_at: string | null
          error: string | null
        }
        Insert: {
          event_id: string
          event_type: string
          received_at?: string
          processed_at?: string | null
          error?: string | null
        }
        Update: {
          event_id?: string
          event_type?: string
          received_at?: string
          processed_at?: string | null
          error?: string | null
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          id: string
          name: string
          slug: string
          description: string | null
          price_monthly: number | null
          price_yearly: number | null
          currency: string
          stripe_price_id_monthly: string | null
          stripe_price_id_yearly: string | null
          stripe_product_id: string | null
          features: Json
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          slug: string
          description?: string | null
          price_monthly?: number | null
          price_yearly?: number | null
          currency?: string
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          stripe_product_id?: string | null
          features: Json
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          description?: string | null
          price_monthly?: number | null
          price_yearly?: number | null
          currency?: string
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          stripe_product_id?: string | null
          features?: Json
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      supplier_documents: {
        Row: {
          id: string
          tenant_id: string
          document_type: string
          document_number: string
          itinerary_id: string | null
          supplier_id: string | null
          supplier_name: string
          supplier_contact_name: string | null
          supplier_contact_email: string | null
          supplier_contact_phone: string | null
          supplier_address: string | null
          client_name: string
          client_nationality: string | null
          num_adults: number
          num_children: number
          city: string | null
          service_date: string | null
          check_in: string | null
          check_out: string | null
          pickup_time: string | null
          pickup_location: string | null
          dropoff_location: string | null
          services: Json | null
          currency: string | null
          total_cost: number | null
          payment_terms: string | null
          special_requests: string | null
          internal_notes: string | null
          status: string
          sent_at: string | null
          confirmed_at: string | null
          completed_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          document_type: string
          document_number: string
          itinerary_id?: string | null
          supplier_id?: string | null
          supplier_name: string
          supplier_contact_name?: string | null
          supplier_contact_email?: string | null
          supplier_contact_phone?: string | null
          supplier_address?: string | null
          client_name: string
          client_nationality?: string | null
          num_adults?: number
          num_children?: number
          city?: string | null
          service_date?: string | null
          check_in?: string | null
          check_out?: string | null
          pickup_time?: string | null
          pickup_location?: string | null
          dropoff_location?: string | null
          services?: Json | null
          currency?: string | null
          total_cost?: number | null
          payment_terms?: string | null
          special_requests?: string | null
          internal_notes?: string | null
          status?: string
          sent_at?: string | null
          confirmed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          document_type?: string
          document_number?: string
          itinerary_id?: string | null
          supplier_id?: string | null
          supplier_name?: string
          supplier_contact_name?: string | null
          supplier_contact_email?: string | null
          supplier_contact_phone?: string | null
          supplier_address?: string | null
          client_name?: string
          client_nationality?: string | null
          num_adults?: number
          num_children?: number
          city?: string | null
          service_date?: string | null
          check_in?: string | null
          check_out?: string | null
          pickup_time?: string | null
          pickup_location?: string | null
          dropoff_location?: string | null
          services?: Json | null
          currency?: string | null
          total_cost?: number | null
          payment_terms?: string | null
          special_requests?: string | null
          internal_notes?: string | null
          status?: string
          sent_at?: string | null
          confirmed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_documents_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_expenses: {
        Row: {
          id: string
          tenant_id: string
          supplier_invoice_id: string
          expense_id: string
          matched_amount: number | null
          notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          supplier_invoice_id: string
          expense_id: string
          matched_amount?: number | null
          notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          supplier_invoice_id?: string
          expense_id?: string
          matched_amount?: number | null
          notes?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_expenses_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_expenses_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoices: {
        Row: {
          id: string
          tenant_id: string
          supplier_invoice_number: string
          internal_reference: string | null
          supplier_name: string
          supplier_id: string | null
          invoice_date: string
          due_date: string | null
          amount: number
          currency: string | null
          tax_amount: number | null
          description: string | null
          line_items: Json | null
          status: string | null
          match_status: string | null
          matched_amount: number | null
          discrepancy_amount: number | null
          discrepancy_notes: string | null
          document_url: string | null
          document_filename: string | null
          document_storage_path: string | null
          approved_by: string | null
          approved_at: string | null
          paid_at: string | null
          payment_method: string | null
          payment_reference: string | null
          notes: string | null
          itinerary_id: string | null
          client_invoice_id: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
          booking_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          supplier_invoice_number: string
          internal_reference?: string | null
          supplier_name: string
          supplier_id?: string | null
          invoice_date: string
          due_date?: string | null
          amount: number
          currency?: string | null
          tax_amount?: number | null
          description?: string | null
          line_items?: Json | null
          status?: string | null
          match_status?: string | null
          matched_amount?: number | null
          discrepancy_amount?: number | null
          discrepancy_notes?: string | null
          document_url?: string | null
          document_filename?: string | null
          document_storage_path?: string | null
          approved_by?: string | null
          approved_at?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          notes?: string | null
          itinerary_id?: string | null
          client_invoice_id?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          booking_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          supplier_invoice_number?: string
          internal_reference?: string | null
          supplier_name?: string
          supplier_id?: string | null
          invoice_date?: string
          due_date?: string | null
          amount?: number
          currency?: string | null
          tax_amount?: number | null
          description?: string | null
          line_items?: Json | null
          status?: string | null
          match_status?: string | null
          matched_amount?: number | null
          discrepancy_amount?: number | null
          discrepancy_notes?: string | null
          document_url?: string | null
          document_filename?: string | null
          document_storage_path?: string | null
          approved_by?: string | null
          approved_at?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          notes?: string | null
          itinerary_id?: string | null
          client_invoice_id?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          booking_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          id: string
          supplier_code: string | null
          company_name: string
          contact_name: string | null
          email: string | null
          phone: string | null
          supplier_type: string | null
          address: string | null
          city: string | null
          country: string | null
          payment_terms: string | null
          tax_id: string | null
          is_active: boolean | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          phone2: string | null
          whatsapp: string | null
          website: string | null
          contact_email: string | null
          contact_phone: string | null
          default_commission_rate: number | null
          commission_type: string | null
          bank_details: string | null
          languages: string[] | null
          vehicle_types: string[] | null
          star_rating: string | null
          property_type: string | null
          cuisine_types: string[] | null
          routes: string[] | null
          ship_name: string | null
          cabin_count: number | null
          capacity: number | null
          is_property: boolean | null
          parent_supplier_id: string | null
          name: string | null
          type: string | null
          status: string | null
          tenant_id: string
        }
        Insert: {
          id?: string
          supplier_code?: string | null
          company_name: string
          contact_name?: string | null
          email?: string | null
          phone?: string | null
          supplier_type?: string | null
          address?: string | null
          city?: string | null
          country?: string | null
          payment_terms?: string | null
          tax_id?: string | null
          is_active?: boolean | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          phone2?: string | null
          whatsapp?: string | null
          website?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          default_commission_rate?: number | null
          commission_type?: string | null
          bank_details?: string | null
          languages?: string[] | null
          vehicle_types?: string[] | null
          star_rating?: string | null
          property_type?: string | null
          cuisine_types?: string[] | null
          routes?: string[] | null
          ship_name?: string | null
          cabin_count?: number | null
          capacity?: number | null
          is_property?: boolean | null
          parent_supplier_id?: string | null
          name?: string | null
          type?: string | null
          status?: string | null
          tenant_id: string
        }
        Update: {
          id?: string
          supplier_code?: string | null
          company_name?: string
          contact_name?: string | null
          email?: string | null
          phone?: string | null
          supplier_type?: string | null
          address?: string | null
          city?: string | null
          country?: string | null
          payment_terms?: string | null
          tax_id?: string | null
          is_active?: boolean | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          phone2?: string | null
          whatsapp?: string | null
          website?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          default_commission_rate?: number | null
          commission_type?: string | null
          bank_details?: string | null
          languages?: string[] | null
          vehicle_types?: string[] | null
          star_rating?: string | null
          property_type?: string | null
          cuisine_types?: string[] | null
          routes?: string[] | null
          ship_name?: string | null
          cabin_count?: number | null
          capacity?: number | null
          is_property?: boolean | null
          parent_supplier_id?: string | null
          name?: string | null
          type?: string | null
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_parent_supplier_id_fkey"
            columns: ["parent_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_conversations: {
        Row: {
          id: string
          tenant_id: string
          subject: string | null
          status: string
          created_by: string | null
          created_at: string
          last_message_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          subject?: string | null
          status?: string
          created_by?: string | null
          created_at?: string
          last_message_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          subject?: string | null
          status?: string
          created_by?: string | null
          created_at?: string
          last_message_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          id: string
          conversation_id: string
          tenant_id: string
          sender_type: string
          sender_user_id: string | null
          body: string
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          tenant_id: string
          sender_type: string
          sender_user_id?: string | null
          body: string
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          tenant_id?: string
          sender_type?: string
          sender_user_id?: string | null
          body?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          id: string
          tenant_id: string
          title: string
          description: string | null
          due_date: string | null
          priority: string | null
          status: string | null
          assigned_to: string | null
          linked_type: string | null
          linked_id: string | null
          notes: string | null
          completed_at: string | null
          archived: boolean | null
          archived_at: string | null
          created_at: string | null
          updated_at: string | null
          department_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          title: string
          description?: string | null
          due_date?: string | null
          priority?: string | null
          status?: string | null
          assigned_to?: string | null
          linked_type?: string | null
          linked_id?: string | null
          notes?: string | null
          completed_at?: string | null
          archived?: boolean | null
          archived_at?: string | null
          created_at?: string | null
          updated_at?: string | null
          department_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          title?: string
          description?: string | null
          due_date?: string | null
          priority?: string | null
          status?: string | null
          assigned_to?: string | null
          linked_type?: string | null
          linked_id?: string | null
          notes?: string | null
          completed_at?: string | null
          archived?: boolean | null
          archived_at?: string | null
          created_at?: string | null
          updated_at?: string | null
          department_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          tenant_id: string
          name: string
          email: string | null
          phone: string | null
          role: string | null
          is_active: boolean | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          department_id: string | null
          user_id: string | null
          staff_type: string
          whatsapp: string | null
          photo_url: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          email?: string | null
          phone?: string | null
          role?: string | null
          is_active?: boolean | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          department_id?: string | null
          user_id?: string | null
          staff_type?: string
          whatsapp?: string | null
          photo_url?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          email?: string | null
          phone?: string | null
          role?: string | null
          is_active?: boolean | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          department_id?: string | null
          user_id?: string | null
          staff_type?: string
          whatsapp?: string | null
          photo_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      template_placeholders: {
        Row: {
          id: string
          tenant_id: string
          placeholder: string
          display_name: string | null
          category: string | null
          example_value: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          placeholder: string
          display_name?: string | null
          category?: string | null
          example_value?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          placeholder?: string
          display_name?: string | null
          category?: string | null
          example_value?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_placeholders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      template_send_log: {
        Row: {
          id: string
          tenant_id: string
          template_id: string | null
          client_id: string | null
          recipient_id: string | null
          recipient_type: string | null
          channel: string | null
          recipient_email: string | null
          recipient_phone: string | null
          subject: string | null
          body_preview: string | null
          status: string | null
          error_message: string | null
          sent_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          template_id?: string | null
          client_id?: string | null
          recipient_id?: string | null
          recipient_type?: string | null
          channel?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          subject?: string | null
          body_preview?: string | null
          status?: string | null
          error_message?: string | null
          sent_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          template_id?: string | null
          client_id?: string | null
          recipient_id?: string | null
          recipient_type?: string | null
          channel?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          subject?: string | null
          body_preview?: string | null
          status?: string | null
          error_message?: string | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_send_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_send_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_activity_logs: {
        Row: {
          id: string
          tenant_id: string
          user_id: string | null
          action_type: string
          resource_type: string | null
          resource_id: string | null
          details: Json | null
          ip_address: string | null
          user_agent: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          user_id?: string | null
          action_type: string
          resource_type?: string | null
          resource_id?: string | null
          details?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          user_id?: string | null
          action_type?: string
          resource_type?: string | null
          resource_id?: string | null
          details?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_activity_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_destinations: {
        Row: {
          id: string
          tenant_id: string
          catalog_id: string
          is_default: boolean
          generation_brief: string | null
          glossary: Json | null
          is_active: boolean
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          catalog_id: string
          is_default?: boolean
          generation_brief?: string | null
          glossary?: Json | null
          is_active?: boolean
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          catalog_id?: string
          is_default?: boolean
          generation_brief?: string | null
          glossary?: Json | null
          is_active?: boolean
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_destinations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_destinations_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "destination_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_features: {
        Row: {
          id: string
          tenant_id: string
          whatsapp_integration: boolean
          email_integration: boolean
          pdf_generation: boolean
          analytics_enabled: boolean
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          custom_settings: Json | null
          created_at: string | null
          updated_at: string | null
          onboarding_completed: boolean | null
          onboarding_completed_at: string | null
          onboarding_step: number | null
          current_pricing_tier: string | null
          whatsapp_ai_enabled: boolean | null
          concierge_enabled: boolean
          copilot_pregenerate_enabled: boolean
          use_global_catalog: boolean
          activity_summary_enabled: boolean
        }
        Insert: {
          id?: string
          tenant_id: string
          whatsapp_integration?: boolean
          email_integration?: boolean
          pdf_generation?: boolean
          analytics_enabled?: boolean
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          custom_settings?: Json | null
          created_at?: string | null
          updated_at?: string | null
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          onboarding_step?: number | null
          current_pricing_tier?: string | null
          whatsapp_ai_enabled?: boolean | null
          concierge_enabled?: boolean
          copilot_pregenerate_enabled?: boolean
          use_global_catalog?: boolean
          activity_summary_enabled?: boolean
        }
        Update: {
          id?: string
          tenant_id?: string
          whatsapp_integration?: boolean
          email_integration?: boolean
          pdf_generation?: boolean
          analytics_enabled?: boolean
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          custom_settings?: Json | null
          created_at?: string | null
          updated_at?: string | null
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          onboarding_step?: number | null
          current_pricing_tier?: string | null
          whatsapp_ai_enabled?: boolean | null
          concierge_enabled?: boolean
          copilot_pregenerate_enabled?: boolean
          use_global_catalog?: boolean
          activity_summary_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tenant_features_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invitations: {
        Row: {
          id: string
          tenant_id: string
          email: string
          role: string
          invited_by: string
          invitation_token: string
          status: string
          expires_at: string
          accepted_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          email: string
          role?: string
          invited_by: string
          invitation_token: string
          status?: string
          expires_at: string
          accepted_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          email?: string
          role?: string
          invited_by?: string
          invitation_token?: string
          status?: string
          expires_at?: string
          accepted_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          id: string
          tenant_id: string
          user_id: string
          role: string
          status: string
          invited_by: string | null
          invited_at: string | null
          joined_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          user_id: string
          role?: string
          status?: string
          invited_by?: string | null
          invited_at?: string | null
          joined_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          user_id?: string
          role?: string
          status?: string
          invited_by?: string | null
          invited_at?: string | null
          joined_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscriptions: {
        Row: {
          id: string
          tenant_id: string
          plan_id: string
          stripe_customer_id: string
          stripe_subscription_id: string | null
          stripe_payment_method_id: string | null
          status: string
          billing_cycle: string
          current_period_start: string
          current_period_end: string
          trial_ends_at: string | null
          canceled_at: string | null
          ends_at: string | null
          metadata: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          plan_id: string
          stripe_customer_id: string
          stripe_subscription_id?: string | null
          stripe_payment_method_id?: string | null
          status?: string
          billing_cycle?: string
          current_period_start: string
          current_period_end: string
          trial_ends_at?: string | null
          canceled_at?: string | null
          ends_at?: string | null
          metadata?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          plan_id?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string | null
          stripe_payment_method_id?: string | null
          status?: string
          billing_cycle?: string
          current_period_start?: string
          current_period_end?: string
          trial_ends_at?: string | null
          canceled_at?: string | null
          ends_at?: string | null
          metadata?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_usage: {
        Row: {
          id: string
          tenant_id: string
          subscription_id: string
          period_start: string
          period_end: string
          quotes_created: number | null
          whatsapp_messages_sent: number | null
          gmail_emails_fetched: number | null
          pdfs_generated: number | null
          api_calls: number | null
          storage_used: number | null
          created_at: string | null
          updated_at: string | null
          itinerary_runs: number | null
          pricing_runs: number | null
          itineraries_created: number | null
        }
        Insert: {
          id?: string
          tenant_id: string
          subscription_id: string
          period_start: string
          period_end: string
          quotes_created?: number | null
          whatsapp_messages_sent?: number | null
          gmail_emails_fetched?: number | null
          pdfs_generated?: number | null
          api_calls?: number | null
          storage_used?: number | null
          created_at?: string | null
          updated_at?: string | null
          itinerary_runs?: number | null
          pricing_runs?: number | null
          itineraries_created?: number | null
        }
        Update: {
          id?: string
          tenant_id?: string
          subscription_id?: string
          period_start?: string
          period_end?: string
          quotes_created?: number | null
          whatsapp_messages_sent?: number | null
          gmail_emails_fetched?: number | null
          pdfs_generated?: number | null
          api_calls?: number | null
          storage_used?: number | null
          created_at?: string | null
          updated_at?: string | null
          itinerary_runs?: number | null
          pricing_runs?: number | null
          itineraries_created?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_usage_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "tenant_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          rates_currency: string | null
          id: string
          company_name: string
          contact_email: string | null
          created_at: string | null
          updated_at: string | null
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          timezone: string | null
          date_format: string | null
          currency: string | null
          settings: Json | null
          default_currency: string | null
          services_offered: Json | null
          company_website: string | null
          company_phone: string | null
          tagline: string | null
          is_primary: boolean | null
          locale: string
          stripe_customer_id: string | null
          workspace_mode: string
          email_domain: string | null
          email_from_local: string
          resend_domain_id: string | null
          email_domain_status: string
          email_domain_verified_at: string | null
          default_margin_percent: number | null
        }
        Insert: {
          rates_currency?: string | null
          id?: string
          company_name: string
          contact_email?: string | null
          created_at?: string | null
          updated_at?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          timezone?: string | null
          date_format?: string | null
          currency?: string | null
          settings?: Json | null
          default_currency?: string | null
          services_offered?: Json | null
          company_website?: string | null
          company_phone?: string | null
          tagline?: string | null
          is_primary?: boolean | null
          locale?: string
          stripe_customer_id?: string | null
          workspace_mode?: string
          email_domain?: string | null
          email_from_local?: string
          resend_domain_id?: string | null
          email_domain_status?: string
          email_domain_verified_at?: string | null
          default_margin_percent?: number | null
        }
        Update: {
          rates_currency?: string | null
          id?: string
          company_name?: string
          contact_email?: string | null
          created_at?: string | null
          updated_at?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          timezone?: string | null
          date_format?: string | null
          currency?: string | null
          settings?: Json | null
          default_currency?: string | null
          services_offered?: Json | null
          company_website?: string | null
          company_phone?: string | null
          tagline?: string | null
          is_primary?: boolean | null
          locale?: string
          stripe_customer_id?: string | null
          workspace_mode?: string
          email_domain?: string | null
          email_from_local?: string
          resend_domain_id?: string | null
          email_domain_status?: string
          email_domain_verified_at?: string | null
          default_margin_percent?: number | null
        }
        Relationships: []
      }
      tipping_rates: {
        Row: {
          rate_currency: string | null
          id: string
          tenant_id: string | null
          service_code: string | null
          role_type: string
          context: string | null
          rate_unit: string | null
          rate_eur: number
          description: string | null
          notes: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string | null
          service_code?: string | null
          role_type: string
          context?: string | null
          rate_unit?: string | null
          rate_eur?: number
          description?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string | null
          service_code?: string | null
          role_type?: string
          context?: string | null
          rate_unit?: string | null
          rate_eur?: number
          description?: string | null
          notes?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tipping_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_categories: {
        Row: {
          id: string
          tenant_id: string
          category_name: string
          slug: string | null
          description: string | null
          icon: string | null
          created_at: string | null
          category_code: string | null
          is_active: boolean | null
          sort_order: number | null
          name: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          category_name: string
          slug?: string | null
          description?: string | null
          icon?: string | null
          created_at?: string | null
          category_code?: string | null
          is_active?: boolean | null
          sort_order?: number | null
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          category_name?: string
          slug?: string | null
          description?: string | null
          icon?: string | null
          created_at?: string | null
          category_code?: string | null
          is_active?: boolean | null
          sort_order?: number | null
          name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_day_activities: {
        Row: {
          id: string
          tenant_id: string
          template_id: string | null
          tour_day_id: string | null
          day_number: number | null
          sequence_order: number | null
          content_id: string | null
          activity_type: string | null
          activity_name: string | null
          city: string | null
          duration_hours: number | null
          start_time: string | null
          entrance_id: string | null
          transportation_id: string | null
          is_optional: boolean | null
          is_included: boolean | null
          requires_guide: boolean | null
          notes: string | null
          activity_notes: string | null
          internal_notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          template_id?: string | null
          tour_day_id?: string | null
          day_number?: number | null
          sequence_order?: number | null
          content_id?: string | null
          activity_type?: string | null
          activity_name?: string | null
          city?: string | null
          duration_hours?: number | null
          start_time?: string | null
          entrance_id?: string | null
          transportation_id?: string | null
          is_optional?: boolean | null
          is_included?: boolean | null
          requires_guide?: boolean | null
          notes?: string | null
          activity_notes?: string | null
          internal_notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          template_id?: string | null
          tour_day_id?: string | null
          day_number?: number | null
          sequence_order?: number | null
          content_id?: string | null
          activity_type?: string | null
          activity_name?: string | null
          city?: string | null
          duration_hours?: number | null
          start_time?: string | null
          entrance_id?: string | null
          transportation_id?: string | null
          is_optional?: boolean | null
          is_included?: boolean | null
          requires_guide?: boolean | null
          notes?: string | null
          activity_notes?: string | null
          internal_notes?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_day_activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_day_activities_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tour_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_day_activities_tour_day_id_fkey"
            columns: ["tour_day_id"]
            isOneToOne: false
            referencedRelation: "tour_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_day_activities_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_library"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_days: {
        Row: {
          id: string
          tenant_id: string
          template_id: string
          day_number: number
          city: string | null
          accommodation_id: string | null
          breakfast_included: boolean | null
          lunch_meal_id: string | null
          dinner_meal_id: string | null
          guide_required: boolean | null
          guide_id: string | null
          notes: string | null
          created_at: string | null
          description: string | null
          is_arrival: boolean | null
          is_departure: boolean | null
          title: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          template_id: string
          day_number: number
          city?: string | null
          accommodation_id?: string | null
          breakfast_included?: boolean | null
          lunch_meal_id?: string | null
          dinner_meal_id?: string | null
          guide_required?: boolean | null
          guide_id?: string | null
          notes?: string | null
          created_at?: string | null
          description?: string | null
          is_arrival?: boolean | null
          is_departure?: boolean | null
          title?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          template_id?: string
          day_number?: number
          city?: string | null
          accommodation_id?: string | null
          breakfast_included?: boolean | null
          lunch_meal_id?: string | null
          dinner_meal_id?: string | null
          guide_required?: boolean | null
          guide_id?: string | null
          notes?: string | null
          created_at?: string | null
          description?: string | null
          is_arrival?: boolean | null
          is_departure?: boolean | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_days_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_departures: {
        Row: {
          id: string
          tenant_id: string
          template_id: string | null
          variation_id: string | null
          tour_name: string
          tour_code: string | null
          duration_days: number
          start_date: string
          end_date: string
          max_pax: number
          booked_pax: number
          min_pax: number | null
          status: string
          cutoff_days: number | null
          is_guaranteed: boolean | null
          price_per_person: number | null
          currency: string | null
          assigned_guide_id: string | null
          assigned_vehicle_id: string | null
          public_notes: string | null
          internal_notes: string | null
          created_at: string | null
          updated_at: string | null
          created_by: string | null
          external_source: string | null
          external_id: string | null
          external_synced_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          template_id?: string | null
          variation_id?: string | null
          tour_name: string
          tour_code?: string | null
          duration_days?: number
          start_date: string
          end_date: string
          max_pax?: number
          booked_pax?: number
          min_pax?: number | null
          status?: string
          cutoff_days?: number | null
          is_guaranteed?: boolean | null
          price_per_person?: number | null
          currency?: string | null
          assigned_guide_id?: string | null
          assigned_vehicle_id?: string | null
          public_notes?: string | null
          internal_notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          external_source?: string | null
          external_id?: string | null
          external_synced_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          template_id?: string | null
          variation_id?: string | null
          tour_name?: string
          tour_code?: string | null
          duration_days?: number
          start_date?: string
          end_date?: string
          max_pax?: number
          booked_pax?: number
          min_pax?: number | null
          status?: string
          cutoff_days?: number | null
          is_guaranteed?: boolean | null
          price_per_person?: number | null
          currency?: string | null
          assigned_guide_id?: string | null
          assigned_vehicle_id?: string | null
          public_notes?: string | null
          internal_notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          external_source?: string | null
          external_id?: string | null
          external_synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_departures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_departures_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tour_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_departures_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "tour_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_pricing: {
        Row: {
          id: string
          tenant_id: string
          tour_id: string | null
          pax: number
          is_euro_passport: boolean | null
          total_accommodation: number | null
          total_meals: number | null
          total_guides: number | null
          total_transportation: number | null
          total_entrances: number | null
          grand_total: number
          per_person_total: number
          created_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          tour_id?: string | null
          pax: number
          is_euro_passport?: boolean | null
          total_accommodation?: number | null
          total_meals?: number | null
          total_guides?: number | null
          total_transportation?: number | null
          total_entrances?: number | null
          grand_total: number
          per_person_total: number
          created_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          tour_id?: string | null
          pax?: number
          is_euro_passport?: boolean | null
          total_accommodation?: number | null
          total_meals?: number | null
          total_guides?: number | null
          total_transportation?: number | null
          total_entrances?: number | null
          grand_total?: number
          per_person_total?: number
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_pricing_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_pricing_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_quotes: {
        Row: {
          id: string
          quote_number: string
          variation_id: string | null
          partner_id: string | null
          client_name: string | null
          client_email: string | null
          client_phone: string | null
          client_nationality: string | null
          travel_date: string | null
          num_adults: number
          num_children: number | null
          services_snapshot: Json | null
          total_cost: number | null
          margin_percent: number | null
          margin_amount: number | null
          selling_price: number | null
          price_per_person: number | null
          currency: string | null
          status: string | null
          valid_until: string | null
          converted_to_itinerary_id: string | null
          converted_at: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          created_by: string | null
          tour_leader_included: boolean | null
          tour_leader_cost: number | null
          single_supplement: number | null
          is_eur_passport: boolean | null
          season: string | null
          itinerary_id: string | null
          trip_name: string | null
          source: string | null
          version: number | null
          last_modified_by: string | null
          last_modified_at: string | null
          tenant_id: string | null
        }
        Insert: {
          id?: string
          quote_number: string
          variation_id?: string | null
          partner_id?: string | null
          client_name?: string | null
          client_email?: string | null
          client_phone?: string | null
          client_nationality?: string | null
          travel_date?: string | null
          num_adults?: number
          num_children?: number | null
          services_snapshot?: Json | null
          total_cost?: number | null
          margin_percent?: number | null
          margin_amount?: number | null
          selling_price?: number | null
          price_per_person?: number | null
          currency?: string | null
          status?: string | null
          valid_until?: string | null
          converted_to_itinerary_id?: string | null
          converted_at?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          tour_leader_included?: boolean | null
          tour_leader_cost?: number | null
          single_supplement?: number | null
          is_eur_passport?: boolean | null
          season?: string | null
          itinerary_id?: string | null
          trip_name?: string | null
          source?: string | null
          version?: number | null
          last_modified_by?: string | null
          last_modified_at?: string | null
          tenant_id?: string | null
        }
        Update: {
          id?: string
          quote_number?: string
          variation_id?: string | null
          partner_id?: string | null
          client_name?: string | null
          client_email?: string | null
          client_phone?: string | null
          client_nationality?: string | null
          travel_date?: string | null
          num_adults?: number
          num_children?: number | null
          services_snapshot?: Json | null
          total_cost?: number | null
          margin_percent?: number | null
          margin_amount?: number | null
          selling_price?: number | null
          price_per_person?: number | null
          currency?: string | null
          status?: string | null
          valid_until?: string | null
          converted_to_itinerary_id?: string | null
          converted_at?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          tour_leader_included?: boolean | null
          tour_leader_cost?: number | null
          single_supplement?: number | null
          is_eur_passport?: boolean | null
          season?: string | null
          itinerary_id?: string | null
          trip_name?: string | null
          source?: string | null
          version?: number | null
          last_modified_by?: string | null
          last_modified_at?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_templates: {
        Row: {
          id: string
          tenant_id: string
          template_code: string
          template_name: string
          short_description: string | null
          long_description: string | null
          duration_days: number
          duration_nights: number
          category_id: string | null
          destination_id: string | null
          highlights: string[] | null
          main_attractions: string[] | null
          is_active: boolean | null
          uses_day_builder: boolean | null
          created_at: string | null
          updated_at: string | null
          tour_type: string | null
          cities_covered: string[] | null
          destinations_covered: string[] | null
          best_for: string[] | null
          physical_level: string | null
          age_suitability: string | null
          pickup_required: boolean | null
          accommodation_nights: number | null
          meals_included: string[] | null
          image_url: string | null
          gallery_urls: string[] | null
          is_featured: boolean | null
          popularity_score: number | null
          default_transportation_service: string | null
          transportation_city: string | null
          itinerary: Json | null
          inclusions: string[] | null
          exclusions: string[] | null
          primary_destination_id: string | null
          pricing_mode: string | null
          cached_starting_price: number | null
          cached_starting_tier: string | null
          cached_price_updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          template_code: string
          template_name: string
          short_description?: string | null
          long_description?: string | null
          duration_days?: number
          duration_nights?: number
          category_id?: string | null
          destination_id?: string | null
          highlights?: string[] | null
          main_attractions?: string[] | null
          is_active?: boolean | null
          uses_day_builder?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          tour_type?: string | null
          cities_covered?: string[] | null
          destinations_covered?: string[] | null
          best_for?: string[] | null
          physical_level?: string | null
          age_suitability?: string | null
          pickup_required?: boolean | null
          accommodation_nights?: number | null
          meals_included?: string[] | null
          image_url?: string | null
          gallery_urls?: string[] | null
          is_featured?: boolean | null
          popularity_score?: number | null
          default_transportation_service?: string | null
          transportation_city?: string | null
          itinerary?: Json | null
          inclusions?: string[] | null
          exclusions?: string[] | null
          primary_destination_id?: string | null
          pricing_mode?: string | null
          cached_starting_price?: number | null
          cached_starting_tier?: string | null
          cached_price_updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          template_code?: string
          template_name?: string
          short_description?: string | null
          long_description?: string | null
          duration_days?: number
          duration_nights?: number
          category_id?: string | null
          destination_id?: string | null
          highlights?: string[] | null
          main_attractions?: string[] | null
          is_active?: boolean | null
          uses_day_builder?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          tour_type?: string | null
          cities_covered?: string[] | null
          destinations_covered?: string[] | null
          best_for?: string[] | null
          physical_level?: string | null
          age_suitability?: string | null
          pickup_required?: boolean | null
          accommodation_nights?: number | null
          meals_included?: string[] | null
          image_url?: string | null
          gallery_urls?: string[] | null
          is_featured?: boolean | null
          popularity_score?: number | null
          default_transportation_service?: string | null
          transportation_city?: string | null
          itinerary?: Json | null
          inclusions?: string[] | null
          exclusions?: string[] | null
          primary_destination_id?: string | null
          pricing_mode?: string | null
          cached_starting_price?: number | null
          cached_starting_tier?: string | null
          cached_price_updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tour_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_templates_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_variation_services: {
        Row: {
          id: string
          tenant_id: string
          variation_id: string
          service_name: string
          service_category: string | null
          rate_type: string | null
          rate_id: string | null
          quantity_mode: string | null
          quantity_value: number | null
          cost_per_unit: number | null
          day_number: number | null
          sequence_order: number | null
          is_optional: boolean | null
          optional_price_override: number | null
          notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          variation_id: string
          service_name: string
          service_category?: string | null
          rate_type?: string | null
          rate_id?: string | null
          quantity_mode?: string | null
          quantity_value?: number | null
          cost_per_unit?: number | null
          day_number?: number | null
          sequence_order?: number | null
          is_optional?: boolean | null
          optional_price_override?: number | null
          notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          variation_id?: string
          service_name?: string
          service_category?: string | null
          rate_type?: string | null
          rate_id?: string | null
          quantity_mode?: string | null
          quantity_value?: number | null
          cost_per_unit?: number | null
          day_number?: number | null
          sequence_order?: number | null
          is_optional?: boolean | null
          optional_price_override?: number | null
          notes?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_variation_services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_variation_services_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "tour_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_variations: {
        Row: {
          id: string
          tenant_id: string
          template_id: string
          variation_code: string
          variation_name: string
          tier: string
          group_type: string | null
          min_pax: number | null
          max_pax: number | null
          guide_type: string | null
          guide_languages: string[] | null
          vehicle_type: string | null
          inclusions: string[] | null
          exclusions: string[] | null
          optional_extras: Json | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
          optimal_pax: number | null
          accommodation_standard: string | null
          meal_quality: string | null
          private_experience: boolean | null
          skip_line_access: boolean | null
          vip_treatment: boolean | null
          flexible_itinerary: boolean | null
          typical_start_time: string | null
          typical_end_time: string | null
          pickup_time_range: string | null
          available_seasons: string[] | null
          notes: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          template_id: string
          variation_code: string
          variation_name: string
          tier?: string
          group_type?: string | null
          min_pax?: number | null
          max_pax?: number | null
          guide_type?: string | null
          guide_languages?: string[] | null
          vehicle_type?: string | null
          inclusions?: string[] | null
          exclusions?: string[] | null
          optional_extras?: Json | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          optimal_pax?: number | null
          accommodation_standard?: string | null
          meal_quality?: string | null
          private_experience?: boolean | null
          skip_line_access?: boolean | null
          vip_treatment?: boolean | null
          flexible_itinerary?: boolean | null
          typical_start_time?: string | null
          typical_end_time?: string | null
          pickup_time_range?: string | null
          available_seasons?: string[] | null
          notes?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          template_id?: string
          variation_code?: string
          variation_name?: string
          tier?: string
          group_type?: string | null
          min_pax?: number | null
          max_pax?: number | null
          guide_type?: string | null
          guide_languages?: string[] | null
          vehicle_type?: string | null
          inclusions?: string[] | null
          exclusions?: string[] | null
          optional_extras?: Json | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
          optimal_pax?: number | null
          accommodation_standard?: string | null
          meal_quality?: string | null
          private_experience?: boolean | null
          skip_line_access?: boolean | null
          vip_treatment?: boolean | null
          flexible_itinerary?: boolean | null
          typical_start_time?: string | null
          typical_end_time?: string | null
          pickup_time_range?: string | null
          available_seasons?: string[] | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_variations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_variations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tour_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      tours: {
        Row: {
          id: string
          tenant_id: string
          tour_code: string
          tour_name: string
          duration_days: number
          cities: string[] | null
          tour_type: string | null
          is_template: boolean | null
          description: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          tour_code: string
          tour_name: string
          duration_days: number
          cities?: string[] | null
          tour_type?: string | null
          is_template?: boolean | null
          description?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          tour_code?: string
          tour_name?: string
          duration_days?: number
          cities?: string[] | null
          tour_type?: string | null
          is_template?: boolean | null
          description?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tours_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      train_rates: {
        Row: {
          rate_currency: string | null
          id: string
          tenant_id: string | null
          service_code: string | null
          origin_city: string
          destination_city: string
          class_type: string | null
          operator_name: string | null
          rate_eur: number
          duration_hours: number | null
          departure_times: string | null
          rate_valid_from: string | null
          rate_valid_to: string | null
          description: string | null
          notes: string | null
          supplier_id: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string | null
          service_code?: string | null
          origin_city: string
          destination_city: string
          class_type?: string | null
          operator_name?: string | null
          rate_eur?: number
          duration_hours?: number | null
          departure_times?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          description?: string | null
          notes?: string | null
          supplier_id?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string | null
          service_code?: string | null
          origin_city?: string
          destination_city?: string
          class_type?: string | null
          operator_name?: string | null
          rate_eur?: number
          duration_hours?: number | null
          departure_times?: string | null
          rate_valid_from?: string | null
          rate_valid_to?: string | null
          description?: string | null
          notes?: string | null
          supplier_id?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "train_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "train_rates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      transportation_rates: {
        Row: {
          rate_currency: string | null
          id: string
          tenant_id: string
          service_type: string | null
          vehicle_type: string | null
          origin_city: string | null
          destination_city: string | null
          city: string | null
          base_rate_eur: number | null
          base_rate_non_eur: number | null
          rate_per_day: number | null
          capacity: number | null
          created_at: string | null
          route_name: string | null
          includes: string | null
          area: string | null
          duration: string | null
          sedan_rate_eur: number | null
          sedan_rate_non_eur: number | null
          sedan_capacity_min: number | null
          sedan_capacity_max: number | null
          minivan_rate_eur: number | null
          minivan_rate_non_eur: number | null
          minivan_capacity_min: number | null
          minivan_capacity_max: number | null
          van_rate_eur: number | null
          van_rate_non_eur: number | null
          van_capacity_min: number | null
          van_capacity_max: number | null
          minibus_rate_eur: number | null
          minibus_rate_non_eur: number | null
          minibus_capacity_min: number | null
          minibus_capacity_max: number | null
          bus_rate_eur: number | null
          bus_rate_non_eur: number | null
          bus_capacity_min: number | null
          bus_capacity_max: number | null
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          rate_currency?: string | null
          id?: string
          tenant_id: string
          service_type?: string | null
          vehicle_type?: string | null
          origin_city?: string | null
          destination_city?: string | null
          city?: string | null
          base_rate_eur?: number | null
          base_rate_non_eur?: number | null
          rate_per_day?: number | null
          capacity?: number | null
          created_at?: string | null
          route_name?: string | null
          includes?: string | null
          area?: string | null
          duration?: string | null
          sedan_rate_eur?: number | null
          sedan_rate_non_eur?: number | null
          sedan_capacity_min?: number | null
          sedan_capacity_max?: number | null
          minivan_rate_eur?: number | null
          minivan_rate_non_eur?: number | null
          minivan_capacity_min?: number | null
          minivan_capacity_max?: number | null
          van_rate_eur?: number | null
          van_rate_non_eur?: number | null
          van_capacity_min?: number | null
          van_capacity_max?: number | null
          minibus_rate_eur?: number | null
          minibus_rate_non_eur?: number | null
          minibus_capacity_min?: number | null
          minibus_capacity_max?: number | null
          bus_rate_eur?: number | null
          bus_rate_non_eur?: number | null
          bus_capacity_min?: number | null
          bus_capacity_max?: number | null
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          rate_currency?: string | null
          id?: string
          tenant_id?: string
          service_type?: string | null
          vehicle_type?: string | null
          origin_city?: string | null
          destination_city?: string | null
          city?: string | null
          base_rate_eur?: number | null
          base_rate_non_eur?: number | null
          rate_per_day?: number | null
          capacity?: number | null
          created_at?: string | null
          route_name?: string | null
          includes?: string | null
          area?: string | null
          duration?: string | null
          sedan_rate_eur?: number | null
          sedan_rate_non_eur?: number | null
          sedan_capacity_min?: number | null
          sedan_capacity_max?: number | null
          minivan_rate_eur?: number | null
          minivan_rate_non_eur?: number | null
          minivan_capacity_min?: number | null
          minivan_capacity_max?: number | null
          van_rate_eur?: number | null
          van_rate_non_eur?: number | null
          van_capacity_min?: number | null
          van_capacity_max?: number | null
          minibus_rate_eur?: number | null
          minibus_rate_non_eur?: number | null
          minibus_capacity_min?: number | null
          minibus_capacity_max?: number | null
          bus_rate_eur?: number | null
          bus_rate_non_eur?: number | null
          bus_capacity_min?: number | null
          bus_capacity_max?: number | null
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transportation_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_events: {
        Row: {
          id: string
          tenant_id: string
          itinerary_id: string
          itinerary_resource_id: string | null
          event_kind: string
          occurred_at: string
          lat: number | null
          lng: number | null
          note: string | null
          actor_name: string | null
          created_at: string
          actor_team_member_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          itinerary_id: string
          itinerary_resource_id?: string | null
          event_kind: string
          occurred_at?: string
          lat?: number | null
          lng?: number | null
          note?: string | null
          actor_name?: string | null
          created_at?: string
          actor_team_member_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          itinerary_id?: string
          itinerary_resource_id?: string | null
          event_kind?: string
          occurred_at?: string
          lat?: number | null
          lng?: number | null
          note?: string | null
          actor_name?: string | null
          created_at?: string
          actor_team_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_events_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_events_itinerary_resource_id_fkey"
            columns: ["itinerary_resource_id"]
            isOneToOne: false
            referencedRelation: "itinerary_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_events_actor_team_member_id_fkey"
            columns: ["actor_team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_messages: {
        Row: {
          notify_outcome: string | null
          id: string
          tenant_id: string
          itinerary_id: string
          unified_conversation_id: string | null
          direction: string
          content: string
          sender_name: string | null
          team_member_id: string | null
          is_read: boolean
          created_at: string
        }
        Insert: {
          notify_outcome?: string | null
          id?: string
          tenant_id: string
          itinerary_id: string
          unified_conversation_id?: string | null
          direction: string
          content: string
          sender_name?: string | null
          team_member_id?: string | null
          is_read?: boolean
          created_at?: string
        }
        Update: {
          notify_outcome?: string | null
          id?: string
          tenant_id?: string
          itinerary_id?: string
          unified_conversation_id?: string | null
          direction?: string
          content?: string
          sender_name?: string | null
          team_member_id?: string | null
          is_read?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_unified_conversation_id_fkey"
            columns: ["unified_conversation_id"]
            isOneToOne: false
            referencedRelation: "unified_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      unified_conversations: {
        Row: {
          id: string
          tenant_id: string
          client_id: string | null
          contact_name: string | null
          contact_email: string | null
          contact_phone: string | null
          whatsapp_conversation_id: string | null
          total_messages: number | null
          unread_messages: number | null
          last_message_at: string | null
          last_message_preview: string | null
          last_message_channel: string | null
          assigned_team_member_id: string | null
          assigned_at: string | null
          status: string | null
          is_starred: boolean | null
          tags: string[] | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          client_id?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          whatsapp_conversation_id?: string | null
          total_messages?: number | null
          unread_messages?: number | null
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_channel?: string | null
          assigned_team_member_id?: string | null
          assigned_at?: string | null
          status?: string | null
          is_starred?: boolean | null
          tags?: string[] | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          client_id?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          whatsapp_conversation_id?: string | null
          total_messages?: number | null
          unread_messages?: number | null
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_channel?: string | null
          assigned_team_member_id?: string | null
          assigned_at?: string | null
          status?: string | null
          is_starred?: boolean | null
          tags?: string[] | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unified_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unified_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unified_conversations_whatsapp_conversation_id_fkey"
            columns: ["whatsapp_conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unified_conversations_assigned_team_member_id_fkey"
            columns: ["assigned_team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      unified_messages: {
        Row: {
          channel: string | null
          id: string | null
          tenant_id: string | null
          unified_conversation_id: string | null
          contact_identifier: string | null
          content: string | null
          subject: string | null
          direction: string | null
          media_url: string | null
          media_type: string | null
          status: string | null
          message_at: string | null
          is_read: boolean | null
          created_at: string | null
        }
        Insert: {
          channel?: string | null
          id?: string | null
          tenant_id?: string | null
          unified_conversation_id?: string | null
          contact_identifier?: string | null
          content?: string | null
          subject?: string | null
          direction?: string | null
          media_url?: string | null
          media_type?: string | null
          status?: string | null
          message_at?: string | null
          is_read?: boolean | null
          created_at?: string | null
        }
        Update: {
          channel?: string | null
          id?: string | null
          tenant_id?: string | null
          unified_conversation_id?: string | null
          contact_identifier?: string | null
          content?: string | null
          subject?: string | null
          direction?: string | null
          media_url?: string | null
          media_type?: string | null
          status?: string | null
          message_at?: string | null
          is_read?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }
      user_activity_daily: {
        Row: {
          tenant_id: string
          user_id: string
          day: string
          active_minutes: number
          first_seen_at: string | null
          last_seen_at: string | null
        }
        Insert: {
          tenant_id: string
          user_id: string
          day: string
          active_minutes?: number
          first_seen_at?: string | null
          last_seen_at?: string | null
        }
        Update: {
          tenant_id?: string
          user_id?: string
          day?: string
          active_minutes?: number
          first_seen_at?: string | null
          last_seen_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_daily_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          id: string
          user_id: string
          default_cost_mode: string | null
          default_tier: string | null
          default_margin_percent: number | null
          default_currency: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          default_cost_mode?: string | null
          default_tier?: string | null
          default_margin_percent?: number | null
          default_currency?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          default_cost_mode?: string | null
          default_tier?: string | null
          default_margin_percent?: number | null
          default_currency?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          role: string | null
          company_name: string | null
          phone: string | null
          is_active: boolean | null
          avatar_url: string | null
          created_at: string | null
          updated_at: string | null
          last_seen_at: string | null
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          role?: string | null
          company_name?: string | null
          phone?: string | null
          is_active?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          updated_at?: string | null
          last_seen_at?: string | null
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          role?: string | null
          company_name?: string | null
          phone?: string | null
          is_active?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          updated_at?: string | null
          last_seen_at?: string | null
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          id: string
          user_id: string
          notification_preferences: Json | null
          theme: string | null
          language: string | null
          created_at: string | null
          updated_at: string | null
          email_settings: Json | null
        }
        Insert: {
          id?: string
          user_id: string
          notification_preferences?: Json | null
          theme?: string | null
          language?: string | null
          created_at?: string | null
          updated_at?: string | null
          email_settings?: Json | null
        }
        Update: {
          id?: string
          user_id?: string
          notification_preferences?: Json | null
          theme?: string | null
          language?: string | null
          created_at?: string | null
          updated_at?: string | null
          email_settings?: Json | null
        }
        Relationships: []
      }
      variation_daily_itinerary: {
        Row: {
          id: string
          tenant_id: string
          variation_id: string
          day_number: number
          title: string | null
          day_title: string | null
          description: string | null
          day_description: string | null
          city: string | null
          overnight_city: string | null
          breakfast_included: boolean | null
          lunch_included: boolean | null
          dinner_included: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          variation_id: string
          day_number: number
          title?: string | null
          day_title?: string | null
          description?: string | null
          day_description?: string | null
          city?: string | null
          overnight_city?: string | null
          breakfast_included?: boolean | null
          lunch_included?: boolean | null
          dinner_included?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          variation_id?: string
          day_number?: number
          title?: string | null
          day_title?: string | null
          description?: string | null
          day_description?: string | null
          city?: string | null
          overnight_city?: string | null
          breakfast_included?: boolean | null
          lunch_included?: boolean | null
          dinner_included?: boolean | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "variation_daily_itinerary_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variation_daily_itinerary_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "tour_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      variation_pricing: {
        Row: {
          id: string
          tenant_id: string
          variation_id: string
          pax_count: number
          price_per_person: number
          total_price: number
          season: string | null
          valid_from: string | null
          valid_until: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          variation_id: string
          pax_count: number
          price_per_person: number
          total_price: number
          season?: string | null
          valid_from?: string | null
          valid_until?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          variation_id?: string
          pax_count?: number
          price_per_person?: number
          total_price?: number
          season?: string | null
          valid_from?: string | null
          valid_until?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "variation_pricing_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variation_pricing_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "tour_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      variation_services: {
        Row: {
          id: string
          tenant_id: string
          variation_id: string
          service_category: string | null
          service_name: string | null
          quantity_type: string | null
          cost_per_unit: number | null
          applies_to_day: number | null
          is_mandatory: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          variation_id: string
          service_category?: string | null
          service_name?: string | null
          quantity_type?: string | null
          cost_per_unit?: number | null
          applies_to_day?: number | null
          is_mandatory?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          variation_id?: string
          service_category?: string | null
          service_name?: string | null
          quantity_type?: string | null
          cost_per_unit?: number | null
          applies_to_day?: number | null
          is_mandatory?: boolean | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "variation_services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variation_services_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "tour_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          id: string
          vehicle_code: string | null
          vehicle_type: string
          make: string | null
          model: string | null
          year: number | null
          license_plate: string | null
          passenger_capacity: number | null
          luggage_capacity: number | null
          daily_rate: number | null
          supplier_id: string | null
          is_active: boolean | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          tenant_id: string
          name: string | null
          registration_number: string | null
          has_ac: boolean | null
          has_wifi: boolean | null
          is_luxury: boolean | null
          current_mileage: number | null
          last_service_date: string | null
          next_service_date: string | null
          insurance_expiry: string | null
          rate_per_km: number | null
          default_driver_name: string | null
          default_driver_phone: string | null
          photo_url: string | null
          tier: string | null
          is_preferred: boolean | null
          city: string | null
          default_driver_id: string | null
        }
        Insert: {
          id?: string
          vehicle_code?: string | null
          vehicle_type: string
          make?: string | null
          model?: string | null
          year?: number | null
          license_plate?: string | null
          passenger_capacity?: number | null
          luggage_capacity?: number | null
          daily_rate?: number | null
          supplier_id?: string | null
          is_active?: boolean | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          tenant_id: string
          name?: string | null
          registration_number?: string | null
          has_ac?: boolean | null
          has_wifi?: boolean | null
          is_luxury?: boolean | null
          current_mileage?: number | null
          last_service_date?: string | null
          next_service_date?: string | null
          insurance_expiry?: string | null
          rate_per_km?: number | null
          default_driver_name?: string | null
          default_driver_phone?: string | null
          photo_url?: string | null
          tier?: string | null
          is_preferred?: boolean | null
          city?: string | null
          default_driver_id?: string | null
        }
        Update: {
          id?: string
          vehicle_code?: string | null
          vehicle_type?: string
          make?: string | null
          model?: string | null
          year?: number | null
          license_plate?: string | null
          passenger_capacity?: number | null
          luggage_capacity?: number | null
          daily_rate?: number | null
          supplier_id?: string | null
          is_active?: boolean | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          tenant_id?: string
          name?: string | null
          registration_number?: string | null
          has_ac?: boolean | null
          has_wifi?: boolean | null
          is_luxury?: boolean | null
          current_mileage?: number | null
          last_service_date?: string | null
          next_service_date?: string | null
          insurance_expiry?: string | null
          rate_per_km?: number | null
          default_driver_name?: string | null
          default_driver_phone?: string | null
          photo_url?: string | null
          tier?: string | null
          is_preferred?: boolean | null
          city?: string | null
          default_driver_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_default_driver_id_fkey"
            columns: ["default_driver_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          id: string
          tenant_id: string
          client_id: string | null
          phone_number: string
          client_name: string | null
          last_message_at: string | null
          message_count: number
          unread_count: number
          status: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          client_id?: string | null
          phone_number: string
          client_name?: string | null
          last_message_at?: string | null
          message_count?: number
          unread_count?: number
          status?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          client_id?: string | null
          phone_number?: string
          client_name?: string | null
          last_message_at?: string | null
          message_count?: number
          unread_count?: number
          status?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          id: string
          tenant_id: string
          conversation_id: string
          message_text: string | null
          direction: string
          media_url: string | null
          media_type: string | null
          status: string
          sent_at: string | null
          delivered_at: string | null
          read_at: string | null
          created_at: string | null
          message_body: string | null
          message_sid: string | null
          metadata: Json | null
          sent_by: string | null
          media_storage_path: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          conversation_id: string
          message_text?: string | null
          direction: string
          media_url?: string | null
          media_type?: string | null
          status?: string
          sent_at?: string | null
          delivered_at?: string | null
          read_at?: string | null
          created_at?: string | null
          message_body?: string | null
          message_sid?: string | null
          metadata?: Json | null
          sent_by?: string | null
          media_storage_path?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          conversation_id?: string
          message_text?: string | null
          direction?: string
          media_url?: string | null
          media_type?: string | null
          status?: string
          sent_at?: string | null
          delivered_at?: string | null
          read_at?: string | null
          created_at?: string | null
          message_body?: string | null
          message_sid?: string | null
          metadata?: Json | null
          sent_by?: string | null
          media_storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      writing_rules: {
        Row: {
          id: string
          tenant_id: string | null
          name: string
          slug: string | null
          category: string | null
          description: string
          examples: string[] | null
          applies_to_tiers: string[] | null
          applies_to_categories: string[] | null
          is_active: boolean | null
          sort_order: number | null
          created_at: string | null
          updated_at: string | null
          created_by: string | null
          updated_by: string | null
          rule_type: string | null
          priority: number | null
          applies_to: string[] | null
          examples_json: Json | null
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          name: string
          slug?: string | null
          category?: string | null
          description: string
          examples?: string[] | null
          applies_to_tiers?: string[] | null
          applies_to_categories?: string[] | null
          is_active?: boolean | null
          sort_order?: number | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          updated_by?: string | null
          rule_type?: string | null
          priority?: number | null
          applies_to?: string[] | null
          examples_json?: Json | null
        }
        Update: {
          id?: string
          tenant_id?: string | null
          name?: string
          slug?: string | null
          category?: string | null
          description?: string
          examples?: string[] | null
          applies_to_tiers?: string[] | null
          applies_to_categories?: string[] | null
          is_active?: boolean | null
          sort_order?: number | null
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          updated_by?: string | null
          rule_type?: string | null
          priority?: number | null
          applies_to?: string[] | null
          examples_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "writing_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    // NOTE: must be `{ [_ in never]: never }`, NOT `Record<string, never>`.
    // Record's string index signature makes `keyof Functions` = string, which
    // postgrest-js reads as "every column is a computed field" — collapsing
    // every select('*') result to {}.
    Views: { [_ in never]: never }
    Functions: {
      convert_amount: {
        Args: {
          p_amount?: number
          p_from?: string
          p_to?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      create_b2b_quote_version: {
        Args: {
          p_change_reason?: string
          p_changed_by?: string
          p_quote_id?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      create_b2c_quote_version: {
        Args: {
          p_change_reason?: string
          p_changed_by?: string
          p_quote_id?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      find_or_create_unified_conversation: {
        Args: {
          p_email?: string
          p_name?: string
          p_phone?: string
          p_tenant_id?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      generate_b2b_quote_number: {
        Args: Record<PropertyKey, never>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      generate_b2c_quote_number: {
        Args: Record<PropertyKey, never>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      generate_booking_number: {
        Args: Record<PropertyKey, never>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      generate_payment_number: {
        Args: Record<PropertyKey, never>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      get_primary_tenant_id: {
        Args: Record<PropertyKey, never>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      get_quote_pdf_path: {
        Args: {
          p_quote_id?: string
          p_quote_type?: string
          p_tenant_id?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      get_tenant_agent_memories: {
        Args: {
          p_limit?: number
          p_min_confidence?: number
          p_subject_id?: string
          p_subject_type?: string
          p_tenant_id?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      get_tenant_logo_path: {
        Args: {
          p_file_extension?: string
          p_tenant_id?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      get_tenant_subscription: {
        Args: {
          p_tenant_id?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      get_use_global_catalog: {
        Args: Record<PropertyKey, never>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      get_user_tenant_id: {
        Args: Record<PropertyKey, never>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      increment_activity_minutes: {
        Args: {
          p_day?: string
          p_minutes?: number
          p_tenant_id?: string
          p_user_id?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      increment_usage: {
        Args: {
          p_amount?: number
          p_metric?: string
          p_period_end?: string
          p_period_start?: string
          p_tenant_id?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      log_activity: {
        Args: {
          p_action_type?: string
          p_details?: Json
          p_ip_address?: string
          p_resource_id?: string
          p_resource_type?: string
          p_tenant_id?: string
          p_user_agent?: string
          p_user_id?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      mark_overdue_followups: {
        Args: Record<PropertyKey, never>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      match_copilot_knowledge: {
        Args: {
          p_match_count?: number
          p_query_embedding?: string
          p_source_types?: string[]
          p_tenant_id?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      next_supplier_invoice_reference: {
        Args: Record<PropertyKey, never>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      purge_expired_agent_memories: {
        Args: Record<PropertyKey, never>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      record_booking_payment: {
        Args: {
          p_amount?: number
          p_booking_id?: string
          p_created_by?: string
          p_notes?: string
          p_payment_date?: string
          p_payment_method?: string
          p_payment_number?: string
          p_payment_type?: string
          p_tenant_id?: string
          p_transaction_reference?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      recount_client_bookings: {
        Args: {
          p_client_id?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      revert_b2b_quote_to_version: {
        Args: {
          p_quote_id?: string
          p_revert_reason?: string
          p_reverted_by?: string
          p_version_number?: number
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      revert_b2c_quote_to_version: {
        Args: {
          p_quote_id?: string
          p_revert_reason?: string
          p_reverted_by?: string
          p_version_number?: number
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      trip_unread_counts: {
        Args: {
          p_itinerary_ids?: string[]
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      update_unified_conversation_stats: {
        Args: {
          p_unified_id?: string
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
      user_has_role: {
        Args: {
          required_roles?: string[]
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Returns: any
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
