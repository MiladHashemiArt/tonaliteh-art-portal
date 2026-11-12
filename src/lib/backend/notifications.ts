import { supabase } from "./client";
import { permissionDenied } from "./errors";

/** Marks the caller's own notifications as read. Scoped to user_id; RLS still applies. */
export async function markNotificationsRead(userId: string, ids: string[]) {
  if (!ids.length) return;
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("id", ids)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw permissionDenied();
}
