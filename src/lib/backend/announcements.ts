import type { AnnouncementInput } from "@/lib/domain/announcements";

import { supabase } from "./client";
import { permissionDenied } from "./errors";

function clean(input: AnnouncementInput) {
  return { title: input.title.trim(), content: input.content.trim() || null };
}

/** Student notifications come from the existing database trigger on insert — never create them here. */
export async function createAnnouncement(userId: string, input: AnnouncementInput) {
  const { data, error } = await supabase
    .from("announcements")
    .insert({ ...clean(input), created_by: userId })
    .select("id");
  if (error) throw error;
  if (!data?.length) throw permissionDenied();
}

export async function updateAnnouncement(id: string, input: AnnouncementInput) {
  const { data, error } = await supabase
    .from("announcements")
    .update(clean(input))
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw permissionDenied();
}

export async function deleteAnnouncement(id: string) {
  const { data, error } = await supabase.from("announcements").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw permissionDenied();
}
