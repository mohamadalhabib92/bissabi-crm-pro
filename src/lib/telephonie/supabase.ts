import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config';

const url = env('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL);
const key = env('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;

/** Client anon + session Supabase. Absent tant que les variables publiques ne sont pas posées. Jamais de clé service_role. */
export function getSupabase(): SupabaseClient | null {
  if (!url.configured || !key.configured || !url.value || !key.value) return null;
  if (!client) {
    client = createClient(url.value, key.value, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

export const supabaseConfigured = url.configured && key.configured;
