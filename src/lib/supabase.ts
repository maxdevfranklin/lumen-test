import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          user_id: string
          name: string
          email: string
          phone: string
          location: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          email: string
          phone: string
          location: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          email?: string
          phone?: string
          location?: string
          created_at?: string
          updated_at?: string
        }
      }
      work_experiences: {
        Row: {
          id: string
          profile_id: string
          company: string
          position: string
          start_date: string
          end_date: string | null
          is_current: boolean
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          company: string
          position: string
          start_date: string
          end_date?: string | null
          is_current?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          company?: string
          position?: string
          start_date?: string
          end_date?: string | null
          is_current?: boolean
          created_at?: string
        }
      }
      educations: {
        Row: {
          id: string
          profile_id: string
          university: string
          degree: string
          start_date: string
          end_date: string
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          university: string
          degree: string
          start_date: string
          end_date: string
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          university?: string
          degree?: string
          start_date?: string
          end_date?: string
          created_at?: string
        }
      }
      user_settings: {
        Row: {
          id: string
          user_id: string
          openai_key: string | null
          anthropic_key: string | null
          preferred_ai: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          openai_key?: string | null
          anthropic_key?: string | null
          preferred_ai?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          openai_key?: string | null
          anthropic_key?: string | null
          preferred_ai?: string
          created_at?: string
          updated_at?: string
        }
      }
      job_history: {
        Row: {
          id: string
          user_id: string
          company_name: string
          role: string
          job_description: string
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          company_name: string
          role: string
          job_description: string
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          company_name?: string
          role?: string
          job_description?: string
          note?: string | null
          created_at?: string
        }
      }
      resume_history: {
        Row: {
          id: string
          job_history_id: string
          resume_data: any
          generation_cost: number | null
          ai_provider: string
          created_at: string
        }
        Insert: {
          id?: string
          job_history_id: string
          resume_data: any
          generation_cost?: number | null
          ai_provider: string
          created_at?: string
        }
        Update: {
          id?: string
          job_history_id?: string
          resume_data?: any
          generation_cost?: number | null
          ai_provider?: string
          created_at?: string
        }
      }
    }
  }
}