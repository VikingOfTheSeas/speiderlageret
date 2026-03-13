const SUPABASE_URL      = 'https://mxnojoymdgeapwsljkbg.supabase.co';
const SUPABASE_ANON_KEY = 'LIMPINN_DIN_NOKKEL_HER';
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
