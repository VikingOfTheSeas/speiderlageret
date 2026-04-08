const SUPABASE_URL      = 'https://mxnojoymdgeapwsljkbg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14bm9qb3ltZGdlYXB3c2xqa2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMTczNzgsImV4cCI6MjA4ODg5MzM3OH0.IZuE0og-G-12Izu2VVyx_kV8sDHUE6nG5Ziucdi-FNk';
const APP_BASE_URL      = 'https://1-haugerud-lager-administrasjon.vercel.app/';

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function konverterBildeUrl(url) {
  if (!url || url.startsWith('data:')) return url;
  const m1 = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (m1) return `https://drive.google.com/uc?export=view&id=${m1[1]}`;
  const m2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (m2) return `https://drive.google.com/uc?export=view&id=${m2[1]}`;
  return url;
}

// DD/MM/YYYY ↔ YYYY-MM-DD konvertering for dato-felt
function tilDatoFelt(iso) {
  if (!iso) return '';
  var d = iso.split('-');
  return d.length === 3 ? d[2] + '/' + d[1] + '/' + d[0] : iso;
}
function fraDatoFelt(ddmmyyyy) {
  if (!ddmmyyyy) return '';
  var d = ddmmyyyy.split('/');
  return d.length === 3 ? d[2] + '-' + d[1] + '-' + d[0] : ddmmyyyy;
}
function autoFormatDato(e) {
  var v = e.target.value.replace(/[^0-9]/g, '');
  if (v.length > 8) v = v.slice(0, 8);
  if (v.length >= 5) v = v.slice(0,2) + '/' + v.slice(2,4) + '/' + v.slice(4);
  else if (v.length >= 3) v = v.slice(0,2) + '/' + v.slice(2);
  e.target.value = v;
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
