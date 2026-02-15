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
          id: string
          nights: number | null
          property_id: string
          raw_ics_payload: string | null
          room_id: string | null
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
          id?: string
          nights?: number | null
          property_id: string
          raw_ics_payload?: string | null
          room_id?: string | null
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
          id?: string
          nights?: number | null
          property_id?: string
          raw_ics_payload?: string | null
          room_id?: string | null
          source_platform?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          help_text: string | null
          id: string
          label: string
          required: boolean | null
          section_id: string
          sort_order: number | null
          type: Database["public"]["Enums"]["checklist_item_type"] | null
        }
        Insert: {
          help_text?: string | null
          id?: string
          label: string
          required?: boolean | null
          section_id: string
          sort_order?: number | null
          type?: Database["public"]["Enums"]["checklist_item_type"] | null
        }
        Update: {
          help_text?: string | null
          id?: string
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
      checklist_responses: {
        Row: {
          id: string
          item_id: string
          number_value: number | null
          photo_url: string | null
          run_id: string
          text_value: string | null
          yesno_value: boolean | null
        }
        Insert: {
          id?: string
          item_id: string
          number_value?: number | null
          photo_url?: string | null
          run_id: string
          text_value?: string | null
          yesno_value?: boolean | null
        }
        Update: {
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
          id: string
          overall_notes: string | null
          property_id: string | null
          room_id: string | null
          started_at: string | null
        }
        Insert: {
          cleaner_user_id: string
          cleaning_task_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          finished_at?: string | null
          id?: string
          overall_notes?: string | null
          property_id?: string | null
          room_id?: string | null
          started_at?: string | null
        }
        Update: {
          cleaner_user_id?: string
          cleaning_task_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          finished_at?: string | null
          id?: string
          overall_notes?: string | null
          property_id?: string | null
          room_id?: string | null
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_runs_cleaning_task_id_fkey"
            columns: ["cleaning_task_id"]
            isOneToOne: false
            referencedRelation: "cleaning_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_runs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_runs_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_sections: {
        Row: {
          id: string
          sort_order: number | null
          template_id: string
          title: string
        }
        Insert: {
          id?: string
          sort_order?: number | null
          template_id: string
          title: string
        }
        Update: {
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
          id: string
          name: string
          property_id: string | null
          room_id: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          id?: string
          name: string
          property_id?: string | null
          room_id?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string
          id?: string
          name?: string
          property_id?: string | null
          room_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_templates_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
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
          id: string
          locked: boolean | null
          next_booking_id: string | null
          nights_to_show: number | null
          notes: string | null
          previous_booking_id: string | null
          property_id: string
          room_id: string | null
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
          id?: string
          locked?: boolean | null
          next_booking_id?: string | null
          nights_to_show?: number | null
          notes?: string | null
          previous_booking_id?: string | null
          property_id: string
          room_id?: string | null
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
          id?: string
          locked?: boolean | null
          next_booking_id?: string | null
          nights_to_show?: number | null
          notes?: string | null
          previous_booking_id?: string | null
          property_id?: string
          room_id?: string | null
          source?: Database["public"]["Enums"]["cleaning_source"] | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["cleaning_status"] | null
          updated_at?: string
        }
        Relationships: [
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
            foreignKeyName: "cleaning_tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_tasks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          created_at: string
          created_by_user_id: string
          date: string
          id: string
          name: string
          property_id: string | null
          receipt_photo_url: string | null
          reference: string | null
          room_id: string | null
          shop: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by_user_id: string
          date?: string
          id?: string
          name: string
          property_id?: string | null
          receipt_photo_url?: string | null
          reference?: string | null
          room_id?: string | null
          shop?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by_user_id?: string
          date?: string
          id?: string
          name?: string
          property_id?: string | null
          receipt_photo_url?: string | null
          reference?: string | null
          room_id?: string | null
          shop?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      guides: {
        Row: {
          created_at: string
          folder_id: string
          id: string
          pdf_url: string | null
          title: string
          uploaded_by_user_id: string | null
        }
        Insert: {
          created_at?: string
          folder_id: string
          id?: string
          pdf_url?: string | null
          title: string
          uploaded_by_user_id?: string | null
        }
        Update: {
          created_at?: string
          folder_id?: string
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
          id: string
          name: string
          property_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          property_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          property_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guides_folders_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      log_hours: {
        Row: {
          created_at: string
          date: string
          description: string | null
          duration_minutes: number | null
          end_at: string
          id: string
          property_id: string | null
          room_id: string | null
          start_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          description?: string | null
          duration_minutes?: number | null
          end_at: string
          id?: string
          property_id?: string | null
          room_id?: string | null
          start_at: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          description?: string | null
          duration_minutes?: number | null
          end_at?: string
          id?: string
          property_id?: string | null
          room_id?: string | null
          start_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "log_hours_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_hours_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_tickets: {
        Row: {
          created_at: string
          created_by_user_id: string
          date: string
          id: string
          issue: string
          pic1_url: string | null
          pic2_url: string | null
          priority: Database["public"]["Enums"]["maintenance_priority"] | null
          property_id: string | null
          room_id: string | null
          status: Database["public"]["Enums"]["maintenance_status"] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          date?: string
          id?: string
          issue: string
          pic1_url?: string | null
          pic2_url?: string | null
          priority?: Database["public"]["Enums"]["maintenance_priority"] | null
          property_id?: string | null
          room_id?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          date?: string
          id?: string
          issue?: string
          pic1_url?: string | null
          pic2_url?: string | null
          priority?: Database["public"]["Enums"]["maintenance_priority"] | null
          property_id?: string | null
          room_id?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_tickets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_updates: {
        Row: {
          created_at: string
          created_by_user_id: string
          id: string
          note: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          id?: string
          note: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
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
      payout_periods: {
        Row: {
          created_at: string
          end_date: string
          id: string
          property_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["payout_period_status"] | null
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          property_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["payout_period_status"] | null
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          property_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["payout_period_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_periods_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          cleaner_user_id: string
          created_at: string
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
      products: {
        Row: {
          active: boolean | null
          category: string | null
          created_at: string
          id: string
          name: string
          property_id: string | null
        }
        Insert: {
          active?: boolean | null
          category?: string | null
          created_at?: string
          id?: string
          name: string
          property_id?: string | null
        }
        Update: {
          active?: boolean | null
          category?: string | null
          created_at?: string
          id?: string
          name?: string
          property_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          hourly_rate_override: number | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          hourly_rate_override?: number | null
          id?: string
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          hourly_rate_override?: number | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          cleaning_mode: Database["public"]["Enums"]["cleaning_mode"] | null
          created_at: string
          currency: string | null
          default_checkin_time: string | null
          default_checkout_time: string | null
          ics_url_airbnb: string | null
          ics_url_booking: string | null
          ics_url_other: string | null
          id: string
          last_synced_at: string | null
          name: string
          sync_enabled: boolean | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          cleaning_mode?: Database["public"]["Enums"]["cleaning_mode"] | null
          created_at?: string
          currency?: string | null
          default_checkin_time?: string | null
          default_checkout_time?: string | null
          ics_url_airbnb?: string | null
          ics_url_booking?: string | null
          ics_url_other?: string | null
          id?: string
          last_synced_at?: string | null
          name: string
          sync_enabled?: boolean | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          cleaning_mode?: Database["public"]["Enums"]["cleaning_mode"] | null
          created_at?: string
          currency?: string | null
          default_checkin_time?: string | null
          default_checkout_time?: string | null
          ics_url_airbnb?: string | null
          ics_url_booking?: string | null
          ics_url_other?: string | null
          id?: string
          last_synced_at?: string | null
          name?: string
          sync_enabled?: boolean | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rooms: {
        Row: {
          active: boolean | null
          checklist_template_id: string | null
          created_at: string
          id: string
          name: string
          property_id: string
        }
        Insert: {
          active?: boolean | null
          checklist_template_id?: string | null
          created_at?: string
          id?: string
          name: string
          property_id: string
        }
        Update: {
          active?: boolean | null
          checklist_template_id?: string | null
          created_at?: string
          id?: string
          name?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list: {
        Row: {
          created_at: string
          created_by_user_id: string
          id: string
          note: string | null
          product_id: string
          property_id: string | null
          quantity_needed: number | null
          room_id: string | null
          status: Database["public"]["Enums"]["shopping_status"] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          id?: string
          note?: string | null
          product_id: string
          property_id?: string | null
          quantity_needed?: number | null
          room_id?: string | null
          status?: Database["public"]["Enums"]["shopping_status"] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          id?: string
          note?: string | null
          product_id?: string
          property_id?: string | null
          quantity_needed?: number | null
          room_id?: string | null
          status?: Database["public"]["Enums"]["shopping_status"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "cleaner"
      checklist_item_type: "YESNO" | "PHOTO" | "TEXT" | "NUMBER"
      cleaning_mode: "CLEAN_ON_CHECKIN" | "CLEAN_ON_CHECKOUT"
      cleaning_source: "AUTO" | "MANUAL"
      cleaning_status: "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED"
      maintenance_priority: "LOW" | "MEDIUM" | "HIGH"
      maintenance_status: "OPEN" | "IN_PROGRESS" | "DONE"
      payout_period_status: "OPEN" | "CLOSED"
      payout_status: "PENDING" | "PAID"
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
      app_role: ["admin", "manager", "cleaner"],
      checklist_item_type: ["YESNO", "PHOTO", "TEXT", "NUMBER"],
      cleaning_mode: ["CLEAN_ON_CHECKIN", "CLEAN_ON_CHECKOUT"],
      cleaning_source: ["AUTO", "MANUAL"],
      cleaning_status: ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"],
      maintenance_priority: ["LOW", "MEDIUM", "HIGH"],
      maintenance_status: ["OPEN", "IN_PROGRESS", "DONE"],
      payout_period_status: ["OPEN", "CLOSED"],
      payout_status: ["PENDING", "PAID"],
      shopping_status: ["MISSING", "ORDERED", "BOUGHT", "OK"],
    },
  },
} as const
