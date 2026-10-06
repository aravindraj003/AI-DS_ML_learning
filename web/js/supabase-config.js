/*
 * Supabase browser configuration for AI&DS-ML LEARNING.
 *
 * The publishable key is intended for public/browser use. Keep all privileged
 * secret/service keys out of this file and out of the frontend.
 */
window.SUPABASE_URL = 'https://sgzoqjevgmxlfqavwngz.supabase.co';
window.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_WUJH6YfGlLs7h_Icpa2oNg_4vCpz074';

if (!window.supabase || typeof window.supabase.createClient !== 'function') {
  console.error('Supabase JS client is not loaded. Check the CDN script in index.html.');
} else {
  window.supabaseClient = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    }
  );
  console.info('Supabase client initialized for AI&DS-ML LEARNING.');
}
