import type { User } from "@supabase/supabase-js";

import { normalizeDigits } from "@/lib/domain/validation";

import { supabase } from "./client";
import type { ProfileRow } from "./types";

export type ProfileDetails = {
  fullName?: string | undefined;
  phone?: string | undefined;
  homeAddress?: string | undefined;
};

/**
 * Save contact details on the user's own profile.
 * The role is never sent — it stays whatever the database trigger set (student).
 */
export async function saveOwnProfileDetails(userId: string, details: ProfileDetails) {
  const update: { full_name?: string; phone?: string; home_address?: string } = {};
  if (details.fullName?.trim()) update.full_name = details.fullName.trim();
  if (details.phone?.trim()) update.phone = normalizeDigits(details.phone);
  if (details.homeAddress?.trim()) update.home_address = details.homeAddress.trim();
  if (!Object.keys(update).length) return;
  const { error } = await supabase.from("profiles").update(update).eq("id", userId);
  if (error) throw error;
}

function metaString(meta: Record<string, unknown>, key: string): string | undefined {
  const v = meta[key];
  return typeof v === "string" && v.trim() ? v : undefined;
}

/**
 * With email confirmation on, sign-up has no session yet, so phone and address wait in the
 * user's own auth metadata. On the first signed-in visit, copy them onto the profile once.
 */
export async function syncPendingSignupDetails(user: User, profile: ProfileRow | null) {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  if (meta["tonaliteh_pending"] !== true || !profile) return false;
  await saveOwnProfileDetails(user.id, {
    fullName: profile.full_name ? undefined : metaString(meta, "full_name"),
    phone: profile.phone ? undefined : metaString(meta, "phone"),
    homeAddress: profile.home_address ? undefined : metaString(meta, "home_address"),
  });
  await supabase.auth.updateUser({ data: { tonaliteh_pending: false } });
  return true;
}
