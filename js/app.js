// ════════════════════════════════════════════════════
// SPEIDERLAGERET — APP.JS
// ════════════════════════════════════════════════════

const KATEGORIER = ["Camping","Kjøkken","Sikkerhet","Utstyr","Navigasjon","Verktøy","Belysning","Vann","Kommunikasjon","Annet"];
const STATUSER   = ["Tilgjengelig","Utlånt","Til reparasjon","Tapt"];

let gjenstander   = [];
let filteredItems = [];
let sortField     = "id";
let sortDir       = "asc";
let editingId     = null;

// ── Bootstrap ──────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  populateSelects();
  setupListeners();
  await lastInn();
  oppdaterStats();
  displaySummary();
  setupRealtime();
});

// ── Supabase ───────────────────────────────────────────────────────────────
async function lastInn() {
  visTabelLasting(true);
  try {
    const { data, error } = await db.from("gjenstander").select("*").order("id");
    if (error) throw error;
    gjenstander = data || [];
  } catch (e) {
    visBanner("Kunne ikke laste data: " + e.message, "error");
  }
  visTabelLasting(false);
  filtrerOgVis();
}

async function lagreGjenstand(item) {
  const { error } = await db.from("gjenstander").upsert(item, { onConflict: "id" });
  if (error) { visBanner("Feil: " + error.message, "error"); return false; }
  return true;
}

async function slettGjenstandDB(id) {
  const { error } = await db.from("gjenstander").delete().eq("id", id);
  if (error) { visBanner("Feil: " + error.message, "error"); return false; }
  return true;
}

function setupRealtime() {
  db.channel("lager").on("postgres_changes", { event: "*", schema: "public", table: "gjenstander" }, async () => {
    await lastInn(); displaySummary();
  }).subscribe();
}

// ── Filter & visning ───────────────────────────────────────────────────────
function filtrerOgVis() {
  const sok     = document.getElementById("searchInput").value.toLowerCase();
  const kat     = document.getElementById("filterKategori").value;
  const stat    = document.getElementById("filterStatus").value;
  filteredItems = gjenstander.filter(g => {
    const sokMatch = !sok ||
      g.navn.toLowerCase().includes(sok) ||
      g.id.toLowerCase().includes(sok) ||
      (g.serienummer||"").toLowerCase().includes(sok) ||
      (g.utlant_til||"").toLowerCase().includes(sok) ||
      (g.hylleplassering||"").toLowerCase().includes(sok);
    return sokMatch &&
      (kat  === "Alle" || g.kategori === kat) &&
      (stat === "Alle" || g.status   === stat);
  });

  filteredItems.sort((a, b) => {
    const av = String(a[sortField]||"").toLowerCase();
    const bv = String(b[sortField]||"").toLowerCase();
    return sortDir === "asc" ? av.localeCompare(bv,"no") : bv.localeCompare(av,"no");
  });

  visTabell();
  oppdaterStats();
}

// ── Tabell ─────────────────────────────────────────────────────────────────
function visTabell() {
  const tbody = document.getElementById("itemsBody");
  tbody.innerHTML = "";

  if (!filteredItems.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">Ingen gjenstander funnet</td></tr>`;
    document.getElementById("count-shown").textContent = 0;
    document.getElementById("count-total").textContent = gjenstander.length;
    return;
  }

  filteredItems.forEach(g => {
    const tr = document.createElement("tr");
    tr.className = "item-row row-" + statusKlasse(g.status);
    tr.setAttribute("data-id", g.id);
    const safeName = g.navn.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    tr.innerHTML = `
      <td><a class="item-link mono" href="item.html?id=${encodeURIComponent(g.id)}">${g.id}</a></td>
      <td><a class="item-name-link" href="item.html?id=${encodeURIComponent(g.id)}">${g.navn}</a></td>
      <td class="col-hide-sm muted-text">${g.kategori||"—"}</td>
      <td class="col-hide-md mono muted-text">${g.serienummer||"—"}</td>
      <td>
        <select class="inline-status status-select-${statusKlasse(g.status)}"
                onchange="raskStatusEndring('${g.id}', this)">
          ${STATUSER.map(s => `<option value="${s}"${s===g.status?" selected":""}>${s}</option>`).join("")}
        </select>
      </td>
      <td class="col-hide-sm">${g.utlant_til||'<span class="dash">—</span>'}</td>
      <td class="col-hide-md mono small-text">${g.hylleplassering||'<span class="dash">—</span>'}</td>
      <td>
        <div class="actions-cell">
          <button class="btn-action btn-edit"   onclick="apneRedigerModal('${g.id}')" title="Rediger">✏️</button>
          <button class="btn-action btn-qr"     onclick="apneQrModal('${g.id}','${safeName}')" title="QR">⬛</button>
          <button class="btn-action btn-delete" onclick="bekreftSlett('${g.id}','${safeName}')">🗑️</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });

  document.getElementById("count-shown").textContent = filteredItems.length;
  document.getElementById("count-total").textContent  = gjenstander.length;
}

function oppdaterStats() {
  document.getElementById("stat-total").textContent        = gjenstander.length;
  document.getElementById("stat-tilgjengelig").textContent = gjenstander.filter(g=>g.status==="Tilgjengelig").length;
  document.getElementById("stat-utlant").textContent       = gjenstander.filter(g=>g.status==="Utlånt").length;
}

// ── Rask statusendring i tabellen ──────────────────────────────────────────
async function raskStatusEndring(id, sel) {
  const ny = sel.value;
  const g  = gjenstander.find(x => x.id === id);
  if (!g || g.status === ny) return;

  if (ny === "Utlånt" && !g.utlant_til) {
    apneRedigerModal(id);
    sel.value = g.status;
    return;
  }

  // Optimistisk oppdatering
  const tr = document.querySelector(`[data-id="${id}"]`);
  if (tr) {
    tr.className = "item-row row-" + statusKlasse(ny);
    sel.className = "inline-status status-select-" + statusKlasse(ny);
  }

  const oppdatert = { ...g, status: ny };
  if (ny !== "Utlånt") { oppdatert.utlant_til = ""; oppdatert.utlansdato = ""; oppdatert.innleveringsdato = ""; }

  const ok = await lagreGjenstand(oppdatert);
  if (ok) {
    Object.assign(g, oppdatert);
    oppdaterStats();
    displaySummary();
    visBanner("✓ Status: " + ny, "success");
  } else {
    sel.value = g.status;
    if (tr) tr.className = "item-row row-" + statusKlasse(g.status);
  }
}

// ── Rediger Modal ──────────────────────────────────────────────────────────
function apneRedigerModal(id) {
  const g = gjenstander.find(x => x.id === id);
  if (!g) return;
  editingId = id;

  document.getElementById("editModalTitle").textContent = g.navn;
  document.getElementById("editNavn").value       = g.navn || "";
  document.getElementById("editKategori").value   = g.kategori || "Annet";
  document.getElementById("editSerienummer").value= g.serienummer || "";
  document.getElementById("editHylle").value      = g.hylleplassering || "";
  document.getElementById("editBildeUrl").value   = g.bilde_url || "";
  document.getElementById("editStatus").value     = g.status || "Tilgjengelig";
  document.getElementById("editUtlantTil").value  = g.utlant_til || "";
  document.getElementById("editUtlansdato").value = g.utlansdato || "";
  document.getElementById("editInnlevering").value= g.innleveringsdato || "";
  document.getElementById("editNotater").value    = g.notater || "";

  // Vis bilde-forhåndsvisning
  oppdaterBildeForhandvis(g.bilde_url);
  toggleUtlanFelter(g.status);

  document.getElementById("editModal").classList.add("open");
  document.body.style.overflow = "hidden";
}

function lukkRedigerModal() {
  document.getElementById("editModal").classList.remove("open");
  document.body.style.overflow = "";
  editingId = null;
}

function toggleUtlanFelter(status) {
  document.getElementById("utlanSection").style.display = status === "Utlånt" ? "block" : "none";
}

function oppdaterBildeForhandvis(url) {
  const konv  = konverterBildeUrl(url);
  const prev  = document.getElementById("editBildePrev");
  const noImg = document.getElementById("editBildeIngen");
  if (konv) {
    prev.src = konv;
    prev.style.display = "block";
    noImg.style.display = "none";
    prev.onerror = () => { prev.style.display = "none"; noImg.style.display = "flex"; noImg.textContent = "⚠️ Bildet lastet ikke"; };
  } else {
    prev.style.display  = "none";
    noImg.style.display = "flex";
    noImg.textContent   = "Ingen bilde";
  }
}

async function lagreRediger() {
  if (!editingId) return;
  const btn = document.getElementById("saveEditBtn");
  btn.disabled = true; btn.textContent = "Lagrer…";

  const oppdatert = {
    id: editingId,
    navn:             document.getElementById("editNavn").value.trim(),
    kategori:         document.getElementById("editKategori").value,
    serienummer:      document.getElementById("editSerienummer").value.trim(),
    hylleplassering:  document.getElementById("editHylle").value.trim(),
    bilde_url:        konverterBildeUrl(document.getElementById("editBildeUrl").value.trim()),
    status:           document.getElementById("editStatus").value,
    utlant_til:       document.getElementById("editUtlantTil").value.trim(),
    utlansdato:       document.getElementById("editUtlansdato").value,
    innleveringsdato: document.getElementById("editInnlevering").value,
    notater:          document.getElementById("editNotater").value.trim(),
  };

  const ok = await lagreGjenstand(oppdatert);
  if (ok) {
    await lastInn();
    displaySummary();
    lukkRedigerModal();
    visBanner("✓ Lagret!", "success");
  }
  btn.disabled = false; btn.textContent = "Lagre endringer";
}

// ── Legg til ───────────────────────────────────────────────────────────────
async function leggTilGjenstander(e) {
  e.preventDefault();
  const navn   = document.getElementById("itemName").value.trim();
  const kat    = document.getElementById("itemKategori").value;
  const enhet  = document.getElementById("itemEnhet").value.trim() || "stk";
  const antall = parseInt(document.getElementById("itemAntall").value) || 1;
  const pref   = (document.getElementById("itemPrefix").value.trim() || navn.slice(0,3)).toUpperCase();
  const start  = parseInt(document.getElementById("itemStartNr").value) || 1;
  const not    = document.getElementById("itemNotater").value.trim();

  const btn = document.getElementById("addBtn");
  btn.disabled = true; btn.textContent = "Legger til…";

  const nye = Array.from({length: antall}, (_, i) => ({
    id: `${pref}-${String(start+i).padStart(2,"0")}`,
    navn, kategori: kat, enhet,
    serienummer: `${pref}-${String(start+i).padStart(3,"0")}`,
    status: "Tilgjengelig",
    utlant_til: "", utlansdato: "", innleveringsdato: "",
    hylleplassering: "", notater: not, bilde_url: "",
  }));

  const { error } = await db.from("gjenstander").upsert(nye, { onConflict: "id" });
  if (error) {
    visBanner("Feil: " + error.message, "error");
  } else {
    visBanner(`✓ ${antall} gjenstand${antall>1?"er":""} lagt til`, "success");
    document.getElementById("addItemForm").reset();
    document.getElementById("itemAntall").value = "1";
    oppdaterForhandvis();
    await lastInn(); displaySummary();
    settFane("lager");
  }
  btn.disabled = false; btn.textContent = "➕ Legg til";
}

// ── Slett ──────────────────────────────────────────────────────────────────
function bekreftSlett(id, navn) {
  document.getElementById("deleteItemName").textContent = `"${navn}" (${id})`;
  document.getElementById("deleteModal").classList.add("open");
  document.getElementById("confirmDeleteBtn").onclick = async () => {
    if (await slettGjenstandDB(id)) {
      document.getElementById("deleteModal").classList.remove("open");
      await lastInn(); displaySummary();
      visBanner("🗑️ Slettet", "success");
    }
  };
}
function lukkSlettModal() { document.getElementById("deleteModal").classList.remove("open"); }

// ── QR Modal ───────────────────────────────────────────────────────────────
function apneQrModal(id, navn) {
  document.getElementById("qrModalTitle").textContent = navn;
  const cont = document.getElementById("qrContainer");
  cont.innerHTML = "";
  const url = APP_BASE_URL + "item.html?id=" + encodeURIComponent(id);
  document.getElementById("qrUrl").textContent = url;
  new QRCode(cont, { text: url, width: 220, height: 220, colorDark: "#0a1628", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
  document.getElementById("qrModal").classList.add("open");
}
function lukkQrModal() { document.getElementById("qrModal").classList.remove("open"); document.getElementById("qrContainer").innerHTML = ""; }

// ── Sammendrag ─────────────────────────────────────────────────────────────
function displaySummary() {
  const total   = gjenstander.length;
  const tilg    = gjenstander.filter(g=>g.status==="Tilgjengelig").length;
  const utlant  = gjenstander.filter(g=>g.status==="Utlånt").length;
  const rep     = gjenstander.filter(g=>g.status==="Til reparasjon").length;
  const tapt    = gjenstander.filter(g=>g.status==="Tapt").length;
  const forfalt = gjenstander.filter(g=>g.status==="Utlånt"&&g.innleveringsdato&&new Date(g.innleveringsdato)<new Date()).length;

  document.getElementById("kpiGrid").innerHTML = [
    {icon:"📦",val:total,  label:"Totalt",        color:"#46bdc6", border:"rgba(70,189,198,0.3)"},
    {icon:"✅",val:tilg,   label:"Tilgjengelig",  color:"#34d399", border:"rgba(52,211,153,0.3)"},
    {icon:"📤",val:utlant, label:"Utlånt",        color:"#f87171", border:"rgba(248,113,113,0.3)"},
    {icon:"🔧",val:rep,    label:"Til reparasjon",color:"#fbbf24", border:"rgba(251,191,36,0.3)"},
    {icon:"❌",val:tapt,   label:"Tapt",          color:"#94a3b8", border:"rgba(148,163,184,0.3)"},
    ...(forfalt>0?[{icon:"⚠️",val:forfalt,label:"Forfalt",color:"#fb923c",border:"rgba(251,146,60,0.3)"}]:[])
  ].map(k=>`<div class="kpi-card" style="border-color:${k.border}">
    <div class="kpi-icon">${k.icon}</div>
    <div class="kpi-value" style="color:${k.color}">${k.val}</div>
    <div class="kpi-label">${k.label}</div></div>`).join("");

  // Kategoritabell
  const kb = document.getElementById("katTabell");
  kb.innerHTML = "";
  KATEGORIER.forEach(kat => {
    const items = gjenstander.filter(g=>g.kategori===kat);
    if (!items.length) return;
    const kT=items.filter(g=>g.status==="Tilgjengelig").length;
    const kU=items.filter(g=>g.status==="Utlånt").length;
    const kR=items.filter(g=>g.status==="Til reparasjon").length;
    const kL=items.filter(g=>g.status==="Tapt").length;
    const pst=Math.round(kT/items.length*100);
    kb.innerHTML+=`<tr>
      <td class="kat-navn">${kat}</td>
      <td class="center">${items.length}</td>
      <td class="center green-text fw">${kT}</td>
      <td class="center">${kU>0?`<span class="red-text fw">${kU}</span>`:"0"}</td>
      <td class="center">${kR>0?`<span class="orange-text">${kR}</span>`:"0"}</td>
      <td class="center muted-text">${kL}</td>
      <td><div class="andel-row"><div class="andel-bar"><div class="andel-fill" style="width:${pst}%;background:${pst>80?"#34d399":pst>50?"#fbbf24":"#f87171"}"></div></div><span class="andel-pst muted-text">${pst}%</span></div></td>
    </tr>`;
  });

  // Utlåntliste
  const ub = document.getElementById("utlantTabell");
  const ul = gjenstander.filter(g=>g.status==="Utlånt");
  document.getElementById("utlant-count").textContent = ul.length;
  if (!ul.length) {
    ub.innerHTML=`<tr><td colspan="7" class="empty-row">Ingen utlånte gjenstander ✅</td></tr>`;
  } else {
    ub.innerHTML = ul.map(g => {
      const f=g.innleveringsdato&&new Date(g.innleveringsdato)<new Date();
      return `<tr class="${f?"row-forfalt":""}">
        <td class="mono"><a class="item-link" href="item.html?id=${g.id}">${g.id}</a></td>
        <td>${g.navn}</td><td>${g.utlant_til||"—"}</td>
        <td class="mono small-text">${g.utlansdato||"—"}</td>
        <td class="mono small-text ${f?"orange-text fw":""}">${g.innleveringsdato||"—"}${f?" ⚠️":""}</td>
        <td>${f?'<span class="badge-forfalt">FORFALT</span>':'<span class="badge-ok">OK</span>'}</td>
        <td><button class="btn-action btn-edit" onclick="apneRedigerModal('${g.id}')">✏️</button></td>
      </tr>`;
    }).join("");
  }
}

// ── Hjelpere ───────────────────────────────────────────────────────────────
function statusKlasse(s) {
  return {Tilgjengelig:"tilgjengelig",Utlånt:"utlant","Til reparasjon":"reparasjon",Tapt:"tapt"}[s]||"tilgjengelig";
}

function visTabelLasting(v) {
  if (v) document.getElementById("itemsBody").innerHTML = `<tr><td colspan="8" class="empty-row loading-text">⟳ Laster…</td></tr>`;
}

function visBanner(tekst, type="success") {
  const el = document.getElementById("banner");
  el.textContent = tekst;
  el.className = "banner banner-" + type;
  el.style.display = "block";
  setTimeout(()=>el.style.display="none", 3000);
}

function settFane(navn) {
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.tab===navn));
  document.querySelectorAll(".tab-content").forEach(c=>c.classList.toggle("active",c.id===navn));
  if (navn==="sammendrag") displaySummary();
}

function setSorter(felt) {
  sortDir = sortField===felt && sortDir==="asc" ? "desc" : "asc";
  sortField = felt;
  filtrerOgVis();
}

function oppdaterForhandvis() {
  const navn  = document.getElementById("itemName")?.value||"";
  const pref  = (document.getElementById("itemPrefix")?.value||navn.slice(0,3)||"GJN").toUpperCase();
  const ant   = parseInt(document.getElementById("itemAntall")?.value)||1;
  const start = parseInt(document.getElementById("itemStartNr")?.value)||1;
  const vis   = Array.from({length:Math.min(3,ant)},(_,i)=>`${pref}-${String(start+i).padStart(3,"0")}`);
  const el    = document.getElementById("previewText");
  if (el) el.textContent = vis.join(", ")+(ant>3?` … (${ant} totalt)`:"");
}

function populateSelects() {
  ["filterKategori","itemKategori","editKategori"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isFilter = id==="filterKategori";
    el.innerHTML = isFilter ? '<option value="Alle">Alle kategorier</option>' : "";
    KATEGORIER.forEach(k=>el.innerHTML+=`<option value="${k}">${k}</option>`);
  });
}

function setupListeners() {
  document.getElementById("searchInput").addEventListener("input", filtrerOgVis);
  document.getElementById("filterKategori")?.addEventListener("change", filtrerOgVis);
  document.getElementById("filterStatus")?.addEventListener("change", filtrerOgVis);

  document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",e=>settFane(e.currentTarget.dataset.tab)));
  document.getElementById("addItemForm").addEventListener("submit", leggTilGjenstander);
  ["itemName","itemPrefix","itemAntall","itemStartNr"].forEach(id=>document.getElementById(id)?.addEventListener("input",oppdaterForhandvis));

  document.getElementById("editStatus").addEventListener("change",e=>toggleUtlanFelter(e.target.value));
  document.getElementById("editBildeUrl").addEventListener("input",e=>oppdaterBildeForhandvis(e.target.value));

  // Lukk modaler ved klikk utenfor
  ["editModal","qrModal","deleteModal"].forEach(id=>
    document.getElementById(id).addEventListener("click",e=>{
      if(e.target.id===id){ lukkRedigerModal(); lukkQrModal(); lukkSlettModal(); }
    }));
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){lukkRedigerModal();lukkQrModal();lukkSlettModal();}});

  oppdaterForhandvis();
}

// ── Bildeopplasting til Supabase Storage ───────────────────────────────────
async function lastOppBilde(input) {
  const fil = input.files[0];
  if (!fil) return;

  const statusEl = document.getElementById("bildeUploadStatus");
  statusEl.style.display = "block";
  statusEl.className = "bilde-upload-status uploading";
  statusEl.textContent = "⟳ Laster opp " + fil.name + "…";

  // Lag unikt filnavn
  const ext      = fil.name.split('.').pop();
  const filnavn  = `hylle-${editingId || 'item'}-${Date.now()}.${ext}`;

  try {
    const { data, error } = await db.storage
      .from("bilder")
      .upload(filnavn, fil, { upsert: true, contentType: fil.type });

    if (error) throw error;

    // Hent offentlig URL
    const { data: urlData } = db.storage.from("bilder").getPublicUrl(filnavn);
    const url = urlData.publicUrl;

    document.getElementById("editBildeUrl").value = url;
    oppdaterBildeForhandvis(url);

    statusEl.className = "bilde-upload-status success";
    statusEl.textContent = "✓ Bilde lastet opp!";
    setTimeout(() => statusEl.style.display = "none", 3000);
  } catch (e) {
    statusEl.className = "bilde-upload-status feil";
    statusEl.textContent = "❌ Feil: " + e.message + " — Se guide for å aktivere Storage";
  }

  input.value = "";
}
async function lagreGjenstand(item) {
  const { error } = await db.from("gjenstander").upsert(item, { onConflict: "id" });
  if (error) { visBanner("Feil: " + error.message, "error"); return false; }
  return true;
}

async function slettGjenstandDB(id) {
  const { error } = await db.from("gjenstander").delete().eq("id", id);
  if (error) { visBanner("Feil: " + error.message, "error"); return false; }
  return true;
}

function setupRealtime() {
  db.channel("lager").on("postgres_changes", { event: "*", schema: "public", table: "gjenstander" }, async () => {
    await lastInn(); displaySummary();
  }).subscribe();
}

// ── Filter & visning ───────────────────────────────────────────────────────
function filtrerOgVis() {
  const sok     = document.getElementById("searchInput").value.toLowerCase();
  const kat     = document.getElementById("filterKategori").value;
  const stat    = document.getElementById("filterStatus").value;
  const hylle   = document.getElementById("filterHylle").value.toLowerCase();
  const utlant  = document.getElementById("filterUtlant").value.toLowerCase();

  filteredItems = gjenstander.filter(g => {
    const sokMatch = !sok ||
      g.navn.toLowerCase().includes(sok) ||
      g.id.toLowerCase().includes(sok) ||
      (g.serienummer||"").toLowerCase().includes(sok) ||
      (g.utlant_til||"").toLowerCase().includes(sok) ||
      (g.hylleplassering||"").toLowerCase().includes(sok);
    const hylleMatch  = !hylle  || (g.hylleplassering||"").toLowerCase().includes(hylle);
    const utlantMatch = !utlant || (g.utlant_til||"").toLowerCase().includes(utlant);
    return sokMatch &&
      hylleMatch && utlantMatch &&
      (kat  === "Alle" || g.kategori === kat) &&
      (stat === "Alle" || g.status   === stat);
  });

  filteredItems.sort((a, b) => {
    const av = String(a[sortField]||"").toLowerCase();
    const bv = String(b[sortField]||"").toLowerCase();
    return sortDir === "asc" ? av.localeCompare(bv,"no") : bv.localeCompare(av,"no");
  });

  visTabell();
  oppdaterStats();
}

// ── Tabell ─────────────────────────────────────────────────────────────────
function visTabell() {
  const tbody = document.getElementById("itemsBody");
  tbody.innerHTML = "";

  if (!filteredItems.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">Ingen gjenstander funnet</td></tr>`;
    document.getElementById("count-shown").textContent = 0;
    document.getElementById("count-total").textContent = gjenstander.length;
    return;
  }

  filteredItems.forEach(g => {
    const tr = document.createElement("tr");
    tr.className = "item-row row-" + statusKlasse(g.status);
    tr.setAttribute("data-id", g.id);
    const safeName = g.navn.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    tr.innerHTML = `
      <td><a class="item-link mono" href="item.html?id=${encodeURIComponent(g.id)}">${g.id}</a></td>
      <td><a class="item-name-link" href="item.html?id=${encodeURIComponent(g.id)}">${g.navn}</a></td>
      <td class="col-hide-sm muted-text">${g.kategori||"—"}</td>
      <td class="col-hide-md mono muted-text">${g.serienummer||"—"}</td>
      <td>
        <select class="inline-status status-select-${statusKlasse(g.status)}"
                onchange="raskStatusEndring('${g.id}', this)">
          ${STATUSER.map(s => `<option value="${s}"${s===g.status?" selected":""}>${s}</option>`).join("")}
        </select>
      </td>
      <td class="col-hide-sm">${g.utlant_til||'<span class="dash">—</span>'}</td>
      <td class="col-hide-md mono small-text">${g.hylleplassering||'<span class="dash">—</span>'}</td>
      <td>
        <div class="actions-cell">
          <button class="btn-action btn-edit"   onclick="apneRedigerModal('${g.id}')" title="Rediger">✏️</button>
          <button class="btn-action btn-qr"     onclick="apneQrModal('${g.id}','${safeName}')" title="QR">⬛</button>
          <button class="btn-action btn-delete" onclick="bekreftSlett('${g.id}','${safeName}')">🗑️</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });

  document.getElementById("count-shown").textContent = filteredItems.length;
  document.getElementById("count-total").textContent  = gjenstander.length;
}

function oppdaterStats() {
  document.getElementById("stat-total").textContent        = gjenstander.length;
  document.getElementById("stat-tilgjengelig").textContent = gjenstander.filter(g=>g.status==="Tilgjengelig").length;
  document.getElementById("stat-utlant").textContent       = gjenstander.filter(g=>g.status==="Utlånt").length;
}

// ── Rask statusendring i tabellen ──────────────────────────────────────────
async function raskStatusEndring(id, sel) {
  const ny = sel.value;
  const g  = gjenstander.find(x => x.id === id);
  if (!g || g.status === ny) return;

  if (ny === "Utlånt" && !g.utlant_til) {
    apneRedigerModal(id);
    sel.value = g.status;
    return;
  }

  // Optimistisk oppdatering
  const tr = document.querySelector(`[data-id="${id}"]`);
  if (tr) {
    tr.className = "item-row row-" + statusKlasse(ny);
    sel.className = "inline-status status-select-" + statusKlasse(ny);
  }

  const oppdatert = { ...g, status: ny };
  if (ny !== "Utlånt") { oppdatert.utlant_til = ""; oppdatert.utlansdato = ""; oppdatert.innleveringsdato = ""; }

  const ok = await lagreGjenstand(oppdatert);
  if (ok) {
    Object.assign(g, oppdatert);
    oppdaterStats();
    displaySummary();
    visBanner("✓ Status: " + ny, "success");
  } else {
    sel.value = g.status;
    if (tr) tr.className = "item-row row-" + statusKlasse(g.status);
  }
}

// ── Rediger Modal ──────────────────────────────────────────────────────────
function apneRedigerModal(id) {
  const g = gjenstander.find(x => x.id === id);
  if (!g) return;
  editingId = id;

  document.getElementById("editModalTitle").textContent = g.navn;
  document.getElementById("editNavn").value       = g.navn || "";
  document.getElementById("editKategori").value   = g.kategori || "Annet";
  document.getElementById("editSerienummer").value= g.serienummer || "";
  document.getElementById("editHylle").value      = g.hylleplassering || "";
  document.getElementById("editBildeUrl").value   = g.bilde_url || "";
  document.getElementById("editStatus").value     = g.status || "Tilgjengelig";
  document.getElementById("editUtlantTil").value  = g.utlant_til || "";
  document.getElementById("editUtlansdato").value = g.utlansdato || "";
  document.getElementById("editInnlevering").value= g.innleveringsdato || "";
  document.getElementById("editNotater").value    = g.notater || "";

  // Vis bilde-forhåndsvisning
  oppdaterBildeForhandvis(g.bilde_url);
  toggleUtlanFelter(g.status);

  document.getElementById("editModal").classList.add("open");
  document.body.style.overflow = "hidden";
}

function lukkRedigerModal() {
  document.getElementById("editModal").classList.remove("open");
  document.body.style.overflow = "";
  editingId = null;
}

function toggleUtlanFelter(status) {
  document.getElementById("utlanSection").style.display = status === "Utlånt" ? "block" : "none";
}

function oppdaterBildeForhandvis(url) {
  const konv  = konverterBildeUrl(url);
  const prev  = document.getElementById("editBildePrev");
  const noImg = document.getElementById("editBildeIngen");
  if (konv) {
    prev.src = konv;
    prev.style.display = "block";
    noImg.style.display = "none";
    prev.onerror = () => { prev.style.display = "none"; noImg.style.display = "flex"; noImg.textContent = "⚠️ Bildet lastet ikke"; };
  } else {
    prev.style.display  = "none";
    noImg.style.display = "flex";
    noImg.textContent   = "Ingen bilde";
  }
}

async function lagreRediger() {
  if (!editingId) return;
  const btn = document.getElementById("saveEditBtn");
  btn.disabled = true; btn.textContent = "Lagrer…";

  const oppdatert = {
    id: editingId,
    navn:             document.getElementById("editNavn").value.trim(),
    kategori:         document.getElementById("editKategori").value,
    serienummer:      document.getElementById("editSerienummer").value.trim(),
    hylleplassering:  document.getElementById("editHylle").value.trim(),
    bilde_url:        konverterBildeUrl(document.getElementById("editBildeUrl").value.trim()),
    status:           document.getElementById("editStatus").value,
    utlant_til:       document.getElementById("editUtlantTil").value.trim(),
    utlansdato:       document.getElementById("editUtlansdato").value,
    innleveringsdato: document.getElementById("editInnlevering").value,
    notater:          document.getElementById("editNotater").value.trim(),
  };

  const ok = await lagreGjenstand(oppdatert);
  if (ok) {
    await lastInn();
    displaySummary();
    lukkRedigerModal();
    visBanner("✓ Lagret!", "success");
  }
  btn.disabled = false; btn.textContent = "Lagre endringer";
}

// ── Legg til ───────────────────────────────────────────────────────────────
async function leggTilGjenstander(e) {
  e.preventDefault();
  const navn   = document.getElementById("itemName").value.trim();
  const kat    = document.getElementById("itemKategori").value;
  const enhet  = document.getElementById("itemEnhet").value.trim() || "stk";
  const antall = parseInt(document.getElementById("itemAntall").value) || 1;
  const pref   = (document.getElementById("itemPrefix").value.trim() || navn.slice(0,3)).toUpperCase();
  const start  = parseInt(document.getElementById("itemStartNr").value) || 1;
  const not    = document.getElementById("itemNotater").value.trim();

  const btn = document.getElementById("addBtn");
  btn.disabled = true; btn.textContent = "Legger til…";

  const nye = Array.from({length: antall}, (_, i) => ({
    id: `${pref}-${String(start+i).padStart(2,"0")}`,
    navn, kategori: kat, enhet,
    serienummer: `${pref}-${String(start+i).padStart(3,"0")}`,
    status: "Tilgjengelig",
    utlant_til: "", utlansdato: "", innleveringsdato: "",
    hylleplassering: "", notater: not, bilde_url: "",
  }));

  const { error } = await db.from("gjenstander").upsert(nye, { onConflict: "id" });
  if (error) {
    visBanner("Feil: " + error.message, "error");
  } else {
    visBanner(`✓ ${antall} gjenstand${antall>1?"er":""} lagt til`, "success");
    document.getElementById("addItemForm").reset();
    document.getElementById("itemAntall").value = "1";
    oppdaterForhandvis();
    await lastInn(); displaySummary();
    settFane("lager");
  }
  btn.disabled = false; btn.textContent = "➕ Legg til";
}

// ── Slett ──────────────────────────────────────────────────────────────────
function bekreftSlett(id, navn) {
  document.getElementById("deleteItemName").textContent = `"${navn}" (${id})`;
  document.getElementById("deleteModal").classList.add("open");
  document.getElementById("confirmDeleteBtn").onclick = async () => {
    if (await slettGjenstandDB(id)) {
      document.getElementById("deleteModal").classList.remove("open");
      await lastInn(); displaySummary();
      visBanner("🗑️ Slettet", "success");
    }
  };
}
function lukkSlettModal() { document.getElementById("deleteModal").classList.remove("open"); }

// ── QR Modal ───────────────────────────────────────────────────────────────
function apneQrModal(id, navn) {
  document.getElementById("qrModalTitle").textContent = navn;
  const cont = document.getElementById("qrContainer");
  cont.innerHTML = "";
  const url = APP_BASE_URL + "item.html?id=" + encodeURIComponent(id);
  document.getElementById("qrUrl").textContent = url;
  new QRCode(cont, { text: url, width: 220, height: 220, colorDark: "#0a1628", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
  document.getElementById("qrModal").classList.add("open");
}
function lukkQrModal() { document.getElementById("qrModal").classList.remove("open"); document.getElementById("qrContainer").innerHTML = ""; }

// ── Sammendrag ─────────────────────────────────────────────────────────────
function displaySummary() {
  const total   = gjenstander.length;
  const tilg    = gjenstander.filter(g=>g.status==="Tilgjengelig").length;
  const utlant  = gjenstander.filter(g=>g.status==="Utlånt").length;
  const rep     = gjenstander.filter(g=>g.status==="Til reparasjon").length;
  const tapt    = gjenstander.filter(g=>g.status==="Tapt").length;
  const forfalt = gjenstander.filter(g=>g.status==="Utlånt"&&g.innleveringsdato&&new Date(g.innleveringsdato)<new Date()).length;

  document.getElementById("kpiGrid").innerHTML = [
    {icon:"📦",val:total,  label:"Totalt",        color:"#46bdc6", border:"rgba(70,189,198,0.3)"},
    {icon:"✅",val:tilg,   label:"Tilgjengelig",  color:"#34d399", border:"rgba(52,211,153,0.3)"},
    {icon:"📤",val:utlant, label:"Utlånt",        color:"#f87171", border:"rgba(248,113,113,0.3)"},
    {icon:"🔧",val:rep,    label:"Til reparasjon",color:"#fbbf24", border:"rgba(251,191,36,0.3)"},
    {icon:"❌",val:tapt,   label:"Tapt",          color:"#94a3b8", border:"rgba(148,163,184,0.3)"},
    ...(forfalt>0?[{icon:"⚠️",val:forfalt,label:"Forfalt",color:"#fb923c",border:"rgba(251,146,60,0.3)"}]:[])
  ].map(k=>`<div class="kpi-card" style="border-color:${k.border}">
    <div class="kpi-icon">${k.icon}</div>
    <div class="kpi-value" style="color:${k.color}">${k.val}</div>
    <div class="kpi-label">${k.label}</div></div>`).join("");

  // Kategoritabell
  const kb = document.getElementById("katTabell");
  kb.innerHTML = "";
  KATEGORIER.forEach(kat => {
    const items = gjenstander.filter(g=>g.kategori===kat);
    if (!items.length) return;
    const kT=items.filter(g=>g.status==="Tilgjengelig").length;
    const kU=items.filter(g=>g.status==="Utlånt").length;
    const kR=items.filter(g=>g.status==="Til reparasjon").length;
    const kL=items.filter(g=>g.status==="Tapt").length;
    const pst=Math.round(kT/items.length*100);
    kb.innerHTML+=`<tr>
      <td class="kat-navn">${kat}</td>
      <td class="center">${items.length}</td>
      <td class="center green-text fw">${kT}</td>
      <td class="center">${kU>0?`<span class="red-text fw">${kU}</span>`:"0"}</td>
      <td class="center">${kR>0?`<span class="orange-text">${kR}</span>`:"0"}</td>
      <td class="center muted-text">${kL}</td>
      <td><div class="andel-row"><div class="andel-bar"><div class="andel-fill" style="width:${pst}%;background:${pst>80?"#34d399":pst>50?"#fbbf24":"#f87171"}"></div></div><span class="andel-pst muted-text">${pst}%</span></div></td>
    </tr>`;
  });

  // Utlåntliste
  const ub = document.getElementById("utlantTabell");
  const ul = gjenstander.filter(g=>g.status==="Utlånt");
  document.getElementById("utlant-count").textContent = ul.length;
  if (!ul.length) {
    ub.innerHTML=`<tr><td colspan="7" class="empty-row">Ingen utlånte gjenstander ✅</td></tr>`;
  } else {
    ub.innerHTML = ul.map(g => {
      const f=g.innleveringsdato&&new Date(g.innleveringsdato)<new Date();
      return `<tr class="${f?"row-forfalt":""}">
        <td class="mono"><a class="item-link" href="item.html?id=${g.id}">${g.id}</a></td>
        <td>${g.navn}</td><td>${g.utlant_til||"—"}</td>
        <td class="mono small-text">${g.utlansdato||"—"}</td>
        <td class="mono small-text ${f?"orange-text fw":""}">${g.innleveringsdato||"—"}${f?" ⚠️":""}</td>
        <td>${f?'<span class="badge-forfalt">FORFALT</span>':'<span class="badge-ok">OK</span>'}</td>
        <td><button class="btn-action btn-edit" onclick="apneRedigerModal('${g.id}')">✏️</button></td>
      </tr>`;
    }).join("");
  }
}

// ── Hjelpere ───────────────────────────────────────────────────────────────
function statusKlasse(s) {
  return {Tilgjengelig:"tilgjengelig",Utlånt:"utlant","Til reparasjon":"reparasjon",Tapt:"tapt"}[s]||"tilgjengelig";
}

function visTabelLasting(v) {
  if (v) document.getElementById("itemsBody").innerHTML = `<tr><td colspan="8" class="empty-row loading-text">⟳ Laster…</td></tr>`;
}

function visBanner(tekst, type="success") {
  const el = document.getElementById("banner");
  el.textContent = tekst;
  el.className = "banner banner-" + type;
  el.style.display = "block";
  setTimeout(()=>el.style.display="none", 3000);
}

function settFane(navn) {
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.tab===navn));
  document.querySelectorAll(".tab-content").forEach(c=>c.classList.toggle("active",c.id===navn));
  if (navn==="sammendrag") displaySummary();
}

function setSorter(felt) {
  sortDir = sortField===felt && sortDir==="asc" ? "desc" : "asc";
  sortField = felt;
  filtrerOgVis();
}

function oppdaterForhandvis() {
  const navn  = document.getElementById("itemName")?.value||"";
  const pref  = (document.getElementById("itemPrefix")?.value||navn.slice(0,3)||"GJN").toUpperCase();
  const ant   = parseInt(document.getElementById("itemAntall")?.value)||1;
  const start = parseInt(document.getElementById("itemStartNr")?.value)||1;
  const vis   = Array.from({length:Math.min(3,ant)},(_,i)=>`${pref}-${String(start+i).padStart(3,"0")}`);
  const el    = document.getElementById("previewText");
  if (el) el.textContent = vis.join(", ")+(ant>3?` … (${ant} totalt)`:"");
}

function populateSelects() {
  ["filterKategori","itemKategori","editKategori"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isFilter = id==="filterKategori";
    el.innerHTML = isFilter ? '<option value="Alle">Alle kategorier</option>' : "";
    KATEGORIER.forEach(k=>el.innerHTML+=`<option value="${k}">${k}</option>`);
  });
}

function setupListeners() {
  ["searchInput","filterKategori","filterStatus","filterHylle","filterUtlant"].forEach(id =>
    document.getElementById(id)?.addEventListener("input", filtrerOgVis));
  document.getElementById("filterKategori")?.addEventListener("change", filtrerOgVis);
  document.getElementById("filterStatus")?.addEventListener("change", filtrerOgVis);

  document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",e=>settFane(e.currentTarget.dataset.tab)));
  document.getElementById("addItemForm").addEventListener("submit", leggTilGjenstander);
  ["itemName","itemPrefix","itemAntall","itemStartNr"].forEach(id=>document.getElementById(id)?.addEventListener("input",oppdaterForhandvis));

  document.getElementById("editStatus").addEventListener("change",e=>toggleUtlanFelter(e.target.value));
  document.getElementById("editBildeUrl").addEventListener("input",e=>oppdaterBildeForhandvis(e.target.value));

  // Lukk modaler ved klikk utenfor
  ["editModal","qrModal","deleteModal"].forEach(id=>
    document.getElementById(id).addEventListener("click",e=>{
      if(e.target.id===id){ lukkRedigerModal(); lukkQrModal(); lukkSlettModal(); }
    }));
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){lukkRedigerModal();lukkQrModal();lukkSlettModal();}});

  oppdaterForhandvis();
}
