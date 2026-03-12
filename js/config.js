// ════════════════════════════════════════════════════
// ⚙️  SUPABASE-KONFIGURASJON
// Fyll inn din URL og anon-nøkkel fra:
// Supabase → Settings → API
// ════════════════════════════════════════════════════
 
const SUPABASE_URL     = 'https://XXXXXXXXXXXXXXXX.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.XXXXXXX';
 
// Basis-URL for QR-lenker — bytt til din GitHub Pages URL
const APP_BASE_URL = window.location.origin + window.location.pathname.replace('index.html','');
 
const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
