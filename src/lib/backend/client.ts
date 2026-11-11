import { createClient } from "@supabase/supabase-js";

import type { Database } from "./types";

/**
 * Browser client for the existing Tonaliteh backend.
 * Only the publishable (public) key belongs here — it is safe in browser code.
 * Never place a service-role / secret key in this file or anywhere under src/.
 */
const FALLBACK_URL = "https://flaiwkxmlnjdqxlrvmpv.supabase.co";
const FALLBACK_PUBLISHABLE_KEY = "sb_publishable_6QyPUODV3LRGtsmf4l6O8g_YorayyQ8";

export const BACKEND_URL: string =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || FALLBACK_URL;
const PUBLISHABLE_KEY: string =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  FALLBACK_PUBLISHABLE_KEY;

const isBrowser = typeof window !== "undefined";

export const supabase = createClient<Database>(BACKEND_URL, PUBLISHABLE_KEY, {
  auth: {
    storage: isBrowser ? window.localStorage : undefined,
    persistSession: isBrowser,
    autoRefreshToken: isBrowser,
    detectSessionInUrl: isBrowser,
  },
});
