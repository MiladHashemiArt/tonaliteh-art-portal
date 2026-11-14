-- Add indexes for foreign-key columns reported by the Supabase performance advisor.
-- These indexes are additive and do not change application data or access policies.
CREATE INDEX IF NOT EXISTS absences_class_id_idx ON public.absences (class_id);
CREATE INDEX IF NOT EXISTS absences_student_id_idx ON public.absences (student_id);
CREATE INDEX IF NOT EXISTS announcements_created_by_idx ON public.announcements (created_by);
CREATE INDEX IF NOT EXISTS attendance_audit_log_changed_by_idx ON public.attendance_audit_log (changed_by);
CREATE INDEX IF NOT EXISTS attendance_records_marked_by_idx ON public.attendance_records (marked_by);
CREATE INDEX IF NOT EXISTS class_session_closures_created_by_idx ON public.class_session_closures (created_by);
CREATE INDEX IF NOT EXISTS class_session_occurrences_published_by_idx ON public.class_session_occurrences (published_by);
CREATE INDEX IF NOT EXISTS enrollments_class_id_idx ON public.enrollments (class_id);
CREATE INDEX IF NOT EXISTS payments_student_id_idx ON public.payments (student_id);
CREATE INDEX IF NOT EXISTS site_settings_updated_by_idx ON public.site_settings (updated_by);
CREATE INDEX IF NOT EXISTS student_expenses_reviewed_by_idx ON public.student_expenses (reviewed_by);
CREATE INDEX IF NOT EXISTS student_messages_sender_id_idx ON public.student_messages (sender_id);
