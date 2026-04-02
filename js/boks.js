let currentBoks = null;
let boksGjenstander = [];
let aktiveUtlan = [];

document.addEventListener(“DOMContentLoaded”, async () => {
const id = new URLSearchParams(location.search).get(“id”);
if (!id) { visError(“Ingen boks-ID i URL.”); return; }

const timeout = setTimeout(() => {
if (document.getElementById(“loadingState”).style.display !== “none”) {
visError(“Tidsavbrudd — sjekk nettverkstilkoblingen og at boksen finnes i databasen.”);
}
}, 8000);

await lastInnBoks(id);
clearTimeout(timeout);

try {
db.channel(“boks-” + id)
.on(“postgres_changes”, { event: “*”, schema: “public”, table: “gjenstander” }, () => lastInnBoks(id))
.on(“postgres_changes”, { event: “*”, schema: “public”, table: “utlanslogg” },  () => lastInnBoks(id))
.subscribe();
} catch(e) { console.warn(“Realtime ikke tilgjengelig:”, e); }
});

async function lastInnBoks(id) {
try {
const { data: boks, error: bErr } = await db.from(“bokser”).select(”*”).eq(“id”, id).single();
if (bErr || !boks) { visError(“Fant ingen boks med ID: “ + id + (bErr ? “ — “ + bErr.message : “”)); return; }
currentBoks = boks;

```
const { data: gjenstander } = await db.from("gjenstander").select("*").eq("boks_id", id);
boksGjenstander = gjenstander || [];

const gIds = boksGjenstander.map(g => g.id);
let utlan = [];
if (gIds.length > 0) {
  const { data } = await db.from("utlanslogg")
    .select("*").in("gjenstand_id", gIds).eq("status", "aktiv")
    .order("opprettet", { ascending: false });
  utlan = data || [];
}
aktiveUtlan = utlan;
renderBoks();
```

} catch (e) {
visError(“Feil ved lasting: “ + e.message);
}
}

// ── Grupper gjenstander per navn ──────────────────────────────────────────
// Teller status-feltet på individuelle rader — IKKE antall_totalt/antall_utlant
function lagGrupper() {
const map = new Map();
for (const g of boksGjenstander) {
if (!map.has(g.navn)) map.set(g.navn, { tilgj: 0, utlant: 0, alle: [] });
const gr = map.get(g.navn);
gr.alle.push(g);
if (g.status === “Tilgjengelig”) gr.tilgj++;
else if (g.status === “Utlånt”)  gr.utlant++;
}
return map;
}

let _innholdSortFelt = “navn”;
let _innholdSortDir  = “asc”;
let _utlanSortFelt   = “navn”;
let _utlanSortDir    = “asc”;

function sorterInnhold(felt) {
_innholdSortDir  = _innholdSortFelt === felt && _innholdSortDir === “asc” ? “desc” : “asc”;
_innholdSortFelt = felt;
renderBoks();
}

function sorterUtlan(felt) {
_utlanSortDir  = _utlanSortFelt === felt && _utlanSortDir === “asc” ? “desc” : “asc”;
_utlanSortFelt = felt;
renderBoks();
}

function renderBoks() {
document.getElementById(“loadingState”).style.display = “none”;
document.getElementById(“boksContent”).style.display  = “block”;
document.title = currentBoks.navn + “ – 1. Haugerud”;

document.getElementById(“boksNavn”).textContent        = currentBoks.navn;
document.getElementById(“boksHylle”).textContent       = currentBoks.hylleplassering ? “📍 “ + currentBoks.hylleplassering : “”;
document.getElementById(“boksBeskrivelse”).textContent  = currentBoks.beskrivelse || “”;
document.getElementById(“boksIdInfo”).textContent      = currentBoks.id;
document.getElementById(“boksHylleInfo”).textContent   = currentBoks.hylleplassering || “—”;
document.getElementById(“boksBeskInfo”).textContent    = currentBoks.beskrivelse || “—”;

// Bilde
const bUrl = konverterBildeUrl(currentBoks.bilde_url);
const bImg = document.getElementById(“boksBilde”);
const bPh  = document.getElementById(“bildePlaceholder”);
document.getElementById(“boksBildeUrl”).value = currentBoks.bilde_url || “”;
if (bUrl) {
bImg.src = bUrl; bImg.style.display = “block”; bPh.style.display = “none”;
bImg.onerror = () => { bImg.style.display = “none”; bPh.style.display = “flex”; };
} else {
bImg.style.display = “none”; bPh.style.display = “flex”;
}

// Teller i header
const grupper = lagGrupper();
const totTilgj  = boksGjenstander.filter(g => g.status === “Tilgjengelig”).length;
const totUtlant = boksGjenstander.filter(g => g.status === “Utlånt”).length;
document.getElementById(“boksTeller”).textContent =
grupper.size + “ typer · “ + boksGjenstander.length + “ stk · “ +
totTilgj + “ ledig” + (totUtlant ? “ · “ + totUtlant + “ utlånt” : “”);

// QR-kode
const qrEl = document.getElementById(“boksQrCode”);
if (qrEl) {
qrEl.innerHTML = “”;
const boksUrl = APP_BASE_URL + “boks.html?id=” + enc(currentBoks.id);
new QRCode(qrEl, { text: boksUrl, width: 160, height: 160, colorDark: “#000000”, colorLight: “#ffffff”, correctLevel: QRCode.CorrectLevel.H });
}

// ── Innhold-tabell: én rad per navnegruppe, sortert ──────────────────
const tbody = document.getElementById(“boksInnhold”);
if (!grupper.size) {
tbody.innerHTML = ‘<tr><td colspan="5" class="empty-row">Ingen gjenstander i boksen</td></tr>’;
} else {
const innholdListe = […grupper.entries()].map(([navn, gr]) => ({ navn, …gr }));
innholdListe.sort((a, b) => {
const av = _innholdSortFelt === “navn” ? a.navn : _innholdSortFelt === “tilgj” ? a.tilgj : _innholdSortFelt === “utlant” ? a.utlant : a.alle.length;
const bv = _innholdSortFelt === “navn” ? b.navn : _innholdSortFelt === “tilgj” ? b.tilgj : _innholdSortFelt === “utlant” ? b.utlant : b.alle.length;
const cmp = typeof av === “string” ? av.localeCompare(bv, “no”) : av - bv;
return _innholdSortDir === “asc” ? cmp : -cmp;
});
tbody.innerHTML = innholdListe.map(gr => {
const sn = gr.navn.replace(/’/g, “\’”);
return `<tr> <td style="padding-left:14px"><a class="item-name-link" href="item.html?id=${enc(gr.alle[0].id)}">${gr.navn}</a></td> <td class="tc green-text fw">${gr.tilgj}</td> <td class="tc ${gr.utlant > 0 ? "red-text" : "muted-text"}">${gr.utlant}</td> <td class="tc muted-text">${gr.alle.length}</td> <td class="tc" style="white-space:nowrap"> <button class="btn-action btn-edit" style="padding:9px 13px;font-size:17px;min-width:42px" onclick="apneUtlanForNavn('${sn}')">📤</button> <button class="btn-action btn-qr"  style="padding:9px 13px;font-size:17px;min-width:42px" onclick="apneLeverForNavn('${sn}')">📥</button> </td> </tr>`;
}).join(””);
}

// ── Aktive utlån, sortert ─────────────────────────────────────────────
const utlånte = boksGjenstander.filter(g => g.status === “Utlånt”);
document.getElementById(“aktivUtlanCount”).textContent = utlånte.length;
const uTbody = document.getElementById(“boksUtlanslogg”);

if (!utlånte.length) {
uTbody.innerHTML = ‘<tr><td colspan="4" class="empty-row">Ingen aktive utlån ✅</td></tr>’;
} else {
const utMap = new Map();
for (const g of utlånte) {
const key = (g.navn || “”) + “|” + (g.utlant_til || “”);
if (!utMap.has(key)) utMap.set(key, { navn: g.navn, utlant_til: g.utlant_til || “—”, innleveringsdato: g.innleveringsdato || “—”, ids: [], antall: 0 });
const gr = utMap.get(key);
gr.ids.push(g.id);
gr.antall++;
}
const utListe = […utMap.values()];
utListe.sort((a, b) => {
const av = _utlanSortFelt === “navn” ? a.navn : _utlanSortFelt === “antall” ? a.antall : a.innleveringsdato;
const bv = _utlanSortFelt === “navn” ? b.navn : _utlanSortFelt === “antall” ? b.antall : b.innleveringsdato;
const cmp = typeof av === “number” ? av - bv : String(av).localeCompare(String(bv), “no”);
return _utlanSortDir === “asc” ? cmp : -cmp;
});

```
uTbody.innerHTML = utListe.map(gr => {
  const forfalt = gr.innleveringsdato !== "—" && new Date(gr.innleveringsdato) < new Date();
  const idStr = gr.ids.join(",");
  const fristVis = formatDato(gr.innleveringsdato);
  return `<tr class="${forfalt ? "row-forfalt" : ""}">
    <td style="padding-left:16px">
      <div style="font-weight:600;font-size:13px">${gr.navn}</div>
      <div style="font-size:11px;color:var(--muted)">${gr.utlant_til}</div>
    </td>
    <td class="tc fw">${gr.antall}</td>
    <td class="tc mono small-text ${forfalt ? "orange-text fw" : ""}" style="white-space:nowrap">${fristVis}${forfalt ? " ⚠️" : ""}</td>
    <td class="tc" style="white-space:nowrap">
      <button class="btn-action btn-qr"  style="padding:9px 13px;font-size:16px;min-width:42px" onclick="leverGjenstander('${idStr}', ${gr.antall})" title="Lever inn alle">✅</button>
      <button class="btn-action btn-edit" style="padding:9px 13px;font-size:16px;min-width:42px" onclick="apneLeverDelvis('${idStr}', ${gr.antall})" title="Lever inn delvis">✏️</button>
    </td>
  </tr>`;
}).join("");
```

}
}

// ── Utlån ──────────────────────────────────────────────────────────────────
function apneUtlan()               { byggUtlanModal(null); }
function apneUtlanForNavn(navn)    { byggUtlanModal(navn); }
function apneUtlanForGjenstand(id) {
const g = boksGjenstander.find(x => x.id === id);
byggUtlanModal(g ? g.navn : null);
}

function byggUtlanModal(forhåndsNavn) {
const grupper = lagGrupper();
const tilgjGrupper = […grupper.entries()].filter(([, gr]) => gr.tilgj > 0);
if (!tilgjGrupper.length) { visBanner(“Ingenting tilgjengelig å låne ut”, “error”); return; }

const html = `<div class="form-field"> <label>Gjenstand</label> <select id="utlanNavn" class="filter-input" style="width:100%" onchange="oppdaterMaks()"> ${tilgjGrupper.map(([navn, gr]) =>`<option value=”${navn}” data-maks=”${gr.tilgj}”${navn === forhåndsNavn ? “ selected” : “”}>${navn} (${gr.tilgj} tilgj.)</option>` ).join("")} </select> </div> <div class="form-field"> <label>Antall</label> <input type="number" id="utlanAntall" value="1" min="1" style="width:100%"> </div> <div class="form-field"> <label>Låntaker *</label> <input type="text" id="utlanTil" placeholder="Navn eller gruppe" style="width:100%"> </div> <div class="form-grid2"> <div class="form-field"><label>Utlånsdato</label><input type="date" id="utlanDato" value="${iDag()}"></div> <div class="form-field"><label>Leveres inn</label><input type="date" id="utlanFrist"></div> </div>`;

document.getElementById(“utlanBody”).innerHTML = html;
oppdaterMaks();
document.getElementById(“utlanModal”).classList.add(“open”);
}

function oppdaterMaks() {
const sel = document.getElementById(“utlanNavn”);
if (!sel) return;
const maks = parseInt(sel.selectedOptions[0]?.dataset.maks || 1);
const inp  = document.getElementById(“utlanAntall”);
inp.max = maks;
if (parseInt(inp.value) > maks) inp.value = maks;
}

async function lagreUtlan() {
const valgtNavn = document.getElementById(“utlanNavn”).value;
const antall    = parseInt(document.getElementById(“utlanAntall”).value);
const til       = document.getElementById(“utlanTil”).value.trim();
const dato      = document.getElementById(“utlanDato”).value;
const frist     = document.getElementById(“utlanFrist”).value;

if (!til) { visBanner(“Fyll inn låntaker”, “error”); return; }

// Finn N rader med dette navnet og status Tilgjengelig
const kandidater = boksGjenstander.filter(g => g.navn === valgtNavn && g.status === “Tilgjengelig”);
if (antall < 1 || antall > kandidater.length) { visBanner(“Ugyldig antall”, “error”); return; }

const btn = document.querySelector(”#utlanModal .btn-save”);
btn.disabled = true; btn.textContent = “Lagrer…”;

// Sett N individuelle rader til Utlånt
const toUpdate = kandidater.slice(0, antall);
for (const g of toUpdate) {
await db.from(“gjenstander”).update({
status: “Utlånt”, utlant_til: til, utlansdato: dato,
innleveringsdato: frist || null
}).eq(“id”, g.id);
}

// Logg-rad
await db.from(“utlanslogg”).insert({
gjenstand_id: toUpdate[0].id,
boks_id: currentBoks.id,
antall, utlant_til: til, utlansdato: dato,
innleveringsdato: frist || null, status: “aktiv”
});

lukkUtlan();
await lastInnBoks(currentBoks.id);
visBanner(`✓ ${antall} × ${valgtNavn} utlånt til ${til}`, “success”);
btn.disabled = false; btn.textContent = “💾 Registrer utlån”;
}

function lukkUtlan() { document.getElementById(“utlanModal”).classList.remove(“open”); }

// ── Lever inn ──────────────────────────────────────────────────────────────
function apneLever()               { byggLeverModal(null); }
function apneLeverForNavn(navn)    {
// Finn alle utlånte gjenstander med dette navnet direkte
const utlaante = boksGjenstander.filter(g => g.navn === navn && g.status === “Utlånt”);
if (!utlaante.length) { visBanner(“Ingen utlånte gjenstander med dette navnet”, “error”); return; }
const idStr = utlaante.map(g => g.id).join(”,”);
apneLeverDelvis(idStr, utlaante.length);
}
function apneLeverForGjenstand(id) {
const g = boksGjenstander.find(x => x.id === id);
if (g) apneLeverForNavn(g.navn);
}

function byggLeverModal(filtrertNavn) {
const aktive = filtrertNavn
? aktiveUtlan.filter(u => {
const g = boksGjenstander.find(x => x.id === u.gjenstand_id);
return g?.navn === filtrertNavn;
})
: aktiveUtlan;

if (!aktive.length) { visBanner(“Ingen aktive utlån å levere inn”, “error”); return; }

let html = `<div style="display:flex;flex-direction:column;gap:10px">`;
for (const u of aktive) {
const g = boksGjenstander.find(x => x.id === u.gjenstand_id);
const navn = g ? g.navn : u.gjenstand_id;
html += `<div class="utlan-section" style="gap:8px"> <div class="utlan-title">${navn} — ${u.utlant_til || "?"} (lånt ${u.antall} stk)</div> <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"> <label style="font-size:11px;color:var(--muted)">Lever inn:</label> <input type="number" id="lever_${u.id}" value="${u.antall}" min="1" max="${u.antall}" style="width:70px;padding:6px;background:rgba(255,255,255,0.07);border:1px solid rgba(70,189,198,0.25);border-radius:8px;color:#e2e8f0;font-size:13px"> <button class="btn-batch-tilg" onclick="settAlleLever(${u.id},${u.antall})">Alle (${u.antall})</button> </div> </div>`;
}
html += `</div>`;

document.getElementById(“leverBody”).innerHTML = html;
document.getElementById(“leverModal”).classList.add(“open”);
}

function settAlleLever(logId, antall) {
const inp = document.getElementById(“lever_” + logId);
if (inp) inp.value = antall;
}

async function lagreLever() {
const btn = document.querySelector(”#leverModal .btn-save”);
btn.disabled = true; btn.textContent = “Lagrer…”;

for (const u of aktiveUtlan) {
const inp = document.getElementById(“lever_” + u.id);
if (!inp) continue;
const antallLevert = parseInt(inp.value) || 0;
if (antallLevert <= 0) continue;

```
const refItem = boksGjenstander.find(g => g.id === u.gjenstand_id);
const navn = refItem?.navn;

// Sett N utlånte rader tilbake til Tilgjengelig
const utlaante = boksGjenstander.filter(g => g.navn === navn && g.status === "Utlånt");
for (const g of utlaante.slice(0, antallLevert)) {
  await db.from("gjenstander").update({
    status: "Tilgjengelig", utlant_til: "", utlansdato: "", innleveringsdato: ""
  }).eq("id", g.id);
}

if (antallLevert >= u.antall) {
  await db.from("utlanslogg").update({ status: "levert", levert_dato: iDag() }).eq("id", u.id);
} else {
  await db.from("utlanslogg").update({ antall: u.antall - antallLevert }).eq("id", u.id);
}
```

}

lukkLever();
await lastInnBoks(currentBoks.id);
visBanner(“✅ Innlevering registrert”, “success”);
btn.disabled = false; btn.textContent = “✅ Registrer innlevering”;
}

function lukkLever() { document.getElementById(“leverModal”).classList.remove(“open”); }

// Lever inn N gjenstander basert på ID-liste
async function leverGjenstander(idStr, antall) {
const ids = idStr.split(”,”).slice(0, antall);
for (const id of ids) {
await db.from(“gjenstander”).update({
status: “Tilgjengelig”, utlant_til: “”, utlansdato: “”, innleveringsdato: “”
}).eq(“id”, id);
// Marker ev. utlanslogg-rad som levert
await db.from(“utlanslogg”)
.update({ status: “levert”, levert_dato: iDag() })
.eq(“gjenstand_id”, id).eq(“status”, “aktiv”);
}
await lastInnBoks(currentBoks.id);
visBanner(`✅ ${ids.length} stk levert inn`, “success”);
}

async function leverEnkelt(logId, antall) {
const u = aktiveUtlan.find(x => x.id === logId);
if (!u) return;
const refItem = boksGjenstander.find(g => g.id === u.gjenstand_id);
const navn = refItem?.navn;
const utlaante = boksGjenstander.filter(g => g.navn === navn && g.status === “Utlånt”);
for (const g of utlaante.slice(0, antall)) {
await db.from(“gjenstander”).update({
status: “Tilgjengelig”, utlant_til: “”, utlansdato: “”, innleveringsdato: “”
}).eq(“id”, g.id);
}
await db.from(“utlanslogg”).update({ status: “levert”, levert_dato: iDag() }).eq(“id”, logId);
await lastInnBoks(currentBoks.id);
visBanner(“✅ Levert inn”, “success”);
}

async function leverDels(logId) {
byggLeverModal(null);
setTimeout(() => { const inp = document.getElementById(“lever_” + logId); if (inp) inp.focus(); }, 100);
}

function apneLeverDelvis(idStr, totalt) {
const ids = idStr.split(”,”);
const refItem = boksGjenstander.find(g => g.id === ids[0]);
const navn = refItem?.navn || “gjenstand”;

document.getElementById(“leverBody”).innerHTML = ` <div class="utlan-section" style="gap:10px"> <div class="utlan-title">${navn} — ${totalt} stk utlånt</div> <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"> <label style="font-size:12px;color:var(--muted)">Lever inn antall:</label> <input type="number" id="leverDelvisAntall" value="${totalt}" min="1" max="${totalt}" style="width:80px;padding:8px;background:rgba(255,255,255,0.07);border:1px solid rgba(70,189,198,0.25);border-radius:8px;color:#e2e8f0;font-size:14px;text-align:center"> <button class="btn-batch-tilg" onclick="document.getElementById('leverDelvisAntall').value=${totalt}">Alle (${totalt})</button> </div> <input type="hidden" id="leverDelvisIds" value="${idStr}"> </div>`;

// Override the modal footer save button
const saveBtn = document.querySelector(”#leverModal .btn-save”);
if (saveBtn) {
saveBtn.onclick = lagreLeverDelvis;
saveBtn.textContent = “✅ Registrer innlevering”;
}
document.getElementById(“leverModal”).classList.add(“open”);
}

async function lagreLeverDelvis() {
const idStr = document.getElementById(“leverDelvisIds”)?.value;
const antall = parseInt(document.getElementById(“leverDelvisAntall”)?.value) || 0;
if (!idStr || antall < 1) return;

const btn = document.querySelector(”#leverModal .btn-save”);
btn.disabled = true; btn.textContent = “Lagrer…”;

const ids = idStr.split(”,”).slice(0, antall);
for (const id of ids) {
await db.from(“gjenstander”).update({
status: “Tilgjengelig”, utlant_til: “”, utlansdato: “”, innleveringsdato: “”
}).eq(“id”, id);
await db.from(“utlanslogg”)
.update({ status: “levert”, levert_dato: iDag() })
.eq(“gjenstand_id”, id).eq(“status”, “aktiv”);
}

lukkLever();
await lastInnBoks(currentBoks.id);
visBanner(`✅ ${ids.length} stk levert inn`, “success”);
btn.disabled = false; btn.textContent = “✅ Registrer innlevering”;
}

// ── QR / Print / Download ──────────────────────────────────────────────────
async function lagQrBoksCanvas(size) {
return new Promise(resolve => {
const url  = APP_BASE_URL + “boks.html?id=” + enc(currentBoks.id);
const wrap = document.createElement(“div”);
wrap.style.cssText = “position:absolute;left:-9999px;top:-9999px;visibility:hidden”;
document.body.appendChild(wrap);
new QRCode(wrap, { text: url, width: size, height: size, colorDark: “#000000”, colorLight: “#ffffff”, correctLevel: QRCode.CorrectLevel.H });
setTimeout(() => {
const canvas = wrap.querySelector(“canvas”);
const src = canvas ? canvas.toDataURL(“image/png”) : “”;
document.body.removeChild(wrap);
resolve(src);
}, 200);
});
}

function boksEtikettHTML(qrSrc) {
return `<div class="print-label"> <div class="print-label-qr"><img src="${qrSrc}" width="190" height="190" style="display:block"></div> <div class="print-label-info"> <div class="print-label-navn">${currentBoks.navn}</div> <div class="print-label-id">${currentBoks.id}</div> ${currentBoks.hylleplassering ? `<div class="print-label-hylle">📍 ${currentBoks.hylleplassering}</div>` : “”}
<div class="print-label-org">1. Haugerud</div>
</div>

  </div>`;
}

async function skrivUtBoksEtikett() {
const src  = await lagQrBoksCanvas(190);
const area = document.getElementById(“printArea”);
area.innerHTML = boksEtikettHTML(src);
area.style.display = “flex”;
area.style.flexWrap = “wrap”;
setTimeout(() => { window.print(); area.style.display = “none”; }, 400);
}

async function lastNedBoksQr() {
const QR_SIZE   = 1200;
const PAD       = 40;
const FONT_INFO = 60;
const FONT_ORG  = 46;
const LINE_H    = FONT_INFO * 1.6;

const src = await lagQrBoksCanvas(QR_SIZE);
const qrImg = new Image();
qrImg.src = src;
await new Promise(r => { qrImg.onload = r; });

const infoParts = [currentBoks.navn, currentBoks.id];
if (currentBoks.hylleplassering) infoParts.push(“📍 “ + currentBoks.hylleplassering);
const infoLine = infoParts.join(”  ·  “);

const W = QR_SIZE + PAD * 2;
const H = QR_SIZE + PAD + LINE_H + FONT_ORG * 1.6 + PAD;

const c = document.createElement(“canvas”);
c.width = W; c.height = H;
const ctx = c.getContext(“2d”);

ctx.fillStyle = “#ffffff”;
ctx.fillRect(0, 0, W, H);
ctx.imageSmoothingEnabled = false;
ctx.drawImage(qrImg, PAD, 0, QR_SIZE, QR_SIZE);

ctx.textAlign = “center”;
ctx.textBaseline = “middle”;

ctx.font = `700 ${FONT_INFO}px Arial, sans-serif`;
ctx.fillStyle = “#000000”;
ctx.fillText(infoLine, W / 2, QR_SIZE + PAD + LINE_H / 2, W - PAD * 2);

ctx.font = `400 ${FONT_ORG}px Arial, sans-serif`;
ctx.fillStyle = “#888888”;
ctx.fillText(“1. Haugerud”, W / 2, QR_SIZE + PAD + LINE_H + FONT_ORG * 0.8, W - PAD * 2);

const a = document.createElement(“a”);
a.download = `QR-${currentBoks.id}.png`;
a.href = c.toDataURL(“image/png”);
a.click();
}

// ── Bilde ──────────────────────────────────────────────────────────────────
async function lastOppBokseBilde(input) {
const fil = input.files[0]; if (!fil) return; input.value = “”;
const st = document.getElementById(“boksBildeStatus”);
st.style.display = “block”; st.className = “bilde-upload-status uploading”; st.textContent = “⟳ “ + fil.name + “…”;
try {
const dataUrl = await komprimerTilBase64(fil);
const { error } = await db.from(“bokser”).update({ bilde_url: dataUrl }).eq(“id”, currentBoks.id);
if (error) throw new Error(error.message);
currentBoks.bilde_url = dataUrl;
renderBoks();
st.className = “bilde-upload-status success”; st.textContent = “✓ Bilde lagret!”;
setTimeout(() => st.style.display = “none”, 2500);
} catch (e) { st.className = “bilde-upload-status feil”; st.textContent = “❌ “ + e.message; }
}

async function lagreBokseBildeUrl() {
const url = document.getElementById(“boksBildeUrl”).value.trim();
const { error } = await db.from(“bokser”).update({ bilde_url: url }).eq(“id”, currentBoks.id);
if (!error) { currentBoks.bilde_url = url; renderBoks(); visBanner(“✓ Bilde oppdatert”, “success”); }
else visBanner(“Feil: “ + error.message, “error”);
}

// ── Helpers ────────────────────────────────────────────────────────────────
const enc  = s => encodeURIComponent(s);
const iDag = () => new Date().toISOString().split(“T”)[0];

function formatDato(dateStr) {
if (!dateStr || dateStr === “—”) return “—”;
if (dateStr === iDag()) return “I dag”;
const d = new Date(dateStr);
if (isNaN(d)) return dateStr;
return d.toLocaleDateString(“no-NO”, { day: “2-digit”, month: “2-digit”, year: “numeric” }).replace(/./g, “/”);
}

function visError(msg) {
document.getElementById(“loadingState”).style.display = “none”;
document.getElementById(“errorState”).style.display   = “flex”;
document.getElementById(“errorMsg”).textContent = msg;
}

function visBanner(tekst, type = “success”) {
const el = document.getElementById(“banner”);
el.textContent = tekst; el.className = “banner banner-” + type; el.style.display = “block”;
setTimeout(() => el.style.display = “none”, 3000);
}

document.getElementById(“utlanModal”)?.addEventListener(“click”, e => { if (e.target.id === “utlanModal”) lukkUtlan(); });
document.getElementById(“leverModal”)?.addEventListener(“click”, e => { if (e.target.id === “leverModal”) lukkLever(); });
document.addEventListener(“keydown”, e => { if (e.key === “Escape”) { lukkUtlan(); lukkLever(); } });
