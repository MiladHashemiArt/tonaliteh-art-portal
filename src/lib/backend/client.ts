import { createClient } from "@supabase/supabase-js";

import type { Database } from "./types";

/**
 * Browser client for the existing Tonaliteh backend.
 * Values come from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (publishable key only).
 * Never place a service-role / secret key in env vars with the VITE_ prefix or anywhere under src/.
 */
const env = import.meta.env as Record<string, string | undefined>;
const url = env["VITE_SUPABASE_URL"] ?? "";
const anonKey = env["VITE_SUPABASE_ANON_KEY"] ?? env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";

export const backendConfigured = Boolean(url && anonKey);

const isBrowser = typeof window !== "undefined";

export const supabase = createClient<Database>(
  backendConfigured ? url : "http://backend-not-configured.invalid",
  backendConfigured ? anonKey : "missing-key",
  {
    auth: {
      storage: isBrowser ? window.localStorage : undefined,
      persistSession: isBrowser,
      autoRefreshToken: isBrowser,
      detectSessionInUrl: isBrowser,
    },
  },
);
