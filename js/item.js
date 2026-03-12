// ════════════════════════════════════════════════════
// ITEM DETAIL — item.js
// ════════════════════════════════════════════════════

let currentItem = null;
let itemId = null;

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  itemId = params.get("id");
  if (!itemId) { visError("Ingen ID i URL."); return; }

  try {
    const { data, error } = await db.from("gjenstander").select("*").eq("id", itemId).single();
    if (error || !data) { visError(`Fant ingen gjenstand med ID: ${itemId}`); return; }
    currentItem = data;
    renderItem(data);
  } catch (e) { visError("Feil: " + e.message); }

  db.channel("item-"+itemId)
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"gjenstander",filter:`id=eq.${itemId}`}, p=>{
      currentItem = p.new; renderItem(p.new); visBanner("🔄 Oppdatert","success");
    }).subscribe();
});

function renderItem(g) {
  document.title = g.navn + " – Speiderlageret";
  document.getElementById("loadingState").style.display = "none";
  document.getElementById("itemContent").style.display  = "block";

  document.getElementById("itemNavn").textContent         = g.navn;
  document.getElementById("itemId").textContent           = g.id;
  document.getElementById("itemKategori").textContent     = g.kategori||"—";
  document.getElementById("itemSerienummer").textContent  = g.serienummer||"—";
  document.getElementById("itemHylleHeader").textContent  = g.hylleplassering||"Hylle ikke satt";
  document.getElementById("hylleLabelBig").textContent    = g.hylleplassering||"—";
  document.getElementById("itemHylle").textContent        = g.hylleplassering||"—";
  document.getElementById("itemKategori2").textContent    = g.kategori||"—";
  document.getElementById("itemSerienummer2").textContent = g.serienummer||"—";
  document.getElementById("itemEnhet").textContent        = g.enhet||"stk";
  document.getElementById("itemNotater").textContent      = g.notater||"—";

  const statusEl = document.getElementById("itemStatus");
  statusEl.textContent = g.status;
  statusEl.className   = "status-badge status-" + statusKlasse(g.status);

  renderHurtigKnapper(g.status);

  const banner = document.getElementById("utlanBanner");
  if (g.status==="Utlånt") {
    banner.style.display = "block";
    document.getElementById("bannerUtlantTil").textContent  = g.utlant_til||"—";
    document.getElementById("bannerUtlansdato").textContent = g.utlansdato||"—";
    const fristEl = document.getElementById("bannerFrist");
    fristEl.textContent = g.innleveringsdato||"—";
    const forfalt = g.innleveringsdato && new Date(g.innleveringsdato)<new Date();
    fristEl.className = "utlan-banner-val mono"+(forfalt?" forfalt-text":"");
    if (forfalt) fristEl.textContent += " ⚠️";
  } else {
    banner.style.display = "none";
  }

  // Bilde
  const bildeEl   = document.getElementById("hylleBilde");
  const placeholder = document.getElementById("bildePlaceholder");
  const bildeUrl  = konverterBildeUrl(g.bilde_url);
  document.getElementById("newBildeUrl").value = g.bilde_url||"";

  if (bildeUrl) {
    bildeEl.src = bildeUrl;
    bildeEl.style.display = "block";
    placeholder.style.display = "none";
    bildeEl.onerror = ()=>{ bildeEl.style.display="none"; placeholder.style.display="flex"; };
  } else {
    bildeEl.style.display = "none";
    placeholder.style.display = "flex";
  }

  // QR
  const qrEl = document.getElementById("qrCode");
  qrEl.innerHTML = "";
  const url = APP_BASE_URL + "item.html?id=" + encodeURIComponent(g.id);
  document.getElementById("qrUrl").textContent = url;
  new QRCode(qrEl, { text:url, width:190, height:190, colorDark:"#0a1628", colorLight:"#ffffff", correctLevel:QRCode.CorrectLevel.H });
}

function renderHurtigKnapper(gjeldende) {
  const btns = [
    {label:"✅ Tilgjengelig", val:"Tilgjengelig", cls:"qbtn-tilg"},
    {label:"📤 Lån ut",       val:"Utlånt",       cls:"qbtn-utlant"},
    {label:"🔧 Reparasjon",   val:"Til reparasjon",cls:"qbtn-rep"},
    {label:"❌ Tapt",          val:"Tapt",         cls:"qbtn-tapt"},
  ];
  document.getElementById("quickStatusBtns").innerHTML = btns.map(b=>`
    <button class="qbtn ${b.cls}${b.val===gjeldende?" qbtn-active":""}"
            onclick="endreStatus('${b.val}')"
            ${b.val===gjeldende?"disabled":""}>
      ${b.label}
    </button>`).join("");
}

async function endreStatus(ny) {
  if (!currentItem) return;
  if (ny==="Utlånt") {
    document.getElementById("loanTil").value   = currentItem.utlant_til||"";
    document.getElementById("loanDato").value  = currentItem.utlansdato||new Date().toISOString().split("T")[0];
    document.getElementById("loanFrist").value = currentItem.innleveringsdato||"";
    document.getElementById("loanNotater").value = currentItem.notater||"";
    document.getElementById("loanModal").classList.add("open");
    return;
  }
  const oppdatert = {...currentItem, status:ny, utlant_til:"", utlansdato:"", innleveringsdato:""};
  const {error} = await db.from("gjenstander").upsert(oppdatert,{onConflict:"id"});
  if (!error) { currentItem=oppdatert; renderItem(oppdatert); visBanner("✓ Status: "+ny,"success"); }
  else visBanner("Feil: "+error.message,"error");
}

function apneLanModal() {
  if (!currentItem) return;
  document.getElementById("loanTil").value   = currentItem.utlant_til||"";
  document.getElementById("loanDato").value  = currentItem.utlansdato||new Date().toISOString().split("T")[0];
  document.getElementById("loanFrist").value = currentItem.innleveringsdato||"";
  document.getElementById("loanNotater").value = currentItem.notater||"";
  document.getElementById("loanModal").classList.add("open");
}
function lukkLanModal() { document.getElementById("loanModal").classList.remove("open"); }

async function lagreLan() {
  const til = document.getElementById("loanTil").value.trim();
  if (!til) { visBanner("Skriv hvem som låner!","error"); return; }
  const oppdatert = {...currentItem, status:"Utlånt", utlant_til:til,
    utlansdato:document.getElementById("loanDato").value,
    innleveringsdato:document.getElementById("loanFrist").value,
    notater:document.getElementById("loanNotater").value.trim()||currentItem.notater};
  const {error} = await db.from("gjenstander").upsert(oppdatert,{onConflict:"id"});
  if (!error) { currentItem=oppdatert; lukkLanModal(); renderItem(oppdatert); visBanner("✓ Utlån registrert","success"); }
  else visBanner("Feil: "+error.message,"error");
}

function toggleBildeInput() {
  const row = document.getElementById("imageUrlRow");
  const btn = document.getElementById("addImageBtn");
  const vis = row.style.display==="none";
  row.style.display = vis ? "flex" : "none";
  btn.textContent   = vis ? "✕ Avbryt" : "➕ Legg til / endre bilde";
}

async function lagreBildeUrl() {
  const url = document.getElementById("newBildeUrl").value.trim();
  const konv = konverterBildeUrl(url);
  const oppdatert = {...currentItem, bilde_url: konv||url};
  const {error} = await db.from("gjenstander").upsert(oppdatert,{onConflict:"id"});
  if (!error) {
    currentItem=oppdatert; renderItem(oppdatert);
    document.getElementById("imageUrlRow").style.display="none";
    document.getElementById("addImageBtn").textContent="➕ Legg til / endre bilde";
    visBanner(url?"✓ Bilde oppdatert":"✓ Bilde fjernet","success");
  } else visBanner("Feil: "+error.message,"error");
}

function statusKlasse(s) {
  return {Tilgjengelig:"tilgjengelig",Utlånt:"utlant","Til reparasjon":"reparasjon",Tapt:"tapt"}[s]||"tilgjengelig";
}
function visError(msg) {
  document.getElementById("loadingState").style.display="none";
  document.getElementById("errorState").style.display="flex";
  document.getElementById("errorMsg").textContent=msg;
}
function visBanner(tekst,type="success") {
  const el=document.getElementById("banner");
  el.textContent=tekst; el.className="banner banner-"+type; el.style.display="block";
  setTimeout(()=>el.style.display="none",3000);
}

document.getElementById("loanModal").addEventListener("click",e=>{if(e.target.id==="loanModal")lukkLanModal();});
document.addEventListener("keydown",e=>{if(e.key==="Escape")lukkLanModal();});
