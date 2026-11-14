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
  avatar_path: string | null;
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

export type ClassSessionOccurrenceRow = {
  id: string;
  class_session_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  class_type: string;
  status: "scheduled" | "cancelled";
  reservations_open: boolean;
  capacity: number | null;
  announcement: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ClassSessionReservationRow = {
  id: string;
  occurrence_id: string;
  student_id: string;
  status: "reserved" | "cancelled";
  reserved_at: string;
  cancelled_at: string | null;
};

export type EnrollmentRow = {
  id: string;
  student_id: string;
  class_id: string;
  created_at: string;
};

export type AttendanceRecordRow = {
  id: string;
  student_id: string;
  class_id: string;
  session_date: string;
  status: "pending" | "present" | "prior_notice_absence" | "no_notice_absence";
  note: string | null;
  marked_by: string | null;
  marked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StudentArtworkRow = {
  id: string;
  student_id: string;
  title: string;
  description: string | null;
  object_path: string;
  teacher_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StudentArtworkReviewRow = {
  id: string;
  artwork_id: string;
  reviewer_id: string;
  reviewer_name: string | null;
  note: string;
  created_at: string;
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

export type SiteSettingRow = {
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
        Partial<Pick<ProfileRow, "full_name" | "phone" | "home_address" | "avatar_path">>
      >;
      class_sessions: Table<ClassSessionRow, Partial<Omit<ClassSessionRow, "id">>>;
      enrollments: Table<EnrollmentRow, { student_id: string; class_id: string }>;
      class_session_occurrences: Table<ClassSessionOccurrenceRow, Partial<Omit<ClassSessionOccurrenceRow, "id" | "created_at" | "updated_at">> & Pick<ClassSessionOccurrenceRow, "class_session_id" | "session_date" | "start_time" | "end_time" | "class_type" | "created_by">>;
      class_session_reservations: Table<ClassSessionReservationRow, { occurrence_id: string; student_id: string; status?: "reserved" | "cancelled" }>;
      attendance_records: Table<AttendanceRecordRow, Partial<AttendanceRecordRow> & { student_id: string; class_id: string; session_date: string; status: AttendanceRecordRow["status"] }>;
      student_artworks: Table<
        StudentArtworkRow,
        { student_id: string; title: string; object_path: string; description?: string | null },
        Partial<Pick<StudentArtworkRow, "teacher_note" | "reviewed_by" | "reviewed_at" | "title" | "description">>
      >;
      student_artwork_reviews: Table<
        StudentArtworkReviewRow,
        { artwork_id: string; reviewer_id: string; note: string },
        never
      >;
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
      site_settings: Table<
        SiteSettingRow,
        { key: string; value: string; updated_by?: string | null; updated_at?: string }
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      /** Owner-side setup: docs/setup/003_private_national_id.sql */
      get_my_national_id: { Args: Record<PropertyKey, never>; Returns: string | null };
      set_my_national_id: { Args: { _value: string }; Returns: undefined };
      reserve_class_session_occurrence: { Args: { p_occurrence_id: string }; Returns: string };
      cancel_class_session_reservation: { Args: { p_reservation_id: string }; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
