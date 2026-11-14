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

export type EnrollmentRow = {
  id: string;
  student_id: string;
  class_id: string;
  created_at: string;
};

export type ClassSessionOccurrenceRow = {
  id: string;
  class_session_id: string;
  session_date: string;
  is_open: boolean;
  capacity: number;
  booked_count: number;
  published_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ClassSessionReservationRow = {
  id: string;
  occurrence_id: string;
  student_id: string;
  status: "booked" | "cancelled";
  created_at: string;
  updated_at: string;
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
  visibility?: "private" | "published";
  publication_consent_at?: string | null;
  published_at?: string | null;
  technique?: string | null;
  materials?: string | null;
  dimensions?: string | null;
  duration_minutes?: number | null;
};

export type StudentArtworkLikeRow = {
  id: string;
  artwork_id: string;
  user_id: string;
  created_at: string;
};

export type StudentArtworkCommentRow = {
  id: string;
  artwork_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
};

export type StudentArtworkReportRow = {
  id: string;
  reporter_id: string;
  artwork_id: string | null;
  comment_id: string | null;
  reason: string;
  details: string | null;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type StudentFollowRow = {
  follower_id: string;
  followed_id: string;
  created_at: string;
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

export type AttendanceAdjustmentRow = {
  id: string;
  attendance_id: string;
  student_id: string;
  class_id: string;
  session_date: string;
  adjustment_type: "extra_time" | "extra_session";
  quantity_minutes: number | null;
  unit_rate: number;
  amount: number;
  description: string | null;
  payment_id: string | null;
  recorded_by: string | null;
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
      class_session_occurrences: Table<
        ClassSessionOccurrenceRow,
        { class_session_id: string; session_date: string; capacity: number; is_open?: boolean; booked_count?: number; published_by?: string | null; published_at?: string | null },
        Partial<Pick<ClassSessionOccurrenceRow, "capacity" | "is_open" | "booked_count" | "published_by" | "published_at" | "updated_at">>
      >;
      class_session_reservations: Table<
        ClassSessionReservationRow,
        { occurrence_id: string; student_id: string; status?: "booked" | "cancelled" },
        Partial<Pick<ClassSessionReservationRow, "status" | "updated_at">>
      >;
      attendance_records: Table<AttendanceRecordRow, Partial<AttendanceRecordRow> & { student_id: string; class_id: string; session_date: string; status: AttendanceRecordRow["status"] }>;
      attendance_adjustments: Table<
        AttendanceAdjustmentRow,
        { attendance_id: string; student_id: string; class_id: string; session_date: string; adjustment_type: "extra_time" | "extra_session"; quantity_minutes?: number | null; unit_rate: number; description?: string | null; recorded_by: string },
        never
      >;
      student_artworks: Table<
        StudentArtworkRow,
        {
          student_id: string;
          title: string;
          object_path: string;
          description?: string | null;
          technique?: string | null;
          materials?: string | null;
          dimensions?: string | null;
          duration_minutes?: number | null;
        },
        Partial<Pick<StudentArtworkRow, "teacher_note" | "reviewed_by" | "reviewed_at" | "title" | "description" | "technique" | "materials" | "dimensions" | "duration_minutes">>
      >;
      student_artwork_reviews: Table<
        StudentArtworkReviewRow,
        { artwork_id: string; reviewer_id: string; note: string },
        never
      >;
      student_artwork_likes: Table<
        StudentArtworkLikeRow,
        { artwork_id: string; user_id: string }
      >;
      student_artwork_comments: Table<
        StudentArtworkCommentRow,
        { artwork_id: string; author_id: string; parent_id?: string | null; body: string },
        Partial<Pick<StudentArtworkCommentRow, "body">>
      >;
      student_artwork_reports: Table<
        StudentArtworkReportRow,
        { reporter_id: string; artwork_id?: string | null; comment_id?: string | null; reason: string; details?: string | null },
        Partial<Pick<StudentArtworkReportRow, "status" | "reviewed_by" | "reviewed_at">>
      >;
      student_follows: Table<
        StudentFollowRow,
        { follower_id: string; followed_id: string },
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
      set_student_artwork_publication: {
        Args: { _artwork_id: string; _publish: boolean };
        Returns: undefined;
      };

    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
