import type { Settings } from "@/lib/domain/settings";

import { supabase } from "./client";

export async function saveSettings(userId: string, values: Settings) {
  const rows = Object.entries(values).map(([key, value]) => ({
    key,
    value: value ?? "",
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return;
  const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) throw error;
}
