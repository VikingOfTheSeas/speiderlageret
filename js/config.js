const SUPABASE_URL      = 'https://mxnojoymdgeapwsljkbg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14bm9qb3ltZGdlYXB3c2xqa2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMTczNzgsImV4cCI6MjA4ODg5MzM3OH0.IZuE0og-G-12Izu2VVyx_kV8sDHUE6nG5Ziucdi-FNk';
const APP_BASE_URL      = 'https://1-haugerud-lager-administrasjon.vercel.app/';

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Kolonnelister UTEN bilde_url. Base64-bildene gjør at select("*") på
// gjenstander/bokser laster ~16 MB; uten bildene er det ~15 KB.
// Bilder hentes på forespørsel der de faktisk vises (hentGjenstandBilde/
// hentBoksBilde).
const GJENSTAND_FELTER = "id,navn,kategori,serienummer,enhet,status,utlant_til,utlansdato,innleveringsdato,hylleplassering,notater,opprettet,er_bulk,antall_totalt,antall_utlant,boks_id";
const BOKS_FELTER      = "id,navn,hylleplassering,beskrivelse,opprettet";

// Enkel sessionStorage-cache: sidene rendrer umiddelbart fra cachen og
// henter ferske data i bakgrunnen (stale-while-revalidate).
function cacheLes(key) {
  try {
    var raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function cacheSkriv(key, data) {
  try { sessionStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
}

// ---- UTLÅNSLOGG ----
// Én rad per gjenstand slik at hver gjenstandsside får komplett historikk.
async function loggUtlan(items, til, dato, frist) {
  if (!items || !items.length) return;
  var rader = items.map(function(g) {
    return {
      gjenstand_id: g.id,
      boks_id: g.boks_id || null,
      antall: 1,
      utlant_til: til,
      utlansdato: dato,
      innleveringsdato: frist || null,
      status: "aktiv",
    };
  });
  var r = await db.from("utlanslogg").insert(rader);
  if (r.error) console.warn("utlanslogg insert:", r.error.message);
}

// Lukker aktive loggrader for gjenstandene (ved innlevering/statusbytte).
async function loggInnlevert(ids) {
  if (!ids || !ids.length) return;
  var d = new Date();
  var idag = d.getFullYear() + "-" + ("0"+(d.getMonth()+1)).slice(-2) + "-" + ("0"+d.getDate()).slice(-2);
  var r = await db.from("utlanslogg")
    .update({ status: "levert", levert_dato: idag })
    .in("gjenstand_id", ids)
    .eq("status", "aktiv");
  if (r.error) console.warn("utlanslogg levert:", r.error.message);
}

async function hentGjenstandBilde(id) {
  var r = await db.from("gjenstander").select("bilde_url").eq("id", id).single();
  return (r.data && r.data.bilde_url) || "";
}

async function hentBoksBilde(id) {
  var r = await db.from("bokser").select("bilde_url").eq("id", id).single();
  return (r.data && r.data.bilde_url) || "";
}

function konverterBildeUrl(url) {
  if (!url || url.startsWith('data:')) return url;
  const m1 = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (m1) return `https://drive.google.com/uc?export=view&id=${m1[1]}`;
  const m2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (m2) return `https://drive.google.com/uc?export=view&id=${m2[1]}`;
  return url;
}

function komprimerTilBase64(fil) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Kunne ikke lese filen"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Ugyldig bildefil"));
      img.onload = () => {
        const maxW  = 900;
        const scale = Math.min(1, maxW / img.width);
        const c     = document.createElement("canvas");
        c.width     = Math.round(img.width  * scale);
        c.height    = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.78));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(fil);
  });
}
