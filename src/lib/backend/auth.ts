import type { User } from "@supabase/supabase-js";

import { isValidNationalId, normalizeDigits } from "@/lib/domain/validation";

import { supabase } from "./client";
import type { ProfileRow } from "./types";

export type SignupDetails = {
  fullName: string;
  phone: string;
  homeAddress: string;
  nationalId?: string;
};

/**
 * Save registration details on the user's own profile.
 * The role is never sent — it stays whatever the database trigger set (student).
 */
export async function saveOwnProfileDetails(userId: string, details: Partial<SignupDetails>) {
  const update: { full_name?: string; phone?: string; home_address?: string } = {};
  if (details.fullName) update.full_name = details.fullName.trim();
  if (details.phone) update.phone = normalizeDigits(details.phone);
  if (details.homeAddress) update.home_address = details.homeAddress.trim();
  if (Object.keys(update).length) {
    const { error } = await supabase.from("profiles").update(update).eq("id", userId);
    if (error) throw error;
  }
  if (details.nationalId && isValidNationalId(details.nationalId)) {
    const { error } = await supabase.rpc("set_my_national_id", {
      _national_id: normalizeDigits(details.nationalId),
    });
    if (error) throw error;
  }
}

/**
 * When email confirmation is on, sign-up has no session yet, so registration details wait in
 * the user's own metadata. On first signed-in visit, copy them to the profile and drop the
 * national ID from metadata.
 */
export async function syncPendingSignupDetails(user: User, profile: ProfileRow | null) {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const pending = meta.tonaliteh_pending === true;
  if (!pending || !profile) return false;
  await saveOwnProfileDetails(user.id, {
    fullName: profile.full_name ? undefined : (meta.full_name as string | undefined),
    phone: profile.phone ? undefined : (meta.phone as string | undefined),
    homeAddress: profile.home_address ? undefined : (meta.home_address as string | undefined),
    nationalId: meta.national_id as string | undefined,
  });
  await supabase.auth.updateUser({ data: { tonaliteh_pending: false, national_id: null } });
  return true;
}
