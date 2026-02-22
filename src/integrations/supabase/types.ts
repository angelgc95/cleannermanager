export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          checkin_at: string | null
          checkout_at: string | null
          created_at: string
          end_date: string
          external_uid: string | null
          guests_count: number | null
          host_user_id: string
          id: string
          listing_id: string
          nights: number | null
          raw_ics_payload: string | null
          source_platform: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          checkin_at?: string | null
          checkout_at?: string | null
          created_at?: string
          end_date: string
          external_uid?: string | null
          guests_count?: number | null
          host_user_id: string
          id?: string
          listing_id: string
          nights?: number | null
          raw_ics_payload?: string | null
          source_platform?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          checkin_at?: string | null
          checkout_at?: string | null
          created_at?: string
          end_date?: string
          external_uid?: string | null
          guests_count?: number | null
          host_user_id?: string
          id?: string
          listing_id?: string
          nights?: number | null
          raw_ics_payload?: string | null
          source_platform?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          help_text: string | null
          host_user_id: string | null
          id: string
          item_key: string | null
          label: string
          required: boolean | null
          section_id: string
          sort_order: number | null
          type: Database["public"]["Enums"]["checklist_item_type"] | null
        }
        Insert: {
          help_text?: string | null
          host_user_id?: string | null
          id?: string
          item_key?: string | null
          label: string
          required?: boolean | null
          section_id: string
          sort_order?: number | null
          type?: Database["public"]["Enums"]["checklist_item_type"] | null
        }
        Update: {
          help_text?: string | null
          host_user_id?: string | null
          id?: string
          item_key?: string | null
          label?: string
          required?: boolean | null
          section_id?: string
          sort_order?: number | null
          type?: Database["public"]["Enums"]["checklist_item_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "checklist_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_photos: {
        Row: {
          created_at: string
          host_user_id: string | null
          id: string
          item_id: string
          photo_url: string
          run_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          host_user_id?: string | null
          id?: string
          item_id: string
          photo_url: string
          run_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          host_user_id?: string | null
          id?: string
          item_id?: string
          photo_url?: string
          run_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_photos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_photos_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "checklist_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_responses: {
        Row: {
          host_user_id: string | null
          id: string
          item_id: string
          number_value: number | null
          photo_url: string | null
          run_id: string
          text_value: string | null
          yesno_value: boolean | null
        }
        Insert: {
          host_user_id?: string | null
          id?: string
          item_id: string
          number_value?: number | null
          photo_url?: string | null
          run_id: string
          text_value?: string | null
          yesno_value?: boolean | null
        }
        Update: {
          host_user_id?: string | null
          id?: string
          item_id?: string
          number_value?: number | null
          photo_url?: string | null
          run_id?: string
          text_value?: string | null
          yesno_value?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_responses_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_responses_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "checklist_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_runs: {
        Row: {
          cleaner_user_id: string
          cleaning_task_id: string | null
          created_at: string
          duration_minutes: number | null
          finished_at: string | null
          host_user_id: string
          id: string
          listing_id: string | null
          overall_notes: string | null
          payout_id: string | null
          started_at: string | null
        }
        Insert: {
          cleaner_user_id: string
          cleaning_task_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          finished_at?: string | null
          host_user_id: string
          id?: string
          listing_id?: string | null
          overall_notes?: string | null
          payout_id?: string | null
          started_at?: string | null
        }
        Update: {
          cleaner_user_id?: string
          cleaning_task_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          finished_at?: string | null
          host_user_id?: string
          id?: string
          listing_id?: string | null
          overall_notes?: string | null
          payout_id?: string | null
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_runs_cleaning_task_id_fkey"
            columns: ["cleaning_task_id"]
            isOneToOne: true
            referencedRelation: "cleaning_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_runs_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_runs_payout_fk"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_sections: {
        Row: {
          host_user_id: string | null
          id: string
          sort_order: number | null
          template_id: string
          title: string
        }
        Insert: {
          host_user_id?: string | null
          id?: string
          sort_order?: number | null
          template_id: string
          title: string
        }
        Update: {
          host_user_id?: string | null
          id?: string
          sort_order?: number | null
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          active: boolean | null
          created_at: string
          host_user_id: string
          id: string
          listing_id: string | null
          name: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          host_user_id: string
          id?: string
          listing_id?: string | null
          name: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          host_user_id?: string
          id?: string
          listing_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaner_assignments: {
        Row: {
          cleaner_user_id: string
          created_at: string
          host_user_id: string
          id: string
          listing_id: string
        }
        Insert: {
          cleaner_user_id: string
          created_at?: string
          host_user_id: string
          id?: string
          listing_id: string
        }
        Update: {
          cleaner_user_id?: string
          created_at?: string
          host_user_id?: string
          id?: string
          listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaner_assignments_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_tasks: {
        Row: {
          assigned_cleaner_user_id: string | null
          checklist_run_id: string | null
          created_at: string
          end_at: string | null
          guests_to_show: number | null
          host_user_id: string
          id: string
          listing_id: string
          locked: boolean | null
          next_booking_id: string | null
          nights_to_show: number | null
          notes: string | null
          previous_booking_id: string | null
          source: Database["public"]["Enums"]["cleaning_source"] | null
          start_at: string | null
          status: Database["public"]["Enums"]["cleaning_status"] | null
          updated_at: string
        }
        Insert: {
          assigned_cleaner_user_id?: string | null
          checklist_run_id?: string | null
          created_at?: string
          end_at?: string | null
          guests_to_show?: number | null
          host_user_id: string
          id?: string
          listing_id: string
          locked?: boolean | null
          next_booking_id?: string | null
          nights_to_show?: number | null
          notes?: string | null
          previous_booking_id?: string | null
          source?: Database["public"]["Enums"]["cleaning_source"] | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["cleaning_status"] | null
          updated_at?: string
        }
        Update: {
          assigned_cleaner_user_id?: string | null
          checklist_run_id?: string | null
          created_at?: string
          end_at?: string | null
          guests_to_show?: number | null
          host_user_id?: string
          id?: string
          listing_id?: string
          locked?: boolean | null
          next_booking_id?: string | null
          nights_to_show?: number | null
          notes?: string | null
          previous_booking_id?: string | null
          source?: Database["public"]["Enums"]["cleaning_source"] | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["cleaning_status"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_tasks_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_tasks_next_booking_id_fkey"
            columns: ["next_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_tasks_previous_booking_id_fkey"
            columns: ["previous_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_tasks_run_fk"
            columns: ["checklist_run_id"]
            isOneToOne: false
            referencedRelation: "checklist_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      events_cache: {
        Row: {
          category: string
          created_at: string
          date: string
          host_user_id: string
          id: string
          location_key: string
          popularity_score: number | null
          raw: Json | null
          source: string
          start_time: string | null
          title: string
          venue: string | null
        }
        Insert: {
          category: string
          created_at?: string
          date: string
          host_user_id: string
          id?: string
          location_key: string
          popularity_score?: number | null
          raw?: Json | null
          source: string
          start_time?: string | null
          title: string
          venue?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          date?: string
          host_user_id?: string
          id?: string
          location_key?: string
          popularity_score?: number | null
          raw?: Json | null
          source?: string
          start_time?: string | null
          title?: string
          venue?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          created_at: string
          created_by_user_id: string
          date: string
          host_user_id: string
          id: string
          listing_id: string | null
          name: string
          receipt_photo_url: string | null
          reference: string | null
          shop: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by_user_id: string
          date?: string
          host_user_id: string
          id?: string
          listing_id?: string | null
          name: string
          receipt_photo_url?: string | null
          reference?: string | null
          shop?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by_user_id?: string
          date?: string
          host_user_id?: string
          id?: string
          listing_id?: string | null
          name?: string
          receipt_photo_url?: string | null
          reference?: string | null
          shop?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      guides: {
        Row: {
          created_at: string
          folder_id: string
          host_user_id: string
          id: string
          pdf_url: string | null
          title: string
          uploaded_by_user_id: string | null
        }
        Insert: {
          created_at?: string
          folder_id: string
          host_user_id: string
          id?: string
          pdf_url?: string | null
          title: string
          uploaded_by_user_id?: string | null
        }
        Update: {
          created_at?: string
          folder_id?: string
          host_user_id?: string
          id?: string
          pdf_url?: string | null
          title?: string
          uploaded_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guides_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "guides_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      guides_folders: {
        Row: {
          created_at: string
          host_user_id: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          host_user_id: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          host_user_id?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      host_settings: {
        Row: {
          created_at: string
          default_hourly_rate: number
          host_user_id: string
          id: string
          last_refreshed_at: string | null
          max_uplift_pct: number
          min_uplift_pct: number
          nightly_price_suggestions_enabled: boolean
          payout_frequency: string
          payout_week_end_day: number
          suggestion_days_ahead: number
          suggestion_radius_km: number
          timezone: string
          weights_json: Json
        }
        Insert: {
          created_at?: string
          default_hourly_rate?: number
          host_user_id: string
          id?: string
          last_refreshed_at?: string | null
          max_uplift_pct?: number
          min_uplift_pct?: number
          nightly_price_suggestions_enabled?: boolean
          payout_frequency?: string
          payout_week_end_day?: number
          suggestion_days_ahead?: number
          suggestion_radius_km?: number
          timezone?: string
          weights_json?: Json
        }
        Update: {
          created_at?: string
          default_hourly_rate?: number
          host_user_id?: string
          id?: string
          last_refreshed_at?: string | null
          max_uplift_pct?: number
          min_uplift_pct?: number
          nightly_price_suggestions_enabled?: boolean
          payout_frequency?: string
          payout_week_end_day?: number
          suggestion_days_ahead?: number
          suggestion_radius_km?: number
          timezone?: string
          weights_json?: Json
        }
        Relationships: []
      }
      in_app_notifications: {
        Row: {
          body: string | null
          created_at: string
          host_user_id: string | null
          id: string
          link: string | null
          notification_job_id: string | null
          read: boolean | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          host_user_id?: string | null
          id?: string
          link?: string | null
          notification_job_id?: string | null
          read?: boolean | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          host_user_id?: string | null
          id?: string
          link?: string | null
          notification_job_id?: string | null
          read?: boolean | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "in_app_notifications_notification_job_id_fkey"
            columns: ["notification_job_id"]
            isOneToOne: false
            referencedRelation: "notification_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          base_nightly_price: number | null
          city: string | null
          country_code: string | null
          created_at: string
          currency: string | null
          default_checkin_time: string | null
          default_checkout_time: string | null
          host_user_id: string
          ics_url_airbnb: string | null
          ics_url_booking: string | null
          ics_url_other: string | null
          id: string
          last_synced_at: string | null
          lat: number | null
          lng: number | null
          name: string
          sync_enabled: boolean | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          base_nightly_price?: number | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          currency?: string | null
          default_checkin_time?: string | null
          default_checkout_time?: string | null
          host_user_id: string
          ics_url_airbnb?: string | null
          ics_url_booking?: string | null
          ics_url_other?: string | null
          id?: string
          last_synced_at?: string | null
          lat?: number | null
          lng?: number | null
          name: string
          sync_enabled?: boolean | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          base_nightly_price?: number | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          currency?: string | null
          default_checkin_time?: string | null
          default_checkout_time?: string | null
          host_user_id?: string
          ics_url_airbnb?: string | null
          ics_url_booking?: string | null
          ics_url_other?: string | null
          id?: string
          last_synced_at?: string | null
          lat?: number | null
          lng?: number | null
          name?: string
          sync_enabled?: boolean | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      log_hours: {
        Row: {
          checklist_run_id: string | null
          cleaning_task_id: string | null
          created_at: string
          date: string
          description: string | null
          duration_minutes: number | null
          end_at: string
          host_user_id: string
          id: string
          listing_id: string | null
          payout_id: string | null
          source: Database["public"]["Enums"]["log_hours_source"] | null
          start_at: string
          user_id: string
        }
        Insert: {
          checklist_run_id?: string | null
          cleaning_task_id?: string | null
          created_at?: string
          date?: string
          description?: string | null
          duration_minutes?: number | null
          end_at: string
          host_user_id: string
          id?: string
          listing_id?: string | null
          payout_id?: string | null
          source?: Database["public"]["Enums"]["log_hours_source"] | null
          start_at: string
          user_id: string
        }
        Update: {
          checklist_run_id?: string | null
          cleaning_task_id?: string | null
          created_at?: string
          date?: string
          description?: string | null
          duration_minutes?: number | null
          end_at?: string
          host_user_id?: string
          id?: string
          listing_id?: string | null
          payout_id?: string | null
          source?: Database["public"]["Enums"]["log_hours_source"] | null
          start_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "log_hours_checklist_run_id_fkey"
            columns: ["checklist_run_id"]
            isOneToOne: true
            referencedRelation: "checklist_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_hours_cleaning_task_id_fkey"
            columns: ["cleaning_task_id"]
            isOneToOne: false
            referencedRelation: "cleaning_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_hours_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_hours_payout_fk"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_tickets: {
        Row: {
          created_at: string
          created_by_user_id: string
          date: string
          host_user_id: string
          id: string
          issue: string
          listing_id: string | null
          pic1_url: string | null
          pic2_url: string | null
          status: Database["public"]["Enums"]["maintenance_status"] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          date?: string
          host_user_id: string
          id?: string
          issue: string
          listing_id?: string | null
          pic1_url?: string | null
          pic2_url?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          date?: string
          host_user_id?: string
          id?: string
          issue?: string
          listing_id?: string | null
          pic1_url?: string | null
          pic2_url?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_tickets_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_updates: {
        Row: {
          created_at: string
          created_by_user_id: string
          host_user_id: string | null
          id: string
          note: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          host_user_id?: string | null
          id?: string
          note: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          host_user_id?: string | null
          id?: string
          note?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_updates_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "maintenance_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_jobs: {
        Row: {
          cleaning_task_id: string
          created_at: string
          host_user_id: string | null
          id: string
          last_error: string | null
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_job_status"] | null
          type: Database["public"]["Enums"]["notification_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cleaning_task_id: string
          created_at?: string
          host_user_id?: string | null
          id?: string
          last_error?: string | null
          scheduled_for: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_job_status"] | null
          type: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cleaning_task_id?: string
          created_at?: string
          host_user_id?: string | null
          id?: string
          last_error?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_job_status"] | null
          type?: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_jobs_cleaning_task_id_fkey"
            columns: ["cleaning_task_id"]
            isOneToOne: false
            referencedRelation: "cleaning_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          checklist_2pm_enabled: boolean | null
          created_at: string
          email_enabled: boolean | null
          id: string
          inapp_enabled: boolean | null
          manager_cc_enabled: boolean | null
          push_enabled: boolean | null
          reminders_12h_enabled: boolean | null
          reminders_1h_enabled: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          checklist_2pm_enabled?: boolean | null
          created_at?: string
          email_enabled?: boolean | null
          id?: string
          inapp_enabled?: boolean | null
          manager_cc_enabled?: boolean | null
          push_enabled?: boolean | null
          reminders_12h_enabled?: boolean | null
          reminders_1h_enabled?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          checklist_2pm_enabled?: boolean | null
          created_at?: string
          email_enabled?: boolean | null
          id?: string
          inapp_enabled?: boolean | null
          manager_cc_enabled?: boolean | null
          push_enabled?: boolean | null
          reminders_12h_enabled?: boolean | null
          reminders_1h_enabled?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payout_periods: {
        Row: {
          created_at: string
          end_date: string
          host_user_id: string
          id: string
          start_date: string
          status: Database["public"]["Enums"]["payout_period_status"] | null
        }
        Insert: {
          created_at?: string
          end_date: string
          host_user_id: string
          id?: string
          start_date: string
          status?: Database["public"]["Enums"]["payout_period_status"] | null
        }
        Update: {
          created_at?: string
          end_date?: string
          host_user_id?: string
          id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["payout_period_status"] | null
        }
        Relationships: []
      }
      payouts: {
        Row: {
          cleaner_user_id: string
          created_at: string
          host_user_id: string
          hourly_rate_used: number
          id: string
          paid_at: string | null
          payment_reference: string | null
          period_id: string
          status: Database["public"]["Enums"]["payout_status"] | null
          total_amount: number
          total_minutes: number | null
        }
        Insert: {
          cleaner_user_id: string
          created_at?: string
          host_user_id: string
          hourly_rate_used: number
          id?: string
          paid_at?: string | null
          payment_reference?: string | null
          period_id: string
          status?: Database["public"]["Enums"]["payout_status"] | null
          total_amount?: number
          total_minutes?: number | null
        }
        Update: {
          cleaner_user_id?: string
          created_at?: string
          host_user_id?: string
          hourly_rate_used?: number
          id?: string
          paid_at?: string | null
          payment_reference?: string | null
          period_id?: string
          status?: Database["public"]["Enums"]["payout_status"] | null
          total_amount?: number
          total_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payout_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_suggestions: {
        Row: {
          base_price: number
          color_level: string
          confidence: number
          created_at: string
          date: string
          host_user_id: string
          id: string
          listing_id: string
          reasons: Json
          reviewed: boolean
          suggested_price: number
          updated_at: string
          uplift_pct: number
        }
        Insert: {
          base_price: number
          color_level?: string
          confidence?: number
          created_at?: string
          date: string
          host_user_id: string
          id?: string
          listing_id: string
          reasons?: Json
          reviewed?: boolean
          suggested_price: number
          updated_at?: string
          uplift_pct?: number
        }
        Update: {
          base_price?: number
          color_level?: string
          confidence?: number
          created_at?: string
          date?: string
          host_user_id?: string
          id?: string
          listing_id?: string
          reasons?: Json
          reviewed?: boolean
          suggested_price?: number
          updated_at?: string
          uplift_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "pricing_suggestions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean | null
          category: string | null
          created_at: string
          host_user_id: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean | null
          category?: string | null
          created_at?: string
          host_user_id: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean | null
          category?: string | null
          created_at?: string
          host_user_id?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          unique_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          unique_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          unique_code?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shopping_list: {
        Row: {
          checklist_run_id: string | null
          cleared_by_user_id: string | null
          created_at: string
          created_by_user_id: string
          created_from:
            | Database["public"]["Enums"]["shopping_created_from"]
            | null
          host_user_id: string
          id: string
          last_cleared_at: string | null
          listing_id: string | null
          note: string | null
          product_id: string
          quantity_needed: number | null
          status: Database["public"]["Enums"]["shopping_status"] | null
          submission_id: string | null
          updated_at: string
        }
        Insert: {
          checklist_run_id?: string | null
          cleared_by_user_id?: string | null
          created_at?: string
          created_by_user_id: string
          created_from?:
            | Database["public"]["Enums"]["shopping_created_from"]
            | null
          host_user_id: string
          id?: string
          last_cleared_at?: string | null
          listing_id?: string | null
          note?: string | null
          product_id: string
          quantity_needed?: number | null
          status?: Database["public"]["Enums"]["shopping_status"] | null
          submission_id?: string | null
          updated_at?: string
        }
        Update: {
          checklist_run_id?: string | null
          cleared_by_user_id?: string | null
          created_at?: string
          created_by_user_id?: string
          created_from?:
            | Database["public"]["Enums"]["shopping_created_from"]
            | null
          host_user_id?: string
          id?: string
          last_cleared_at?: string | null
          listing_id?: string | null
          note?: string | null
          product_id?: string
          quantity_needed?: number | null
          status?: Database["public"]["Enums"]["shopping_status"] | null
          submission_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_checklist_run_id_fkey"
            columns: ["checklist_run_id"]
            isOneToOne: false
            referencedRelation: "checklist_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "shopping_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_submissions: {
        Row: {
          created_at: string
          created_by_user_id: string
          host_user_id: string
          id: string
          notes: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          host_user_id: string
          id?: string
          notes?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          host_user_id?: string
          id?: string
          notes?: string | null
          status?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleaner_has_listing_access: {
        Args: { _cleaner_id: string; _listing_id: string }
        Returns: boolean
      }
      cleaner_is_assigned_to_host: {
        Args: { _cleaner_id: string; _host_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "host" | "cleaner"
      checklist_item_type: "YESNO" | "PHOTO" | "TEXT" | "NUMBER"
      cleaning_source: "AUTO" | "MANUAL"
      cleaning_status: "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED"
      log_hours_source: "MANUAL" | "CHECKLIST"
      maintenance_priority: "LOW" | "MEDIUM" | "HIGH"
      maintenance_status: "OPEN" | "IN_PROGRESS" | "DONE"
      notification_job_status: "SCHEDULED" | "SENT" | "SKIPPED" | "FAILED"
      notification_type: "REMINDER_12H" | "REMINDER_1H" | "CHECKLIST_2PM"
      payout_period_status: "OPEN" | "CLOSED"
      payout_status: "PENDING" | "PAID"
      shopping_created_from: "MANUAL" | "CHECKLIST"
      shopping_status: "MISSING" | "ORDERED" | "BOUGHT" | "OK"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["host", "cleaner"],
      checklist_item_type: ["YESNO", "PHOTO", "TEXT", "NUMBER"],
      cleaning_source: ["AUTO", "MANUAL"],
      cleaning_status: ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"],
      log_hours_source: ["MANUAL", "CHECKLIST"],
      maintenance_priority: ["LOW", "MEDIUM", "HIGH"],
      maintenance_status: ["OPEN", "IN_PROGRESS", "DONE"],
      notification_job_status: ["SCHEDULED", "SENT", "SKIPPED", "FAILED"],
      notification_type: ["REMINDER_12H", "REMINDER_1H", "CHECKLIST_2PM"],
      payout_period_status: ["OPEN", "CLOSED"],
      payout_status: ["PENDING", "PAID"],
      shopping_created_from: ["MANUAL", "CHECKLIST"],
      shopping_status: ["MISSING", "ORDERED", "BOUGHT", "OK"],
    },
  },
} as const
