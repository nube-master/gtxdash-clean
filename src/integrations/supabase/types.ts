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
      _migration_log: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: number
          metadata: Json | null
          phase: string
          rows_affected: number | null
          rows_after: number | null
          rows_before: number | null
          started_at: string | null
          status: string | null
          step: string
          table_name: string | null
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: number
          metadata?: Json | null
          phase: string
          rows_affected?: number | null
          rows_after?: number | null
          rows_before?: number | null
          started_at?: string | null
          status?: string | null
          step: string
          table_name?: string | null
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: number
          metadata?: Json | null
          phase?: string
          rows_affected?: number | null
          rows_after?: number | null
          rows_before?: number | null
          started_at?: string | null
          status?: string | null
          step?: string
          table_name?: string | null
        }
        Relationships: []
      }
      academy_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          lesson_id: string
          operation_id: string
          user_id: string
          user_name: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          lesson_id: string
          operation_id: string
          user_id: string
          user_name?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          lesson_id?: string
          operation_id?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_comments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "academy_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_comments_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_academy_comments_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_courses: {
        Row: {
          cover_url: string
          created_at: string
          description: string
          id: string
          is_published: boolean
          operation_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          cover_url?: string
          created_at?: string
          description?: string
          id?: string
          is_published?: boolean
          operation_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          cover_url?: string
          created_at?: string
          description?: string
          id?: string
          is_published?: boolean
          operation_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_courses_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_academy_courses_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_knowledge: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          operation_id: string
          sort_order: number
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          operation_id: string
          sort_order?: number
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          operation_id?: string
          sort_order?: number
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_knowledge_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_academy_knowledge_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_lesson_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          lesson_id: string
          operation_id: string
          sort_order: number
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number
          file_type?: string
          file_url: string
          id?: string
          lesson_id: string
          operation_id: string
          sort_order?: number
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          lesson_id?: string
          operation_id?: string
          sort_order?: number
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_lesson_attachments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "academy_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_lesson_attachments_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_academy_lesson_attachments_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_lesson_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          id: string
          lesson_id: string
          operation_id: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          lesson_id: string
          operation_id: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          lesson_id?: string
          operation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "academy_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_lesson_progress_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_academy_lesson_progress_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_lessons: {
        Row: {
          checklist: Json
          content: string
          created_at: string
          description: string
          id: string
          links: Json
          module_id: string
          operation_id: string
          sort_order: number
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          checklist?: Json
          content?: string
          created_at?: string
          description?: string
          id?: string
          links?: Json
          module_id: string
          operation_id: string
          sort_order?: number
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          checklist?: Json
          content?: string
          created_at?: string
          description?: string
          id?: string
          links?: Json
          module_id?: string
          operation_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academy_lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "academy_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_lessons_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_academy_lessons_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_modules: {
        Row: {
          course_id: string | null
          created_at: string
          description: string
          icon: string
          id: string
          operation_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          description?: string
          icon?: string
          id?: string
          operation_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          description?: string
          icon?: string
          id?: string
          operation_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "academy_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_modules_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_academy_modules_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_playbooks: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          operation_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          operation_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          operation_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_playbooks_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_academy_playbooks_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      account_status_log: {
        Row: {
          account_id: string
          account_name: string
          changed_at: string
          id: string
          new_status: number
          old_status: number | null
          operation_id: string
        }
        Insert: {
          account_id: string
          account_name?: string
          changed_at?: string
          id?: string
          new_status: number
          old_status?: number | null
          operation_id: string
        }
        Update: {
          account_id?: string
          account_name?: string
          changed_at?: string
          id?: string
          new_status?: number
          old_status?: number | null
          operation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_status_log_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_account_status_log_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      account_utm_aliases: {
        Row: {
          account_id: string
          account_label: string
          created_at: string
          id: string
          operation_id: string
          updated_at: string
          utm_aliases: string[]
        }
        Insert: {
          account_id: string
          account_label?: string
          created_at?: string
          id?: string
          operation_id: string
          updated_at?: string
          utm_aliases?: string[]
        }
        Update: {
          account_id?: string
          account_label?: string
          created_at?: string
          id?: string
          operation_id?: string
          updated_at?: string
          utm_aliases?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "account_utm_aliases_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_account_utm_aliases_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_mappings: {
        Row: {
          created_at: string | null
          id: string
          nickname: string
          operation_id: string | null
          platform: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          nickname: string
          operation_id?: string | null
          platform?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          nickname?: string
          operation_id?: string | null
          platform?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_mappings_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_operation_mapping: {
        Row: {
          affiliate_id: string
          created_at: string | null
          id: string
          operation_id: string
          program_id: string
        }
        Insert: {
          affiliate_id: string
          created_at?: string | null
          id?: string
          operation_id: string
          program_id: string
        }
        Update: {
          affiliate_id?: string
          created_at?: string | null
          id?: string
          operation_id?: string
          program_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          operation_id: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          operation_id: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          operation_id?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_app_settings_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_leaks: {
        Row: {
          affiliate_id: string | null
          created_at: string | null
          external_order_id: string | null
          id: string
          operation_id: string | null
          program_id: string | null
          reason: string | null
        }
        Insert: {
          affiliate_id?: string | null
          created_at?: string | null
          external_order_id?: string | null
          id?: string
          operation_id?: string | null
          program_id?: string | null
          reason?: string | null
        }
        Update: {
          affiliate_id?: string | null
          created_at?: string | null
          external_order_id?: string | null
          id?: string
          operation_id?: string | null
          program_id?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      audit_log_access_denied: {
        Row: {
          attempted_route: string
          created_at: string
          granted_routes: string[]
          id: string
          ip: string | null
          operation_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          attempted_route: string
          created_at?: string
          granted_routes?: string[]
          id?: string
          ip?: string | null
          operation_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          attempted_route?: string
          created_at?: string
          granted_routes?: string[]
          id?: string
          ip?: string | null
          operation_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      automated_reports_log: {
        Row: {
          created_at: string
          id: string
          metrics: Json | null
          operation_id: string
          period_hours: number
          pushcut_status: string | null
          report_text: string | null
          report_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          metrics?: Json | null
          operation_id: string
          period_hours?: number
          pushcut_status?: string | null
          report_text?: string | null
          report_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          metrics?: Json | null
          operation_id?: string
          period_hours?: number
          pushcut_status?: string | null
          report_text?: string | null
          report_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "automated_reports_log_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_automated_reports_log_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_20260710_offer_status_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string | null
          motivo: string | null
          offer_id: string | null
          status_anterior: Database["public"]["Enums"]["offer_status"] | null
          status_novo: Database["public"]["Enums"]["offer_status"] | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string | null
          motivo?: string | null
          offer_id?: string | null
          status_anterior?: Database["public"]["Enums"]["offer_status"] | null
          status_novo?: Database["public"]["Enums"]["offer_status"] | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string | null
          motivo?: string | null
          offer_id?: string | null
          status_anterior?: Database["public"]["Enums"]["offer_status"] | null
          status_novo?: Database["public"]["Enums"]["offer_status"] | null
        }
        Relationships: []
      }
      backup_20260710_offers: {
        Row: {
          aliases: string[] | null
          apelido_interno: string | null
          comissao_pct: number | null
          comissao_usd: number | null
          cpa_target_brl: number | null
          created_at: string | null
          created_by: string | null
          data_inicio: string | null
          data_morte: string | null
          geo: Database["public"]["Enums"]["offer_geo"] | null
          id: string | null
          landing_pages: string[] | null
          link_checkout: string | null
          margem_pct: number | null
          media_channels: string[] | null
          motivo_morte: string | null
          nicho: Database["public"]["Enums"]["offer_nicho"] | null
          nickname_afiliado: string | null
          notas: string | null
          pixel_id: string | null
          preview_image_updated_at: string | null
          preview_image_url: string | null
          producer_id: string | null
          produto_real: string | null
          sales_page_url: string | null
          status: Database["public"]["Enums"]["offer_status"] | null
          tags: string[] | null
          teto_validacao_brl: number | null
          ticket_front_brl: number | null
          ticket_front_usd: number | null
          tipo: Database["public"]["Enums"]["offer_tipo"] | null
          updated_at: string | null
          updated_by: string | null
          vendor: Database["public"]["Enums"]["offer_vendor"] | null
          vendor_id: string | null
          vendors_clickbank: string[] | null
          vsl_player: string | null
          vsl_url: string | null
        }
        Insert: {
          aliases?: string[] | null
          apelido_interno?: string | null
          comissao_pct?: number | null
          comissao_usd?: number | null
          cpa_target_brl?: number | null
          created_at?: string | null
          created_by?: string | null
          data_inicio?: string | null
          data_morte?: string | null
          geo?: Database["public"]["Enums"]["offer_geo"] | null
          id?: string | null
          landing_pages?: string[] | null
          link_checkout?: string | null
          margem_pct?: number | null
          media_channels?: string[] | null
          motivo_morte?: string | null
          nicho?: Database["public"]["Enums"]["offer_nicho"] | null
          nickname_afiliado?: string | null
          notas?: string | null
          pixel_id?: string | null
          preview_image_updated_at?: string | null
          preview_image_url?: string | null
          producer_id?: string | null
          produto_real?: string | null
          sales_page_url?: string | null
          status?: Database["public"]["Enums"]["offer_status"] | null
          tags?: string[] | null
          teto_validacao_brl?: number | null
          ticket_front_brl?: number | null
          ticket_front_usd?: number | null
          tipo?: Database["public"]["Enums"]["offer_tipo"] | null
          updated_at?: string | null
          updated_by?: string | null
          vendor?: Database["public"]["Enums"]["offer_vendor"] | null
          vendor_id?: string | null
          vendors_clickbank?: string[] | null
          vsl_player?: string | null
          vsl_url?: string | null
        }
        Update: {
          aliases?: string[] | null
          apelido_interno?: string | null
          comissao_pct?: number | null
          comissao_usd?: number | null
          cpa_target_brl?: number | null
          created_at?: string | null
          created_by?: string | null
          data_inicio?: string | null
          data_morte?: string | null
          geo?: Database["public"]["Enums"]["offer_geo"] | null
          id?: string | null
          landing_pages?: string[] | null
          link_checkout?: string | null
          margem_pct?: number | null
          media_channels?: string[] | null
          motivo_morte?: string | null
          nicho?: Database["public"]["Enums"]["offer_nicho"] | null
          nickname_afiliado?: string | null
          notas?: string | null
          pixel_id?: string | null
          preview_image_updated_at?: string | null
          preview_image_url?: string | null
          producer_id?: string | null
          produto_real?: string | null
          sales_page_url?: string | null
          status?: Database["public"]["Enums"]["offer_status"] | null
          tags?: string[] | null
          teto_validacao_brl?: number | null
          ticket_front_brl?: number | null
          ticket_front_usd?: number | null
          tipo?: Database["public"]["Enums"]["offer_tipo"] | null
          updated_at?: string | null
          updated_by?: string | null
          vendor?: Database["public"]["Enums"]["offer_vendor"] | null
          vendor_id?: string | null
          vendors_clickbank?: string[] | null
          vsl_player?: string | null
          vsl_url?: string | null
        }
        Relationships: []
      }
      backup_20260710_operation_invites: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string | null
          expires_at: string | null
          id: string | null
          invited_by: string | null
          operation_id: string | null
          role: string | null
          token: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string | null
          invited_by?: string | null
          operation_id?: string | null
          role?: string | null
          token?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string | null
          invited_by?: string | null
          operation_id?: string | null
          role?: string | null
          token?: string | null
        }
        Relationships: []
      }
      backup_20260710_operation_members: {
        Row: {
          id: string | null
          joined_at: string | null
          operation_id: string | null
          role: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          id?: string | null
          joined_at?: string | null
          operation_id?: string | null
          role?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string | null
          joined_at?: string | null
          operation_id?: string | null
          role?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      backup_20260710_operations: {
        Row: {
          created_at: string | null
          currency: string | null
          daily_revenue_goal: number | null
          enabled_features: Json | null
          id: string | null
          logo_url: string | null
          max_cpa: number | null
          max_members: number | null
          max_meta_accounts: number | null
          min_roas: number | null
          monthly_revenue_goal: number | null
          name: string | null
          owner_user_id: string | null
          plan: string | null
          primary_color: string | null
          slug: string | null
          status: string | null
          timezone: string | null
          trial_ends_at: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          daily_revenue_goal?: number | null
          enabled_features?: Json | null
          id?: string | null
          logo_url?: string | null
          max_cpa?: number | null
          max_members?: number | null
          max_meta_accounts?: number | null
          min_roas?: number | null
          monthly_revenue_goal?: number | null
          name?: string | null
          owner_user_id?: string | null
          plan?: string | null
          primary_color?: string | null
          slug?: string | null
          status?: string | null
          timezone?: string | null
          trial_ends_at?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          daily_revenue_goal?: number | null
          enabled_features?: Json | null
          id?: string | null
          logo_url?: string | null
          max_cpa?: number | null
          max_members?: number | null
          max_meta_accounts?: number | null
          min_roas?: number | null
          monthly_revenue_goal?: number | null
          name?: string | null
          owner_user_id?: string | null
          plan?: string | null
          primary_color?: string | null
          slug?: string | null
          status?: string | null
          timezone?: string | null
          trial_ends_at?: string | null
        }
        Relationships: []
      }
      backup_20260710_pacing_budget_groups: {
        Row: {
          config: Json | null
          created_at: string | null
          currency: string | null
          description: string | null
          enabled: boolean | null
          id: string | null
          max_daily_total: number | null
          max_spend_per_hour: number | null
          name: string | null
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          enabled?: boolean | null
          id?: string | null
          max_daily_total?: number | null
          max_spend_per_hour?: number | null
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          enabled?: boolean | null
          id?: string | null
          max_daily_total?: number | null
          max_spend_per_hour?: number | null
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      backup_20260710_pacing_cooldowns: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          id: string | null
          last_set_budget_brl: number | null
          locked_by_rule_id: string | null
          locked_until_hour_brt: number | null
          reason: string | null
          rule_id: string | null
          set_by: string | null
          snoozed_until: string | null
          updated_at: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          id?: string | null
          last_set_budget_brl?: number | null
          locked_by_rule_id?: string | null
          locked_until_hour_brt?: number | null
          reason?: string | null
          rule_id?: string | null
          set_by?: string | null
          snoozed_until?: string | null
          updated_at?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          id?: string | null
          last_set_budget_brl?: number | null
          locked_by_rule_id?: string | null
          locked_until_hour_brt?: number | null
          reason?: string | null
          rule_id?: string | null
          set_by?: string | null
          snoozed_until?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      backup_20260710_pacing_evaluation_log: {
        Row: {
          blocked_details: Json | null
          campaign_ids: string[] | null
          campaigns_blocked: number | null
          campaigns_fired: number | null
          campaigns_matched: number | null
          created_at: string | null
          dry_run: boolean | null
          evaluated_at: string | null
          id: string | null
          rule_id: string | null
          rule_name: string | null
          skip_reason: string | null
        }
        Insert: {
          blocked_details?: Json | null
          campaign_ids?: string[] | null
          campaigns_blocked?: number | null
          campaigns_fired?: number | null
          campaigns_matched?: number | null
          created_at?: string | null
          dry_run?: boolean | null
          evaluated_at?: string | null
          id?: string | null
          rule_id?: string | null
          rule_name?: string | null
          skip_reason?: string | null
        }
        Update: {
          blocked_details?: Json | null
          campaign_ids?: string[] | null
          campaigns_blocked?: number | null
          campaigns_fired?: number | null
          campaigns_matched?: number | null
          created_at?: string | null
          dry_run?: boolean | null
          evaluated_at?: string | null
          id?: string | null
          rule_id?: string | null
          rule_name?: string | null
          skip_reason?: string | null
        }
        Relationships: []
      }
      backup_20260710_pacing_rules: {
        Row: {
          action_config: Json | null
          budget_group_id: string | null
          created_at: string | null
          default_daily_target_brl: number | null
          description: string | null
          dry_run: boolean | null
          enabled: boolean | null
          filter_config: Json | null
          fire_count_today: number | null
          fire_count_total: number | null
          id: string | null
          last_evaluated_at: string | null
          last_triggered_at: string | null
          name: string | null
          notification_config: Json | null
          trigger_config: Json | null
          updated_at: string | null
        }
        Insert: {
          action_config?: Json | null
          budget_group_id?: string | null
          created_at?: string | null
          default_daily_target_brl?: number | null
          description?: string | null
          dry_run?: boolean | null
          enabled?: boolean | null
          filter_config?: Json | null
          fire_count_today?: number | null
          fire_count_total?: number | null
          id?: string | null
          last_evaluated_at?: string | null
          last_triggered_at?: string | null
          name?: string | null
          notification_config?: Json | null
          trigger_config?: Json | null
          updated_at?: string | null
        }
        Update: {
          action_config?: Json | null
          budget_group_id?: string | null
          created_at?: string | null
          default_daily_target_brl?: number | null
          description?: string | null
          dry_run?: boolean | null
          enabled?: boolean | null
          filter_config?: Json | null
          fire_count_today?: number | null
          fire_count_total?: number | null
          id?: string | null
          last_evaluated_at?: string | null
          last_triggered_at?: string | null
          name?: string | null
          notification_config?: Json | null
          trigger_config?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      backup_20260710_pacing_settings: {
        Row: {
          key: string | null
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          key?: string | null
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          key?: string | null
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      backup_20260710_producers: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string | null
          name: string | null
          notes: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          name?: string | null
          notes?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          name?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      backup_20260710_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string | null
          phone: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string | null
          phone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string | null
          phone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      backup_20260710_spy_ads: {
        Row: {
          ad_active_status: string | null
          ad_creation_time: string | null
          ad_first_seen_at: string | null
          ad_last_seen_at: string | null
          advertiser_name: string | null
          advertiser_page_id: string | null
          ai_summary: string | null
          copywriter_confidence: number | null
          copywriter_id: string | null
          created_at: string | null
          creative_type: string | null
          creative_url: string | null
          cta_text: string | null
          description: string | null
          destination_url: string | null
          geo_targeting: Json | null
          headline: string | null
          hook_classified: string | null
          hook_text: string | null
          id: string | null
          meta_ad_id: string | null
          offer_id: string | null
          platform: Json | null
          primary_text: string | null
          thumbnail_url: string | null
        }
        Insert: {
          ad_active_status?: string | null
          ad_creation_time?: string | null
          ad_first_seen_at?: string | null
          ad_last_seen_at?: string | null
          advertiser_name?: string | null
          advertiser_page_id?: string | null
          ai_summary?: string | null
          copywriter_confidence?: number | null
          copywriter_id?: string | null
          created_at?: string | null
          creative_type?: string | null
          creative_url?: string | null
          cta_text?: string | null
          description?: string | null
          destination_url?: string | null
          geo_targeting?: Json | null
          headline?: string | null
          hook_classified?: string | null
          hook_text?: string | null
          id?: string | null
          meta_ad_id?: string | null
          offer_id?: string | null
          platform?: Json | null
          primary_text?: string | null
          thumbnail_url?: string | null
        }
        Update: {
          ad_active_status?: string | null
          ad_creation_time?: string | null
          ad_first_seen_at?: string | null
          ad_last_seen_at?: string | null
          advertiser_name?: string | null
          advertiser_page_id?: string | null
          ai_summary?: string | null
          copywriter_confidence?: number | null
          copywriter_id?: string | null
          created_at?: string | null
          creative_type?: string | null
          creative_url?: string | null
          cta_text?: string | null
          description?: string | null
          destination_url?: string | null
          geo_targeting?: Json | null
          headline?: string | null
          hook_classified?: string | null
          hook_text?: string | null
          id?: string | null
          meta_ad_id?: string | null
          offer_id?: string | null
          platform?: Json | null
          primary_text?: string | null
          thumbnail_url?: string | null
        }
        Relationships: []
      }
      backup_20260710_spy_copywriters: {
        Row: {
          alias: string[] | null
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          id: string | null
          is_legendary: boolean | null
          known_offers: string[] | null
          name: string | null
          signature_patterns: Json | null
        }
        Insert: {
          alias?: string[] | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          id?: string | null
          is_legendary?: boolean | null
          known_offers?: string[] | null
          name?: string | null
          signature_patterns?: Json | null
        }
        Update: {
          alias?: string[] | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          id?: string | null
          is_legendary?: boolean | null
          known_offers?: string[] | null
          name?: string | null
          signature_patterns?: Json | null
        }
        Relationships: []
      }
      backup_20260710_spy_favorites: {
        Row: {
          favorited_at: string | null
          id: string | null
          offer_id: string | null
          user_id: string | null
        }
        Insert: {
          favorited_at?: string | null
          id?: string | null
          offer_id?: string | null
          user_id?: string | null
        }
        Update: {
          favorited_at?: string | null
          id?: string | null
          offer_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      backup_20260710_spy_lps: {
        Row: {
          cta_main: string | null
          format: string | null
          headline: string | null
          hook_main: string | null
          html_hash: string | null
          id: string | null
          is_upsell: boolean | null
          offer_id: string | null
          parent_lp_id: string | null
          pitch_time_seconds: number | null
          pixels_detected: Json | null
          scraped_at: string | null
          screenshot_url: string | null
          sub_headline: string | null
          url: string | null
          url_final: string | null
        }
        Insert: {
          cta_main?: string | null
          format?: string | null
          headline?: string | null
          hook_main?: string | null
          html_hash?: string | null
          id?: string | null
          is_upsell?: boolean | null
          offer_id?: string | null
          parent_lp_id?: string | null
          pitch_time_seconds?: number | null
          pixels_detected?: Json | null
          scraped_at?: string | null
          screenshot_url?: string | null
          sub_headline?: string | null
          url?: string | null
          url_final?: string | null
        }
        Update: {
          cta_main?: string | null
          format?: string | null
          headline?: string | null
          hook_main?: string | null
          html_hash?: string | null
          id?: string | null
          is_upsell?: boolean | null
          offer_id?: string | null
          parent_lp_id?: string | null
          pitch_time_seconds?: number | null
          pixels_detected?: Json | null
          scraped_at?: string | null
          screenshot_url?: string | null
          sub_headline?: string | null
          url?: string | null
          url_final?: string | null
        }
        Relationships: []
      }
      backup_20260710_super_admins: {
        Row: {
          created_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      backup_20260710_user_page_permissions: {
        Row: {
          allowed_pages: string[] | null
          created_at: string | null
          id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          allowed_pages?: string[] | null
          created_at?: string | null
          id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          allowed_pages?: string[] | null
          created_at?: string | null
          id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      backup_20260710_user_roles: {
        Row: {
          id: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          user_id: string | null
        }
        Insert: {
          id?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          user_id?: string | null
        }
        Update: {
          id?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          user_id?: string | null
        }
        Relationships: []
      }
      backup_20260826_traffic_breakdowns: {
        Row: {
          account_id: string | null
          age: string | null
          breakdown_type: string | null
          campaign_name: string | null
          clicks: number | null
          conversions: number | null
          country: string | null
          cpc: number | null
          cpm: number | null
          created_at: string | null
          currency: string | null
          date: string | null
          fx_rate: number | null
          fx_stale: boolean | null
          gender: string | null
          id: string | null
          impressions: number | null
          inline_link_clicks: number | null
          operation_id: string | null
          platform_position: string | null
          publisher_platform: string | null
          revenue: number | null
          spend: number | null
          spend_brl: number | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          age?: string | null
          breakdown_type?: string | null
          campaign_name?: string | null
          clicks?: number | null
          conversions?: number | null
          country?: string | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          currency?: string | null
          date?: string | null
          fx_rate?: number | null
          fx_stale?: boolean | null
          gender?: string | null
          id?: string | null
          impressions?: number | null
          inline_link_clicks?: number | null
          operation_id?: string | null
          platform_position?: string | null
          publisher_platform?: string | null
          revenue?: number | null
          spend?: number | null
          spend_brl?: number | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          age?: string | null
          breakdown_type?: string | null
          campaign_name?: string | null
          clicks?: number | null
          conversions?: number | null
          country?: string | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          currency?: string | null
          date?: string | null
          fx_rate?: number | null
          fx_stale?: boolean | null
          gender?: string | null
          id?: string | null
          impressions?: number | null
          inline_link_clicks?: number | null
          operation_id?: string | null
          platform_position?: string | null
          publisher_platform?: string | null
          revenue?: number | null
          spend?: number | null
          spend_brl?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      backup_20260826_traffic_data: {
        Row: {
          account_id: string | null
          ad_id: string | null
          ad_name: string | null
          adset_id: string | null
          adset_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          clicks: number | null
          cpc: number | null
          cpm: number | null
          created_at: string | null
          ctr: number | null
          currency: string | null
          date: string | null
          fb_pixel_initiate_checkout: number | null
          fx_rate: number | null
          fx_stale: boolean | null
          id: string | null
          impressions: number | null
          initiate_checkout: number | null
          inline_link_clicks: number | null
          landing_page_views: number | null
          operation_id: string | null
          project_slug: string | null
          purchase_count: number | null
          spend: number | null
          spend_brl: number | null
          status: string | null
          thruplays: number | null
          updated_at: string | null
          video_100_percent: number | null
          video_25_percent: number | null
          video_3s_views: number | null
          video_50_percent: number | null
          video_75_percent: number | null
          video_plays: number | null
        }
        Insert: {
          account_id?: string | null
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          clicks?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          currency?: string | null
          date?: string | null
          fb_pixel_initiate_checkout?: number | null
          fx_rate?: number | null
          fx_stale?: boolean | null
          id?: string | null
          impressions?: number | null
          initiate_checkout?: number | null
          inline_link_clicks?: number | null
          landing_page_views?: number | null
          operation_id?: string | null
          project_slug?: string | null
          purchase_count?: number | null
          spend?: number | null
          spend_brl?: number | null
          status?: string | null
          thruplays?: number | null
          updated_at?: string | null
          video_100_percent?: number | null
          video_25_percent?: number | null
          video_3s_views?: number | null
          video_50_percent?: number | null
          video_75_percent?: number | null
          video_plays?: number | null
        }
        Update: {
          account_id?: string | null
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          clicks?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          currency?: string | null
          date?: string | null
          fb_pixel_initiate_checkout?: number | null
          fx_rate?: number | null
          fx_stale?: boolean | null
          id?: string | null
          impressions?: number | null
          initiate_checkout?: number | null
          inline_link_clicks?: number | null
          landing_page_views?: number | null
          operation_id?: string | null
          project_slug?: string | null
          purchase_count?: number | null
          spend?: number | null
          spend_brl?: number | null
          status?: string | null
          thruplays?: number | null
          updated_at?: string | null
          video_100_percent?: number | null
          video_25_percent?: number | null
          video_3s_views?: number | null
          video_50_percent?: number | null
          video_75_percent?: number | null
          video_plays?: number | null
        }
        Relationships: []
      }
      backup_20260826_traffic_data_hourly: {
        Row: {
          account_id: string | null
          clicks: number | null
          created_at: string | null
          currency: string | null
          date: string | null
          fb_pixel_initiate_checkout: number | null
          fx_rate: number | null
          hour: number | null
          id: string | null
          impressions: number | null
          initiated_checkouts: number | null
          landing_page_views: number | null
          operation_id: string | null
          spend: number | null
          spend_brl: number | null
          updated_at: string | null
          video_plays: number | null
          vsl_plays: number | null
        }
        Insert: {
          account_id?: string | null
          clicks?: number | null
          created_at?: string | null
          currency?: string | null
          date?: string | null
          fb_pixel_initiate_checkout?: number | null
          fx_rate?: number | null
          hour?: number | null
          id?: string | null
          impressions?: number | null
          initiated_checkouts?: number | null
          landing_page_views?: number | null
          operation_id?: string | null
          spend?: number | null
          spend_brl?: number | null
          updated_at?: string | null
          video_plays?: number | null
          vsl_plays?: number | null
        }
        Update: {
          account_id?: string | null
          clicks?: number | null
          created_at?: string | null
          currency?: string | null
          date?: string | null
          fb_pixel_initiate_checkout?: number | null
          fx_rate?: number | null
          hour?: number | null
          id?: string | null
          impressions?: number | null
          initiated_checkouts?: number | null
          landing_page_views?: number | null
          operation_id?: string | null
          spend?: number | null
          spend_brl?: number | null
          updated_at?: string | null
          video_plays?: number | null
          vsl_plays?: number | null
        }
        Relationships: []
      }
      backup_20260826b_traffic_breakdowns: {
        Row: {
          account_id: string | null
          age: string | null
          breakdown_type: string | null
          campaign_name: string | null
          clicks: number | null
          conversions: number | null
          country: string | null
          cpc: number | null
          cpm: number | null
          created_at: string | null
          currency: string | null
          date: string | null
          fx_rate: number | null
          fx_stale: boolean | null
          gender: string | null
          id: string | null
          impressions: number | null
          inline_link_clicks: number | null
          operation_id: string | null
          platform_position: string | null
          publisher_platform: string | null
          revenue: number | null
          spend: number | null
          spend_brl: number | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          age?: string | null
          breakdown_type?: string | null
          campaign_name?: string | null
          clicks?: number | null
          conversions?: number | null
          country?: string | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          currency?: string | null
          date?: string | null
          fx_rate?: number | null
          fx_stale?: boolean | null
          gender?: string | null
          id?: string | null
          impressions?: number | null
          inline_link_clicks?: number | null
          operation_id?: string | null
          platform_position?: string | null
          publisher_platform?: string | null
          revenue?: number | null
          spend?: number | null
          spend_brl?: number | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          age?: string | null
          breakdown_type?: string | null
          campaign_name?: string | null
          clicks?: number | null
          conversions?: number | null
          country?: string | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          currency?: string | null
          date?: string | null
          fx_rate?: number | null
          fx_stale?: boolean | null
          gender?: string | null
          id?: string | null
          impressions?: number | null
          inline_link_clicks?: number | null
          operation_id?: string | null
          platform_position?: string | null
          publisher_platform?: string | null
          revenue?: number | null
          spend?: number | null
          spend_brl?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      backup_20260826b_traffic_data: {
        Row: {
          account_id: string | null
          ad_id: string | null
          ad_name: string | null
          adset_id: string | null
          adset_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          clicks: number | null
          cpc: number | null
          cpm: number | null
          created_at: string | null
          ctr: number | null
          currency: string | null
          date: string | null
          fb_pixel_initiate_checkout: number | null
          fx_rate: number | null
          fx_stale: boolean | null
          id: string | null
          impressions: number | null
          initiate_checkout: number | null
          inline_link_clicks: number | null
          landing_page_views: number | null
          operation_id: string | null
          project_slug: string | null
          purchase_count: number | null
          spend: number | null
          spend_brl: number | null
          status: string | null
          thruplays: number | null
          updated_at: string | null
          video_100_percent: number | null
          video_25_percent: number | null
          video_3s_views: number | null
          video_50_percent: number | null
          video_75_percent: number | null
          video_plays: number | null
        }
        Insert: {
          account_id?: string | null
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          clicks?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          currency?: string | null
          date?: string | null
          fb_pixel_initiate_checkout?: number | null
          fx_rate?: number | null
          fx_stale?: boolean | null
          id?: string | null
          impressions?: number | null
          initiate_checkout?: number | null
          inline_link_clicks?: number | null
          landing_page_views?: number | null
          operation_id?: string | null
          project_slug?: string | null
          purchase_count?: number | null
          spend?: number | null
          spend_brl?: number | null
          status?: string | null
          thruplays?: number | null
          updated_at?: string | null
          video_100_percent?: number | null
          video_25_percent?: number | null
          video_3s_views?: number | null
          video_50_percent?: number | null
          video_75_percent?: number | null
          video_plays?: number | null
        }
        Update: {
          account_id?: string | null
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          clicks?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          currency?: string | null
          date?: string | null
          fb_pixel_initiate_checkout?: number | null
          fx_rate?: number | null
          fx_stale?: boolean | null
          id?: string | null
          impressions?: number | null
          initiate_checkout?: number | null
          inline_link_clicks?: number | null
          landing_page_views?: number | null
          operation_id?: string | null
          project_slug?: string | null
          purchase_count?: number | null
          spend?: number | null
          spend_brl?: number | null
          status?: string | null
          thruplays?: number | null
          updated_at?: string | null
          video_100_percent?: number | null
          video_25_percent?: number | null
          video_3s_views?: number | null
          video_50_percent?: number | null
          video_75_percent?: number | null
          video_plays?: number | null
        }
        Relationships: []
      }
      backup_20260826b_traffic_hourly: {
        Row: {
          account_id: string | null
          clicks: number | null
          created_at: string | null
          currency: string | null
          date: string | null
          fb_pixel_initiate_checkout: number | null
          fx_rate: number | null
          hour: number | null
          id: string | null
          impressions: number | null
          initiated_checkouts: number | null
          landing_page_views: number | null
          operation_id: string | null
          spend: number | null
          spend_brl: number | null
          updated_at: string | null
          video_plays: number | null
          vsl_plays: number | null
        }
        Insert: {
          account_id?: string | null
          clicks?: number | null
          created_at?: string | null
          currency?: string | null
          date?: string | null
          fb_pixel_initiate_checkout?: number | null
          fx_rate?: number | null
          hour?: number | null
          id?: string | null
          impressions?: number | null
          initiated_checkouts?: number | null
          landing_page_views?: number | null
          operation_id?: string | null
          spend?: number | null
          spend_brl?: number | null
          updated_at?: string | null
          video_plays?: number | null
          vsl_plays?: number | null
        }
        Update: {
          account_id?: string | null
          clicks?: number | null
          created_at?: string | null
          currency?: string | null
          date?: string | null
          fb_pixel_initiate_checkout?: number | null
          fx_rate?: number | null
          hour?: number | null
          id?: string | null
          impressions?: number | null
          initiated_checkouts?: number | null
          landing_page_views?: number | null
          operation_id?: string | null
          spend?: number | null
          spend_brl?: number | null
          updated_at?: string | null
          video_plays?: number | null
          vsl_plays?: number | null
        }
        Relationships: []
      }
      backup_20260826c_traffic_breakdowns: {
        Row: {
          account_id: string | null
          age: string | null
          breakdown_type: string | null
          campaign_name: string | null
          clicks: number | null
          conversions: number | null
          country: string | null
          cpc: number | null
          cpm: number | null
          created_at: string | null
          currency: string | null
          date: string | null
          fx_rate: number | null
          fx_stale: boolean | null
          gender: string | null
          id: string | null
          impressions: number | null
          inline_link_clicks: number | null
          operation_id: string | null
          platform_position: string | null
          publisher_platform: string | null
          revenue: number | null
          spend: number | null
          spend_brl: number | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          age?: string | null
          breakdown_type?: string | null
          campaign_name?: string | null
          clicks?: number | null
          conversions?: number | null
          country?: string | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          currency?: string | null
          date?: string | null
          fx_rate?: number | null
          fx_stale?: boolean | null
          gender?: string | null
          id?: string | null
          impressions?: number | null
          inline_link_clicks?: number | null
          operation_id?: string | null
          platform_position?: string | null
          publisher_platform?: string | null
          revenue?: number | null
          spend?: number | null
          spend_brl?: number | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          age?: string | null
          breakdown_type?: string | null
          campaign_name?: string | null
          clicks?: number | null
          conversions?: number | null
          country?: string | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          currency?: string | null
          date?: string | null
          fx_rate?: number | null
          fx_stale?: boolean | null
          gender?: string | null
          id?: string | null
          impressions?: number | null
          inline_link_clicks?: number | null
          operation_id?: string | null
          platform_position?: string | null
          publisher_platform?: string | null
          revenue?: number | null
          spend?: number | null
          spend_brl?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      business_managers: {
        Row: {
          bm_id: string
          created_at: string
          id: string
          name: string
          operation_id: string
          status: string
          updated_at: string
        }
        Insert: {
          bm_id: string
          created_at?: string
          id?: string
          name?: string
          operation_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          bm_id?: string
          created_at?: string
          id?: string
          name?: string
          operation_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_managers_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_business_managers_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_mapping_rules: {
        Row: {
          account_id: string | null
          account_type: string
          bm_id: string | null
          created_at: string
          currency: string
          display_name: string
          id: string
          is_active: boolean
          operation_id: string
          pattern: string
          pattern_type: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          account_type?: string
          bm_id?: string | null
          created_at?: string
          currency?: string
          display_name?: string
          id?: string
          is_active?: boolean
          operation_id: string
          pattern: string
          pattern_type?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          account_type?: string
          bm_id?: string | null
          created_at?: string
          currency?: string
          display_name?: string
          id?: string
          is_active?: boolean
          operation_id?: string
          pattern?: string
          pattern_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_mapping_rules_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_campaign_mapping_rules_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_pacing_overrides: {
        Row: {
          account_id: string | null
          campaign_id: string
          created_at: string
          daily_target_brl: number | null
          exempt_until: string | null
          hourly_cap_brl_override: number | null
          id: string
          notes: string | null
          rules_exempt: boolean
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          campaign_id: string
          created_at?: string
          daily_target_brl?: number | null
          exempt_until?: string | null
          hourly_cap_brl_override?: number | null
          id?: string
          notes?: string | null
          rules_exempt?: boolean
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          campaign_id?: string
          created_at?: string
          daily_target_brl?: number | null
          exempt_until?: string | null
          hourly_cap_brl_override?: number | null
          id?: string
          notes?: string | null
          rules_exempt?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      cashflow_adjustments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          date: string
          description: string
          id: string
          operation_id: string
          type: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          date: string
          description?: string
          id?: string
          operation_id: string
          type?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string
          id?: string
          operation_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_adjustments_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cashflow_adjustments_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      cashflow_settings: {
        Row: {
          created_at: string
          id: string
          initial_cash: number
          margin_percent: number
          month: string
          notes: string | null
          operation_id: string
          payment_model: string
          projection_roi: number
          timezone_venda: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          initial_cash?: number
          margin_percent?: number
          month: string
          notes?: string | null
          operation_id: string
          payment_model?: string
          projection_roi?: number
          timezone_venda?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          initial_cash?: number
          margin_percent?: number
          month?: string
          notes?: string | null
          operation_id?: string
          payment_model?: string
          projection_roi?: number
          timezone_venda?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_settings_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cashflow_settings_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_performance_goals: {
        Row: {
          channel_id: string
          cpa_target: number
          created_at: string
          daily_revenue_target: number
          daily_spend_cap: number
          id: string
          min_sales_per_day: number
          notes: string
          operation_id: string
          roas_target: number
          updated_at: string
        }
        Insert: {
          channel_id: string
          cpa_target?: number
          created_at?: string
          daily_revenue_target?: number
          daily_spend_cap?: number
          id?: string
          min_sales_per_day?: number
          notes?: string
          operation_id: string
          roas_target?: number
          updated_at?: string
        }
        Update: {
          channel_id?: string
          cpa_target?: number
          created_at?: string
          daily_revenue_target?: number
          daily_spend_cap?: number
          id?: string
          min_sales_per_day?: number
          notes?: string
          operation_id?: string
          roas_target?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_performance_goals_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: true
            referencedRelation: "media_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_performance_goals_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_channel_performance_goals_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      clickbank_audit: {
        Row: {
          aff_sub2: string | null
          aff_sub3: string | null
          affiliate: string | null
          amount_brl: number
          amount_usd: number
          buyer_email: string | null
          buyer_email_hash: string | null
          buyer_name: string | null
          country: string | null
          created_at: string
          date: string
          id: string
          item_name: string | null
          key_used: string | null
          meta_ad_id: string | null
          meta_ad_name: string | null
          meta_adset_id: string | null
          meta_adset_name: string | null
          meta_campaign_id: string | null
          meta_campaign_name: string | null
          meta_placement: string | null
          operation_id: string
          product_name: string | null
          quantity: number | null
          raw_tracking: Json | null
          receipt: string
          sck: string | null
          src: string | null
          transaction_type: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          vendor: string | null
          xcod: string | null
        }
        Insert: {
          aff_sub2?: string | null
          aff_sub3?: string | null
          affiliate?: string | null
          amount_brl?: number
          amount_usd?: number
          buyer_email?: string | null
          buyer_email_hash?: string | null
          buyer_name?: string | null
          country?: string | null
          created_at?: string
          date?: string
          id?: string
          item_name?: string | null
          key_used?: string | null
          meta_ad_id?: string | null
          meta_ad_name?: string | null
          meta_adset_id?: string | null
          meta_adset_name?: string | null
          meta_campaign_id?: string | null
          meta_campaign_name?: string | null
          meta_placement?: string | null
          operation_id: string
          product_name?: string | null
          quantity?: number | null
          raw_tracking?: Json | null
          receipt: string
          sck?: string | null
          src?: string | null
          transaction_type?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          vendor?: string | null
          xcod?: string | null
        }
        Update: {
          aff_sub2?: string | null
          aff_sub3?: string | null
          affiliate?: string | null
          amount_brl?: number
          amount_usd?: number
          buyer_email?: string | null
          buyer_email_hash?: string | null
          buyer_name?: string | null
          country?: string | null
          created_at?: string
          date?: string
          id?: string
          item_name?: string | null
          key_used?: string | null
          meta_ad_id?: string | null
          meta_ad_name?: string | null
          meta_adset_id?: string | null
          meta_adset_name?: string | null
          meta_campaign_id?: string | null
          meta_campaign_name?: string | null
          meta_placement?: string | null
          operation_id?: string
          product_name?: string | null
          quantity?: number | null
          raw_tracking?: Json | null
          receipt?: string
          sck?: string | null
          src?: string | null
          transaction_type?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          vendor?: string | null
          xcod?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clickbank_audit_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_clickbank_audit_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      cod_campaign_rules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          mode: string
          operation_id: string
          pattern: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          mode?: string
          operation_id: string
          pattern: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          mode?: string
          operation_id?: string
          pattern?: string
        }
        Relationships: []
      }
      cod_import_job_errors: {
        Row: {
          created_at: string
          field: string | null
          id: number
          job_id: string
          message: string | null
          order_id: string | null
          raw_row: Json | null
          row_number: number | null
        }
        Insert: {
          created_at?: string
          field?: string | null
          id?: number
          job_id: string
          message?: string | null
          order_id?: string | null
          raw_row?: Json | null
          row_number?: number | null
        }
        Update: {
          created_at?: string
          field?: string | null
          id?: number
          job_id?: string
          message?: string | null
          order_id?: string | null
          raw_row?: Json | null
          row_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cod_import_job_errors_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cod_import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      cod_import_jobs: {
        Row: {
          created_at: string
          error_count: number
          error_message: string | null
          filename: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          is_retroactive: boolean
          last_batch_index: number
          operation_id: string | null
          processed_rows: number
          rows_payload: Json
          skipped_count: number
          started_at: string | null
          status: string
          success_count: number
          total_rows: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_count?: number
          error_message?: string | null
          filename?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          is_retroactive?: boolean
          last_batch_index?: number
          operation_id?: string | null
          processed_rows?: number
          rows_payload?: Json
          skipped_count?: number
          started_at?: string | null
          status?: string
          success_count?: number
          total_rows?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_count?: number
          error_message?: string | null
          filename?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          is_retroactive?: boolean
          last_batch_index?: number
          operation_id?: string | null
          processed_rows?: number
          rows_payload?: Json
          skipped_count?: number
          started_at?: string | null
          status?: string
          success_count?: number
          total_rows?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cod_import_jobs_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      cod_manual_import_rows: {
        Row: {
          batch_id: string
          created_at: string
          external_order_id: string | null
          id: string
          message: string | null
          payload: Json | null
          result: string
          row_number: number
        }
        Insert: {
          batch_id: string
          created_at?: string
          external_order_id?: string | null
          id?: string
          message?: string | null
          payload?: Json | null
          result: string
          row_number: number
        }
        Update: {
          batch_id?: string
          created_at?: string
          external_order_id?: string | null
          id?: string
          message?: string | null
          payload?: Json | null
          result?: string
          row_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "cod_manual_import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "cod_manual_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      cod_manual_imports: {
        Row: {
          created_at: string
          failed_rows: number
          filename: string
          id: string
          imported_rows: number
          operation_id: string
          retroactive: boolean
          skipped_rows: number
          snapshot: Json
          status: string
          total_rows: number
          undone_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          failed_rows?: number
          filename: string
          id?: string
          imported_rows?: number
          operation_id: string
          retroactive?: boolean
          skipped_rows?: number
          snapshot?: Json
          status?: string
          total_rows?: number
          undone_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          failed_rows?: number
          filename?: string
          id?: string
          imported_rows?: number
          operation_id?: string
          retroactive?: boolean
          skipped_rows?: number
          snapshot?: Json
          status?: string
          total_rows?: number
          undone_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      cod_orders: {
        Row: {
          affiliate_id: string | null
          approved_at: string | null
          approved_notified_at: string | null
          backfilled_at: string | null
          buyer_email: string | null
          cancelled_at: string | null
          commission_currency: string
          commission_value: number | null
          commission_value_brl: number | null
          converted_at: string | null
          country_code: string | null
          created_at: string
          customer_country: string | null
          delivery_date: string | null
          expired_at: string | null
          external_order_id: string
          fx_rate_used: number | null
          id: string
          import_batch_id: string | null
          import_job_id: string | null
          legacy: boolean
          operation_id: string
          order_date: string
          order_value: number | null
          order_value_brl: number | null
          paid_at: string | null
          paid_notified_at: string | null
          payment_date: string | null
          platform: string
          product_key: string | null
          product_name: string | null
          program_id: string | null
          project_slug: string | null
          raw_payload: Json
          received_via: string
          refused_at: string | null
          source: string
          status: string
          updated_at: string
          webhook_endpoint_slug: string | null
        }
        Insert: {
          affiliate_id?: string | null
          approved_at?: string | null
          approved_notified_at?: string | null
          backfilled_at?: string | null
          buyer_email?: string | null
          cancelled_at?: string | null
          commission_currency?: string
          commission_value?: number | null
          commission_value_brl?: number | null
          converted_at?: string | null
          country_code?: string | null
          created_at?: string
          customer_country?: string | null
          delivery_date?: string | null
          expired_at?: string | null
          external_order_id: string
          fx_rate_used?: number | null
          id?: string
          import_batch_id?: string | null
          import_job_id?: string | null
          legacy?: boolean
          operation_id: string
          order_date: string
          order_value?: number | null
          order_value_brl?: number | null
          paid_at?: string | null
          paid_notified_at?: string | null
          payment_date?: string | null
          platform?: string
          product_key?: string | null
          product_name?: string | null
          program_id?: string | null
          project_slug?: string | null
          raw_payload: Json
          received_via?: string
          refused_at?: string | null
          source?: string
          status: string
          updated_at?: string
          webhook_endpoint_slug?: string | null
        }
        Update: {
          affiliate_id?: string | null
          approved_at?: string | null
          approved_notified_at?: string | null
          backfilled_at?: string | null
          buyer_email?: string | null
          cancelled_at?: string | null
          commission_currency?: string
          commission_value?: number | null
          commission_value_brl?: number | null
          converted_at?: string | null
          country_code?: string | null
          created_at?: string
          customer_country?: string | null
          delivery_date?: string | null
          expired_at?: string | null
          external_order_id?: string
          fx_rate_used?: number | null
          id?: string
          import_batch_id?: string | null
          import_job_id?: string | null
          legacy?: boolean
          operation_id?: string
          order_date?: string
          order_value?: number | null
          order_value_brl?: number | null
          paid_at?: string | null
          paid_notified_at?: string | null
          payment_date?: string | null
          platform?: string
          product_key?: string | null
          product_name?: string | null
          program_id?: string | null
          project_slug?: string | null
          raw_payload?: Json
          received_via?: string
          refused_at?: string | null
          source?: string
          status?: string
          updated_at?: string
          webhook_endpoint_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cod_orders_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "cod_manual_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cod_orders_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "cod_import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cod_orders_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_team_overrides: {
        Row: {
          campaign_name_pattern: string | null
          created_at: string
          created_by: string | null
          creative_id: string
          id: string
          operation_id: string
          override_copy_writer: string | null
          override_editor: string | null
          reason: string
          updated_at: string
        }
        Insert: {
          campaign_name_pattern?: string | null
          created_at?: string
          created_by?: string | null
          creative_id: string
          id?: string
          operation_id: string
          override_copy_writer?: string | null
          override_editor?: string | null
          reason?: string
          updated_at?: string
        }
        Update: {
          campaign_name_pattern?: string | null
          created_at?: string
          created_by?: string | null
          creative_id?: string
          id?: string
          operation_id?: string
          override_copy_writer?: string | null
          override_editor?: string | null
          reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_team_overrides_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_creative_team_overrides_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_card_charges: {
        Row: {
          ad_account_id: string | null
          amount_brl: number
          amount_usd: number | null
          card_last_four: string | null
          card_provider: string
          charge_date: string
          created_at: string
          created_by: string | null
          fee_iof_brl: number | null
          fee_other_brl: number | null
          fx_rate_charged: number | null
          id: string
          match_confidence: number | null
          match_method: string | null
          match_notes: string | null
          match_status: string
          matched_daily_perf_ids: string[] | null
          merchant_name: string | null
          operation_id: string
          raw_description: string | null
          source_file_id: string | null
          source_row_hash: string
          superseded_by: string | null
          updated_at: string
          upload_log_id: string | null
        }
        Insert: {
          ad_account_id?: string | null
          amount_brl: number
          amount_usd?: number | null
          card_last_four?: string | null
          card_provider: string
          charge_date: string
          created_at?: string
          created_by?: string | null
          fee_iof_brl?: number | null
          fee_other_brl?: number | null
          fx_rate_charged?: number | null
          id?: string
          match_confidence?: number | null
          match_method?: string | null
          match_notes?: string | null
          match_status?: string
          matched_daily_perf_ids?: string[] | null
          merchant_name?: string | null
          operation_id: string
          raw_description?: string | null
          source_file_id?: string | null
          source_row_hash: string
          superseded_by?: string | null
          updated_at?: string
          upload_log_id?: string | null
        }
        Update: {
          ad_account_id?: string | null
          amount_brl?: number
          amount_usd?: number | null
          card_last_four?: string | null
          card_provider?: string
          charge_date?: string
          created_at?: string
          created_by?: string | null
          fee_iof_brl?: number | null
          fee_other_brl?: number | null
          fx_rate_charged?: number | null
          id?: string
          match_confidence?: number | null
          match_method?: string | null
          match_notes?: string | null
          match_status?: string
          matched_daily_perf_ids?: string[] | null
          merchant_name?: string | null
          operation_id?: string
          raw_description?: string | null
          source_file_id?: string | null
          source_row_hash?: string
          superseded_by?: string | null
          updated_at?: string
          upload_log_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_card_charges_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_card_charges_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "daily_card_charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_card_charges_upload_log_id_fkey"
            columns: ["upload_log_id"]
            isOneToOne: false
            referencedRelation: "integration_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_daily_card_charges_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_totals_snapshot: {
        Row: {
          cac: number
          cp_count: number
          cp_revenue: number
          created_at: string
          date: string
          id: string
          lucro_bruto: number
          operation_id: string
          roas: number
          rt_count: number
          rt_revenue_brl: number
          spend_source: string
          ticket_medio: number
          total_clicks: number
          total_conversions: number
          total_impressions: number
          total_lp_views: number | null
          total_revenue: number
          total_spend: number
          usd_to_brl: number
          vsl_plays: number | null
        }
        Insert: {
          cac?: number
          cp_count?: number
          cp_revenue?: number
          created_at?: string
          date: string
          id?: string
          lucro_bruto?: number
          operation_id: string
          roas?: number
          rt_count?: number
          rt_revenue_brl?: number
          spend_source?: string
          ticket_medio?: number
          total_clicks?: number
          total_conversions?: number
          total_impressions?: number
          total_lp_views?: number | null
          total_revenue?: number
          total_spend?: number
          usd_to_brl?: number
          vsl_plays?: number | null
        }
        Update: {
          cac?: number
          cp_count?: number
          cp_revenue?: number
          created_at?: string
          date?: string
          id?: string
          lucro_bruto?: number
          operation_id?: string
          roas?: number
          rt_count?: number
          rt_revenue_brl?: number
          spend_source?: string
          ticket_medio?: number
          total_clicks?: number
          total_conversions?: number
          total_impressions?: number
          total_lp_views?: number | null
          total_revenue?: number
          total_spend?: number
          usd_to_brl?: number
          vsl_plays?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_totals_snapshot_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_daily_totals_snapshot_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rate_log: {
        Row: {
          created_at: string
          id: string
          operation_id: string
          rate: number
          source: string
        }
        Insert: {
          created_at?: string
          id?: string
          operation_id: string
          rate: number
          source?: string
        }
        Update: {
          created_at?: string
          id?: string
          operation_id?: string
          rate?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rate_log_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_exchange_rate_log_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates_cache: {
        Row: {
          base_currency: string
          expires_at: string
          fetched_at: string
          id: number
          rate: number
          source: string
          target_currency: string
        }
        Insert: {
          base_currency: string
          expires_at: string
          fetched_at?: string
          id?: number
          rate: number
          source?: string
          target_currency: string
        }
        Update: {
          base_currency?: string
          expires_at?: string
          fetched_at?: string
          id?: number
          rate?: number
          source?: string
          target_currency?: string
        }
        Relationships: []
      }
      exchange_rates_daily: {
        Row: {
          created_at: string
          currency_from: string
          currency_to: string
          fetched_at: string
          id: string
          operation_id: string
          rate_avg: number
          rate_buy: number | null
          rate_date: string
          rate_sell: number | null
          source: string
          source_payload: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency_from?: string
          currency_to?: string
          fetched_at?: string
          id?: string
          operation_id: string
          rate_avg: number
          rate_buy?: number | null
          rate_date: string
          rate_sell?: number | null
          source?: string
          source_payload?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency_from?: string
          currency_to?: string
          fetched_at?: string
          id?: string
          operation_id?: string
          rate_avg?: number
          rate_buy?: number | null
          rate_date?: string
          rate_sell?: number | null
          source?: string
          source_payload?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_exchange_rates_daily_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          key: string
          metadata: Json | null
          operation_ids: string[] | null
          rollout_pct: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          key: string
          metadata?: Json | null
          operation_ids?: string[] | null
          rollout_pct?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          enabled?: boolean
          key?: string
          metadata?: Json | null
          operation_ids?: string[] | null
          rollout_pct?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      fee_mapping: {
        Row: {
          applies_to: string
          card_provider: string | null
          created_at: string
          fee_category: string
          fee_code: string
          fee_name: string
          fee_type: string
          fee_value: number
          id: string
          is_active: boolean
          notes: string | null
          operation_id: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          applies_to?: string
          card_provider?: string | null
          created_at?: string
          fee_category: string
          fee_code: string
          fee_name: string
          fee_type: string
          fee_value: number
          id?: string
          is_active?: boolean
          notes?: string | null
          operation_id: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          applies_to?: string
          card_provider?: string | null
          created_at?: string
          fee_category?: string
          fee_code?: string
          fee_name?: string
          fee_type?: string
          fee_value?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          operation_id?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_fee_mapping_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_costs: {
        Row: {
          category: string
          cost_type: string
          created_at: string
          id: string
          is_active: boolean
          monthly_value: number
          name: string
          operation_id: string
          recurrence: string
          sector: string
          updated_at: string
        }
        Insert: {
          category?: string
          cost_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_value?: number
          name: string
          operation_id: string
          recurrence?: string
          sector?: string
          updated_at?: string
        }
        Update: {
          category?: string
          cost_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_value?: number
          name?: string
          operation_id?: string
          recurrence?: string
          sector?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_costs_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_fixed_costs_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_projects: {
        Row: {
          account_ids: string[]
          campaign_name_patterns: string[]
          code: string
          color: string
          commission_usd: number
          created_at: string
          icon: string
          id: string
          is_active: boolean
          name: string
          notes: string
          offer_name_patterns: string[]
          operation_id: string
          revenue_source: string
          spend_source: string
          target_cpa_usd: number
          target_daily_revenue_brl: number
          target_margin_pct: number
          target_roas: number
          ticket_usd: number
          updated_at: string
        }
        Insert: {
          account_ids?: string[]
          campaign_name_patterns?: string[]
          code: string
          color?: string
          commission_usd?: number
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string
          offer_name_patterns?: string[]
          operation_id: string
          revenue_source?: string
          spend_source?: string
          target_cpa_usd?: number
          target_daily_revenue_brl?: number
          target_margin_pct?: number
          target_roas?: number
          ticket_usd?: number
          updated_at?: string
        }
        Update: {
          account_ids?: string[]
          campaign_name_patterns?: string[]
          code?: string
          color?: string
          commission_usd?: number
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string
          offer_name_patterns?: string[]
          operation_id?: string
          revenue_source?: string
          spend_source?: string
          target_cpa_usd?: number
          target_daily_revenue_brl?: number
          target_margin_pct?: number
          target_roas?: number
          ticket_usd?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_funnel_projects_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_fix_targets: {
        Row: {
          account_id: string
          api_spend: number | null
          applied_at: string | null
          created_at: string
          date: string
          operation_id: string
          ratio: number | null
          sys_spend: number | null
        }
        Insert: {
          account_id: string
          api_spend?: number | null
          applied_at?: string | null
          created_at?: string
          date: string
          operation_id: string
          ratio?: number | null
          sys_spend?: number | null
        }
        Update: {
          account_id?: string
          api_spend?: number | null
          applied_at?: string | null
          created_at?: string
          date?: string
          operation_id?: string
          ratio?: number | null
          sys_spend?: number | null
        }
        Relationships: []
      }
      gtx_data_warnings: {
        Row: {
          campaign_id: string | null
          created_at: string
          descricao: string
          entidade: string
          id: string
          operation_id: string
          tipo_erro: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          descricao?: string
          entidade?: string
          id?: string
          operation_id: string
          tipo_erro: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          descricao?: string
          entidade?: string
          id?: string
          operation_id?: string
          tipo_erro?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_gtx_data_warnings_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtx_data_warnings_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      gtx_decisions_log: {
        Row: {
          campaign_id: string
          campaign_name: string
          created_at: string
          decisao: string
          fase: string
          id: string
          is_financial_valid: boolean
          lucro_3d: number
          motivo: string
          operation_id: string
          roas_3d: number
          vendas_3d: number
          versao_engine: string
        }
        Insert: {
          campaign_id: string
          campaign_name?: string
          created_at?: string
          decisao: string
          fase?: string
          id?: string
          is_financial_valid?: boolean
          lucro_3d?: number
          motivo?: string
          operation_id: string
          roas_3d?: number
          vendas_3d?: number
          versao_engine?: string
        }
        Update: {
          campaign_id?: string
          campaign_name?: string
          created_at?: string
          decisao?: string
          fase?: string
          id?: string
          is_financial_valid?: boolean
          lucro_3d?: number
          motivo?: string
          operation_id?: string
          roas_3d?: number
          vendas_3d?: number
          versao_engine?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_gtx_decisions_log_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtx_decisions_log_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_logs: {
        Row: {
          created_at: string
          id: string
          integration: string
          message: string | null
          operation_id: string
          records_processed: number | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          integration: string
          message?: string | null
          operation_id: string
          records_processed?: number | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          integration?: string
          message?: string | null
          operation_id?: string
          records_processed?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_integration_logs_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_logs_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      jarvis_conversations: {
        Row: {
          created_at: string
          id: string
          operation_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          operation_id: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          operation_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_jarvis_conversations_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jarvis_conversations_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      jarvis_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          operation_id: string
          role: string
          user_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          operation_id: string
          role?: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          operation_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_jarvis_messages_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jarvis_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "jarvis_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jarvis_messages_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      live_events: {
        Row: {
          account_id: string | null
          ad_id: string | null
          clickid: string | null
          country: string | null
          created_at: string
          device_type: string | null
          event_type: string
          id: string
          metadata: Json | null
          operation_id: string
          player_id: string
          product: string | null
          product_slug: string | null
          second_in_video: number | null
          session_id: string
          utm_campaign: string | null
        }
        Insert: {
          account_id?: string | null
          ad_id?: string | null
          clickid?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          operation_id: string
          player_id: string
          product?: string | null
          product_slug?: string | null
          second_in_video?: number | null
          session_id: string
          utm_campaign?: string | null
        }
        Update: {
          account_id?: string | null
          ad_id?: string | null
          clickid?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          operation_id?: string
          player_id?: string
          product?: string | null
          product_slug?: string | null
          second_in_video?: number | null
          session_id?: string
          utm_campaign?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_live_events_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      live_sale_attribution: {
        Row: {
          clickid: string
          created_at: string
          first_seen_at: string | null
          id: string
          is_orphan: boolean
          matched_player_id: string | null
          matched_player_name: string | null
          matched_session_id: string | null
          matched_via: string | null
          offer_name: string | null
          operation_id: string
          product: string | null
          sale_at: string
          sale_platform: string | null
          sale_source: string | null
          sale_status: string
          sale_value_usd: number
          time_to_sale_seconds: number | null
          updated_at: string
        }
        Insert: {
          clickid: string
          created_at?: string
          first_seen_at?: string | null
          id?: string
          is_orphan?: boolean
          matched_player_id?: string | null
          matched_player_name?: string | null
          matched_session_id?: string | null
          matched_via?: string | null
          offer_name?: string | null
          operation_id: string
          product?: string | null
          sale_at: string
          sale_platform?: string | null
          sale_source?: string | null
          sale_status: string
          sale_value_usd?: number
          time_to_sale_seconds?: number | null
          updated_at?: string
        }
        Update: {
          clickid?: string
          created_at?: string
          first_seen_at?: string | null
          id?: string
          is_orphan?: boolean
          matched_player_id?: string | null
          matched_player_name?: string | null
          matched_session_id?: string | null
          matched_via?: string | null
          offer_name?: string | null
          operation_id?: string
          product?: string | null
          sale_at?: string
          sale_platform?: string | null
          sale_source?: string | null
          sale_status?: string
          sale_value_usd?: number
          time_to_sale_seconds?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_live_sale_attribution_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      live_viewers: {
        Row: {
          account_id: string | null
          ad_id: string | null
          city: string | null
          clickid: string | null
          country: string | null
          cta_clicked: boolean | null
          current_second_in_video: number | null
          device_type: string | null
          exit_reason: string | null
          id: string
          ip_hash: string | null
          ip_hash_c24: string | null
          last_seen_at: string
          operation_id: string
          pitch_reached: boolean | null
          player_id: string
          player_name: string | null
          product: string | null
          product_slug: string | null
          session_id: string
          started_at: string
          state: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          account_id?: string | null
          ad_id?: string | null
          city?: string | null
          clickid?: string | null
          country?: string | null
          cta_clicked?: boolean | null
          current_second_in_video?: number | null
          device_type?: string | null
          exit_reason?: string | null
          id?: string
          ip_hash?: string | null
          ip_hash_c24?: string | null
          last_seen_at?: string
          operation_id: string
          pitch_reached?: boolean | null
          player_id: string
          player_name?: string | null
          product?: string | null
          product_slug?: string | null
          session_id: string
          started_at?: string
          state?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          account_id?: string | null
          ad_id?: string | null
          city?: string | null
          clickid?: string | null
          country?: string | null
          cta_clicked?: boolean | null
          current_second_in_video?: number | null
          device_type?: string | null
          exit_reason?: string | null
          id?: string
          ip_hash?: string | null
          ip_hash_c24?: string | null
          last_seen_at?: string
          operation_id?: string
          pitch_reached?: boolean | null
          player_id?: string
          player_name?: string | null
          product?: string | null
          product_slug?: string | null
          session_id?: string
          started_at?: string
          state?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_live_viewers_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_adjustments: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          is_active: boolean
          operation_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          id?: string
          is_active?: boolean
          operation_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          operation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_manual_adjustments_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_adjustments_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_oauth_clients: {
        Row: {
          client_id: string
          client_name: string
          client_secret: string | null
          created_at: string
          grant_types: Json
          redirect_uris: Json
          response_types: Json
          scope: string
          token_endpoint_auth_method: string | null
        }
        Insert: {
          client_id: string
          client_name: string
          client_secret?: string | null
          created_at?: string
          grant_types?: Json
          redirect_uris: Json
          response_types?: Json
          scope: string
          token_endpoint_auth_method?: string | null
        }
        Update: {
          client_id?: string
          client_name?: string
          client_secret?: string | null
          created_at?: string
          grant_types?: Json
          redirect_uris?: Json
          response_types?: Json
          scope?: string
          token_endpoint_auth_method?: string | null
        }
        Relationships: []
      }
      mcp_oauth_codes: {
        Row: {
          client_id: string
          code: string
          code_challenge: string
          code_challenge_method: string
          created_at: string
          expires_at: string
          redirect_uri: string
          scope: string
          used: boolean
          user_id: string | null
        }
        Insert: {
          client_id: string
          code: string
          code_challenge: string
          code_challenge_method?: string
          created_at?: string
          expires_at?: string
          redirect_uri: string
          scope: string
          used?: boolean
          user_id?: string | null
        }
        Update: {
          client_id?: string
          code?: string
          code_challenge?: string
          code_challenge_method?: string
          created_at?: string
          expires_at?: string
          redirect_uri?: string
          scope?: string
          used?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mcp_oauth_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "mcp_oauth_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      mcp_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          last_used_at: string | null
          name: string
          oauth_client_id: string | null
          operation_id: string | null
          prefix: string
          refresh_token_hash: string | null
          scopes: Json
          token_hash: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          oauth_client_id?: string | null
          operation_id?: string | null
          prefix: string
          refresh_token_hash?: string | null
          scopes?: Json
          token_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          oauth_client_id?: string | null
          operation_id?: string | null
          prefix?: string
          refresh_token_hash?: string | null
          scopes?: Json
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_tokens_oauth_client_id_fkey"
            columns: ["oauth_client_id"]
            isOneToOne: false
            referencedRelation: "mcp_oauth_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "mcp_tokens_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      media_channels: {
        Row: {
          campaign_name_patterns: string[]
          color: string
          created_at: string
          icon: string
          id: string
          is_active: boolean
          name: string
          operation_id: string
          revenue_source: string
          rt_source_patterns: string[]
          slug: string
          sort_order: number
          spend_source: string
          updated_at: string
          utm_source_patterns: string[]
        }
        Insert: {
          campaign_name_patterns?: string[]
          color?: string
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          operation_id: string
          revenue_source?: string
          rt_source_patterns?: string[]
          slug: string
          sort_order?: number
          spend_source?: string
          updated_at?: string
          utm_source_patterns?: string[]
        }
        Update: {
          campaign_name_patterns?: string[]
          color?: string
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          operation_id?: string
          revenue_source?: string
          rt_source_patterns?: string[]
          slug?: string
          sort_order?: number
          spend_source?: string
          updated_at?: string
          utm_source_patterns?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "fk_media_channels_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_channels_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_account_financials: {
        Row: {
          account_balance: number
          account_id: string
          account_name: string
          amount_spent: number
          card_brand: string | null
          card_last4: string | null
          created_at: string
          currency: string
          id: string
          operation_id: string
          payment_method_type: string | null
          spend_cap: number
          updated_at: string
        }
        Insert: {
          account_balance?: number
          account_id: string
          account_name?: string
          amount_spent?: number
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          currency?: string
          id?: string
          operation_id: string
          payment_method_type?: string | null
          spend_cap?: number
          updated_at?: string
        }
        Update: {
          account_balance?: number
          account_id?: string
          account_name?: string
          amount_spent?: number
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          currency?: string
          id?: string
          operation_id?: string
          payment_method_type?: string | null
          spend_cap?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_meta_account_financials_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_account_financials_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_accounts: {
        Row: {
          account_id: string
          active: boolean | null
          business_id: string | null
          created_at: string | null
          currency: string | null
          name: string
          operation_id: string | null
          status: string | null
          timezone_name: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          active?: boolean | null
          business_id?: string | null
          created_at?: string | null
          currency?: string | null
          name: string
          operation_id?: string | null
          status?: string | null
          timezone_name?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          active?: boolean | null
          business_id?: string | null
          created_at?: string | null
          currency?: string | null
          name?: string
          operation_id?: string | null
          status?: string | null
          timezone_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_accounts_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_accounts: {
        Row: {
          account_id: string
          account_name: string
          account_status: number
          bm_id: string | null
          category: string
          created_at: string
          currency: string
          disable_reason: string | null
          first_ad_date: string | null
          id: string
          is_active: boolean
          operation_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          account_id: string
          account_name?: string
          account_status?: number
          bm_id?: string | null
          category?: string
          created_at?: string
          currency?: string
          disable_reason?: string | null
          first_ad_date?: string | null
          id?: string
          is_active?: boolean
          operation_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          account_name?: string
          account_status?: number
          bm_id?: string | null
          category?: string
          created_at?: string
          currency?: string
          disable_reason?: string | null
          first_ad_date?: string | null
          id?: string
          is_active?: boolean
          operation_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_meta_ad_accounts_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_accounts_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_pages: {
        Row: {
          account_id: string
          ad_id: string
          ad_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          created_at: string
          effective_status: string | null
          id: string
          last_synced_at: string
          operation_id: string | null
          page_id: string | null
          page_name: string | null
        }
        Insert: {
          account_id: string
          ad_id: string
          ad_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          created_at?: string
          effective_status?: string | null
          id?: string
          last_synced_at?: string
          operation_id?: string | null
          page_id?: string | null
          page_name?: string | null
        }
        Update: {
          account_id?: string
          ad_id?: string
          ad_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          created_at?: string
          effective_status?: string | null
          id?: string
          last_synced_at?: string
          operation_id?: string | null
          page_id?: string | null
          page_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_pages_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_status: {
        Row: {
          account_id: string
          ad_id: string
          adset_id: string
          campaign_id: string
          clicks: number | null
          created_at: string
          creative_id: string | null
          effective_status: string | null
          impressions: number | null
          name: string | null
          operation_id: string
          preview_url: string | null
          purchases: number | null
          revenue_brl: number | null
          spend_brl: number | null
          status: string | null
          synced_at: string
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          ad_id: string
          adset_id: string
          campaign_id: string
          clicks?: number | null
          created_at?: string
          creative_id?: string | null
          effective_status?: string | null
          impressions?: number | null
          name?: string | null
          operation_id: string
          preview_url?: string | null
          purchases?: number | null
          revenue_brl?: number | null
          spend_brl?: number | null
          status?: string | null
          synced_at?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          ad_id?: string
          adset_id?: string
          campaign_id?: string
          clicks?: number | null
          created_at?: string
          creative_id?: string | null
          effective_status?: string | null
          impressions?: number | null
          name?: string | null
          operation_id?: string
          preview_url?: string | null
          purchases?: number | null
          revenue_brl?: number | null
          spend_brl?: number | null
          status?: string | null
          synced_at?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      meta_adset_status: {
        Row: {
          account_id: string
          adset_id: string
          adset_name: string
          bid_amount: number | null
          bid_amount_currency: string | null
          bid_strategy: string | null
          billing_event: string | null
          campaign_id: string
          campaign_name: string | null
          created_at: string
          daily_budget: number
          effective_status: string
          lifetime_budget: number
          operation_id: string | null
          optimization_goal: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          adset_id: string
          adset_name?: string
          bid_amount?: number | null
          bid_amount_currency?: string | null
          bid_strategy?: string | null
          billing_event?: string | null
          campaign_id: string
          campaign_name?: string | null
          created_at?: string
          daily_budget?: number
          effective_status?: string
          lifetime_budget?: number
          operation_id?: string | null
          optimization_goal?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          adset_id?: string
          adset_name?: string
          bid_amount?: number | null
          bid_amount_currency?: string | null
          bid_strategy?: string | null
          billing_event?: string | null
          campaign_id?: string
          campaign_name?: string | null
          created_at?: string
          daily_budget?: number
          effective_status?: string
          lifetime_budget?: number
          operation_id?: string | null
          optimization_goal?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      meta_campaign_status: {
        Row: {
          account_id: string
          campaign_id: string
          campaign_name: string
          created_at: string
          daily_budget: number
          effective_status: string
          id: string
          lifetime_budget: number
          objective: string | null
          operation_id: string
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          campaign_id: string
          campaign_name?: string
          created_at?: string
          daily_budget?: number
          effective_status?: string
          id?: string
          lifetime_budget?: number
          objective?: string | null
          operation_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          campaign_id?: string
          campaign_name?: string
          created_at?: string
          daily_budget?: number
          effective_status?: string
          id?: string
          lifetime_budget?: number
          objective?: string | null
          operation_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_meta_campaign_status_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_campaign_status_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_country_insights: {
        Row: {
          account_id: string
          campaign_id: string
          campaign_name: string
          clicks: number
          country_code: string
          created_at: string
          date: string
          id: string
          impressions: number
          initiate_checkouts: number
          link_clicks: number
          lp_views: number
          operation_id: string | null
          purchases: number
          revenue: number
          spend: number
          updated_at: string
        }
        Insert: {
          account_id: string
          campaign_id: string
          campaign_name: string
          clicks?: number
          country_code: string
          created_at?: string
          date: string
          id?: string
          impressions?: number
          initiate_checkouts?: number
          link_clicks?: number
          lp_views?: number
          operation_id?: string | null
          purchases?: number
          revenue?: number
          spend?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          campaign_id?: string
          campaign_name?: string
          clicks?: number
          country_code?: string
          created_at?: string
          date?: string
          id?: string
          impressions?: number
          initiate_checkouts?: number
          link_clicks?: number
          lp_views?: number
          operation_id?: string | null
          purchases?: number
          revenue?: number
          spend?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_country_insights_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_pacing_audit: {
        Row: {
          action: string
          created_at: string | null
          entity_id: string
          entity_name: string | null
          executed_by: string | null
          id: string
          new_value: number | null
          operation_id: string | null
          previous_value: number | null
          reason: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          entity_id: string
          entity_name?: string | null
          executed_by?: string | null
          id?: string
          new_value?: number | null
          operation_id?: string | null
          previous_value?: number | null
          reason?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          entity_id?: string
          entity_name?: string | null
          executed_by?: string | null
          id?: string
          new_value?: number | null
          operation_id?: string | null
          previous_value?: number | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_pacing_audit_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_payment_transactions: {
        Row: {
          account_id: string
          account_name: string | null
          amount: number
          amount_brl: number | null
          billing_reason: string | null
          billing_reference: string | null
          card_brand: string | null
          card_last4: string | null
          charge_date: string | null
          charge_window_days: number | null
          charged_at: string
          created_at: string
          currency: string
          id: string
          match_status: string | null
          matched_at: string | null
          matched_card_charge_id: string | null
          meta_transaction_id: string
          operation_id: string
          payment_method_type: string | null
          raw_payload: Json | null
          status: string | null
          updated_at: string
          vat_invoice_id: string | null
        }
        Insert: {
          account_id: string
          account_name?: string | null
          amount?: number
          amount_brl?: number | null
          billing_reason?: string | null
          billing_reference?: string | null
          card_brand?: string | null
          card_last4?: string | null
          charge_date?: string | null
          charge_window_days?: number | null
          charged_at: string
          created_at?: string
          currency?: string
          id?: string
          match_status?: string | null
          matched_at?: string | null
          matched_card_charge_id?: string | null
          meta_transaction_id: string
          operation_id: string
          payment_method_type?: string | null
          raw_payload?: Json | null
          status?: string | null
          updated_at?: string
          vat_invoice_id?: string | null
        }
        Update: {
          account_id?: string
          account_name?: string | null
          amount?: number
          amount_brl?: number | null
          billing_reason?: string | null
          billing_reference?: string | null
          card_brand?: string | null
          card_last4?: string | null
          charge_date?: string | null
          charge_window_days?: number | null
          charged_at?: string
          created_at?: string
          currency?: string
          id?: string
          match_status?: string | null
          matched_at?: string | null
          matched_card_charge_id?: string | null
          meta_transaction_id?: string
          operation_id?: string
          payment_method_type?: string | null
          raw_payload?: Json | null
          status?: string | null
          updated_at?: string
          vat_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_meta_payment_transactions_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_permission_alerts: {
        Row: {
          account_id: string | null
          account_name: string | null
          affected_count: number | null
          alert_type: string
          created_at: string
          details: Json | null
          first_detected_at: string
          id: string
          last_seen_at: string
          notified_at: string | null
          resolved_at: string | null
          status: string
          system_user_id: string | null
          system_user_label: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          account_name?: string | null
          affected_count?: number | null
          alert_type: string
          created_at?: string
          details?: Json | null
          first_detected_at?: string
          id?: string
          last_seen_at?: string
          notified_at?: string | null
          resolved_at?: string | null
          status?: string
          system_user_id?: string | null
          system_user_label?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          account_name?: string | null
          affected_count?: number | null
          alert_type?: string
          created_at?: string
          details?: Json | null
          first_detected_at?: string
          id?: string
          last_seen_at?: string
          notified_at?: string | null
          resolved_at?: string | null
          status?: string
          system_user_id?: string | null
          system_user_label?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      meta_spend_realtime_safe: {
        Row: {
          account_id: string
          clicks: number
          fetched_at: string
          id: string
          impressions: number
          landing_page_views: number | null
          operation_id: string
          purchase_count: number | null
          sp_date: string
          spend_brl: number
        }
        Insert: {
          account_id: string
          clicks?: number
          fetched_at?: string
          id?: string
          impressions?: number
          landing_page_views?: number | null
          operation_id: string
          purchase_count?: number | null
          sp_date?: string
          spend_brl?: number
        }
        Update: {
          account_id?: string
          clicks?: number
          fetched_at?: string
          id?: string
          impressions?: number
          landing_page_views?: number | null
          operation_id?: string
          purchase_count?: number | null
          sp_date?: string
          spend_brl?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_meta_spend_realtime_safe_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_spend_realtime_safe_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_token_permissions: {
        Row: {
          account_id: string
          account_name: string | null
          can_manage: boolean
          can_read: boolean
          checked_at: string
          created_at: string
          id: string
          last_error: string | null
          tasks_by_token: Json
          tokens_total_tested: number
          tokens_with_manage: number
          tokens_with_read: number
          updated_at: string
        }
        Insert: {
          account_id: string
          account_name?: string | null
          can_manage?: boolean
          can_read?: boolean
          checked_at?: string
          created_at?: string
          id?: string
          last_error?: string | null
          tasks_by_token?: Json
          tokens_total_tested?: number
          tokens_with_manage?: number
          tokens_with_read?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          account_name?: string | null
          can_manage?: boolean
          can_read?: boolean
          checked_at?: string
          created_at?: string
          id?: string
          last_error?: string | null
          tasks_by_token?: Json
          tokens_total_tested?: number
          tokens_with_manage?: number
          tokens_with_read?: number
          updated_at?: string
        }
        Relationships: []
      }
      mgid_ad_accounts: {
        Row: {
          account_id: string
          account_name: string
          api_token: string
          created_at: string
          currency: string | null
          id: string
          is_active: boolean
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          operation_id: string
          timezone: string | null
          updated_at: string
          wallet_balance: number | null
          wallet_credit: number | null
        }
        Insert: {
          account_id: string
          account_name: string
          api_token: string
          created_at?: string
          currency?: string | null
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          operation_id: string
          timezone?: string | null
          updated_at?: string
          wallet_balance?: number | null
          wallet_credit?: number | null
        }
        Update: {
          account_id?: string
          account_name?: string
          api_token?: string
          created_at?: string
          currency?: string | null
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          operation_id?: string
          timezone?: string | null
          updated_at?: string
          wallet_balance?: number | null
          wallet_credit?: number | null
        }
        Relationships: []
      }
      mgid_campaign_status: {
        Row: {
          account_id: string
          campaign_id: string
          campaign_name: string | null
          campaign_type: string | null
          created_at: string
          daily_limit_cents: number | null
          id: string
          language: string | null
          last_synced_at: string
          limit_type: string | null
          operation_id: string
          overall_limit_cents: number | null
          status: string | null
          status_reason: string | null
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          when_add: string | null
        }
        Insert: {
          account_id: string
          campaign_id: string
          campaign_name?: string | null
          campaign_type?: string | null
          created_at?: string
          daily_limit_cents?: number | null
          id?: string
          language?: string | null
          last_synced_at?: string
          limit_type?: string | null
          operation_id: string
          overall_limit_cents?: number | null
          status?: string | null
          status_reason?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          when_add?: string | null
        }
        Update: {
          account_id?: string
          campaign_id?: string
          campaign_name?: string | null
          campaign_type?: string | null
          created_at?: string
          daily_limit_cents?: number | null
          id?: string
          language?: string | null
          last_synced_at?: string
          limit_type?: string | null
          operation_id?: string
          overall_limit_cents?: number | null
          status?: string | null
          status_reason?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          when_add?: string | null
        }
        Relationships: []
      }
      mgid_traffic_data: {
        Row: {
          account_id: string
          avg_cpc: number
          campaign_id: string
          campaign_name: string | null
          clicks: number
          conversion_cost: number
          conversions_buying: number
          conversions_decision: number
          created_at: string
          date: string
          epc: number
          id: string
          impressions: number
          operation_id: string
          profit: number
          revenue: number
          spend: number
          updated_at: string
        }
        Insert: {
          account_id: string
          avg_cpc?: number
          campaign_id: string
          campaign_name?: string | null
          clicks?: number
          conversion_cost?: number
          conversions_buying?: number
          conversions_decision?: number
          created_at?: string
          date: string
          epc?: number
          id?: string
          impressions?: number
          operation_id: string
          profit?: number
          revenue?: number
          spend?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          avg_cpc?: number
          campaign_id?: string
          campaign_name?: string | null
          clicks?: number
          conversion_cost?: number
          conversions_buying?: number
          conversions_decision?: number
          created_at?: string
          date?: string
          epc?: number
          id?: string
          impressions?: number
          operation_id?: string
          profit?: number
          revenue?: number
          spend?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mgid_traffic_data_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_goals: {
        Row: {
          created_at: string
          goal_value: number
          id: string
          month: string
          operation_id: string
          profit_goal: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          goal_value?: number
          id?: string
          month: string
          operation_id: string
          profit_goal?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          goal_value?: number
          id?: string
          month?: string
          operation_id?: string
          profit_goal?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_monthly_goals_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_goals_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      newsbreak_ad_accounts: {
        Row: {
          access_token: string
          account_id: string
          account_name: string
          created_at: string
          id: string
          is_active: boolean
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          operation_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          access_token: string
          account_id: string
          account_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          operation_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          account_id?: string
          account_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          operation_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_newsbreak_ad_accounts_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      newsbreak_campaign_status: {
        Row: {
          account_id: string
          budget: number | null
          campaign_id: string
          campaign_name: string
          created_at: string
          id: string
          last_synced_at: string
          objective: string | null
          online_status: string | null
          operation_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          budget?: number | null
          campaign_id: string
          campaign_name: string
          created_at?: string
          id?: string
          last_synced_at?: string
          objective?: string | null
          online_status?: string | null
          operation_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          budget?: number | null
          campaign_id?: string
          campaign_name?: string
          created_at?: string
          id?: string
          last_synced_at?: string
          objective?: string | null
          online_status?: string | null
          operation_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_newsbreak_campaign_status_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      newsbreak_traffic_data: {
        Row: {
          account_id: string
          ad_id: string | null
          ad_name: string | null
          ad_set_id: string | null
          ad_set_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          clicks: number
          conversions: number
          cpc: number
          cpm: number
          created_at: string
          ctr: number
          date: string
          id: string
          impressions: number
          operation_id: string
          spend: number
          status: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          ad_id?: string | null
          ad_name?: string | null
          ad_set_id?: string | null
          ad_set_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          clicks?: number
          conversions?: number
          cpc?: number
          cpm?: number
          created_at?: string
          ctr?: number
          date: string
          id?: string
          impressions?: number
          operation_id: string
          spend?: number
          status?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          ad_id?: string | null
          ad_name?: string | null
          ad_set_id?: string | null
          ad_set_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          clicks?: number
          conversions?: number
          cpc?: number
          cpm?: number
          created_at?: string
          ctr?: number
          date?: string
          id?: string
          impressions?: number
          operation_id?: string
          spend?: number
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_newsbreak_traffic_data_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsbreak_traffic_data_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_recipients: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_orphan: boolean | null
          name: string
          operation_id: string
          project_filter: Json
          schedule: Json
          updated_at: string
          webhook_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_orphan?: boolean | null
          name: string
          operation_id: string
          project_filter?: Json
          schedule?: Json
          updated_at?: string
          webhook_url?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_orphan?: boolean | null
          name?: string
          operation_id?: string
          project_filter?: Json
          schedule?: Json
          updated_at?: string
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_notification_recipients_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_recipients_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          created_at: string
          id: string
          operation_id: string
          report_pattern: string
          report_schedule: Json
          sale_show_dashboard_name: boolean
          sale_show_product: boolean
          sale_show_utm_campaign: boolean
          sale_value_format: string
          send_approved_sales: boolean
          send_pending_sales: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          operation_id: string
          report_pattern?: string
          report_schedule?: Json
          sale_show_dashboard_name?: boolean
          sale_show_product?: boolean
          sale_show_utm_campaign?: boolean
          sale_value_format?: string
          send_approved_sales?: boolean
          send_pending_sales?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          operation_id?: string
          report_pattern?: string
          report_schedule?: Json
          sale_show_dashboard_name?: boolean
          sale_show_product?: boolean
          sale_show_utm_campaign?: boolean
          sale_value_format?: string
          send_approved_sales?: boolean
          send_pending_sales?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_notification_settings_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_settings_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          available_variables: string[]
          body_template: string
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          operation_id: string | null
          project_scope: string
          title_template: string
          type: string
          updated_at: string
          use_legacy: boolean
        }
        Insert: {
          available_variables?: string[]
          body_template?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          operation_id?: string | null
          project_scope?: string
          title_template?: string
          type?: string
          updated_at?: string
          use_legacy?: boolean
        }
        Update: {
          available_variables?: string[]
          body_template?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          operation_id?: string | null
          project_scope?: string
          title_template?: string
          type?: string
          updated_at?: string
          use_legacy?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fk_notification_templates_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_templates_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_benchmarks: {
        Row: {
          conversion_pct: number | null
          cpc_brl: number | null
          cpi_brl: number | null
          cpm_brl: number | null
          created_at: string
          created_by: string | null
          ctr_pct: number | null
          id: string
          nicho: Database["public"]["Enums"]["offer_nicho"]
          notes: string | null
          operation_id: string
          pitch_retention_pct: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          conversion_pct?: number | null
          cpc_brl?: number | null
          cpi_brl?: number | null
          cpm_brl?: number | null
          created_at?: string
          created_by?: string | null
          ctr_pct?: number | null
          id?: string
          nicho: Database["public"]["Enums"]["offer_nicho"]
          notes?: string | null
          operation_id: string
          pitch_retention_pct?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          conversion_pct?: number | null
          cpc_brl?: number | null
          cpi_brl?: number | null
          cpm_brl?: number | null
          created_at?: string
          created_by?: string | null
          ctr_pct?: number | null
          id?: string
          nicho?: Database["public"]["Enums"]["offer_nicho"]
          notes?: string | null
          operation_id?: string
          pitch_retention_pct?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_offer_benchmarks_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_benchmarks_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          motivo: string | null
          offer_id: string
          operation_id: string
          status_anterior: Database["public"]["Enums"]["offer_status"] | null
          status_novo: Database["public"]["Enums"]["offer_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          motivo?: string | null
          offer_id: string
          operation_id: string
          status_anterior?: Database["public"]["Enums"]["offer_status"] | null
          status_novo: Database["public"]["Enums"]["offer_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          motivo?: string | null
          offer_id?: string
          operation_id?: string
          status_anterior?: Database["public"]["Enums"]["offer_status"] | null
          status_novo?: Database["public"]["Enums"]["offer_status"]
        }
        Relationships: [
          {
            foreignKeyName: "fk_offer_status_history_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_status_history_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_status_history_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "v_offers_active"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_status_history_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          aliases: string[] | null
          apelido_interno: string
          comissao_pct: number | null
          comissao_usd: number | null
          cpa_target_brl: number | null
          created_at: string
          created_by: string | null
          data_inicio: string | null
          data_morte: string | null
          geo: Database["public"]["Enums"]["offer_geo"]
          id: string
          is_cod: boolean
          landing_pages: string[] | null
          link_checkout: string | null
          margem_pct: number | null
          media_channels: string[] | null
          motivo_morte: string | null
          nicho: Database["public"]["Enums"]["offer_nicho"]
          nickname_afiliado: string | null
          notas: string | null
          operation_id: string
          pixel_id: string | null
          preview_image_updated_at: string | null
          preview_image_url: string | null
          producer_id: string | null
          produto_real: string
          redtrack_offer_names: string[] | null
          sales_page_url: string | null
          status: Database["public"]["Enums"]["offer_status"]
          tags: string[] | null
          teto_validacao_brl: number | null
          ticket_front_brl: number | null
          ticket_front_usd: number | null
          tipo: Database["public"]["Enums"]["offer_tipo"]
          updated_at: string
          updated_by: string | null
          vendor: Database["public"]["Enums"]["offer_vendor"]
          vendor_id: string | null
          vendors_clickbank: string[] | null
          vsl_player: string | null
          vsl_url: string | null
        }
        Insert: {
          aliases?: string[] | null
          apelido_interno: string
          comissao_pct?: number | null
          comissao_usd?: number | null
          cpa_target_brl?: number | null
          created_at?: string
          created_by?: string | null
          data_inicio?: string | null
          data_morte?: string | null
          geo?: Database["public"]["Enums"]["offer_geo"]
          id?: string
          is_cod?: boolean
          landing_pages?: string[] | null
          link_checkout?: string | null
          margem_pct?: number | null
          media_channels?: string[] | null
          motivo_morte?: string | null
          nicho: Database["public"]["Enums"]["offer_nicho"]
          nickname_afiliado?: string | null
          notas?: string | null
          operation_id: string
          pixel_id?: string | null
          preview_image_updated_at?: string | null
          preview_image_url?: string | null
          producer_id?: string | null
          produto_real: string
          redtrack_offer_names?: string[] | null
          sales_page_url?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          tags?: string[] | null
          teto_validacao_brl?: number | null
          ticket_front_brl?: number | null
          ticket_front_usd?: number | null
          tipo?: Database["public"]["Enums"]["offer_tipo"]
          updated_at?: string
          updated_by?: string | null
          vendor: Database["public"]["Enums"]["offer_vendor"]
          vendor_id?: string | null
          vendors_clickbank?: string[] | null
          vsl_player?: string | null
          vsl_url?: string | null
        }
        Update: {
          aliases?: string[] | null
          apelido_interno?: string
          comissao_pct?: number | null
          comissao_usd?: number | null
          cpa_target_brl?: number | null
          created_at?: string
          created_by?: string | null
          data_inicio?: string | null
          data_morte?: string | null
          geo?: Database["public"]["Enums"]["offer_geo"]
          id?: string
          is_cod?: boolean
          landing_pages?: string[] | null
          link_checkout?: string | null
          margem_pct?: number | null
          media_channels?: string[] | null
          motivo_morte?: string | null
          nicho?: Database["public"]["Enums"]["offer_nicho"]
          nickname_afiliado?: string | null
          notas?: string | null
          operation_id?: string
          pixel_id?: string | null
          preview_image_updated_at?: string | null
          preview_image_url?: string | null
          producer_id?: string | null
          produto_real?: string
          redtrack_offer_names?: string[] | null
          sales_page_url?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          tags?: string[] | null
          teto_validacao_brl?: number | null
          ticket_front_brl?: number | null
          ticket_front_usd?: number | null
          tipo?: Database["public"]["Enums"]["offer_tipo"]
          updated_at?: string
          updated_by?: string | null
          vendor?: Database["public"]["Enums"]["offer_vendor"]
          vendor_id?: string | null
          vendors_clickbank?: string[] | null
          vsl_player?: string | null
          vsl_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_offers_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_aliases: {
        Row: {
          alias_input: string
          created_at: string
          id: string
          operation_id: string
          updated_at: string
        }
        Insert: {
          alias_input: string
          created_at?: string
          id?: string
          operation_id: string
          updated_at?: string
        }
        Update: {
          alias_input?: string
          created_at?: string
          id?: string
          operation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_aliases_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_audit: {
        Row: {
          action: string
          id: string
          note: string | null
          operation_id: string
          performed_at: string
          performed_by: string
        }
        Insert: {
          action: string
          id?: string
          note?: string | null
          operation_id: string
          performed_at?: string
          performed_by: string
        }
        Update: {
          action?: string
          id?: string
          note?: string | null
          operation_id?: string
          performed_at?: string
          performed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_audit_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_credentials: {
        Row: {
          account_ids: string[]
          created_at: string
          expires_at: string | null
          id: string
          last_verification_error: string | null
          last_verified_at: string | null
          metadata: Json
          operation_id: string
          profile_key: string
          provider: string
          rotated_at: string | null
          status: string
          updated_at: string
          vault_secret_id: string | null
          vault_secret_name: string
        }
        Insert: {
          account_ids?: string[]
          created_at?: string
          expires_at?: string | null
          id?: string
          last_verification_error?: string | null
          last_verified_at?: string | null
          metadata?: Json
          operation_id: string
          profile_key?: string
          provider: string
          rotated_at?: string | null
          status?: string
          updated_at?: string
          vault_secret_id?: string | null
          vault_secret_name: string
        }
        Update: {
          account_ids?: string[]
          created_at?: string
          expires_at?: string | null
          id?: string
          last_verification_error?: string | null
          last_verified_at?: string | null
          metadata?: Json
          operation_id?: string
          profile_key?: string
          provider?: string
          rotated_at?: string | null
          status?: string
          updated_at?: string
          vault_secret_id?: string | null
          vault_secret_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_credentials_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          operation_id: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          operation_id: string
          role?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          operation_id?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_operation_invites_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_invites_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_members: {
        Row: {
          id: string
          joined_at: string
          operation_id: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          operation_id: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          operation_id?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_operation_members_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_members_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_webhooks: {
        Row: {
          active: boolean
          created_at: string
          endpoint_slug: string
          id: string
          operation_id: string
          platform: string
          secret_token: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          endpoint_slug: string
          id?: string
          operation_id: string
          platform: string
          secret_token: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          endpoint_slug?: string
          id?: string
          operation_id?: string
          platform?: string
          secret_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_webhooks_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      operations: {
        Row: {
          apply_meta_tax: boolean
          archived_at: string | null
          created_at: string
          currency: string
          daily_revenue_goal: number | null
          deleted_at: string | null
          enabled_features: Json
          id: string
          logo_url: string | null
          max_cpa: number | null
          max_members: number | null
          max_meta_accounts: number | null
          min_roas: number | null
          monthly_revenue_goal: number | null
          name: string
          owner_user_id: string
          plan: string
          primary_color: string | null
          slug: string
          status: string
          suspended_at: string | null
          timezone: string
          trial_ends_at: string | null
          vturb_api_key: string | null
        }
        Insert: {
          apply_meta_tax?: boolean
          archived_at?: string | null
          created_at?: string
          currency?: string
          daily_revenue_goal?: number | null
          deleted_at?: string | null
          enabled_features?: Json
          id?: string
          logo_url?: string | null
          max_cpa?: number | null
          max_members?: number | null
          max_meta_accounts?: number | null
          min_roas?: number | null
          monthly_revenue_goal?: number | null
          name: string
          owner_user_id: string
          plan?: string
          primary_color?: string | null
          slug: string
          status?: string
          suspended_at?: string | null
          timezone?: string
          trial_ends_at?: string | null
          vturb_api_key?: string | null
        }
        Update: {
          apply_meta_tax?: boolean
          archived_at?: string | null
          created_at?: string
          currency?: string
          daily_revenue_goal?: number | null
          deleted_at?: string | null
          enabled_features?: Json
          id?: string
          logo_url?: string | null
          max_cpa?: number | null
          max_members?: number | null
          max_meta_accounts?: number | null
          min_roas?: number | null
          monthly_revenue_goal?: number | null
          name?: string
          owner_user_id?: string
          plan?: string
          primary_color?: string | null
          slug?: string
          status?: string
          suspended_at?: string | null
          timezone?: string
          trial_ends_at?: string | null
          vturb_api_key?: string | null
        }
        Relationships: []
      }
      orphan_orders: {
        Row: {
          created_at: string | null
          headers: Json | null
          id: string
          raw_payload: Json
          reason: string
          resolved_at: string | null
          resolved_operation_id: string | null
          webhook_source: string
        }
        Insert: {
          created_at?: string | null
          headers?: Json | null
          id?: string
          raw_payload: Json
          reason: string
          resolved_at?: string | null
          resolved_operation_id?: string | null
          webhook_source: string
        }
        Update: {
          created_at?: string | null
          headers?: Json | null
          id?: string
          raw_payload?: Json
          reason?: string
          resolved_at?: string | null
          resolved_operation_id?: string | null
          webhook_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "orphan_orders_resolved_operation_id_fkey"
            columns: ["resolved_operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      pacing_action_log: {
        Row: {
          account_id: string
          account_name: string | null
          action_type: string
          batch_id: string | null
          budget_group_id: string | null
          campaign_id: string
          campaign_name: string
          created_at: string
          daily_budget: number | null
          dry_run: boolean
          error_message: string | null
          id: string
          killed_by: string | null
          meta_response: Json | null
          operation_id: string
          pct_above_expected: number | null
          pushcut_response: Json | null
          pushcut_sent: boolean
          reason: string
          region: string | null
          rule_id: string | null
          sales_last_hour: number | null
          spend_at_action: number | null
          spend_expected: number | null
          spend_last_hour: number | null
          success: boolean | null
          triggered_at: string
        }
        Insert: {
          account_id: string
          account_name?: string | null
          action_type: string
          batch_id?: string | null
          budget_group_id?: string | null
          campaign_id: string
          campaign_name: string
          created_at?: string
          daily_budget?: number | null
          dry_run?: boolean
          error_message?: string | null
          id?: string
          killed_by?: string | null
          meta_response?: Json | null
          operation_id: string
          pct_above_expected?: number | null
          pushcut_response?: Json | null
          pushcut_sent?: boolean
          reason: string
          region?: string | null
          rule_id?: string | null
          sales_last_hour?: number | null
          spend_at_action?: number | null
          spend_expected?: number | null
          spend_last_hour?: number | null
          success?: boolean | null
          triggered_at?: string
        }
        Update: {
          account_id?: string
          account_name?: string | null
          action_type?: string
          batch_id?: string | null
          budget_group_id?: string | null
          campaign_id?: string
          campaign_name?: string
          created_at?: string
          daily_budget?: number | null
          dry_run?: boolean
          error_message?: string | null
          id?: string
          killed_by?: string | null
          meta_response?: Json | null
          operation_id?: string
          pct_above_expected?: number | null
          pushcut_response?: Json | null
          pushcut_sent?: boolean
          reason?: string
          region?: string | null
          rule_id?: string | null
          sales_last_hour?: number | null
          spend_at_action?: number | null
          spend_expected?: number | null
          spend_last_hour?: number | null
          success?: boolean | null
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pacing_action_log_budget_group_id_fkey"
            columns: ["budget_group_id"]
            isOneToOne: false
            referencedRelation: "pacing_budget_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacing_action_log_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacing_action_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "pacing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      pacing_budget_groups: {
        Row: {
          config: Json
          created_at: string
          currency: string
          description: string | null
          enabled: boolean
          id: string
          max_daily_total: number | null
          max_spend_per_hour: number
          name: string
          operation_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          currency?: string
          description?: string | null
          enabled?: boolean
          id?: string
          max_daily_total?: number | null
          max_spend_per_hour: number
          name: string
          operation_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          currency?: string
          description?: string | null
          enabled?: boolean
          id?: string
          max_daily_total?: number | null
          max_spend_per_hour?: number
          name?: string
          operation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_pacing_budget_groups_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacing_budget_groups_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      pacing_campaign_hourly_snapshots: {
        Row: {
          account_id: string
          campaign_id: string
          campaign_name: string
          clicks_today: number
          created_at: string
          date: string
          id: string
          impressions_today: number
          link_clicks_today: number
          operation_id: string
          revenue_today_brl: number
          sales_last_60m: number
          snapshot_at: string
          snapshot_bucket: string
          source: string
          spend_last_60m_brl: number
          spend_today_brl: number
          updated_at: string
        }
        Insert: {
          account_id: string
          campaign_id: string
          campaign_name: string
          clicks_today?: number
          created_at?: string
          date: string
          id?: string
          impressions_today?: number
          link_clicks_today?: number
          operation_id: string
          revenue_today_brl?: number
          sales_last_60m?: number
          snapshot_at?: string
          snapshot_bucket: string
          source?: string
          spend_last_60m_brl?: number
          spend_today_brl?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          campaign_id?: string
          campaign_name?: string
          clicks_today?: number
          created_at?: string
          date?: string
          id?: string
          impressions_today?: number
          link_clicks_today?: number
          operation_id?: string
          revenue_today_brl?: number
          sales_last_60m?: number
          snapshot_at?: string
          snapshot_bucket?: string
          source?: string
          spend_last_60m_brl?: number
          spend_today_brl?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_pacing_campaign_hourly_snapshots_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacing_campaign_hourly_snapshots_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      pacing_cooldowns: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          last_set_budget_brl: number | null
          locked_by_rule_id: string | null
          locked_until_hour_brt: number | null
          operation_id: string
          reason: string | null
          rule_id: string | null
          set_by: string | null
          snoozed_until: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          last_set_budget_brl?: number | null
          locked_by_rule_id?: string | null
          locked_until_hour_brt?: number | null
          operation_id: string
          reason?: string | null
          rule_id?: string | null
          set_by?: string | null
          snoozed_until: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          last_set_budget_brl?: number | null
          locked_by_rule_id?: string | null
          locked_until_hour_brt?: number | null
          operation_id?: string
          reason?: string | null
          rule_id?: string | null
          set_by?: string | null
          snoozed_until?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_pacing_cooldowns_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacing_cooldowns_locked_by_rule_id_fkey"
            columns: ["locked_by_rule_id"]
            isOneToOne: false
            referencedRelation: "pacing_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacing_cooldowns_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacing_cooldowns_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "pacing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      pacing_evaluation_log: {
        Row: {
          blocked_details: Json | null
          campaign_ids: string[] | null
          campaigns_blocked: number
          campaigns_fired: number
          campaigns_matched: number
          created_at: string
          dry_run: boolean
          evaluated_at: string
          id: string
          operation_id: string
          rule_id: string | null
          rule_name: string
          skip_reason: string | null
        }
        Insert: {
          blocked_details?: Json | null
          campaign_ids?: string[] | null
          campaigns_blocked?: number
          campaigns_fired?: number
          campaigns_matched?: number
          created_at?: string
          dry_run?: boolean
          evaluated_at?: string
          id?: string
          operation_id: string
          rule_id?: string | null
          rule_name: string
          skip_reason?: string | null
        }
        Update: {
          blocked_details?: Json | null
          campaign_ids?: string[] | null
          campaigns_blocked?: number
          campaigns_fired?: number
          campaigns_matched?: number
          created_at?: string
          dry_run?: boolean
          evaluated_at?: string
          id?: string
          operation_id?: string
          rule_id?: string | null
          rule_name?: string
          skip_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_pacing_evaluation_log_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacing_evaluation_log_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacing_evaluation_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "pacing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      pacing_rules: {
        Row: {
          action_config: Json
          budget_group_id: string | null
          created_at: string
          default_daily_target_brl: number | null
          description: string | null
          dry_run: boolean
          enabled: boolean
          filter_config: Json
          fire_count_today: number
          fire_count_total: number
          id: string
          last_evaluated_at: string | null
          last_triggered_at: string | null
          name: string
          notification_config: Json
          operation_id: string
          trigger_config: Json
          updated_at: string
        }
        Insert: {
          action_config?: Json
          budget_group_id?: string | null
          created_at?: string
          default_daily_target_brl?: number | null
          description?: string | null
          dry_run?: boolean
          enabled?: boolean
          filter_config?: Json
          fire_count_today?: number
          fire_count_total?: number
          id?: string
          last_evaluated_at?: string | null
          last_triggered_at?: string | null
          name: string
          notification_config?: Json
          operation_id: string
          trigger_config?: Json
          updated_at?: string
        }
        Update: {
          action_config?: Json
          budget_group_id?: string | null
          created_at?: string
          default_daily_target_brl?: number | null
          description?: string | null
          dry_run?: boolean
          enabled?: boolean
          filter_config?: Json
          fire_count_today?: number
          fire_count_total?: number
          id?: string
          last_evaluated_at?: string | null
          last_triggered_at?: string | null
          name?: string
          notification_config?: Json
          operation_id?: string
          trigger_config?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_pacing_rules_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacing_rules_budget_group_id_fkey"
            columns: ["budget_group_id"]
            isOneToOne: false
            referencedRelation: "pacing_budget_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacing_rules_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      pacing_settings: {
        Row: {
          key: string
          operation_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          operation_id: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          operation_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "pacing_settings_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_models: {
        Row: {
          created_at: string
          id: string
          is_system: boolean
          name: string
          operation_id: string
          rules_json: Json
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          operation_id: string
          rules_json?: Json
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          operation_id?: string
          rules_json?: Json
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_payment_models_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_models_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      payoneer_transactions: {
        Row: {
          amount_brl: number | null
          category: string
          created_at: string
          credit_amount: number
          currency: string
          debit_amount: number
          description: string | null
          fx_rate: number | null
          id: string
          imported_at: string
          linked_charge_id: string | null
          linked_topup_id: string | null
          net_amount: number
          operation_id: string
          raw_description: string | null
          reference_id: string | null
          running_balance: number | null
          source_file_id: string | null
          source_label: string | null
          source_row_hash: string
          status: string | null
          store_name: string | null
          target_label: string | null
          transaction_date: string
          transaction_id: string
          updated_at: string
          upload_log_id: string | null
        }
        Insert: {
          amount_brl?: number | null
          category: string
          created_at?: string
          credit_amount?: number
          currency?: string
          debit_amount?: number
          description?: string | null
          fx_rate?: number | null
          id?: string
          imported_at?: string
          linked_charge_id?: string | null
          linked_topup_id?: string | null
          net_amount?: number
          operation_id: string
          raw_description?: string | null
          reference_id?: string | null
          running_balance?: number | null
          source_file_id?: string | null
          source_label?: string | null
          source_row_hash: string
          status?: string | null
          store_name?: string | null
          target_label?: string | null
          transaction_date: string
          transaction_id: string
          updated_at?: string
          upload_log_id?: string | null
        }
        Update: {
          amount_brl?: number | null
          category?: string
          created_at?: string
          credit_amount?: number
          currency?: string
          debit_amount?: number
          description?: string | null
          fx_rate?: number | null
          id?: string
          imported_at?: string
          linked_charge_id?: string | null
          linked_topup_id?: string | null
          net_amount?: number
          operation_id?: string
          raw_description?: string | null
          reference_id?: string | null
          running_balance?: number | null
          source_file_id?: string | null
          source_label?: string | null
          source_row_hash?: string
          status?: string | null
          store_name?: string | null
          target_label?: string | null
          transaction_date?: string
          transaction_id?: string
          updated_at?: string
          upload_log_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_payoneer_transactions_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payoneer_transactions_upload_log_id_fkey"
            columns: ["upload_log_id"]
            isOneToOne: false
            referencedRelation: "integration_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_goals: {
        Row: {
          average_product_price: number
          cogs: number
          cpa_goal: number
          created_at: string
          end_date: string
          fee_rate: number
          id: string
          margin_goal: number
          operation_id: string
          profit_goal: number
          revenue_goal: number
          sales_goal: number
          start_date: string
          tax_rate: number
          updated_at: string
        }
        Insert: {
          average_product_price?: number
          cogs?: number
          cpa_goal?: number
          created_at?: string
          end_date: string
          fee_rate?: number
          id?: string
          margin_goal?: number
          operation_id: string
          profit_goal?: number
          revenue_goal?: number
          sales_goal?: number
          start_date: string
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          average_product_price?: number
          cogs?: number
          cpa_goal?: number
          created_at?: string
          end_date?: string
          fee_rate?: number
          id?: string
          margin_goal?: number
          operation_id?: string
          profit_goal?: number
          revenue_goal?: number
          sales_goal?: number
          start_date?: string
          tax_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_planning_goals_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_goals_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      producers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          operation_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          operation_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          operation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_producers_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producers_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_margin_settings: {
        Row: {
          be_buffer_pct: number
          created_at: string
          id: string
          margin_pct: number
          operation_id: string
          product_key: string
          updated_at: string
        }
        Insert: {
          be_buffer_pct?: number
          created_at?: string
          id?: string
          margin_pct?: number
          operation_id: string
          product_key: string
          updated_at?: string
        }
        Update: {
          be_buffer_pct?: number
          created_at?: string
          id?: string
          margin_pct?: number
          operation_id?: string
          product_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_margin_settings_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          phone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pulse_divergence_log: {
        Row: {
          created_at: string
          dash_revenue: number | null
          dash_sales: number | null
          dash_spend: number | null
          details: string | null
          exceeded: boolean
          hour_brt: number | null
          id: string
          operation_id: string | null
          pulse_revenue: number | null
          pulse_sales: number | null
          pulse_spend: number | null
          report_date: string
          revenue_drift_pct: number | null
          sales_drift_pct: number | null
          spend_drift_pct: number | null
        }
        Insert: {
          created_at?: string
          dash_revenue?: number | null
          dash_sales?: number | null
          dash_spend?: number | null
          details?: string | null
          exceeded?: boolean
          hour_brt?: number | null
          id?: string
          operation_id?: string | null
          pulse_revenue?: number | null
          pulse_sales?: number | null
          pulse_spend?: number | null
          report_date: string
          revenue_drift_pct?: number | null
          sales_drift_pct?: number | null
          spend_drift_pct?: number | null
        }
        Update: {
          created_at?: string
          dash_revenue?: number | null
          dash_sales?: number | null
          dash_spend?: number | null
          details?: string | null
          exceeded?: boolean
          hour_brt?: number | null
          id?: string
          operation_id?: string | null
          pulse_revenue?: number | null
          pulse_sales?: number | null
          pulse_spend?: number | null
          report_date?: string
          revenue_drift_pct?: number | null
          sales_drift_pct?: number | null
          spend_drift_pct?: number | null
        }
        Relationships: []
      }
      push_notification_history: {
        Row: {
          body: string | null
          error: string | null
          id: string
          notification_type: string | null
          operation_id: string | null
          payload: Json | null
          sent_at: string
          status: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          error?: string | null
          id?: string
          notification_type?: string | null
          operation_id?: string | null
          payload?: Json | null
          sent_at?: string
          status?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          error?: string | null
          id?: string
          notification_type?: string | null
          operation_id?: string | null
          payload?: Json | null
          sent_at?: string
          status?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      push_notification_recipients: {
        Row: {
          created_at: string
          enabled: boolean
          notification_type: string
          operation_id: string
          template_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          notification_type: string
          operation_id: string
          template_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          notification_type?: string
          operation_id?: string
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_notification_recipients_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_notification_recipients_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      push_send_claims: {
        Row: {
          created_at: string
          dedupe_key: string
        }
        Insert: {
          created_at?: string
          dedupe_key: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          deleted_at: string | null
          device_label: string | null
          enabled: boolean
          endpoint: string
          id: string
          last_used_at: string | null
          operation_id: string | null
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          deleted_at?: string | null
          device_label?: string | null
          enabled?: boolean
          endpoint: string
          id?: string
          last_used_at?: string | null
          operation_id?: string | null
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          deleted_at?: string | null
          device_label?: string | null
          enabled?: boolean
          endpoint?: string
          id?: string
          last_used_at?: string | null
          operation_id?: string | null
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      recipient_notification_prefs: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          operation_id: string
          recipient_id: string
          schedule: Json
          template_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          operation_id: string
          recipient_id: string
          schedule?: Json
          template_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          operation_id?: string
          recipient_id?: string
          schedule?: Json
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_recipient_notification_prefs_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipient_notification_prefs_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipient_notification_prefs_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "notification_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipient_notification_prefs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_alerts: {
        Row: {
          actual_amount_brl: number | null
          ad_account_id: string | null
          alert_date: string
          alert_type: string
          auto_resolution_reason: string | null
          auto_resolved: boolean
          card_charge_id: string | null
          card_provider: string | null
          created_at: string
          description: string
          detected_at: string
          detection_metadata: Json | null
          expected_amount_brl: number | null
          gap_amount_brl: number | null
          gap_percentage: number | null
          id: string
          operation_id: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          suggested_action: string | null
          title: string
          updated_at: string
        }
        Insert: {
          actual_amount_brl?: number | null
          ad_account_id?: string | null
          alert_date: string
          alert_type: string
          auto_resolution_reason?: string | null
          auto_resolved?: boolean
          card_charge_id?: string | null
          card_provider?: string | null
          created_at?: string
          description?: string
          detected_at?: string
          detection_metadata?: Json | null
          expected_amount_brl?: number | null
          gap_amount_brl?: number | null
          gap_percentage?: number | null
          id?: string
          operation_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          suggested_action?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          actual_amount_brl?: number | null
          ad_account_id?: string | null
          alert_date?: string
          alert_type?: string
          auto_resolution_reason?: string | null
          auto_resolved?: boolean
          card_charge_id?: string | null
          card_provider?: string | null
          created_at?: string
          description?: string
          detected_at?: string
          detection_metadata?: Json | null
          expected_amount_brl?: number | null
          gap_amount_brl?: number | null
          gap_percentage?: number | null
          id?: string
          operation_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          suggested_action?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_reconciliation_alerts_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_alerts_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      redtrack_conversions: {
        Row: {
          browser: string | null
          campaign: string | null
          city: string | null
          clickid: string | null
          conv_time: string | null
          country: string | null
          currency: string | null
          device_fullname: string | null
          external_id: string | null
          id: string
          offer: string | null
          operation_id: string | null
          os: string | null
          payout: number | null
          payout_brl: number | null
          product: string | null
          project: string | null
          project_slug: string | null
          raw_payload: Json | null
          received_at: string | null
          rt_ad: string | null
          rt_ad_id: string | null
          rt_adgroup: string | null
          rt_adgroup_id: string | null
          rt_campaign: string | null
          rt_campaign_id: string | null
          rt_id: string
          rt_medium: string | null
          rt_placement: string | null
          rt_source: string | null
          source: string | null
          status: string | null
          track_time: string | null
          type: string | null
        }
        Insert: {
          browser?: string | null
          campaign?: string | null
          city?: string | null
          clickid?: string | null
          conv_time?: string | null
          country?: string | null
          currency?: string | null
          device_fullname?: string | null
          external_id?: string | null
          id?: string
          offer?: string | null
          operation_id?: string | null
          os?: string | null
          payout?: number | null
          payout_brl?: number | null
          product?: string | null
          project?: string | null
          project_slug?: string | null
          raw_payload?: Json | null
          received_at?: string | null
          rt_ad?: string | null
          rt_ad_id?: string | null
          rt_adgroup?: string | null
          rt_adgroup_id?: string | null
          rt_campaign?: string | null
          rt_campaign_id?: string | null
          rt_id: string
          rt_medium?: string | null
          rt_placement?: string | null
          rt_source?: string | null
          source?: string | null
          status?: string | null
          track_time?: string | null
          type?: string | null
        }
        Update: {
          browser?: string | null
          campaign?: string | null
          city?: string | null
          clickid?: string | null
          conv_time?: string | null
          country?: string | null
          currency?: string | null
          device_fullname?: string | null
          external_id?: string | null
          id?: string
          offer?: string | null
          operation_id?: string | null
          os?: string | null
          payout?: number | null
          payout_brl?: number | null
          product?: string | null
          project?: string | null
          project_slug?: string | null
          raw_payload?: Json | null
          received_at?: string | null
          rt_ad?: string | null
          rt_ad_id?: string | null
          rt_adgroup?: string | null
          rt_adgroup_id?: string | null
          rt_campaign?: string | null
          rt_campaign_id?: string | null
          rt_id?: string
          rt_medium?: string | null
          rt_placement?: string | null
          rt_source?: string | null
          source?: string | null
          status?: string | null
          track_time?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "redtrack_conversions_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      redtrack_events: {
        Row: {
          amount: number
          browser: string | null
          city: string | null
          clickid: string | null
          country: string | null
          created_at: string
          currency: string
          device: string | null
          event_type: string
          id: string
          meta_ad_id: string | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          occurred_at: string
          offer_name: string | null
          operation_id: string
          os: string | null
          product_name: string | null
          push_sent_at: string | null
          raw_payload: Json | null
          redtrack_id: string | null
          status: string | null
          tid: string | null
          transaction_id: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          amount?: number
          browser?: string | null
          city?: string | null
          clickid?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          device?: string | null
          event_type?: string
          id?: string
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          occurred_at?: string
          offer_name?: string | null
          operation_id: string
          os?: string | null
          product_name?: string | null
          push_sent_at?: string | null
          raw_payload?: Json | null
          redtrack_id?: string | null
          status?: string | null
          tid?: string | null
          transaction_id?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          amount?: number
          browser?: string | null
          city?: string | null
          clickid?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          device?: string | null
          event_type?: string
          id?: string
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          occurred_at?: string
          offer_name?: string | null
          operation_id?: string
          os?: string | null
          product_name?: string | null
          push_sent_at?: string | null
          raw_payload?: Json | null
          redtrack_id?: string | null
          status?: string | null
          tid?: string | null
          transaction_id?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_redtrack_events_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redtrack_events_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_data: {
        Row: {
          country: string | null
          created_at: string
          date: string
          id: string
          operation_id: string
          order_id: string
          product_name: string | null
          project_slug: string | null
          push_sent: boolean
          push_sent_at: string | null
          revenue: number
          status: string
          store: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          date: string
          id?: string
          operation_id: string
          order_id: string
          product_name?: string | null
          project_slug?: string | null
          push_sent?: boolean
          push_sent_at?: string | null
          revenue?: number
          status?: string
          store?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          date?: string
          id?: string
          operation_id?: string
          order_id?: string
          product_name?: string | null
          project_slug?: string | null
          push_sent?: boolean
          push_sent_at?: string | null
          revenue?: number
          status?: string
          store?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_data_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      scale_radar_plans: {
        Row: {
          created_at: string
          created_by: string
          id: string
          operation_id: string
          project_filter: string
          recommendations: Json
          snapshot: Json
          total_creatives_analyzed: number
          total_weak_accounts: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          operation_id: string
          project_filter?: string
          recommendations?: Json
          snapshot?: Json
          total_creatives_analyzed?: number
          total_weak_accounts?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          operation_id?: string
          project_filter?: string
          recommendations?: Json
          snapshot?: Json
          total_creatives_analyzed?: number
          total_weak_accounts?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_scale_radar_plans_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scale_radar_plans_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      space_commission_config: {
        Row: {
          base_formula: string
          commission_pct: number
          created_at: string
          delivery_rate_pct: number
          id: string
          includes_account_rental: boolean
          includes_other_costs: boolean
          includes_taxes: boolean
          includes_traffic_infra: boolean
          is_cod_operation: boolean
          operation_id: string
          other_costs_brl: number
          updated_at: string
        }
        Insert: {
          base_formula?: string
          commission_pct?: number
          created_at?: string
          delivery_rate_pct?: number
          id?: string
          includes_account_rental?: boolean
          includes_other_costs?: boolean
          includes_taxes?: boolean
          includes_traffic_infra?: boolean
          is_cod_operation?: boolean
          operation_id: string
          other_costs_brl?: number
          updated_at?: string
        }
        Update: {
          base_formula?: string
          commission_pct?: number
          created_at?: string
          delivery_rate_pct?: number
          id?: string
          includes_account_rental?: boolean
          includes_other_costs?: boolean
          includes_taxes?: boolean
          includes_traffic_infra?: boolean
          is_cod_operation?: boolean
          operation_id?: string
          other_costs_brl?: number
          updated_at?: string
        }
        Relationships: []
      }
      space_commission_config_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          operation_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          operation_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          operation_id?: string
        }
        Relationships: []
      }
      spy_ad_insights: {
        Row: {
          ad_id: string
          analyzed_at: string
          angle: string | null
          cta_style: string | null
          emotional_trigger: string | null
          hook_text: string | null
          hook_type: string | null
          id: string
          offer_id: string
          operation_id: string
          pain_point: string | null
          promise: string | null
          raw_analysis: Json | null
          score_persuasao: number | null
          target_audience: string | null
        }
        Insert: {
          ad_id: string
          analyzed_at?: string
          angle?: string | null
          cta_style?: string | null
          emotional_trigger?: string | null
          hook_text?: string | null
          hook_type?: string | null
          id?: string
          offer_id: string
          operation_id: string
          pain_point?: string | null
          promise?: string | null
          raw_analysis?: Json | null
          score_persuasao?: number | null
          target_audience?: string | null
        }
        Update: {
          ad_id?: string
          analyzed_at?: string
          angle?: string | null
          cta_style?: string | null
          emotional_trigger?: string | null
          hook_text?: string | null
          hook_type?: string | null
          id?: string
          offer_id?: string
          operation_id?: string
          pain_point?: string | null
          promise?: string | null
          raw_analysis?: Json | null
          score_persuasao?: number | null
          target_audience?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_spy_ad_insights_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_ad_insights_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: true
            referencedRelation: "spy_ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_ad_insights_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "spy_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_ads: {
        Row: {
          ad_active_status: string | null
          ad_creation_time: string | null
          ad_first_seen_at: string
          ad_last_seen_at: string
          advertiser_name: string | null
          advertiser_page_id: string | null
          ai_summary: string | null
          copywriter_confidence: number | null
          copywriter_id: string | null
          created_at: string
          creative_type: string | null
          creative_url: string | null
          cta_text: string | null
          description: string | null
          destination_url: string | null
          geo_targeting: Json | null
          headline: string | null
          hook_classified: string | null
          hook_text: string | null
          id: string
          meta_ad_id: string | null
          offer_id: string
          operation_id: string
          platform: Json | null
          primary_text: string | null
          thumbnail_url: string | null
        }
        Insert: {
          ad_active_status?: string | null
          ad_creation_time?: string | null
          ad_first_seen_at?: string
          ad_last_seen_at?: string
          advertiser_name?: string | null
          advertiser_page_id?: string | null
          ai_summary?: string | null
          copywriter_confidence?: number | null
          copywriter_id?: string | null
          created_at?: string
          creative_type?: string | null
          creative_url?: string | null
          cta_text?: string | null
          description?: string | null
          destination_url?: string | null
          geo_targeting?: Json | null
          headline?: string | null
          hook_classified?: string | null
          hook_text?: string | null
          id?: string
          meta_ad_id?: string | null
          offer_id: string
          operation_id: string
          platform?: Json | null
          primary_text?: string | null
          thumbnail_url?: string | null
        }
        Update: {
          ad_active_status?: string | null
          ad_creation_time?: string | null
          ad_first_seen_at?: string
          ad_last_seen_at?: string
          advertiser_name?: string | null
          advertiser_page_id?: string | null
          ai_summary?: string | null
          copywriter_confidence?: number | null
          copywriter_id?: string | null
          created_at?: string
          creative_type?: string | null
          creative_url?: string | null
          cta_text?: string | null
          description?: string | null
          destination_url?: string | null
          geo_targeting?: Json | null
          headline?: string | null
          hook_classified?: string | null
          hook_text?: string | null
          id?: string
          meta_ad_id?: string | null
          offer_id?: string
          operation_id?: string
          platform?: Json | null
          primary_text?: string | null
          thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_spy_ads_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_ads_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "spy_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_ads_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_alerts: {
        Row: {
          body: string
          created_at: string
          event_type: string
          id: string
          offer_id: string | null
          operation_id: string
          payload: Json
          pushcut_error: string | null
          pushcut_sent: boolean
          pushcut_sent_at: string | null
          read_at: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          event_type: string
          id?: string
          offer_id?: string | null
          operation_id: string
          payload?: Json
          pushcut_error?: string | null
          pushcut_sent?: boolean
          pushcut_sent_at?: string | null
          read_at?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          event_type?: string
          id?: string
          offer_id?: string | null
          operation_id?: string
          payload?: Json
          pushcut_error?: string | null
          pushcut_sent?: boolean
          pushcut_sent_at?: string | null
          read_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_spy_alerts_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_alerts_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "spy_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_copywriters: {
        Row: {
          alias: string[] | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          id: string
          is_legendary: boolean
          known_offers: string[] | null
          name: string
          operation_id: string
          signature_patterns: Json | null
        }
        Insert: {
          alias?: string[] | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          is_legendary?: boolean
          known_offers?: string[] | null
          name: string
          operation_id: string
          signature_patterns?: Json | null
        }
        Update: {
          alias?: string[] | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          is_legendary?: boolean
          known_offers?: string[] | null
          name?: string
          operation_id?: string
          signature_patterns?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_spy_copywriters_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_copywriters_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_favorites: {
        Row: {
          favorited_at: string
          id: string
          offer_id: string
          operation_id: string
          user_id: string
        }
        Insert: {
          favorited_at?: string
          id?: string
          offer_id: string
          operation_id: string
          user_id: string
        }
        Update: {
          favorited_at?: string
          id?: string
          offer_id?: string
          operation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_spy_favorites_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_favorites_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "spy_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_favorites_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_history: {
        Row: {
          active_ads_count: number | null
          id: number
          offer_id: string
          operation_id: string
          raw_snapshot: Json | null
          snapshot_at: string
          total_ads_count: number | null
        }
        Insert: {
          active_ads_count?: number | null
          id?: number
          offer_id: string
          operation_id: string
          raw_snapshot?: Json | null
          snapshot_at?: string
          total_ads_count?: number | null
        }
        Update: {
          active_ads_count?: number | null
          id?: number
          offer_id?: string
          operation_id?: string
          raw_snapshot?: Json | null
          snapshot_at?: string
          total_ads_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_spy_history_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_history_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "spy_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_lps: {
        Row: {
          cta_main: string | null
          format: string | null
          headline: string | null
          hook_main: string | null
          html_hash: string | null
          id: string
          is_upsell: boolean
          offer_id: string
          operation_id: string
          parent_lp_id: string | null
          pitch_time_seconds: number | null
          pixels_detected: Json | null
          scraped_at: string
          screenshot_url: string | null
          sub_headline: string | null
          url: string
          url_final: string | null
        }
        Insert: {
          cta_main?: string | null
          format?: string | null
          headline?: string | null
          hook_main?: string | null
          html_hash?: string | null
          id?: string
          is_upsell?: boolean
          offer_id: string
          operation_id: string
          parent_lp_id?: string | null
          pitch_time_seconds?: number | null
          pixels_detected?: Json | null
          scraped_at?: string
          screenshot_url?: string | null
          sub_headline?: string | null
          url: string
          url_final?: string | null
        }
        Update: {
          cta_main?: string | null
          format?: string | null
          headline?: string | null
          hook_main?: string | null
          html_hash?: string | null
          id?: string
          is_upsell?: boolean
          offer_id?: string
          operation_id?: string
          parent_lp_id?: string | null
          pitch_time_seconds?: number | null
          pixels_detected?: Json | null
          scraped_at?: string
          screenshot_url?: string | null
          sub_headline?: string | null
          url?: string
          url_final?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_spy_lps_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_lps_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "spy_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_lps_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_lps_parent_lp_id_fkey"
            columns: ["parent_lp_id"]
            isOneToOne: false
            referencedRelation: "spy_lps"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_offer_files: {
        Row: {
          created_at: string
          file_name: string
          folder: string
          id: string
          mime_type: string | null
          offer_id: string
          operation_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          folder: string
          id?: string
          mime_type?: string | null
          offer_id: string
          operation_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          folder?: string
          id?: string
          mime_type?: string | null
          offer_id?: string
          operation_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_spy_offer_files_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_offer_files_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "spy_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_offers: {
        Row: {
          active_ads_count: number
          ad_library_url: string | null
          advertiser_count: number
          ai_analyzed_at: string | null
          ai_angles: string[]
          ai_niche_tags: string[]
          ai_summary: string | null
          atributos: string[]
          briefing_generated_at: string | null
          briefing_md: string | null
          category_tab: string
          checkout_url: string | null
          checkout_urls: string[]
          cloaker_detected: boolean
          copy_intel_analyzed_at: string | null
          copy_intel_summary: Json | null
          created_at: string
          days_running_max: number | null
          domain: string | null
          escalando: boolean
          extra_links: Json
          first_seen_at: string
          fit_gtx: string | null
          funnel_url: string | null
          funnel_urls: string[]
          geo_main: string | null
          hero_creative_url: string | null
          hero_thumbnail_url: string | null
          id: string
          idioma: string | null
          last_constant_growth_alert_at: string | null
          last_constant_growth_pct: number | null
          last_dead_alert_at: string | null
          last_emerging_growth_alert_at: string | null
          last_emerging_growth_pct: number | null
          last_synced_at: string | null
          last_updated_at: string
          nicho: string | null
          notes: string | null
          notion_id: string | null
          offer_name: string
          oldest_active_ad_at: string | null
          operation_id: string
          payout_estimated_usd: number | null
          primary_advertiser: string | null
          primary_advertiser_page_id: string | null
          product_name: string | null
          sales_page_url: string | null
          saved_count: number
          score: number | null
          source: string
          source_meta: Json | null
          status: string
          subnicho: string | null
          sync_error: string | null
          sync_status: string
          total_ads_count: number
          trafego: string
          view_count: number
          vsl_intel_analyzed_at: string | null
          vsl_intel_source_files: Json | null
          vsl_intel_summary: Json | null
        }
        Insert: {
          active_ads_count?: number
          ad_library_url?: string | null
          advertiser_count?: number
          ai_analyzed_at?: string | null
          ai_angles?: string[]
          ai_niche_tags?: string[]
          ai_summary?: string | null
          atributos?: string[]
          briefing_generated_at?: string | null
          briefing_md?: string | null
          category_tab?: string
          checkout_url?: string | null
          checkout_urls?: string[]
          cloaker_detected?: boolean
          copy_intel_analyzed_at?: string | null
          copy_intel_summary?: Json | null
          created_at?: string
          days_running_max?: number | null
          domain?: string | null
          escalando?: boolean
          extra_links?: Json
          first_seen_at?: string
          fit_gtx?: string | null
          funnel_url?: string | null
          funnel_urls?: string[]
          geo_main?: string | null
          hero_creative_url?: string | null
          hero_thumbnail_url?: string | null
          id?: string
          idioma?: string | null
          last_constant_growth_alert_at?: string | null
          last_constant_growth_pct?: number | null
          last_dead_alert_at?: string | null
          last_emerging_growth_alert_at?: string | null
          last_emerging_growth_pct?: number | null
          last_synced_at?: string | null
          last_updated_at?: string
          nicho?: string | null
          notes?: string | null
          notion_id?: string | null
          offer_name: string
          oldest_active_ad_at?: string | null
          operation_id: string
          payout_estimated_usd?: number | null
          primary_advertiser?: string | null
          primary_advertiser_page_id?: string | null
          product_name?: string | null
          sales_page_url?: string | null
          saved_count?: number
          score?: number | null
          source?: string
          source_meta?: Json | null
          status?: string
          subnicho?: string | null
          sync_error?: string | null
          sync_status?: string
          total_ads_count?: number
          trafego?: string
          view_count?: number
          vsl_intel_analyzed_at?: string | null
          vsl_intel_source_files?: Json | null
          vsl_intel_summary?: Json | null
        }
        Update: {
          active_ads_count?: number
          ad_library_url?: string | null
          advertiser_count?: number
          ai_analyzed_at?: string | null
          ai_angles?: string[]
          ai_niche_tags?: string[]
          ai_summary?: string | null
          atributos?: string[]
          briefing_generated_at?: string | null
          briefing_md?: string | null
          category_tab?: string
          checkout_url?: string | null
          checkout_urls?: string[]
          cloaker_detected?: boolean
          copy_intel_analyzed_at?: string | null
          copy_intel_summary?: Json | null
          created_at?: string
          days_running_max?: number | null
          domain?: string | null
          escalando?: boolean
          extra_links?: Json
          first_seen_at?: string
          fit_gtx?: string | null
          funnel_url?: string | null
          funnel_urls?: string[]
          geo_main?: string | null
          hero_creative_url?: string | null
          hero_thumbnail_url?: string | null
          id?: string
          idioma?: string | null
          last_constant_growth_alert_at?: string | null
          last_constant_growth_pct?: number | null
          last_dead_alert_at?: string | null
          last_emerging_growth_alert_at?: string | null
          last_emerging_growth_pct?: number | null
          last_synced_at?: string | null
          last_updated_at?: string
          nicho?: string | null
          notes?: string | null
          notion_id?: string | null
          offer_name?: string
          oldest_active_ad_at?: string | null
          operation_id?: string
          payout_estimated_usd?: number | null
          primary_advertiser?: string | null
          primary_advertiser_page_id?: string | null
          product_name?: string | null
          sales_page_url?: string | null
          saved_count?: number
          score?: number | null
          source?: string
          source_meta?: Json | null
          status?: string
          subnicho?: string | null
          sync_error?: string | null
          sync_status?: string
          total_ads_count?: number
          trafego?: string
          view_count?: number
          vsl_intel_analyzed_at?: string | null
          vsl_intel_source_files?: Json | null
          vsl_intel_summary?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_spy_offers_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_scrape_log: {
        Row: {
          ads_fetched: number | null
          apify_run_id: string | null
          duration_ms: number | null
          errors: number | null
          id: number
          offers_created: number | null
          offers_updated: number | null
          operation_id: string
          ran_at: string
          source: string | null
        }
        Insert: {
          ads_fetched?: number | null
          apify_run_id?: string | null
          duration_ms?: number | null
          errors?: number | null
          id?: number
          offers_created?: number | null
          offers_updated?: number | null
          operation_id: string
          ran_at?: string
          source?: string | null
        }
        Update: {
          ads_fetched?: number | null
          apify_run_id?: string | null
          duration_ms?: number | null
          errors?: number | null
          id?: number
          offers_created?: number | null
          offers_updated?: number | null
          operation_id?: string
          ran_at?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_spy_scrape_log_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_watchlist: {
        Row: {
          created_at: string
          enabled: boolean
          fetch_frequency_hours: number
          id: string
          kind: string
          last_fetched_at: string | null
          operation_id: string
          value: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          fetch_frequency_hours?: number
          id?: string
          kind: string
          last_fetched_at?: string | null
          operation_id: string
          value: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          fetch_frequency_hours?: number
          id?: string
          kind?: string
          last_fetched_at?: string | null
          operation_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_spy_watchlist_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string
          is_restricted: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string
          is_restricted?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string
          is_restricted?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      system_daily_snapshot: {
        Row: {
          api_read_errors_24h: number
          api_write_errors_24h: number
          calculation_errors: number
          created_at: string
          decision_errors: number
          divergence_percent: number
          id: string
          operation_id: string
          overall_status: string
          snapshot_date: string
          total_campaigns_dash: number
          total_campaigns_meta: number
          total_revenue: number
          total_sales: number
          total_spend: number
        }
        Insert: {
          api_read_errors_24h?: number
          api_write_errors_24h?: number
          calculation_errors?: number
          created_at?: string
          decision_errors?: number
          divergence_percent?: number
          id?: string
          operation_id: string
          overall_status?: string
          snapshot_date?: string
          total_campaigns_dash?: number
          total_campaigns_meta?: number
          total_revenue?: number
          total_sales?: number
          total_spend?: number
        }
        Update: {
          api_read_errors_24h?: number
          api_write_errors_24h?: number
          calculation_errors?: number
          created_at?: string
          decision_errors?: number
          divergence_percent?: number
          id?: string
          operation_id?: string
          overall_status?: string
          snapshot_date?: string
          total_campaigns_dash?: number
          total_campaigns_meta?: number
          total_revenue?: number
          total_sales?: number
          total_spend?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_system_daily_snapshot_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_daily_snapshot_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_docs: {
        Row: {
          category: string
          content: string
          created_at: string
          doc_key: string
          id: string
          operation_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          doc_key: string
          id?: string
          operation_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          doc_key?: string
          id?: string
          operation_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_docs_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_health_logs: {
        Row: {
          created_at: string
          id: string
          message: string | null
          metadata: Json | null
          operation_id: string
          source: string
          status: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          metadata?: Json | null
          operation_id: string
          source?: string
          status?: string
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          metadata?: Json | null
          operation_id?: string
          source?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_system_health_logs_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_health_logs_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          created_at: string
          function_name: string | null
          id: string
          message: string | null
          metadata: Json | null
          operation_id: string
          stack: string | null
          type: string
        }
        Insert: {
          created_at?: string
          function_name?: string | null
          id?: string
          message?: string | null
          metadata?: Json | null
          operation_id: string
          stack?: string | null
          type?: string
        }
        Update: {
          created_at?: string
          function_name?: string | null
          id?: string
          message?: string | null
          metadata?: Json | null
          operation_id?: string
          stack?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_system_logs_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_logs_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      taboola_ad_accounts: {
        Row: {
          account_id: string
          account_name: string | null
          client_id: string
          client_secret: string
          created_at: string | null
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          operation_id: string
          updated_at: string | null
        }
        Insert: {
          account_id: string
          account_name?: string | null
          client_id: string
          client_secret: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          operation_id: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          account_name?: string | null
          client_id?: string
          client_secret?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          operation_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "taboola_ad_accounts_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      taboola_traffic_data: {
        Row: {
          account_id: string
          campaign_id: string
          campaign_name: string | null
          clicks: number | null
          cpc: number | null
          cpm: number | null
          created_at: string | null
          ctr: number | null
          date: string
          id: string
          impressions: number | null
          operation_id: string
          spend: number | null
        }
        Insert: {
          account_id: string
          campaign_id: string
          campaign_name?: string | null
          clicks?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          date: string
          id?: string
          impressions?: number | null
          operation_id: string
          spend?: number | null
        }
        Update: {
          account_id?: string
          campaign_id?: string
          campaign_name?: string | null
          clicks?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number | null
          operation_id?: string
          spend?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "taboola_traffic_data_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_applications: {
        Row: {
          area_of_interest: string
          cover_letter: string
          created_at: string
          email: string
          full_name: string
          id: string
          instagram: string
          job_id: string | null
          notes: string
          operation_id: string
          phone: string
          portfolio_url: string
          quiz_answers: Json
          resume_url: string
          status: string
          updated_at: string
        }
        Insert: {
          area_of_interest?: string
          cover_letter?: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          instagram?: string
          job_id?: string | null
          notes?: string
          operation_id: string
          phone?: string
          portfolio_url?: string
          quiz_answers?: Json
          resume_url?: string
          status?: string
          updated_at?: string
        }
        Update: {
          area_of_interest?: string
          cover_letter?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          instagram?: string
          job_id?: string | null
          notes?: string
          operation_id?: string
          phone?: string
          portfolio_url?: string
          quiz_answers?: Json
          resume_url?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_talent_applications_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "talent_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_applications_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_jobs: {
        Row: {
          area: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          operation_id: string
          quiz_questions: Json
          sort_order: number
          title: string
          updated_at: string
          work_model: string
        }
        Insert: {
          area?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          operation_id: string
          quiz_questions?: Json
          sort_order?: number
          title: string
          updated_at?: string
          work_model?: string
        }
        Update: {
          area?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          operation_id?: string
          quiz_questions?: Json
          sort_order?: number
          title?: string
          updated_at?: string
          work_model?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_talent_jobs_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_jobs_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          commission_type: string
          created_at: string
          fixed_value: number
          id: string
          is_active: boolean
          name: string
          operation_id: string
          percentage: number
          role_title: string
          scope: string
          scope_ref: string | null
          updated_at: string
        }
        Insert: {
          commission_type?: string
          created_at?: string
          fixed_value?: number
          id?: string
          is_active?: boolean
          name: string
          operation_id: string
          percentage?: number
          role_title?: string
          scope?: string
          scope_ref?: string | null
          updated_at?: string
        }
        Update: {
          commission_type?: string
          created_at?: string
          fixed_value?: number
          id?: string
          is_active?: boolean
          name?: string
          operation_id?: string
          percentage?: number
          role_title?: string
          scope?: string
          scope_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_team_members_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_breakdowns: {
        Row: {
          account_id: string
          age: string | null
          breakdown_type: string
          campaign_name: string
          clicks: number
          conversions: number
          country: string | null
          cpc: number
          cpm: number
          created_at: string
          currency: string | null
          date: string
          fx_rate: number | null
          fx_stale: boolean | null
          gender: string | null
          id: string
          impressions: number
          inline_link_clicks: number
          operation_id: string
          platform_position: string | null
          publisher_platform: string | null
          revenue: number
          spend: number
          spend_brl: number | null
          updated_at: string
        }
        Insert: {
          account_id: string
          age?: string | null
          breakdown_type?: string
          campaign_name?: string
          clicks?: number
          conversions?: number
          country?: string | null
          cpc?: number
          cpm?: number
          created_at?: string
          currency?: string | null
          date: string
          fx_rate?: number | null
          fx_stale?: boolean | null
          gender?: string | null
          id?: string
          impressions?: number
          inline_link_clicks?: number
          operation_id: string
          platform_position?: string | null
          publisher_platform?: string | null
          revenue?: number
          spend?: number
          spend_brl?: number | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          age?: string | null
          breakdown_type?: string
          campaign_name?: string
          clicks?: number
          conversions?: number
          country?: string | null
          cpc?: number
          cpm?: number
          created_at?: string
          currency?: string | null
          date?: string
          fx_rate?: number | null
          fx_stale?: boolean | null
          gender?: string | null
          id?: string
          impressions?: number
          inline_link_clicks?: number
          operation_id?: string
          platform_position?: string | null
          publisher_platform?: string | null
          revenue?: number
          spend?: number
          spend_brl?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "traffic_breakdowns_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_data: {
        Row: {
          account_id: string
          ad_id: string | null
          ad_name: string
          adset_id: string | null
          adset_name: string
          campaign_id: string | null
          campaign_name: string
          clicks: number
          cpc: number
          cpm: number
          created_at: string
          ctr: number
          currency: string | null
          date: string
          fb_pixel_initiate_checkout: number | null
          fx_rate: number | null
          fx_stale: boolean
          id: string
          impressions: number
          initiate_checkout: number
          inline_link_clicks: number
          landing_page_views: number | null
          operation_id: string
          project_slug: string | null
          purchase_count: number | null
          spend: number
          spend_brl: number | null
          status: string
          thruplays: number
          updated_at: string
          video_100_percent: number
          video_25_percent: number
          video_3s_views: number
          video_50_percent: number
          video_75_percent: number
          video_plays: number
        }
        Insert: {
          account_id: string
          ad_id?: string | null
          ad_name: string
          adset_id?: string | null
          adset_name: string
          campaign_id?: string | null
          campaign_name: string
          clicks?: number
          cpc?: number
          cpm?: number
          created_at?: string
          ctr?: number
          currency?: string | null
          date: string
          fb_pixel_initiate_checkout?: number | null
          fx_rate?: number | null
          fx_stale?: boolean
          id?: string
          impressions?: number
          initiate_checkout?: number
          inline_link_clicks?: number
          landing_page_views?: number | null
          operation_id: string
          project_slug?: string | null
          purchase_count?: number | null
          spend?: number
          spend_brl?: number | null
          status?: string
          thruplays?: number
          updated_at?: string
          video_100_percent?: number
          video_25_percent?: number
          video_3s_views?: number
          video_50_percent?: number
          video_75_percent?: number
          video_plays?: number
        }
        Update: {
          account_id?: string
          ad_id?: string | null
          ad_name?: string
          adset_id?: string | null
          adset_name?: string
          campaign_id?: string | null
          campaign_name?: string
          clicks?: number
          cpc?: number
          cpm?: number
          created_at?: string
          ctr?: number
          currency?: string | null
          date?: string
          fb_pixel_initiate_checkout?: number | null
          fx_rate?: number | null
          fx_stale?: boolean
          id?: string
          impressions?: number
          initiate_checkout?: number
          inline_link_clicks?: number
          landing_page_views?: number | null
          operation_id?: string
          project_slug?: string | null
          purchase_count?: number | null
          spend?: number
          spend_brl?: number | null
          status?: string
          thruplays?: number
          updated_at?: string
          video_100_percent?: number
          video_25_percent?: number
          video_3s_views?: number
          video_50_percent?: number
          video_75_percent?: number
          video_plays?: number
        }
        Relationships: [
          {
            foreignKeyName: "traffic_data_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_data_backup_20260815: {
        Row: {
          account_id: string | null
          ad_name: string | null
          adset_name: string | null
          campaign_name: string | null
          clicks: number | null
          cpc: number | null
          cpm: number | null
          created_at: string | null
          ctr: number | null
          date: string | null
          fb_pixel_initiate_checkout: number | null
          id: string | null
          impressions: number | null
          initiate_checkout: number | null
          inline_link_clicks: number | null
          landing_page_views: number | null
          operation_id: string | null
          purchase_count: number | null
          spend: number | null
          status: string | null
          thruplays: number | null
          updated_at: string | null
          video_100_percent: number | null
          video_25_percent: number | null
          video_3s_views: number | null
          video_50_percent: number | null
          video_75_percent: number | null
        }
        Insert: {
          account_id?: string | null
          ad_name?: string | null
          adset_name?: string | null
          campaign_name?: string | null
          clicks?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          date?: string | null
          fb_pixel_initiate_checkout?: number | null
          id?: string | null
          impressions?: number | null
          initiate_checkout?: number | null
          inline_link_clicks?: number | null
          landing_page_views?: number | null
          operation_id?: string | null
          purchase_count?: number | null
          spend?: number | null
          status?: string | null
          thruplays?: number | null
          updated_at?: string | null
          video_100_percent?: number | null
          video_25_percent?: number | null
          video_3s_views?: number | null
          video_50_percent?: number | null
          video_75_percent?: number | null
        }
        Update: {
          account_id?: string | null
          ad_name?: string | null
          adset_name?: string | null
          campaign_name?: string | null
          clicks?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          date?: string | null
          fb_pixel_initiate_checkout?: number | null
          id?: string | null
          impressions?: number | null
          initiate_checkout?: number | null
          inline_link_clicks?: number | null
          landing_page_views?: number | null
          operation_id?: string | null
          purchase_count?: number | null
          spend?: number | null
          status?: string | null
          thruplays?: number | null
          updated_at?: string | null
          video_100_percent?: number | null
          video_25_percent?: number | null
          video_3s_views?: number | null
          video_50_percent?: number | null
          video_75_percent?: number | null
        }
        Relationships: []
      }
      traffic_data_hourly: {
        Row: {
          account_id: string
          clicks: number
          created_at: string
          currency: string | null
          date: string
          fb_pixel_initiate_checkout: number | null
          fx_rate: number | null
          hour: number
          id: string
          impressions: number
          initiated_checkouts: number | null
          landing_page_views: number | null
          operation_id: string
          spend: number
          spend_brl: number | null
          updated_at: string
          video_plays: number
          vsl_plays: number | null
        }
        Insert: {
          account_id: string
          clicks?: number
          created_at?: string
          currency?: string | null
          date: string
          fb_pixel_initiate_checkout?: number | null
          fx_rate?: number | null
          hour: number
          id?: string
          impressions?: number
          initiated_checkouts?: number | null
          landing_page_views?: number | null
          operation_id: string
          spend?: number
          spend_brl?: number | null
          updated_at?: string
          video_plays?: number
          vsl_plays?: number | null
        }
        Update: {
          account_id?: string
          clicks?: number
          created_at?: string
          currency?: string | null
          date?: string
          fb_pixel_initiate_checkout?: number | null
          fx_rate?: number | null
          hour?: number
          id?: string
          impressions?: number
          initiated_checkouts?: number | null
          landing_page_views?: number | null
          operation_id?: string
          spend?: number
          spend_brl?: number | null
          updated_at?: string
          video_plays?: number
          vsl_plays?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_traffic_data_hourly_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traffic_data_hourly_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      treasury_topups: {
        Row: {
          amount: number
          amount_brl: number
          created_at: string
          created_by: string | null
          currency: string
          fx_rate: number | null
          id: string
          notes: string | null
          operation_id: string
          provider: string
          reference: string | null
          topup_date: string
          updated_at: string
          upload_log_id: string | null
        }
        Insert: {
          amount: number
          amount_brl: number
          created_at?: string
          created_by?: string | null
          currency?: string
          fx_rate?: number | null
          id?: string
          notes?: string | null
          operation_id: string
          provider: string
          reference?: string | null
          topup_date: string
          updated_at?: string
          upload_log_id?: string | null
        }
        Update: {
          amount?: number
          amount_brl?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          fx_rate?: number | null
          id?: string
          notes?: string | null
          operation_id?: string
          provider?: string
          reference?: string | null
          topup_date?: string
          updated_at?: string
          upload_log_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_treasury_topups_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_topups_upload_log_id_fkey"
            columns: ["upload_log_id"]
            isOneToOne: false
            referencedRelation: "integration_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          operation_id: string
          user_email: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          operation_id: string
          user_email?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          operation_id?: string
          user_email?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_activity_logs_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_activity_logs_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_page_permissions: {
        Row: {
          allowed_pages: string[]
          created_at: string
          id: string
          operation_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_pages?: string[]
          created_at?: string
          id?: string
          operation_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_pages?: string[]
          created_at?: string
          id?: string
          operation_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_page_permissions_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_page_permissions_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
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
      variable_costs: {
        Row: {
          calc_base: string
          created_at: string
          fixed_value: number
          id: string
          is_active: boolean
          name: string
          operation_id: string
          percentage: number
          scope: string
          scope_ref: string | null
          updated_at: string
        }
        Insert: {
          calc_base?: string
          created_at?: string
          fixed_value?: number
          id?: string
          is_active?: boolean
          name: string
          operation_id: string
          percentage?: number
          scope?: string
          scope_ref?: string | null
          updated_at?: string
        }
        Update: {
          calc_base?: string
          created_at?: string
          fixed_value?: number
          id?: string
          is_active?: boolean
          name?: string
          operation_id?: string
          percentage?: number
          scope?: string
          scope_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_variable_costs_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variable_costs_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      vsl_data: {
        Row: {
          average_watch_time: number
          button_clicks: number
          checkout_clicks: number
          created_at: string
          date: string
          id: string
          operation_id: string
          retention_rate: number
          revenue: number
          total_views: number
          unique_views: number
          video_id: string
          video_name: string
        }
        Insert: {
          average_watch_time?: number
          button_clicks?: number
          checkout_clicks?: number
          created_at?: string
          date: string
          id?: string
          operation_id: string
          retention_rate?: number
          revenue?: number
          total_views?: number
          unique_views?: number
          video_id: string
          video_name: string
        }
        Update: {
          average_watch_time?: number
          button_clicks?: number
          checkout_clicks?: number
          created_at?: string
          date?: string
          id?: string
          operation_id?: string
          retention_rate?: number
          revenue?: number
          total_views?: number
          unique_views?: number
          video_id?: string
          video_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_vsl_data_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vsl_data_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      vsl_origin_stats: {
        Row: {
          ad_id: string
          data_capturada: string
          id: string
          pitch_rate: number | null
          play_rate: number | null
          total_clicked: number
          total_over_pitch: number
          total_started: number
          total_viewed: number
          updated_at: string
          vsl_player_id: string
        }
        Insert: {
          ad_id: string
          data_capturada: string
          id?: string
          pitch_rate?: number | null
          play_rate?: number | null
          total_clicked?: number
          total_over_pitch?: number
          total_started?: number
          total_viewed?: number
          updated_at?: string
          vsl_player_id: string
        }
        Update: {
          ad_id?: string
          data_capturada?: string
          id?: string
          pitch_rate?: number | null
          play_rate?: number | null
          total_clicked?: number
          total_over_pitch?: number
          total_started?: number
          total_viewed?: number
          updated_at?: string
          vsl_player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vsl_origin_stats_vsl_player_id_fkey"
            columns: ["vsl_player_id"]
            isOneToOne: false
            referencedRelation: "vsl_players"
            referencedColumns: ["id"]
          },
        ]
      }
      vsl_players: {
        Row: {
          ativa: boolean
          created_at: string
          id: string
          nome_vsl: string
          offer_id: string | null
          operation_id: string | null
          pasta_vturb: string | null
          pitch_time_seconds: number
          updated_at: string
          video_duration_seconds: number
          vturb_player_id: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome_vsl: string
          offer_id?: string | null
          operation_id?: string | null
          pasta_vturb?: string | null
          pitch_time_seconds?: number
          updated_at?: string
          video_duration_seconds?: number
          vturb_player_id: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome_vsl?: string
          offer_id?: string | null
          operation_id?: string | null
          pasta_vturb?: string | null
          pitch_time_seconds?: number
          updated_at?: string
          video_duration_seconds?: number
          vturb_player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vsl_players_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vsl_players_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "v_offers_active"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vsl_players_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      vturb_performance_daily: {
        Row: {
          conversion_rate: number
          conversions: number
          created_at: string
          cta_clicks: number
          date: string
          id: string
          is_mock: boolean
          meta_campaign_id: string | null
          operation_id: string
          pitch_pct: number
          plays: number
          project: string
          retention_100: number
          retention_25: number
          retention_50: number
          retention_75: number
          retention_avg: number
          retention_curve: Json
          synced_at: string
          unique_views: number
          utm_campaign: string
          views: number
          vsl_id: string
          vsl_name: string
        }
        Insert: {
          conversion_rate?: number
          conversions?: number
          created_at?: string
          cta_clicks?: number
          date: string
          id?: string
          is_mock?: boolean
          meta_campaign_id?: string | null
          operation_id: string
          pitch_pct?: number
          plays?: number
          project?: string
          retention_100?: number
          retention_25?: number
          retention_50?: number
          retention_75?: number
          retention_avg?: number
          retention_curve?: Json
          synced_at?: string
          unique_views?: number
          utm_campaign?: string
          views?: number
          vsl_id: string
          vsl_name?: string
        }
        Update: {
          conversion_rate?: number
          conversions?: number
          created_at?: string
          cta_clicks?: number
          date?: string
          id?: string
          is_mock?: boolean
          meta_campaign_id?: string | null
          operation_id?: string
          pitch_pct?: number
          plays?: number
          project?: string
          retention_100?: number
          retention_25?: number
          retention_50?: number
          retention_75?: number
          retention_avg?: number
          retention_curve?: Json
          synced_at?: string
          unique_views?: number
          utm_campaign?: string
          views?: number
          vsl_id?: string
          vsl_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_vturb_performance_daily_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vturb_performance_daily_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          created_at: string
          detail: Json | null
          endpoint_slug: string | null
          headers: Json | null
          id: string
          operation_id: string | null
          outcome: string
          platform: string
          reason: string | null
          status_code: number
        }
        Insert: {
          created_at?: string
          detail?: Json | null
          endpoint_slug?: string | null
          headers?: Json | null
          id?: string
          operation_id?: string | null
          outcome: string
          platform: string
          reason?: string | null
          status_code: number
        }
        Update: {
          created_at?: string
          detail?: Json | null
          endpoint_slug?: string | null
          headers?: Json | null
          id?: string
          operation_id?: string | null
          outcome?: string
          platform?: string
          reason?: string | null
          status_code?: number
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string
          currency: string | null
          customer_email: string | null
          customer_name: string | null
          error_message: string | null
          external_order_id: string | null
          id: string
          operation_id: string
          payload: Json
          payload_hash: string
          payment_status: string | null
          product_name: string | null
          raw_body: string | null
          received_at: string
          response: Json
          source: string
          source_created_at: string | null
          status: string
          value_cents: number | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          error_message?: string | null
          external_order_id?: string | null
          id?: string
          operation_id: string
          payload?: Json
          payload_hash: string
          payment_status?: string | null
          product_name?: string | null
          raw_body?: string | null
          received_at?: string
          response?: Json
          source: string
          source_created_at?: string | null
          status?: string
          value_cents?: number | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          error_message?: string | null
          external_order_id?: string | null
          id?: string
          operation_id?: string
          payload?: Json
          payload_hash?: string
          payment_status?: string | null
          product_name?: string | null
          raw_body?: string | null
          received_at?: string
          response?: Json
          source?: string
          source_created_at?: string | null
          status?: string
          value_cents?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      campaign_aggregated: {
        Row: {
          avg_ticket: number | null
          cac: number | null
          campaign_name: string | null
          conversion_rate: number | null
          date: string | null
          roas: number | null
          total_3s_views: number | null
          total_clicks: number | null
          total_impressions: number | null
          total_revenue: number | null
          total_sales: number | null
          total_spend: number | null
        }
        Relationships: []
      }
      cod_daily_pnl_by_origin: {
        Row: {
          commission_total: number | null
          day_status: string | null
          delivery_rate: number | null
          invest_total: number | null
          operation_id: string | null
          order_date: string | null
          order_value_total: number | null
          orders_canceled: number | null
          orders_delivered: number | null
          orders_expired: number | null
          orders_generated: number | null
          orders_refused: number | null
          profit_of_day: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cod_orders_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_aggregated: {
        Row: {
          ad_name: string | null
          cac: number | null
          campaign_name: string | null
          cpc: number | null
          cpm: number | null
          ctr: number | null
          hold_rate: number | null
          hook_rate: number | null
          roas: number | null
          total_100_pct: number | null
          total_25_pct: number | null
          total_3s_views: number | null
          total_50_pct: number | null
          total_75_pct: number | null
          total_clicks: number | null
          total_impressions: number | null
          total_revenue: number | null
          total_sales: number | null
          total_spend: number | null
        }
        Relationships: []
      }
      live_viewers_active: {
        Row: {
          desktop_count: number | null
          mobile_count: number | null
          operation_id: string | null
          player_id: string | null
          player_name: string | null
          tablet_count: number | null
          viewers_at_cta: number | null
          viewers_at_pitch: number | null
          viewers_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_live_viewers_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      live_viewers_geo: {
        Row: {
          country: string | null
          operation_id: string | null
          pct: number | null
          player_id: string | null
          state: string | null
          viewers_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_live_viewers_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_account_financials_consolidated: {
        Row: {
          accounts_count: number | null
          currency: string | null
          last_updated: string | null
          operation_id: string | null
          total_account_balance: number | null
          total_amount_spent: number | null
          total_remaining_cap: number | null
          total_spend_cap: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_meta_account_financials_operation"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_account_financials_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_creatives_performance: {
        Row: {
          account_ids: string[] | null
          ad_code: string | null
          cac: number | null
          clicks: number | null
          ctr_link: number | null
          ic_count: number | null
          impressions: number | null
          link_clicks: number | null
          operation_id: string | null
          purchase_count: number | null
          revenue_brl: number | null
          roas: number | null
          spend_brl: number | null
        }
        Relationships: [
          {
            foreignKeyName: "traffic_data_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_traffic_spend_by_account: {
        Row: {
          account_id: string | null
          date: string | null
          total_clicks: number | null
          total_impressions: number | null
          total_spend: number | null
        }
        Relationships: []
      }
      structure_aggregated: {
        Row: {
          active_campaigns: number | null
          campaign_count: number | null
          paused_campaigns: number | null
          roas: number | null
          structure_type: string | null
          total_revenue: number | null
          total_spend: number | null
        }
        Relationships: []
      }
      v_expiring_credentials: {
        Row: {
          expires_at: string | null
          id: string | null
          last_verified_at: string | null
          operation_id: string | null
          operation_name: string | null
          operation_slug: string | null
          profile_key: string | null
          provider: string | null
          status: string | null
          time_until_expiry: string | null
          urgency: string | null
          vault_secret_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operation_credentials_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_offers_active: {
        Row: {
          apelido_interno: string | null
          comissao_pct: number | null
          cpa_target_brl: number | null
          created_at: string | null
          created_by: string | null
          data_inicio: string | null
          data_morte: string | null
          dias_rodando: number | null
          geo: Database["public"]["Enums"]["offer_geo"] | null
          id: string | null
          landing_pages: string[] | null
          lifetime_dias: number | null
          link_checkout: string | null
          margem_pct: number | null
          motivo_morte: string | null
          nicho: Database["public"]["Enums"]["offer_nicho"] | null
          nickname_afiliado: string | null
          notas: string | null
          pixel_id: string | null
          produto_real: string | null
          status: Database["public"]["Enums"]["offer_status"] | null
          tags: string[] | null
          ticket_front_brl: number | null
          ticket_front_usd: number | null
          tipo: Database["public"]["Enums"]["offer_tipo"] | null
          updated_at: string | null
          updated_by: string | null
          vendor: Database["public"]["Enums"]["offer_vendor"] | null
          vendor_id: string | null
          vsl_player: string | null
          vsl_url: string | null
        }
        Insert: {
          apelido_interno?: string | null
          comissao_pct?: number | null
          cpa_target_brl?: number | null
          created_at?: string | null
          created_by?: string | null
          data_inicio?: string | null
          data_morte?: string | null
          dias_rodando?: never
          geo?: Database["public"]["Enums"]["offer_geo"] | null
          id?: string | null
          landing_pages?: string[] | null
          lifetime_dias?: never
          link_checkout?: string | null
          margem_pct?: number | null
          motivo_morte?: string | null
          nicho?: Database["public"]["Enums"]["offer_nicho"] | null
          nickname_afiliado?: string | null
          notas?: string | null
          pixel_id?: string | null
          produto_real?: string | null
          status?: Database["public"]["Enums"]["offer_status"] | null
          tags?: string[] | null
          ticket_front_brl?: number | null
          ticket_front_usd?: number | null
          tipo?: Database["public"]["Enums"]["offer_tipo"] | null
          updated_at?: string | null
          updated_by?: string | null
          vendor?: Database["public"]["Enums"]["offer_vendor"] | null
          vendor_id?: string | null
          vsl_player?: string | null
          vsl_url?: string | null
        }
        Update: {
          apelido_interno?: string | null
          comissao_pct?: number | null
          cpa_target_brl?: number | null
          created_at?: string | null
          created_by?: string | null
          data_inicio?: string | null
          data_morte?: string | null
          dias_rodando?: never
          geo?: Database["public"]["Enums"]["offer_geo"] | null
          id?: string | null
          landing_pages?: string[] | null
          lifetime_dias?: never
          link_checkout?: string | null
          margem_pct?: number | null
          motivo_morte?: string | null
          nicho?: Database["public"]["Enums"]["offer_nicho"] | null
          nickname_afiliado?: string | null
          notas?: string | null
          pixel_id?: string | null
          produto_real?: string | null
          status?: Database["public"]["Enums"]["offer_status"] | null
          tags?: string[] | null
          ticket_front_brl?: number | null
          ticket_front_usd?: number | null
          tipo?: Database["public"]["Enums"]["offer_tipo"] | null
          updated_at?: string | null
          updated_by?: string | null
          vendor?: Database["public"]["Enums"]["offer_vendor"] | null
          vendor_id?: string | null
          vsl_player?: string | null
          vsl_url?: string | null
        }
        Relationships: []
      }
      vsl_aggregated: {
        Row: {
          avg_retention: number | null
          avg_watch_time: number | null
          button_ctr: number | null
          total_button_clicks: number | null
          total_checkout_clicks: number | null
          total_unique_views: number | null
          total_views: number | null
          video_id: string | null
          video_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _count_null_operation: { Args: { p_table: string }; Returns: number }
      _count_rows: { Args: { p_table: string }; Returns: number }
      _current_op: { Args: never; Returns: string }
      _enable_cross_op: { Args: { p_reason: string }; Returns: undefined }
      _flag_on: { Args: { p_key: string; p_op?: string }; Returns: boolean }
      _is_cross_op_intent: { Args: never; Returns: boolean }
      _op_scope_check: { Args: { row_op: string }; Returns: boolean }
      account_currency: { Args: { _account_id: string }; Returns: string }
      admin_copy_push_prefs: {
        Args: { p_from: string; p_operation_id: string; p_to: string }
        Returns: number
      }
      admin_da_op: { Args: { _op_id: string }; Returns: boolean }
      admin_list_cron_jobs: {
        Args: never
        Returns: {
          active: boolean
          jobname: string
          schedule: string
        }[]
      }
      admin_list_cron_runs: {
        Args: never
        Returns: {
          jobname: string
          return_message: string
          start_time: string
          status: string
        }[]
      }
      admin_list_push_users: {
        Args: { p_operation_id: string }
        Returns: {
          device_count: number
          display_name: string
          email: string
          last_used_at: string
          member_role: string
          recipient_count: number
          user_id: string
        }[]
      }
      audit_tool_bypass: { Args: never; Returns: boolean }
      cleanup_pacing_campaign_hourly_snapshots: {
        Args: never
        Returns: undefined
      }
      cleanup_pacing_evaluation_log: { Args: never; Returns: undefined }
      cleanup_stale_live_viewers: { Args: never; Returns: undefined }
      cross_op_intent: { Args: never; Returns: boolean }
      dashboard_consolidated: {
        Args: {
          p_currency?: string
          p_end?: string
          p_include_suspended?: boolean
          p_range?: string
          p_start?: string
        }
        Returns: Json
      }
      exec_sql: { Args: { query: string }; Returns: Json }
      f9_policy_test: { Args: { p_scenarios: Json }; Returns: Json }
      fx_rate_for: {
        Args: { _currency: string; _date: string }
        Returns: number
      }
      fx_to_brl: {
        Args: { _amount: number; _currency: string; _date: string }
        Returns: number
      }
      get_ad_performance_metrics: {
        Args: { p_ad_id?: string; p_days: number }
        Returns: {
          ad_id: string
          ad_name: string
          ic: number
          purchase: number
          revenue: number
          spend: number
        }[]
      }
      get_campaign_performance_metrics: {
        Args: { p_campaign_id?: string; p_days: number }
        Returns: {
          campaign_id: string
          campaign_name: string
          ic: number
          purchase: number
          revenue: number
          roas: number
          spend: number
        }[]
      }
      get_cb_creative_sales: {
        Args: {
          p_end_date: string
          p_operation_id?: string
          p_start_date: string
        }
        Returns: {
          campaign_name: string
          receipt: string
          revenue_brl: number
        }[]
      }
      get_cb_creative_sales_daily: {
        Args: {
          p_end_date: string
          p_operation_id?: string
          p_start_date: string
        }
        Returns: {
          campaign_name: string
          date: string
          receipt: string
          revenue_brl: number
        }[]
      }
      get_cod_daily_pnl: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          arpu: number
          connect_rate: number
          invest_total: number
          meta_clicks: number
          meta_cpa: number
          meta_ic: number
          meta_impressions: number
          net_profit: number
          operation_id: string
          order_date: string
          orders_generated: number
          revenue_total: number
          roi: number
        }[]
      }
      get_cod_daily_pnl_v10: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_display_currency?: string
          p_operation_id: string
        }
        Returns: {
          commission_avg_approved: number
          commission_generated: number
          orders_approved: number
          orders_cancelled: number
          orders_expired: number
          orders_generated: number
          orders_paid: number
          orders_pending: number
          pending_commission_total: number
          res_date: string
          revenue_approved: number
          revenue_generated: number
          revenue_total: number
          ticket_avg_approved: number
        }[]
      }
      get_cod_daily_pnl_v11: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_display_currency?: string
          p_operation_id: string
        }
        Returns: {
          commission_avg_approved: number
          commission_generated: number
          orders_approved: number
          orders_cancelled: number
          orders_expired: number
          orders_generated: number
          orders_paid: number
          orders_pending: number
          pending_commission_total: number
          res_date: string
          revenue_approved: number
          revenue_generated: number
          revenue_total: number
          ticket_avg_approved: number
        }[]
      }
      get_cod_daily_pnl_v12: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_display_currency?: string
          p_operation_id: string
        }
        Returns: {
          avg_comm_7d_brl: number
          commission_avg_approved: number
          commission_generated: number
          orders_approved: number
          orders_cancelled: number
          orders_expired: number
          orders_generated: number
          orders_paid: number
          orders_pending: number
          pending_commission_total: number
          res_date: string
          revenue_approved: number
          revenue_generated: number
          revenue_total: number
          ticket_avg_approved: number
        }[]
      }
      get_cod_daily_pnl_v13:
        | {
            Args: {
              p_date_from: string
              p_date_to: string
              p_operation_id: string
            }
            Returns: {
              avg_comm_7d_brl: number
              commission_avg_approved: number
              commission_generated: number
              invest_total_brl: number
              orders_approved: number
              orders_canceled: number
              orders_expired: number
              orders_generated: number
              orders_paid: number
              orders_pending: number
              pending_commission_total: number
              res_date: string
              revenue_approved: number
              revenue_generated: number
              revenue_total: number
              ticket_avg_approved: number
            }[]
          }
        | {
            Args: {
              p_date_from: string
              p_date_to: string
              p_display_currency?: string
              p_operation_id: string
            }
            Returns: {
              avg_comm_7d_brl: number
              commission_avg_approved: number
              commission_generated: number
              invest_total_brl: number
              orders_approved: number
              orders_cancelled: number
              orders_expired: number
              orders_generated: number
              orders_paid: number
              orders_pending: number
              pending_commission_total: number
              res_date: string
              revenue_approved: number
              revenue_generated: number
              revenue_total: number
              ticket_avg_approved: number
            }[]
          }
      get_cod_daily_pnl_v2: {
        Args: { p_date_from: string; p_date_to: string; p_operation_id: string }
        Returns: {
          invest_total: number
          net_profit: number
          orders_delivered: number
          orders_generated: number
          res_date: string
          res_operation_id: string
          revenue_total: number
          roi: number
        }[]
      }
      get_cod_daily_pnl_v3: {
        Args: { p_date_from: string; p_date_to: string; p_operation_id: string }
        Returns: {
          commission_generated: number
          orders_approved: number
          orders_delivered: number
          orders_expired: number
          orders_generated: number
          res_date: string
          revenue_approved: number
          revenue_delivered: number
          revenue_generated: number
          revenue_total: number
        }[]
      }
      get_cod_daily_pnl_v4: {
        Args: { p_date_from: string; p_date_to: string; p_operation_id: string }
        Returns: {
          commission_generated: number
          orders_delivered: number
          orders_generated: number
          orders_paid: number
          res_date: string
          revenue_delivered: number
          revenue_generated: number
          revenue_total: number
        }[]
      }
      get_cod_daily_pnl_v5: {
        Args: { p_date_from: string; p_date_to: string; p_operation_id: string }
        Returns: {
          commission_generated: number
          commission_paid: number
          orders_approved: number
          orders_expired: number
          orders_generated: number
          orders_paid: number
          orders_pending: number
          res_date: string
          revenue_approved: number
          revenue_generated: number
          revenue_total: number
        }[]
      }
      get_cod_daily_pnl_v6:
        | {
            Args: {
              p_date_from: string
              p_date_to: string
              p_operation_id: string
            }
            Returns: {
              commission_approved: number
              commission_generated: number
              orders_approved: number
              orders_expired: number
              orders_generated: number
              orders_paid: number
              res_date: string
              revenue_approved: number
              revenue_generated: number
              revenue_total: number
            }[]
          }
        | {
            Args: {
              p_date_from: string
              p_date_to: string
              p_display_currency?: string
              p_operation_id: string
            }
            Returns: {
              commission_generated: number
              orders_approved: number
              orders_expired: number
              orders_generated: number
              orders_paid: number
              res_date: string
              revenue_approved: number
              revenue_generated: number
              revenue_total: number
            }[]
          }
      get_cod_daily_pnl_v7: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_display_currency?: string
          p_operation_id: string
        }
        Returns: {
          commission_avg_approved: number
          commission_generated: number
          orders_approved: number
          orders_expired: number
          orders_generated: number
          orders_paid: number
          orders_pending: number
          res_date: string
          revenue_approved: number
          revenue_generated: number
          revenue_total: number
          ticket_avg_approved: number
        }[]
      }
      get_cod_daily_pnl_v8: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_display_currency?: string
          p_operation_id: string
        }
        Returns: {
          commission_avg_approved: number
          commission_generated: number
          orders_approved: number
          orders_expired: number
          orders_generated: number
          orders_paid: number
          orders_pending: number
          res_date: string
          revenue_approved: number
          revenue_generated: number
          revenue_total: number
          ticket_avg_approved: number
        }[]
      }
      get_cod_daily_pnl_v9: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_display_currency?: string
          p_operation_id: string
        }
        Returns: {
          commission_avg_approved: number
          commission_generated: number
          orders_approved: number
          orders_cancelled: number
          orders_expired: number
          orders_generated: number
          orders_paid: number
          orders_pending: number
          pending_commission_total: number
          res_date: string
          revenue_approved: number
          revenue_generated: number
          revenue_total: number
          ticket_avg_approved: number
        }[]
      }
      get_cod_historical_approval_rate: {
        Args: { _operation_id: string }
        Returns: number
      }
      get_cod_historical_approval_rate_v2: {
        Args: { _operation_id: string }
        Returns: number
      }
      get_commission_calc: {
        Args: { p_end: string; p_operation_id: string; p_start: string }
        Returns: Json
      }
      get_country_performance: {
        Args: {
          p_end_date: string
          p_min_spend?: number
          p_operation_id: string
          p_start_date: string
        }
        Returns: {
          connect_rate: number
          country_code: string
          cpa: number
          cpc: number
          real_revenue: number
          real_roas: number
          roas: number
          total_clicks: number
          total_ics: number
          total_impressions: number
          total_link_clicks: number
          total_lp_views: number
          total_purchases: number
          total_revenue: number
          total_spend: number
        }[]
      }
      get_creative_traffic_aggregated: {
        Args: {
          p_end_date: string
          p_operation_id?: string
          p_start_date: string
        }
        Returns: {
          account_id: string
          ad_name: string
          campaign_name: string
          status: string
          total_clicks: number
          total_impressions: number
          total_inline_link_clicks: number
          total_spend: number
          total_thruplays: number
          total_video_100_percent: number
          total_video_25_percent: number
          total_video_3s_views: number
          total_video_50_percent: number
          total_video_75_percent: number
        }[]
      }
      get_creative_traffic_normalized_sp: {
        Args: {
          p_end_date: string
          p_operation_id?: string
          p_start_date: string
        }
        Returns: {
          account_id: string
          ad_id: string
          ad_name: string
          campaign_name: string
          status: string
          total_clicks: number
          total_impressions: number
          total_initiate_checkout: number
          total_inline_link_clicks: number
          total_spend: number
          total_thruplays: number
          total_video_100_percent: number
          total_video_25_percent: number
          total_video_3s_views: number
          total_video_50_percent: number
          total_video_75_percent: number
        }[]
      }
      get_cron_job_history: {
        Args: { p_job_name: string; p_limit?: number }
        Returns: {
          end_time: string
          jobid: number
          return_message: string
          runid: number
          start_time: string
          status: string
        }[]
      }
      get_fx_health: {
        Args: never
        Returns: {
          currency_from: string
          hours_stale: number
          is_stale: boolean
          last_rate_date: string
          rate_avg: number
        }[]
      }
      get_hourly_sales_by_account: {
        Args: {
          p_end_date: string
          p_operation_id?: string
          p_start_date: string
        }
        Returns: {
          account_id: string
          hour: number
          total_revenue: number
        }[]
      }
      get_leaderboard_cb_sales:
        | {
            Args: { p_end_date: string; p_start_date: string }
            Returns: {
              campaign_name: string
              receipt: string
              revenue_brl: number
            }[]
          }
        | {
            Args: {
              p_end_date: string
              p_operation_id?: string
              p_start_date: string
            }
            Returns: {
              campaign_name: string
              receipt: string
              revenue_brl: number
            }[]
          }
      get_leaderboard_redtrack:
        | {
            Args: { p_end_date: string; p_start_date: string }
            Returns: {
              event_type: string
              sale_count: number
              total_revenue: number
              utm_campaign: string
            }[]
          }
        | {
            Args: {
              p_end_date: string
              p_operation_id?: string
              p_start_date: string
            }
            Returns: {
              event_type: string
              sale_count: number
              total_revenue: number
              utm_campaign: string
            }[]
          }
      get_leaderboard_sales:
        | {
            Args: { p_end_date: string; p_start_date: string }
            Returns: {
              sale_count: number
              total_revenue: number
              utm_campaign: string
            }[]
          }
        | {
            Args: {
              p_end_date: string
              p_operation_id?: string
              p_start_date: string
            }
            Returns: {
              sale_count: number
              total_revenue: number
              utm_campaign: string
            }[]
          }
      get_leaderboard_sales_v2: {
        Args: { p_date_from: string; p_date_to: string; p_operation_id: string }
        Returns: {
          res_product_name: string
          res_revenue: number
          res_sales_count: number
        }[]
      }
      get_leaderboard_traffic:
        | {
            Args: { p_end_date: string; p_start_date: string }
            Returns: {
              account_id: string
              ad_name: string
              campaign_name: string
              total_clicks: number
              total_impressions: number
              total_spend: number
            }[]
          }
        | {
            Args: {
              p_end_date: string
              p_operation_id?: string
              p_start_date: string
            }
            Returns: {
              account_id: string
              ad_name: string
              campaign_name: string
              total_clicks: number
              total_impressions: number
              total_spend: number
            }[]
          }
      get_leaderboard_traffic_v2: {
        Args: { p_date_from: string; p_date_to: string; p_operation_id: string }
        Returns: {
          res_campaign_name: string
          res_clicks: number
          res_spend: number
        }[]
      }
      get_live_pacing_campaigns: {
        Args: { p_operation_id?: string }
        Returns: {
          account: string
          account_id: string
          clicks: number
          cpa: number
          cpc: number
          ctr: number
          daily_budget: number
          effective_status: string
          id: string
          impressions: number
          name: string
          operation_id: string
          revenue: number
          roas: number
          sales: number
          spend: number
          status: string
          today_label: string
          yesterday_spend: number
        }[]
      }
      get_live_viewers_heatmap: {
        Args: {
          p_ad_id?: string
          p_operation_id?: string
          p_operation_ids?: string[]
          p_player_id?: string
          p_product?: string
          p_since: string
        }
        Returns: {
          dow: number
          hour: number
          samples: number
          viewers: number
        }[]
      }
      get_meta_balances_consolidated: { Args: never; Returns: Json }
      get_meta_spend_brl_daily: {
        Args: {
          p_end_date: string
          p_operation_id?: string
          p_start_date: string
        }
        Returns: number
      }
      get_offer_traffic_daily: {
        Args: { p_offer_id: string; p_operation_id?: string }
        Returns: {
          date: string
          spend_brl: number
        }[]
      }
      get_offer_vsl_metrics: {
        Args: {
          p_apelido: string
          p_end_date: string
          p_operation_id?: string
          p_start_date: string
        }
        Returns: {
          avg_retention: number
          button_clicks: number
          checkout_clicks: number
          conversion_rate: number
          revenue: number
          total_views: number
          unique_views: number
          vsl_count_period: number
          vsl_count_total: number
        }[]
      }
      get_offers_kpi_metrics: {
        Args: { p_operation_id?: string }
        Returns: {
          apelido_interno: string
          conversion_pct: number
          cpc_brl: number
          cpi_brl: number
          cpm_brl: number
          ctr_pct: number
          ic_count: number
          impressions: number
          link_clicks: number
          offer_id: string
          pitch_retention_pct: number
          sales_count: number
          spend_brl: number
        }[]
      }
      get_offers_kpi_metrics_range: {
        Args: {
          p_end_date: string
          p_operation_id?: string
          p_start_date: string
        }
        Returns: {
          apelido_interno: string
          conversion_pct: number
          cpc_brl: number
          cpi_brl: number
          cpm_brl: number
          ctr_pct: number
          ic_count: number
          impressions: number
          link_clicks: number
          offer_id: string
          pitch_retention_pct: number
          sales_count: number
          spend_brl: number
        }[]
      }
      get_offers_revenue_range: {
        Args: {
          p_end_date: string
          p_operation_id?: string
          p_start_date: string
        }
        Returns: {
          apelido_interno: string
          offer_id: string
          revenue_brl: number
          sales: number
        }[]
      }
      get_offers_revenue_stats: {
        Args: { p_operation_id?: string }
        Returns: {
          apelido_interno: string
          offer_id: string
          revenue_30d_brl: number
          revenue_7d_brl: number
          revenue_today_brl: number
          sales_30d: number
          sales_7d: number
          sales_today: number
        }[]
      }
      get_offers_sales_intelligence: {
        Args: {
          p_end_date: string
          p_operation_id?: string
          p_start_date: string
        }
        Returns: {
          apelido_interno: string
          geo: string
          nicho: string
          offer_id: string
          produto_real: string
          revenue_brl: number
          sales_count: number
        }[]
      }
      get_offers_today_revenue: {
        Args: { p_operation_id?: string }
        Returns: {
          apelido_interno: string
          offer_id: string
          revenue_today_brl: number
          sales_today: number
        }[]
      }
      get_offers_today_traffic: {
        Args: { p_operation_id?: string }
        Returns: {
          accounts_count: number
          active_campaigns_count: number
          apelido_interno: string
          offer_id: string
          spend_today_brl: number
        }[]
      }
      get_offers_traffic_stats: {
        Args: { p_operation_id?: string }
        Returns: {
          accounts_count: number
          active_campaigns_count: number
          apelido_interno: string
          last_spend_date: string
          offer_id: string
          spend_30d_brl: number
          spend_7d_brl: number
          spend_today_brl: number
        }[]
      }
      get_offers_vsl_counts: {
        Args: { p_operation_id?: string }
        Returns: {
          apelido_interno: string
          offer_id: string
          vsl_count: number
        }[]
      }
      get_operation_credential: {
        Args: {
          p_operation_id: string
          p_profile_key?: string
          p_provider: string
        }
        Returns: string
      }
      get_operation_credentials: {
        Args: { p_audit_tool_bypass?: boolean; p_operation_id: string }
        Returns: {
          account_ids: string[]
          created_at: string
          expires_at: string | null
          id: string
          last_verification_error: string | null
          last_verified_at: string | null
          metadata: Json
          operation_id: string
          profile_key: string
          provider: string
          rotated_at: string | null
          status: string
          updated_at: string
          vault_secret_id: string | null
          vault_secret_name: string
        }[]
        SetofOptions: {
          from: "*"
          to: "operation_credentials"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_orphan_campaign_tags_today: {
        Args: { p_operation_id?: string }
        Returns: {
          campaigns_count: number
          spend_brl: number
          tag: string
        }[]
      }
      get_pacing_campaigns_for_range:
        | {
            Args: { d_end: string; d_start: string }
            Returns: {
              account_id: string
              account_name: string
              campaign_id: string
              campaign_name: string
              clicks_today: number
              daily_budget: number
              effective_status: string
              impressions_today: number
              revenue_today: number
              revenue_yesterday: number
              sales_today: number
              sales_yesterday: number
              spend_today: number
              spend_yesterday: number
              status: string
            }[]
          }
        | {
            Args: { d_end: string; d_start: string; p_operation_id?: string }
            Returns: {
              account_id: string
              account_name: string
              campaign_id: string
              campaign_name: string
              clicks_today: number
              daily_budget: number
              effective_status: string
              impressions_today: number
              revenue_today: number
              revenue_yesterday: number
              sales_today: number
              sales_yesterday: number
              spend_today: number
              spend_yesterday: number
              status: string
            }[]
          }
      get_pacing_sales_match_stats: {
        Args: { p_operation_id?: string }
        Returns: {
          matched_by_name: number
          matched_by_rt: number
          matched_sales: number
          total_sales: number
          unmatched_revenue: number
          unmatched_sales: number
        }[]
      }
      get_payoneer_summary: { Args: { p_days?: number }; Returns: Json }
      get_spend_brl_consistency: {
        Args: never
        Returns: {
          bug_rows: number
          date: string
          diff_pct: number
          operation_id: string
          operation_name: string
          status: string
          sum_expected_brl: number
          sum_spend_brl: number
          suspect_rows: number
          table_name: string
          total_rows: number
        }[]
      }
      get_spend_normalized_sp: {
        Args: {
          p_end_date: string
          p_operation_id?: string
          p_start_date: string
        }
        Returns: {
          clicks: number
          impressions: number
          initiated_checkouts: number
          landing_page_views: number
          sp_date: string
          total_spend: number
          vsl_plays: number
        }[]
      }
      get_spend_normalized_sp_v2: {
        Args: { p_date_from: string; p_date_to: string; p_operation_id: string }
        Returns: {
          res_date: string
          spend_total: number
        }[]
      }
      get_suspicious_access_denied: {
        Args: { _days?: number; _min_attempts?: number }
        Returns: {
          attempted_routes: string[]
          attempts: number
          last_attempt: string
          user_id: string
        }[]
      }
      get_total_link_clicks: {
        Args: {
          p_end_date: string
          p_operation_id?: string
          p_start_date: string
        }
        Returns: {
          total_link_clicks: number
        }[]
      }
      get_total_traffic_metrics: {
        Args: {
          p_campaign_keyword?: string
          p_end_date: string
          p_operation_id?: string
          p_start_date: string
          p_strict_keyword?: boolean
        }
        Returns: {
          total_clicks: number
          total_ic: number
          total_impressions: number
          total_landing_page_views: number
          total_link_clicks: number
          total_purchase: number
          total_revenue: number
          total_spend: number
          total_vsl_plays: number
        }[]
      }
      get_total_traffic_metrics_v2: {
        Args: { p_date_from: string; p_date_to: string; p_operation_id: string }
        Returns: {
          res_clicks: number
          res_impressions: number
          res_spend: number
        }[]
      }
      get_traffic_aggregated: {
        Args: {
          p_end_date: string
          p_operation_id?: string
          p_start_date: string
        }
        Returns: {
          account_id: string
          ad_name: string
          adset_name: string
          avg_cpc: number
          avg_cpm: number
          avg_ctr: number
          campaign_name: string
          date: string
          status: string
          total_clicks: number
          total_impressions: number
          total_initiate_checkout: number
          total_inline_link_clicks: number
          total_spend: number
          total_thruplays: number
          total_video_100_percent: number
          total_video_25_percent: number
          total_video_3s_views: number
          total_video_50_percent: number
          total_video_75_percent: number
        }[]
      }
      get_traffic_by_campaign:
        | {
            Args: { p_end_date: string; p_start_date: string }
            Returns: {
              campaign_name: string
              date: string
              total_clicks: number
              total_impressions: number
              total_spend: number
              total_video_3s_views: number
            }[]
          }
        | {
            Args: {
              p_end_date: string
              p_operation_id?: string
              p_start_date: string
            }
            Returns: {
              campaign_name: string
              date: string
              total_clicks: number
              total_impressions: number
              total_spend: number
              total_video_3s_views: number
            }[]
          }
      get_traffic_by_campaign_day: {
        Args: {
          p_end_date: string
          p_operation_id?: string
          p_start_date: string
        }
        Returns: {
          campaign_name: string
          clicks: number
          date: string
          impressions: number
          spend: number
        }[]
      }
      get_traffic_clicks_total: {
        Args: {
          p_end_date: string
          p_operation_id?: string
          p_start_date: string
        }
        Returns: {
          total_clicks: number
          total_impressions: number
        }[]
      }
      get_traffic_spend_by_account:
        | {
            Args: { p_end_date: string; p_start_date: string }
            Returns: {
              account_id: string
              date: string
              total_spend: number
            }[]
          }
        | {
            Args: {
              p_end_date: string
              p_operation_id?: string
              p_start_date: string
            }
            Returns: {
              account_id: string
              date: string
              total_spend: number
            }[]
          }
      get_traffic_spend_by_account_fast: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          account_id: string
          date: string
          total_clicks: number
          total_impressions: number
          total_spend: number
        }[]
      }
      get_traffic_spend_by_account_normalized: {
        Args: {
          p_end_date: string
          p_operation_id?: string
          p_start_date: string
        }
        Returns: {
          account_id: string
          date: string
          total_spend: number
          used_fallback: boolean
        }[]
      }
      get_traffic_spend_by_account_v2: {
        Args: { p_date_from: string; p_date_to: string; p_operation_id: string }
        Returns: {
          res_account_id: string
          res_spend: number
        }[]
      }
      get_traffic_spend_total:
        | {
            Args: { p_end_date: string; p_start_date: string }
            Returns: {
              total_spend: number
            }[]
          }
        | {
            Args: {
              p_end_date: string
              p_operation_id?: string
              p_start_date: string
            }
            Returns: {
              total_spend: number
            }[]
          }
      get_treasury_overview: { Args: never; Returns: Json }
      get_unique_buyers: {
        Args: { p_end: string; p_operation_id: string; p_start: string }
        Returns: {
          arpu_brl: number
          total_revenue_brl: number
          total_transactions: number
          unique_buyers: number
        }[]
      }
      get_vsl_advanced_metrics: {
        Args: {
          p_end_date: string
          p_operation_id?: string
          p_start_date: string
        }
        Returns: {
          bench_conversion_pct: number
          bench_cpi_brl: number
          bench_pitch_pct: number
          hook_rate_pct: number
          impressions_total: number
          offer_apelido: string
          offer_id: string
          offer_nicho: string
          pitch_pct_weighted: number
          play_rate_pct: number
          plays_total: number
          unique_views_total: number
          video_3s_total: number
          views_total: number
          vsl_id: string
        }[]
      }
      get_vsl_retention_7d: {
        Args: { p_operation_id?: string }
        Returns: {
          date: string
          plays: number
          retention_pct: number
          vsl_id: string
        }[]
      }
      get_vsl_spend_breakdown: {
        Args: {
          p_end_date: string
          p_operation_id?: string
          p_start_date: string
        }
        Returns: {
          spend_brl: number
          vsl_id: string
        }[]
      }
      get_vsl_top_creatives: {
        Args: {
          p_end_date: string
          p_limit?: number
          p_operation_id?: string
          p_start_date: string
          p_vsl_id: string
        }
        Returns: {
          ad_name: string
          attributed_spend_brl: number
          campaign_name: string
          impressions: number
          link_clicks: number
          share_pct: number
          total_spend_brl: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      live_user_in_operation: { Args: { _op: string }; Returns: boolean }
      log_spend_brl_correction: {
        Args: {
          _account_id: string
          _date: string
          _fx: number
          _new_brl: number
          _old_brl: number
          _operation_id: string
          _spend: number
          _table: string
        }
        Returns: undefined
      }
      mcp_token_has_operation_access: {
        Args: { _operation_id: string; _token_id: string }
        Returns: boolean
      }
      normalize_campaign_key: { Args: { p: string }; Returns: string }
      refresh_aggregated_views: { Args: never; Returns: undefined }
      refresh_daily_snapshot: {
        Args: { p_date: string; p_operation_id: string }
        Returns: undefined
      }
      refresh_mv_traffic_spend: { Args: never; Returns: undefined }
      require_op_access: {
        Args: { p_operation_id: string }
        Returns: undefined
      }
      require_op_access_array: {
        Args: { p_operation_ids: string[] }
        Returns: undefined
      }
      reset_pacing_fire_count_daily: { Args: never; Returns: undefined }
      resolve_meta_credential_by_account: {
        Args: { p_account_id: string; p_operation_id: string }
        Returns: {
          credential_id: string
          profile_key: string
        }[]
      }
      resolve_pacing_sales_attribution: {
        Args: { p_date: string; p_operation_id?: string }
        Returns: {
          campaign_id: string
          matched_via: string
          revenue: number
          sales: number
        }[]
      }
      spy_offer_in_my_operation: {
        Args: { _offer_id: string }
        Returns: boolean
      }
      strict_op_scope: { Args: { _op_id: string }; Returns: boolean }
      vault_create_secret_wrapper: {
        Args: {
          secret_description?: string
          secret_name: string
          secret_value: string
        }
        Returns: string
      }
      vault_update_secret_wrapper: {
        Args: {
          p_new_description?: string
          p_new_value: string
          p_secret_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "gestor_trafego" | "visualizador" | "editor"
      offer_geo:
        | "BR"
        | "US"
        | "UK"
        | "DE"
        | "FR"
        | "ES"
        | "IT"
        | "CA"
        | "AU"
        | "HU"
        | "PL"
        | "RO"
        | "NL"
        | "PT"
        | "MX"
        | "SK"
        | "CZ"
        | "AT"
        | "CH"
        | "BE"
        | "IE"
        | "SE"
        | "NO"
        | "DK"
        | "FI"
        | "GR"
        | "BG"
        | "HR"
        | "SI"
        | "LT"
        | "LV"
        | "EE"
        | "LU"
        | "AR"
        | "CL"
        | "CO"
        | "PE"
        | "UY"
        | "EC"
        | "PY"
        | "BO"
        | "VE"
        | "CR"
        | "PA"
        | "DO"
        | "GT"
        | "NZ"
        | "ZA"
        | "IN"
        | "JP"
        | "KR"
        | "SG"
        | "MY"
        | "PH"
        | "TH"
        | "ID"
        | "VN"
        | "TR"
        | "IL"
        | "AE"
        | "SA"
      offer_nicho:
        | "brain_memory"
        | "blood_sugar_glp1"
        | "weight_loss"
        | "mens_health_ed"
        | "heart_bp"
        | "prostate"
        | "tinnitus"
        | "joint_pain"
        | "financial"
        | "outro"
        | "blood_sugar"
        | "glp1"
        | "vision"
        | "hearing"
        | "womens_health"
        | "skin_beauty"
        | "hair_loss"
        | "dental"
        | "sleep"
        | "energy"
        | "immunity"
        | "digestive"
        | "kidney_liver"
        | "anti_aging"
        | "muscle"
        | "detox"
        | "thyroid"
        | "spiritual"
        | "survival"
        | "pet"
      offer_status: "ativa" | "em_teste" | "pausada" | "morta" | "arquivada"
      offer_tipo: "propria" | "afiliacao" | "spy_capturada"
      offer_vendor:
        | "clickbank"
        | "buygoods"
        | "cartpanda"
        | "hotmart"
        | "kiwify"
        | "monetizze"
        | "outro"
        | "cod_europa"
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
      app_role: ["admin", "gestor_trafego", "visualizador", "editor"],
      offer_geo: [
        "BR",
        "US",
        "UK",
        "DE",
        "FR",
        "ES",
        "IT",
        "CA",
        "AU",
        "HU",
        "PL",
        "RO",
        "NL",
        "PT",
        "MX",
        "SK",
        "CZ",
        "AT",
        "CH",
        "BE",
        "IE",
        "SE",
        "NO",
        "DK",
        "FI",
        "GR",
        "BG",
        "HR",
        "SI",
        "LT",
        "LV",
        "EE",
        "LU",
        "AR",
        "CL",
        "CO",
        "PE",
        "UY",
        "EC",
        "PY",
        "BO",
        "VE",
        "CR",
        "PA",
        "DO",
        "GT",
        "NZ",
        "ZA",
        "IN",
        "JP",
        "KR",
        "SG",
        "MY",
        "PH",
        "TH",
        "ID",
        "VN",
        "TR",
        "IL",
        "AE",
        "SA",
      ],
      offer_nicho: [
        "brain_memory",
        "blood_sugar_glp1",
        "weight_loss",
        "mens_health_ed",
        "heart_bp",
        "prostate",
        "tinnitus",
        "joint_pain",
        "financial",
        "outro",
        "blood_sugar",
        "glp1",
        "vision",
        "hearing",
        "womens_health",
        "skin_beauty",
        "hair_loss",
        "dental",
        "sleep",
        "energy",
        "immunity",
        "digestive",
        "kidney_liver",
        "anti_aging",
        "muscle",
        "detox",
        "thyroid",
        "spiritual",
        "survival",
        "pet",
      ],
      offer_status: ["ativa", "em_teste", "pausada", "morta", "arquivada"],
      offer_tipo: ["propria", "afiliacao", "spy_capturada"],
      offer_vendor: [
        "clickbank",
        "buygoods",
        "cartpanda",
        "hotmart",
        "kiwify",
        "monetizze",
        "outro",
        "cod_europa",
      ],
    },
  },
} as const
