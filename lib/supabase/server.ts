import { createClient, SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";

let client: SupabaseClient | null = null;

function supabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdmin(): SupabaseClient {
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set"
    );
  }
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: ws as unknown as typeof WebSocket },
    });
  }
  return client;
}

export function tryGetSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  return getSupabaseAdmin();
}
