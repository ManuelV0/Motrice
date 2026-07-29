import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabasePublishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

function readInitialAuthCallbackError() {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  return (
    url.searchParams.get('error_description') ||
    hash.get('error_description') ||
    url.searchParams.get('error') ||
    hash.get('error') ||
    ''
  );
}

export const supabaseAuthCallbackError = readInitialAuthCallbackError();
export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        persistSession: true,
        storageKey: 'motrice-supabase-auth'
      }
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase non configurato: aggiungi URL e publishable key.');
  }
  return supabase;
}
