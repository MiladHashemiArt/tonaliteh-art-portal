import type { Settings } from "@/lib/domain/settings";

import { supabase } from "./client";
import { permissionDenied } from "./errors";

/** Upsert only the given keys; other settings are left untouched. Writes are limited to staff by the database policy. */
export async function saveSettings(userId: string, values: Settings) {
  const rows = Object.entries(values).map(([key, value]) => ({
    key,
    value: value ?? "",
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return;
  const { data, error } = await supabase
    .from("site_settings")
    .upsert(rows, { onConflict: "key" })
    .select("key");
  if (error) throw error;
  if ((data ?? []).length < rows.length) throw permissionDenied();
}
