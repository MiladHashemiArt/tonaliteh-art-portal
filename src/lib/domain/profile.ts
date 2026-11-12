import { isValidPhone } from "./validation";

export const FULL_NAME_MAX = 80;
export const HOME_ADDRESS_MAX = 500;

export type ProfileForm = { fullName: string; phone: string; homeAddress: string };
export type ProfileFormErrors = Partial<Record<keyof ProfileForm, string>>;

/** Fields a user may edit on their own profile. Role and national ID are never part of this form. */
export const OWN_EDITABLE_PROFILE_FIELDS = ["full_name", "phone", "home_address"] as const;

export function validateProfileForm(v: ProfileForm): ProfileFormErrors {
  const errors: ProfileFormErrors = {};
  const name = v.fullName.trim();
  if (name.length < 3) errors.fullName = "نام و نام خانوادگی را کامل بنویسید.";
  else if (name.length > FULL_NAME_MAX) errors.fullName = "نام طولانی است.";
  if (v.phone.trim() && !isValidPhone(v.phone)) errors.phone = "شمارهٔ تماس معتبر نیست.";
  if (v.homeAddress.trim().length > HOME_ADDRESS_MAX) errors.homeAddress = "نشانی طولانی است.";
  return errors;
}

/** Show only the last three digits of a national ID. */
export function maskNationalId(value: string): string {
  const v = value.trim();
  if (v.length <= 3) return v;
  return "•".repeat(v.length - 3) + v.slice(-3);
}
