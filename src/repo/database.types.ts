// Generated from the Supabase project with the MCP server (generate_typescript_types).
// Regenerate after every migration. Do not edit by hand.

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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_replay: {
        Row: {
          created_at: string
          input_hash: string
          output: Json
          step: string
        }
        Insert: {
          created_at?: string
          input_hash: string
          output: Json
          step: string
        }
        Update: {
          created_at?: string
          input_hash?: string
          output?: Json
          step?: string
        }
        Relationships: []
      }
      ai_runs: {
        Row: {
          accepted: boolean | null
          checks: Json
          created_at: string
          edited: boolean | null
          id: string
          input: Json
          latency_ms: number
          line_id: string | null
          mode: string
          model: string
          output: Json | null
          raw_output: string | null
          request_id: string | null
          step: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          accepted?: boolean | null
          checks?: Json
          created_at?: string
          edited?: boolean | null
          id?: string
          input: Json
          latency_ms: number
          line_id?: string | null
          mode: string
          model: string
          output?: Json | null
          raw_output?: string | null
          request_id?: string | null
          step: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          accepted?: boolean | null
          checks?: Json
          created_at?: string
          edited?: boolean | null
          id?: string
          input?: Json
          latency_ms?: number
          line_id?: string | null
          mode?: string
          model?: string
          output?: Json | null
          raw_output?: string | null
          request_id?: string | null
          step?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: []
      }
      catalog_materials: {
        Row: {
          eur_per_kg_base: number
          grade: Database["public"]["Enums"]["material_grade"]
        }
        Insert: {
          eur_per_kg_base: number
          grade: Database["public"]["Enums"]["material_grade"]
        }
        Update: {
          eur_per_kg_base?: number
          grade?: Database["public"]["Enums"]["material_grade"]
        }
        Relationships: []
      }
      catalog_profiles: {
        Row: {
          family: Database["public"]["Enums"]["product_family"]
          kg_per_m: number
          size: number
        }
        Insert: {
          family: Database["public"]["Enums"]["product_family"]
          kg_per_m: number
          size: number
        }
        Update: {
          family?: Database["public"]["Enums"]["product_family"]
          kg_per_m?: number
          size?: number
        }
        Relationships: []
      }
      customer_responses: {
        Row: {
          applied: boolean
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          interpretation: Json | null
          quotation_id: string
          raw_text: string
        }
        Insert: {
          applied?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          interpretation?: Json | null
          quotation_id: string
          raw_text: string
        }
        Update: {
          applied?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          interpretation?: Json | null
          quotation_id?: string
          raw_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_responses_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          country: string
          created_at: string
          id: string
          name: string
          segment: string
        }
        Insert: {
          country?: string
          created_at?: string
          id?: string
          name: string
          segment?: string
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          name?: string
          segment?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          actor_name: string
          actor_role: string
          created_at: string
          id: string
          line_id: string | null
          payload: Json
          request_id: string
          type: string
        }
        Insert: {
          actor_name?: string
          actor_role: string
          created_at?: string
          id?: string
          line_id?: string | null
          payload?: Json
          request_id: string
          type: string
        }
        Update: {
          actor_name?: string
          actor_role?: string
          created_at?: string
          id?: string
          line_id?: string | null
          payload?: Json
          request_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      feasibility_checks: {
        Row: {
          alternative: Json | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          line_id: string
          notes: string | null
          requested_at: string
          requested_by: string
          rule_hits: Json
          status: Database["public"]["Enums"]["check_status"]
        }
        Insert: {
          alternative?: Json | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          line_id: string
          notes?: string | null
          requested_at?: string
          requested_by: string
          rule_hits?: Json
          status?: Database["public"]["Enums"]["check_status"]
        }
        Update: {
          alternative?: Json | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          line_id?: string
          notes?: string | null
          requested_at?: string
          requested_by?: string
          rule_hits?: Json
          status?: Database["public"]["Enums"]["check_status"]
        }
        Relationships: [
          {
            foreignKeyName: "feasibility_checks_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
        ]
      }
      feasibility_rules: {
        Row: {
          family: Database["public"]["Enums"]["product_family"] | null
          id: string
          material: Database["public"]["Enums"]["material_grade"] | null
          max_length_mm: number | null
          min_quantity: number | null
          not_offered: boolean
          note: string
          size_max: number | null
          size_min: number | null
        }
        Insert: {
          family?: Database["public"]["Enums"]["product_family"] | null
          id: string
          material?: Database["public"]["Enums"]["material_grade"] | null
          max_length_mm?: number | null
          min_quantity?: number | null
          not_offered?: boolean
          note: string
          size_max?: number | null
          size_min?: number | null
        }
        Update: {
          family?: Database["public"]["Enums"]["product_family"] | null
          id?: string
          material?: Database["public"]["Enums"]["material_grade"] | null
          max_length_mm?: number | null
          min_quantity?: number | null
          not_offered?: boolean
          note?: string
          size_max?: number | null
          size_min?: number | null
        }
        Relationships: []
      }
      legacy_quotes: {
        Row: {
          customer: string
          margin: number
          material: string
          outcome: string
          product: string
          production_cost: number
          quantity: number
          quote_date: string
          quote_id: string
          quoted_price: number
          revision: number
          source: string
        }
        Insert: {
          customer: string
          margin: number
          material: string
          outcome: string
          product: string
          production_cost: number
          quantity: number
          quote_date: string
          quote_id: string
          quoted_price: number
          revision: number
          source: string
        }
        Update: {
          customer?: string
          margin?: number
          material?: string
          outcome?: string
          product?: string
          production_cost?: number
          quantity?: number
          quote_date?: string
          quote_id?: string
          quoted_price?: number
          revision?: number
          source?: string
        }
        Relationships: []
      }
      lines: {
        Row: {
          agreed_in_quotation_id: string | null
          alternative_of_line_id: string | null
          commercial_status: Database["public"]["Enums"]["commercial_status"]
          cost_estimate: number | null
          created_at: string
          family: Database["public"]["Enums"]["product_family"]
          id: string
          length_mm: number
          line_no: number
          material: Database["public"]["Enums"]["material_grade"]
          notes: string
          price_memo: string | null
          quantity: number
          reference_ids: string[]
          request_id: string
          size: number
          technical_status: Database["public"]["Enums"]["technical_status"]
          unit_price: number | null
        }
        Insert: {
          agreed_in_quotation_id?: string | null
          alternative_of_line_id?: string | null
          commercial_status?: Database["public"]["Enums"]["commercial_status"]
          cost_estimate?: number | null
          created_at?: string
          family: Database["public"]["Enums"]["product_family"]
          id?: string
          length_mm: number
          line_no: number
          material: Database["public"]["Enums"]["material_grade"]
          notes?: string
          price_memo?: string | null
          quantity: number
          reference_ids?: string[]
          request_id: string
          size: number
          technical_status?: Database["public"]["Enums"]["technical_status"]
          unit_price?: number | null
        }
        Update: {
          agreed_in_quotation_id?: string | null
          alternative_of_line_id?: string | null
          commercial_status?: Database["public"]["Enums"]["commercial_status"]
          cost_estimate?: number | null
          created_at?: string
          family?: Database["public"]["Enums"]["product_family"]
          id?: string
          length_mm?: number
          line_no?: number
          material?: Database["public"]["Enums"]["material_grade"]
          notes?: string
          price_memo?: string | null
          quantity?: number
          reference_ids?: string[]
          request_id?: string
          size?: number
          technical_status?: Database["public"]["Enums"]["technical_status"]
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lines_agreed_in_quotation_id_fkey"
            columns: ["agreed_in_quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lines_alternative_of_line_id_fkey"
            columns: ["alternative_of_line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lines_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          id: string
          lines: Json
          order_ref: string
          request_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lines?: Json
          order_ref: string
          request_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lines?: Json
          order_ref?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_lines: {
        Row: {
          cost_estimate: number
          created_at: string
          family: Database["public"]["Enums"]["product_family"]
          id: string
          length_mm: number
          line_id: string
          line_no: number
          margin: number
          material: Database["public"]["Enums"]["material_grade"]
          price_memo: string | null
          quantity: number
          quotation_id: string
          reference_ids: string[]
          size: number
          subject_to_feasibility: boolean
          total_price: number
          unit_price: number
        }
        Insert: {
          cost_estimate: number
          created_at?: string
          family: Database["public"]["Enums"]["product_family"]
          id?: string
          length_mm: number
          line_id: string
          line_no: number
          margin: number
          material: Database["public"]["Enums"]["material_grade"]
          price_memo?: string | null
          quantity: number
          quotation_id: string
          reference_ids?: string[]
          size: number
          subject_to_feasibility?: boolean
          total_price: number
          unit_price: number
        }
        Update: {
          cost_estimate?: number
          created_at?: string
          family?: Database["public"]["Enums"]["product_family"]
          id?: string
          length_mm?: number
          line_id?: string
          line_no?: number
          margin?: number
          material?: Database["public"]["Enums"]["material_grade"]
          price_memo?: string | null
          quantity?: number
          quotation_id?: string
          reference_ids?: string[]
          size?: number
          subject_to_feasibility?: boolean
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_lines_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_lines_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          cover_text: string | null
          created_at: string
          id: string
          request_id: string
          revision_no: number
          sent_at: string | null
          status: Database["public"]["Enums"]["quotation_status"]
          valid_until: string | null
        }
        Insert: {
          cover_text?: string | null
          created_at?: string
          id?: string
          request_id: string
          revision_no: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quotation_status"]
          valid_until?: string | null
        }
        Update: {
          cover_text?: string | null
          created_at?: string
          id?: string
          request_id?: string
          revision_no?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quotation_status"]
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          created_at: string
          customer_id: string
          delivery_hint: string | null
          hold_reason: string | null
          id: string
          open_questions: Json
          order_id: string | null
          owner: string
          received_at: string
          ref: string
          requested_delivery_date: string | null
          source_text: string
          stated_date: string | null
          status: Database["public"]["Enums"]["request_status"]
          title: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          delivery_hint?: string | null
          hold_reason?: string | null
          id?: string
          open_questions?: Json
          order_id?: string | null
          owner?: string
          received_at?: string
          ref: string
          requested_delivery_date?: string | null
          source_text?: string
          stated_date?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          title?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          delivery_hint?: string | null
          hold_reason?: string | null
          id?: string
          open_questions?: Json
          order_id?: string | null
          owner?: string
          received_at?: string
          ref?: string
          requested_delivery_date?: string | null
          source_text?: string
          stated_date?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      check_status: "pending" | "feasible" | "not_feasible" | "waived"
      commercial_status:
        | "draft"
        | "quoted"
        | "negotiating"
        | "agreed"
        | "declined"
        | "withdrawn"
        | "superseded"
      material_grade: "S235" | "S355" | "S460"
      product_family: "HEA" | "HEB" | "IPE"
      quotation_status: "draft" | "sent" | "superseded"
      request_status: "open" | "on_hold" | "rejected" | "converted"
      technical_status: "not_required" | "pending" | "feasible" | "not_feasible"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      check_status: ["pending", "feasible", "not_feasible", "waived"],
      commercial_status: [
        "draft",
        "quoted",
        "negotiating",
        "agreed",
        "declined",
        "withdrawn",
        "superseded",
      ],
      material_grade: ["S235", "S355", "S460"],
      product_family: ["HEA", "HEB", "IPE"],
      quotation_status: ["draft", "sent", "superseded"],
      request_status: ["open", "on_hold", "rejected", "converted"],
      technical_status: ["not_required", "pending", "feasible", "not_feasible"],
    },
  },
} as const
