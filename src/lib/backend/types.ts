/**
 * Hand-written types for the existing Tonaliteh backend schema.
 * Replace with generated types once the project is linked in Lovable.
 * Ids are typed as string; compare them with String(...) because some tables may use numeric ids.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  created_at: string;
  home_address: string | null;
};

export type ClassSessionRow = {
  id: string;
  class_day: string | number | null;
  start_time: string | null;
  end_time: string | null;
  class_type: string | null;
  session_date: string | null;
  is_active: boolean | null;
  recurrence_weeks: number | null;
  recurrence_anchor_date: string | null;
};

export type EnrollmentRow = {
  id?: string;
  student_id: string;
  class_id: string;
  created_at?: string;
};

export type AnnouncementRow = {
  id: string;
  title: string;
  content: string | null;
  created_by: string | null;
  created_at: string;
};

export type AbsenceRow = {
  id: string;
  student_id: string;
  class_id: string | null;
  absence_date: string;
  description: string | null;
  created_at: string;
};

export type PaymentRow = {
  id: string;
  student_id: string;
  amount: number | string | null;
  payment_date: string | null;
  status: string | null;
  description: string | null;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  title: string | null;
  body: string | null;
  notification_type: string | null;
  related_id: string | null;
  created_at: string;
  read_at: string | null;
};

export type AppSettingRow = {
  key: string;
  value: string;
  updated_at: string;
  updated_by: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        ProfileRow,
        Partial<ProfileRow> & { id: string },
        Partial<Pick<ProfileRow, "full_name" | "phone" | "home_address">>
      >;
      class_sessions: Table<ClassSessionRow, Partial<Omit<ClassSessionRow, "id">>>;
      enrollments: Table<EnrollmentRow, { student_id: string; class_id: string }>;
      announcements: Table<
        AnnouncementRow,
        { title: string; content?: string | null; created_by?: string | null }
      >;
      absences: Table<
        AbsenceRow,
        {
          student_id: string;
          class_id?: string | null;
          absence_date: string;
          description?: string | null;
        }
      >;
      payments: Table<PaymentRow, Partial<Omit<PaymentRow, "id">> & { student_id: string }>;
      notifications: Table<NotificationRow, Partial<NotificationRow>, { read_at?: string | null }>;
      app_settings: Table<
        AppSettingRow,
        { key: string; value: string; updated_by?: string | null; updated_at?: string }
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      get_my_national_id: { Args: Record<string, never>; Returns: string | null };
      set_my_national_id: { Args: { _national_id: string | null }; Returns: undefined };
      get_student_national_id: { Args: { _student_id: string }; Returns: string | null };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
