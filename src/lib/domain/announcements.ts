import { isStaff, type AppRole } from "./roles";

export const ANNOUNCEMENT_TITLE_MAX = 150;
export const ANNOUNCEMENT_CONTENT_MAX = 4000;

/** Only teacher and manager publish, edit or delete announcements. Students read only. RLS still decides each write. */
export function canManageAnnouncements(role: AppRole): boolean {
  return isStaff(role);
}

export type AnnouncementInput = { title: string; content: string };
export type AnnouncementErrors = Partial<Record<keyof AnnouncementInput, string>>;

export function validateAnnouncement(input: AnnouncementInput): AnnouncementErrors {
  const errors: AnnouncementErrors = {};
  const title = input.title.trim();
  if (!title) errors.title = "عنوان اطلاعیه را بنویسید.";
  else if (title.length > ANNOUNCEMENT_TITLE_MAX) errors.title = "عنوان طولانی است.";
  if (input.content.trim().length > ANNOUNCEMENT_CONTENT_MAX)
    errors.content = "متن اطلاعیه طولانی است.";
  return errors;
}
