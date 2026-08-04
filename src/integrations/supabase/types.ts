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
      academic_years: {
        Row: {
          closed_at: string | null
          created_at: string
          id: string
          is_current: boolean
          label: string
          started_at: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          id?: string
          is_current?: boolean
          label: string
          started_at?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          id?: string
          is_current?: boolean
          label?: string
          started_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          academic_year_id: string
          author_id: string
          body: string
          created_at: string
          id: string
          scope: Database["public"]["Enums"]["announcement_scope"]
          stage_group: Database["public"]["Enums"]["stage_group"] | null
          teacher_assignment_id: string | null
          title: string
        }
        Insert: {
          academic_year_id?: string
          author_id: string
          body: string
          created_at?: string
          id?: string
          scope: Database["public"]["Enums"]["announcement_scope"]
          stage_group?: Database["public"]["Enums"]["stage_group"] | null
          teacher_assignment_id?: string | null
          title: string
        }
        Update: {
          academic_year_id?: string
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          scope?: Database["public"]["Enums"]["announcement_scope"]
          stage_group?: Database["public"]["Enums"]["stage_group"] | null
          teacher_assignment_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_teacher_assignment_id_fkey"
            columns: ["teacher_assignment_id"]
            isOneToOne: false
            referencedRelation: "teacher_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          academic_year_id: string
          created_at: string
          date: string
          id: string
          recorded_by: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
        }
        Insert: {
          academic_year_id?: string
          created_at?: string
          date: string
          id?: string
          recorded_by?: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          date?: string
          id?: string
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          academic_year_id: string
          created_at: string
          id: string
          kind: string
          other_id: string
          subject_id: string | null
          teacher_id: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          id?: string
          kind: string
          other_id: string
          subject_id?: string | null
          teacher_id: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          id?: string
          kind?: string
          other_id?: string
          subject_id?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          academic_year_id: string | null
          announcement_id: string | null
          category: string
          created_at: string
          expires_at: string | null
          file_name: string
          file_size_bytes: number
          file_type: string
          grade_level: Database["public"]["Enums"]["grade_level"] | null
          homework_id: string | null
          id: string
          r2_key: string
          stage_group: Database["public"]["Enums"]["stage_group"] | null
          uploaded_by: string
        }
        Insert: {
          academic_year_id?: string | null
          announcement_id?: string | null
          category?: string
          created_at?: string
          expires_at?: string | null
          file_name: string
          file_size_bytes?: number
          file_type: string
          grade_level?: Database["public"]["Enums"]["grade_level"] | null
          homework_id?: string | null
          id?: string
          r2_key: string
          stage_group?: Database["public"]["Enums"]["stage_group"] | null
          uploaded_by: string
        }
        Update: {
          academic_year_id?: string | null
          announcement_id?: string | null
          category?: string
          created_at?: string
          expires_at?: string | null
          file_name?: string
          file_size_bytes?: number
          file_type?: string
          grade_level?: Database["public"]["Enums"]["grade_level"] | null
          homework_id?: string | null
          id?: string
          r2_key?: string
          stage_group?: Database["public"]["Enums"]["stage_group"] | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homework"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          academic_year_id: string
          approved_at: string | null
          approved_by: string | null
          committed_at: string
          entered_by: string | null
          id: string
          max_score: number
          month: number | null
          score: number
          student_id: string
          subject_id: string
          term: Database["public"]["Enums"]["term_type"]
          updated_at: string
        }
        Insert: {
          academic_year_id?: string
          approved_at?: string | null
          approved_by?: string | null
          committed_at?: string
          entered_by?: string | null
          id?: string
          max_score: number
          month?: number | null
          score: number
          student_id: string
          subject_id: string
          term: Database["public"]["Enums"]["term_type"]
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          approved_at?: string | null
          approved_by?: string | null
          committed_at?: string
          entered_by?: string | null
          id?: string
          max_score?: number
          month?: number | null
          score?: number
          student_id?: string
          subject_id?: string
          term?: Database["public"]["Enums"]["term_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grades_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      homework: {
        Row: {
          academic_year_id: string
          attachment_path: string | null
          auto_lock: boolean
          bank_id: string | null
          body: string | null
          created_at: string
          due_at: string | null
          id: string
          kind: Database["public"]["Enums"]["homework_kind"]
          link_url: string | null
          locked: boolean
          teacher_assignment_id: string
          title: string
        }
        Insert: {
          academic_year_id?: string
          attachment_path?: string | null
          auto_lock?: boolean
          bank_id?: string | null
          body?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["homework_kind"]
          link_url?: string | null
          locked?: boolean
          teacher_assignment_id: string
          title: string
        }
        Update: {
          academic_year_id?: string
          attachment_path?: string | null
          auto_lock?: boolean
          bank_id?: string | null
          body?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["homework_kind"]
          link_url?: string | null
          locked?: boolean
          teacher_assignment_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "question_banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_teacher_assignment_id_fkey"
            columns: ["teacher_assignment_id"]
            isOneToOne: false
            referencedRelation: "teacher_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_answers: {
        Row: {
          id: string
          is_correct: boolean | null
          manual_score: number | null
          mcq_choice: number | null
          question_id: string
          submission_id: string
          written_text: string | null
        }
        Insert: {
          id?: string
          is_correct?: boolean | null
          manual_score?: number | null
          mcq_choice?: number | null
          question_id: string
          submission_id: string
          written_text?: string | null
        }
        Update: {
          id?: string
          is_correct?: boolean | null
          manual_score?: number | null
          mcq_choice?: number | null
          question_id?: string
          submission_id?: string
          written_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "homework_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "homework_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_questions: {
        Row: {
          homework_id: string
          id: string
          order: number
          question_id: string
        }
        Insert: {
          homework_id: string
          id?: string
          order?: number
          question_id: string
        }
        Update: {
          homework_id?: string
          id?: string
          order?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_questions_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homework"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_submissions: {
        Row: {
          academic_year_id: string
          auto_score: number | null
          created_at: string
          final_score: number | null
          homework_id: string
          id: string
          locked: boolean
          manual_score: number | null
          student_id: string
          submitted_at: string | null
        }
        Insert: {
          academic_year_id?: string
          auto_score?: number | null
          created_at?: string
          final_score?: number | null
          homework_id: string
          id?: string
          locked?: boolean
          manual_score?: number | null
          student_id: string
          submitted_at?: string | null
        }
        Update: {
          academic_year_id?: string
          auto_score?: number | null
          created_at?: string
          final_score?: number | null
          homework_id?: string
          id?: string
          locked?: boolean
          manual_score?: number | null
          student_id?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "homework_submissions_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_submissions_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homework"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          mobile: string | null
          national_id: string | null
          status: Database["public"]["Enums"]["profile_status"]
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          mobile?: string | null
          national_id?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          mobile?: string | null
          national_id?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
        }
        Relationships: []
      }
      question_banks: {
        Row: {
          created_at: string
          id: string
          name: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          teacher_id?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          bank_id: string
          choices: Json | null
          correct_choice: number | null
          created_at: string
          id: string
          points: number
          prompt: string
          type: Database["public"]["Enums"]["question_type"]
        }
        Insert: {
          bank_id: string
          choices?: Json | null
          correct_choice?: number | null
          created_at?: string
          id?: string
          points?: number
          prompt: string
          type: Database["public"]["Enums"]["question_type"]
        }
        Update: {
          bank_id?: string
          choices?: Json | null
          correct_choice?: number | null
          created_at?: string
          id?: string
          points?: number
          prompt?: string
          type?: Database["public"]["Enums"]["question_type"]
        }
        Relationships: [
          {
            foreignKeyName: "questions_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "question_banks"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_requests: {
        Row: {
          created_at: string
          grade_level: Database["public"]["Enums"]["grade_level"]
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          stage_group: Database["public"]["Enums"]["stage_group"]
          status: Database["public"]["Enums"]["request_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          grade_level: Database["public"]["Enums"]["grade_level"]
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          stage_group: Database["public"]["Enums"]["stage_group"]
          status?: Database["public"]["Enums"]["request_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          grade_level?: Database["public"]["Enums"]["grade_level"]
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          stage_group?: Database["public"]["Enums"]["stage_group"]
          status?: Database["public"]["Enums"]["request_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signup_requests_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_manager_assignments: {
        Row: {
          id: string
          stage_group: Database["public"]["Enums"]["stage_group"]
          user_id: string
        }
        Insert: {
          id?: string
          stage_group: Database["public"]["Enums"]["stage_group"]
          user_id: string
        }
        Update: {
          id?: string
          stage_group?: Database["public"]["Enums"]["stage_group"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_manager_assignments_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_enrollments: {
        Row: {
          academic_year_id: string
          grade_level: Database["public"]["Enums"]["grade_level"]
          id: string
          is_graduated: boolean
          stage_group: Database["public"]["Enums"]["stage_group"]
          user_id: string
        }
        Insert: {
          academic_year_id?: string
          grade_level: Database["public"]["Enums"]["grade_level"]
          id?: string
          is_graduated?: boolean
          stage_group: Database["public"]["Enums"]["stage_group"]
          user_id: string
        }
        Update: {
          academic_year_id?: string
          grade_level?: Database["public"]["Enums"]["grade_level"]
          id?: string
          is_graduated?: boolean
          stage_group?: Database["public"]["Enums"]["stage_group"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_enrollments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_enrollments_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          grade_level: Database["public"]["Enums"]["grade_level"]
          id: string
          name: string
          stage_group: Database["public"]["Enums"]["stage_group"]
        }
        Insert: {
          grade_level: Database["public"]["Enums"]["grade_level"]
          id?: string
          name: string
          stage_group: Database["public"]["Enums"]["stage_group"]
        }
        Update: {
          grade_level?: Database["public"]["Enums"]["grade_level"]
          id?: string
          name?: string
          stage_group?: Database["public"]["Enums"]["stage_group"]
        }
        Relationships: []
      }
      teacher_assignments: {
        Row: {
          academic_year_id: string
          assigned_by: string | null
          created_at: string
          id: string
          subject_id: string
          teacher_id: string
        }
        Insert: {
          academic_year_id?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          subject_id: string
          teacher_id: string
        }
        Update: {
          academic_year_id?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          subject_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_assignments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_assignments_teacher_id_profiles_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      term_month_settings: {
        Row: {
          months: number[]
          term: Database["public"]["Enums"]["term_type"]
          updated_at: string
        }
        Insert: {
          months: number[]
          term: Database["public"]["Enums"]["term_type"]
          updated_at?: string
        }
        Update: {
          months?: number[]
          term?: Database["public"]["Enums"]["term_type"]
          updated_at?: string
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
      approve_grades: { Args: { _ids: string[] }; Returns: number }
      chat_peer_names: {
        Args: never
        Returns: {
          full_name: string
          id: string
        }[]
      }
      chat_relationship_exists: {
        Args: {
          _kind: string
          _other_id: string
          _subject_id: string
          _teacher_id: string
          _year_id: string
        }
        Returns: boolean
      }
      current_academic_year_id: { Args: never; Returns: string }
      delete_academic_year: { Args: { _year: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_stage_manager_of: {
        Args: {
          _stage: Database["public"]["Enums"]["stage_group"]
          _user_id: string
        }
        Returns: boolean
      }
      pending_promotion_count: { Args: never; Returns: number }
      preview_promotion_roster: {
        Args: never
        Returns: {
          full_name: string
          grade_level: Database["public"]["Enums"]["grade_level"]
          stage_group: Database["public"]["Enums"]["stage_group"]
          user_id: string
        }[]
      }
      promote_students: {
        Args: { _promotions: Json; _repeats: string[] }
        Returns: undefined
      }
      rename_academic_year: {
        Args: { _label: string; _year: string }
        Returns: undefined
      }
      set_current_academic_year: { Args: { _year: string }; Returns: undefined }
      set_grade_cell_max: {
        Args: {
          _month: number
          _new_max: number
          _subject: string
          _term: string
        }
        Returns: number
      }
      start_new_academic_year: { Args: { _label: string }; Returns: string }
      start_year_and_promote: {
        Args: { _label: string; _promotions: Json; _repeats: string[] }
        Returns: string
      }
      student_of_stage_manager: {
        Args: { _sm: string; _student: string }
        Returns: boolean
      }
      student_stage: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["stage_group"]
      }
      subject_reference_counts: {
        Args: { _subject: string }
        Returns: {
          grades: number
          homework: number
          teachers: number
        }[]
      }
      subject_stage: {
        Args: { _subject: string }
        Returns: Database["public"]["Enums"]["stage_group"]
      }
      subject_uuid: {
        Args: {
          _grade: Database["public"]["Enums"]["grade_level"]
          _name: string
          _stage: Database["public"]["Enums"]["stage_group"]
        }
        Returns: string
      }
      teacher_owns_assignment: {
        Args: { _assignment: string; _user_id: string }
        Returns: boolean
      }
      year_scoped_counts: { Args: { _year: string }; Returns: Json }
    }
    Enums: {
      announcement_scope: "stage" | "subject"
      app_role: "student" | "teacher" | "stage_manager" | "admin"
      attendance_status: "present" | "absent" | "late"
      grade_level:
        | "p1"
        | "p2"
        | "p3"
        | "p4"
        | "p5"
        | "p6"
        | "prep1"
        | "prep2"
        | "prep3"
        | "sec1"
        | "sec2"
        | "sec3"
      homework_kind: "simple" | "bank"
      profile_status: "pending" | "active"
      question_type: "mcq" | "written"
      request_status: "pending" | "approved" | "rejected"
      stage_group: "primary_1_2" | "primary_3_6" | "preparatory" | "secondary"
      term_type: "term_1" | "term_2" | "midyear" | "final"
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
      announcement_scope: ["stage", "subject"],
      app_role: ["student", "teacher", "stage_manager", "admin"],
      attendance_status: ["present", "absent", "late"],
      grade_level: [
        "p1",
        "p2",
        "p3",
        "p4",
        "p5",
        "p6",
        "prep1",
        "prep2",
        "prep3",
        "sec1",
        "sec2",
        "sec3",
      ],
      homework_kind: ["simple", "bank"],
      profile_status: ["pending", "active"],
      question_type: ["mcq", "written"],
      request_status: ["pending", "approved", "rejected"],
      stage_group: ["primary_1_2", "primary_3_6", "preparatory", "secondary"],
      term_type: ["term_1", "term_2", "midyear", "final"],
    },
  },
} as const
