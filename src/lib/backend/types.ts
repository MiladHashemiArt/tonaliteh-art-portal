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

/** One dated meeting of a weekly class that staff publish for reservations. */
export type OccurrenceRow = {
  id: string;
  class_session_id: string;
  session_date: string;
  published_at: string | null;
  published_by: string | null;
  is_open: boolean | null;
  is_cancelled: boolean | null;
  capacity: number | null;
  booked_count: number | null;
  created_at: string;
  updated_at: string | null;
};

export type ReservationRow = {
  id: string;
  occurrence_id: string;
  student_id: string;
  status: string | null;
  created_at: string;
  updated_at: string | null;
};

/** Extra billable attendance (second slot, overtime) entered by staff. Quantity is not a column. */
export type AttendanceAdjustmentRow = {
  id: string;
  student_id: string;
  class_id: string | null;
  session_date: string | null;
  adjustment_type: string | null;
  unit_rate: number | string | null;
  amount: number | string | null;
  description: string | null;
  payment_id: string | null;
  attendance_id: string | null;
  recorded_by: string | null;
  created_at: string;
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

/** Read-only history row written by the backend when an attendance status changes. */
export type AttendanceAuditRow = {
  id: string;
  attendance_id: string;
  changed_by: string | null;
  old_status: string | null;
  new_status: string;
  reason: string | null;
  changed_at: string;
};

export type StudentMessageRow = {
  id: string;
  student_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
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

export type StudentSubscriptionRow = {
  id: string;
  student_id: string;
  duration_months: number;
  sessions_per_month: number;
  total_sessions: number;
  consumed_sessions: number;
  remaining_sessions: number;
  monthly_price: number | string;
  total_price: number | string;
  discount_applied: boolean;
  starts_on: string;
  ends_on: string;
  status: string;
  created_at: string;
};

export type PaymentRow = {
  id: string;
  student_id: string;
  subscription_id?: string | null;
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
      attendance_records: Table<
        AttendanceRecordRow,
        Partial<AttendanceRecordRow> & {
          student_id: string;
          class_id: string;
          session_date: string;
          status: AttendanceRecordRow["status"];
        }
      >;
      class_session_occurrences: Table<
        OccurrenceRow,
        Partial<Omit<OccurrenceRow, "id" | "created_at">> & {
          class_session_id: string;
          session_date: string;
        },
        Partial<
          Pick<
            OccurrenceRow,
            "published_at" | "published_by" | "is_open" | "is_cancelled" | "capacity"
          >
        >
      >;
      class_session_reservations: Table<
        ReservationRow,
        { occurrence_id: string; student_id: string; status?: string | null },
        Partial<Pick<ReservationRow, "status">>
      >;
      attendance_adjustments: Table<
        AttendanceAdjustmentRow,
        Partial<Omit<AttendanceAdjustmentRow, "id" | "created_at">> & { student_id: string },
        Partial<Pick<AttendanceAdjustmentRow, "payment_id" | "description">>
      >;
      student_artworks: Table<
        StudentArtworkRow,
        { student_id: string; title: string; object_path: string; description?: string | null },
        Partial<
          Pick<
            StudentArtworkRow,
            "teacher_note" | "reviewed_by" | "reviewed_at" | "title" | "description"
          >
        >
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
      student_subscriptions: Table<StudentSubscriptionRow, never, never>;
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
      /** Owner-side setup: docs/setup/005_session_reservations.sql */
      tonaliteh_reserve_occurrence: { Args: { _occurrence_id: string }; Returns: string };
      tonaliteh_cancel_reservation: { Args: { _occurrence_id: string }; Returns: undefined };
      tonaliteh_create_subscription: {
        Args: {
          _duration_months: number;
          _sessions_per_month: number;
          _class_session_ids: string[];
          _starts_on: string;
        };
        Returns: string;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

/** Backwards-compatible names used by the booking pages. */
export type ClassSessionOccurrenceRow = OccurrenceRow;
export type ClassSessionReservationRow = ReservationRow;
