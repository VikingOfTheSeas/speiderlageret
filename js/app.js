var KATEGORIER = [“Camping”,“Kjøkken”,“Sikkerhet”,“Utstyr”,“Navigasjon”,“Verktøy”,“Belysning”,“Vann”,“Kommunikasjon”,“Annet”];
var STATUSER   = [“Tilgjengelig”,“Utlånt”,“Til reparasjon”,“Tapt”];

var gjenstander = [];
var bokser      = [];
var sortField   = “id”;
var sortDir     = “asc”;
var editingId   = null;
var valgte      = new Set();
var skannede    = new Set();
var html5QrScanner = null;
var fokusTriggerInterval = null;
var printKo     = [];
var drawerOpen  = false;
var _slettFn    = null;
var _qrAktivId  = null;

// –– HELPERS ––
function sk(s) {
var m = {“Tilgjengelig”:“tilgjengelig”,“Utlånt”:“utlant”,“Til reparasjon”:“reparasjon”,“Tapt”:“tapt”};
return m[s] || “tilgjengelig”;
}
function enc(s) { return encodeURIComponent(s); }
function _idag() { return new Date().toISOString().split(“T”)[0]; }
function formatDato(d) {
if (!d) return “-”;
if (d === _idag()) return “I dag”;
var dt = new Date(d);
if (isNaN(dt)) return d;
return (“0”+dt.getDate()).slice(-2) + “/” + (“0”+(dt.getMonth()+1)).slice(-2) + “/” + dt.getFullYear();
}
function visBanner(tekst, type) {
type = type || “success”;
var el = document.getElementById(“banner”);
el.textContent = tekst;
el.className = “banner banner-” + type;
el.style.display = “block”;
setTimeout(function() { el.style.display = “none”; }, 3000);
}

// –– INIT ––
document.addEventListener(“DOMContentLoaded”, async function() {
populerSelects();
setupListeners();
await lastInn();
await lastInnBokser();
setupRealtime();
if (new URLSearchParams(location.search).get(“scan”) === “1”) {
history.replaceState({}, “”, location.pathname);
setTimeout(function() { apneScanner(); }, 400);
}
var aktivTab = sessionStorage.getItem(“aktivTab”);
if (aktivTab) { sessionStorage.removeItem(“aktivTab”); settFane(aktivTab); }
});

// –– DATA ––
async function lastInn() {
document.getElementById(“itemsBody”).innerHTML = “<tr><td colspan='9' class='empty-row loading-text'>Laster…</td></tr>”;
var r = await db.from(“gjenstander”).select(”*”).order(“id”);
if (r.error) { visBanner(“Feil: “ + r.error.message, “error”); return; }
gjenstander = r.data || [];
filtrerOgVis();
oppdaterStats();
viseSammendrag();
}

async function lastInnBokser() {
var r = await db.from(“bokser”).select(”*”).order(“id”);
bokser = r.data || [];
if (document.getElementById(“bokser”) && document.getElementById(“bokser”).classList.contains(“active”)) visBokser();
populerBoksSelect();
}

function setupRealtime() {
db.channel(“lager”)
.on(“postgres_changes”, { event: “*”, schema: “public”, table: “gjenstander” }, async function() { await lastInn(); })
.on(“postgres_changes”, { event: “*”, schema: “public”, table: “bokser” }, async function() { await lastInnBokser(); })
.subscribe();
}

// –– FILTER / SORT ––
function filtrerOgVis() {
var sok  = document.getElementById(“searchInput”).value.toLowerCase();
var kat  = document.getElementById(“filterKategori”).value;
var stat = document.getElementById(“filterStatus”).value;
var liste = gjenstander.filter(function(g) {
var treff = !sok || g.id.toLowerCase().includes(sok) || g.navn.toLowerCase().includes(sok) ||
(g.serienummer||””).toLowerCase().includes(sok) || (g.utlant_til||””).toLowerCase().includes(sok) ||
(g.hylleplassering||””).toLowerCase().includes(sok);
return treff && (kat === “Alle” || g.kategori === kat) && (stat === “Alle” || g.status === stat);
});
liste.sort(function(a, b) {
var av = String(a[sortField]||””).toLowerCase();
var bv = String(b[sortField]||””).toLowerCase();
return sortDir === “asc” ? av.localeCompare(bv,“no”) : bv.localeCompare(av,“no”);
});
visTabell(liste);
document.getElementById(“count-shown”).textContent = liste.length;
document.getElementById(“count-total”).textContent  = gjenstander.length;
}

function setSorter(felt) {
sortDir = sortField === felt && sortDir === “asc” ? “desc” : “asc”;
sortField = felt;
filtrerOgVis();
}

// –– TABELL ––
function visTabell(liste) {
var tbody = document.getElementById(“itemsBody”);
if (!liste.length) { tbody.innerHTML = “<tr><td colspan='9' class='empty-row'>Ingen gjenstander</td></tr>”; return; }
tbody.innerHTML = liste.map(function(g) {
var sn  = g.navn.replace(/’/g, “\’”);
var sel = valgte.has(g.id);
var opts = STATUSER.map(function(s) { return “<option” + (s===g.status?” selected”:””) + “>” + s + “</option>”; }).join(””);
return “<tr class='item-row row-" + sk(g.status) + (sel?" row-selected":"") + "' data-id='" + g.id + "'>” +
“<td class='tc'><input type=‘checkbox’ class=‘row-checkbox’ value=’” + g.id + “’ onchange=‘oppdaterValg()’” + (sel?” checked”:””) + “></td>” +
“<td class='tc'><a class='item-link mono' href='item.html?id=" + enc(g.id) + "'>” + g.id + “</a></td>” +
“<td class='tc'><span class='item-name-link' style='cursor:pointer' onclick='apneRediger(\"" + g.id + "\")'>” + g.navn + “</span></td>” +
“<td class='tc'><select class='inline-status status-select-" + sk(g.status) + "' onchange='raskStatus(\"" + g.id + "\",this)'>” + opts + “</select></td>” +
“<td class='tc'><div class='actions-cell'>” +
“<button class='btn-action btn-edit' onclick='apneRediger(\"" + g.id + "\")'>✎️</button>” +
“<button class='btn-action btn-qr' onclick='event.shiftKey?toggleKo(\"" + g.id + "\"):apneQr(\"" + g.id + "\",\"" + sn + "\")'>⬛</button>” +
“<button class='btn-action btn-delete' onclick='event.shiftKey?bekreftSlett(\"" + g.id + "\",\"" + sn + "\",true):bekreftSlett(\"" + g.id + "\",\"" + sn + "\")'>🗑️</button>” +
“</div></td>” +
“<td class='tc col-extra col-extra-text mono small-text'>” + (g.hylleplassering||”<span class='dash'>-</span>”) + “</td>” +
“<td class='tc col-extra col-extra-text'>” + (g.kategori||”-”) + “</td>” +
“<td class='tc col-extra col-extra-text small-text'>” + (g.utlant_til||”<span class='dash'>-</span>”) + “</td>” +
“<td class='tc col-extra col-extra-text mono small-text'>” + (g.serienummer||”-”) + “</td>” +
“</tr>”;
}).join(””);
}

function oppdaterStats() {
document.getElementById(“stat-total”).textContent        = gjenstander.length;
document.getElementById(“stat-tilgjengelig”).textContent = gjenstander.filter(function(g) { return g.status === “Tilgjengelig”; }).length;
document.getElementById(“stat-utlant”).textContent       = gjenstander.filter(function(g) { return g.status === “Utlånt”; }).length;
}

// –– MULTI-SELECT ––
function oppdaterValg() {
valgte.clear();
document.querySelectorAll(”.row-checkbox:not(#selectAll):checked”).forEach(function(cb) { valgte.add(cb.value); });
var bar = document.getElementById(“batchBar”);
bar.style.display = valgte.size > 0 ? “flex” : “none”;
document.getElementById(“batchCount”).textContent = valgte.size + “ valgt”;
document.querySelectorAll(”.item-row”).forEach(function(row) {
row.classList.toggle(“row-selected”, valgte.has(row.dataset.id));
});
}

function toggleSelectAll(el) {
document.querySelectorAll(”.row-checkbox:not(#selectAll)”).forEach(function(cb) { cb.checked = el.checked; });
oppdaterValg();
}

function clearValg() {
valgte.clear();
document.querySelectorAll(”.row-checkbox”).forEach(function(cb) { cb.checked = false; });
document.getElementById(“batchBar”).style.display = “none”;
document.querySelectorAll(”.item-row”).forEach(function(r) { r.classList.remove(“row-selected”); });
}

// –– UTLÅN MODAL ––
var _utlanIds = [];

function apneUtlanModal(ids) {
_utlanIds = Array.isArray(ids) ? ids : [ids];
var idag = new Date().toISOString().split(“T”)[0];
var liste = document.getElementById(“utlanGjenstanderListe”);
liste.innerHTML = _utlanIds.map(function(id) {
var g = gjenstander.find(function(x) { return x.id === id; });
if (!g) return “”;
return “<div style='display:flex;align-items:center;gap:8px'>” +
“<span class='mono small-text' style='color:var(--primary)'>” + g.id + “</span>” +
“<span style='color:var(--text)'>” + g.navn + “</span>” +
(g.hylleplassering ? “<span class='muted-text small-text' style='margin-left:auto'>” + g.hylleplassering + “</span>” : “”) +
“</div>”;
}).join(””);
document.getElementById(“utlanTil”).value = “”;
document.getElementById(“utlanDato”).value = idag;
document.getElementById(“utlanFrist”).value = “”;
oppdaterDatoVis(“utlanDato”, “utlanDatoVis”);
oppdaterDatoVis(“utlanFrist”, “utlanFristVis”);
document.getElementById(“utlanModal”).classList.add(“open”);
document.body.style.overflow = “hidden”;
setTimeout(function() { document.getElementById(“utlanTil”).focus(); }, 100);
}

function lukkUtlanModal() {
document.getElementById(“utlanModal”).classList.remove(“open”);
document.body.style.overflow = “”;
_utlanIds = [];
}

function oppdaterDatoVis(inputId, visId) {
var val = document.getElementById(inputId) ? document.getElementById(inputId).value : “”;
var el  = document.getElementById(visId);
if (el) el.textContent = val ? formatDato(val) : “”;
}

async function lagreUtlanModal() {
var til   = document.getElementById(“utlanTil”).value.trim();
var dato  = document.getElementById(“utlanDato”).value;
var frist = document.getElementById(“utlanFrist”).value;
if (!til)  { visBanner(“Fyll inn låntaker”, “error”); return; }
if (!dato) { visBanner(“Fyll inn utlånsdato”, “error”); return; }
var btn = document.querySelector(”#utlanModal .btn-save”);
btn.disabled = true; btn.textContent = “Lagrer…”;
for (var id of _utlanIds) {
var g = gjenstander.find(function(x) { return x.id === id; });
if (!g) continue;
await db.from(“gjenstander”).upsert(Object.assign({}, g, {
status: “Utlånt”, utlant_til: til, utlansdato: dato, innleveringsdato: frist || null
}), {onConflict:“id”});
}
lukkUtlanModal();
await lastInn();
visBanner(_utlanIds.length + “ gjenstand” + (_utlanIds.length > 1 ? “er” : “”) + “ utlånt til “ + til, “success”);
btn.disabled = false; btn.textContent = “Registrer utlån”;
}

function batchUtlan() {
if (!valgte.size) return;
apneUtlanModal(Array.from(valgte));
}

async function batchTilgjengelig() {
if (!valgte.size) return;
var ids = Array.from(valgte);
for (var id of ids) {
var g = gjenstander.find(function(x) { return x.id === id; });
if (g) await db.from(“gjenstander”).upsert(Object.assign({}, g, {status:“Tilgjengelig”,utlant_til:””,utlansdato:””,innleveringsdato:””}), {onConflict:“id”});
}
clearValg(); await lastInn(); visBanner(ids.length + “ satt til Tilgjengelig”, “success”);
}

function apneBatchRediger() {
if (!valgte.size) return;
var modal = document.getElementById(“batchRedigerModal”);
var katSel = document.getElementById(“batchKategori”);
katSel.innerHTML = “<option value=''>— Ikke endre —</option>” + KATEGORIER.map(function(k) { return “<option value='" + k + "'>” + k + “</option>”; }).join(””);
var boksSel = document.getElementById(“batchBoksId”);
boksSel.innerHTML = “<option value=''>— Ikke endre —</option><option value='__fjern__'>Fjern fra boks</option>” +
bokser.map(function(b) { return “<option value='" + b.id + "'>” + b.navn + “ (” + b.id + “)</option>”; }).join(””);
document.getElementById(“batchHylle”).value = “”;
document.getElementById(“batchStatus”).value = “”;
document.getElementById(“batchBildeUrl”).value = “”;
document.getElementById(“batchBildeStatus”).style.display = “none”;
modal.classList.add(“open”);
document.body.style.overflow = “hidden”;
}

function lukkBatchRediger() {
document.getElementById(“batchRedigerModal”).classList.remove(“open”);
document.body.style.overflow = “”;
}

async function lastOppBatchBilde(input) {
var fil = input.files[0]; if (!fil) return; input.value = “”;
var st = document.getElementById(“batchBildeStatus”);
st.style.display = “block”; st.className = “bilde-upload-status uploading”; st.textContent = “Laster opp…”;
try {
var dataUrl = await komprimerTilBase64(fil);
document.getElementById(“batchBildeUrl”).value = dataUrl;
st.className = “bilde-upload-status success”; st.textContent = “Klar!”;
setTimeout(function() { st.style.display = “none”; }, 2000);
} catch(e) { st.className = “bilde-upload-status feil”; st.textContent = “Feil: “ + e.message; }
}

async function lagreBatchRediger() {
var hylle   = document.getElementById(“batchHylle”).value.trim();
var kat     = document.getElementById(“batchKategori”).value;
var boksVal = document.getElementById(“batchBoksId”).value;
var status  = document.getElementById(“batchStatus”).value;
var bildeRaw = document.getElementById(“batchBildeUrl”).value.trim();
var bilde   = bildeRaw.startsWith(“data:”) ? bildeRaw : konverterBildeUrl(bildeRaw);
var btn = document.querySelector(”#batchRedigerModal .btn-save”);
btn.disabled = true; btn.textContent = “Lagrer…”;
var ids = Array.from(valgte);
for (var id of ids) {
var g = gjenstander.find(function(x) { return x.id === id; });
if (!g) continue;
var oppdatert = Object.assign({}, g);
if (hylle)   oppdatert.hylleplassering = hylle;
if (kat)     oppdatert.kategori = kat;
if (status)  oppdatert.status = status;
if (bilde)   oppdatert.bilde_url = bilde;
if (boksVal === “**fjern**”) oppdatert.boks_id = null;
else if (boksVal) oppdatert.boks_id = boksVal;
await db.from(“gjenstander”).upsert(oppdatert, {onConflict:“id”});
}
lukkBatchRediger(); clearValg(); await lastInn();
visBanner(ids.length + “ gjenstander oppdatert”, “success”);
btn.disabled = false; btn.textContent = “Oppdater alle valgte”;
}

// –– RASK STATUS ––
async function raskStatus(id, sel) {
var ny = sel.value;
var g  = gjenstander.find(function(x) { return x.id === id; });
if (!g || g.status === ny) return;
if (ny === “Utlånt” && !g.utlant_til) { apneUtlanModal([id]); sel.value = g.status; return; }
var ok = Object.assign({}, g, {status: ny});
if (ny !== “Utlånt”) { ok.utlant_til = “”; ok.utlansdato = “”; ok.innleveringsdato = “”; }
sel.className = “inline-status status-select-” + sk(ny);
document.querySelector(”[data-id=’” + id + “’]”).className = “item-row row-” + sk(ny);
var r = await db.from(“gjenstander”).upsert(ok, {onConflict:“id”});
if (r.error) { visBanner(“Feil: “ + r.error.message, “error”); sel.value = g.status; }
else { Object.assign(g, ok); oppdaterStats(); viseSammendrag(); visBanner(ny, “success”); }
}

// –– REDIGER ––
function apneRediger(id, forceStatus) {
var g = gjenstander.find(function(x) { return x.id === id; });
if (!g) return;
editingId = id;
document.getElementById(“editModalTitle”).textContent = g.navn;
document.getElementById(“editNavn”).value             = g.navn || “”;
document.getElementById(“editKategori”).value         = g.kategori || “Annet”;
document.getElementById(“editSerienummer”).value      = g.serienummer || “”;
document.getElementById(“editHylle”).value            = g.hylleplassering || “”;
document.getElementById(“editBildeUrl”).value         = g.bilde_url || “”;
document.getElementById(“editStatus”).value           = forceStatus || g.status || “Tilgjengelig”;
document.getElementById(“editUtlantTil”).value        = g.utlant_til || “”;
document.getElementById(“editUtlansdato”).value       = g.utlansdato || “”;
document.getElementById(“editInnlevering”).value      = g.innleveringsdato || “”;
document.getElementById(“editNotater”).value          = g.notater || “”;
document.getElementById(“editBoksId”).value           = g.boks_id || “”;
populerBoksSelect();
viseBildePrev(g.bilde_url);
toggleUtlan(forceStatus || g.status);
document.getElementById(“editModal”).classList.add(“open”);
document.body.style.overflow = “hidden”;
}

function lukkRedigerModal() {
document.getElementById(“editModal”).classList.remove(“open”);
document.body.style.overflow = “”;
editingId = null;
}

function toggleUtlan(s) {
document.getElementById(“utlanSection”).style.display = s === “Utlånt” ? “block” : “none”;
}

function viseBildePrev(url) {
var konv = konverterBildeUrl(url);
var img  = document.getElementById(“editBildePrev”);
var ing  = document.getElementById(“editBildeIngen”);
if (konv) {
img.src = konv; img.style.display = “block”; ing.style.display = “none”;
img.onerror = function() { img.style.display = “none”; ing.style.display = “flex”; ing.textContent = “Bildet lastet ikke”; };
} else {
img.style.display = “none”; ing.style.display = “flex”; ing.textContent = “Ingen bilde”;
}
}

async function lagreRediger() {
var btn = document.getElementById(“saveEditBtn”);
btn.disabled = true; btn.textContent = “Lagrer\u2026”;
var status      = document.getElementById(“editStatus”).value;
var utlant_til  = document.getElementById(“editUtlantTil”).value.trim();
var utlansdato  = document.getElementById(“editUtlansdato”).value;
var innlevering = document.getElementById(“editInnlevering”).value;

// Batch mode
if (window._batchUtlanIds && window._batchUtlanIds.length > 1) {
var bids = window._batchUtlanIds;
for (var bid of bids) {
var bg = gjenstander.find(function(x) { return x.id === bid; });
if (bg) await db.from(“gjenstander”).upsert(Object.assign({}, bg, {
status: status, utlant_til: utlant_til, utlansdato: utlansdato, innleveringsdato: innlevering
}), {onConflict:“id”});
}
window._batchUtlanIds = null;
clearValg(); await lastInn(); lukkRedigerModal();
visBanner(bids.length + “ oppdatert!”, “success”);
btn.disabled = false; btn.textContent = “Lagre”;
return;
}

if (!editingId) return;
var bildeRaw = document.getElementById(“editBildeUrl”).value.trim();
var oppdatert = {
id: editingId,
navn:            document.getElementById(“editNavn”).value.trim(),
kategori:        document.getElementById(“editKategori”).value,
serienummer:     document.getElementById(“editSerienummer”).value.trim(),
hylleplassering: document.getElementById(“editHylle”).value.trim(),
bilde_url:       bildeRaw.startsWith(“data:”) ? bildeRaw : konverterBildeUrl(bildeRaw),
boks_id:         document.getElementById(“editBoksId”).value || null,
status: status, utlant_til: utlant_til, utlansdato: utlansdato, innleveringsdato: innlevering,
notater: document.getElementById(“editNotater”).value.trim(),
};
var r = await db.from(“gjenstander”).upsert(oppdatert, {onConflict:“id”});
if (r.error) { visBanner(“Feil: “ + r.error.message, “error”); }
else { await lastInn(); lukkRedigerModal(); visBanner(“Lagret!”, “success”); }
btn.disabled = false; btn.textContent = “Lagre”;
}

// –– BILDEOPPLASTING ––
async function lastOppBilde(input) {
var fil = input.files[0]; if (!fil) return; input.value = “”;
var st = document.getElementById(“bildeUploadStatus”);
st.style.display = “block”; st.className = “bilde-upload-status uploading”; st.textContent = fil.name + “…”;
try {
var dataUrl = await komprimerTilBase64(fil);
document.getElementById(“editBildeUrl”).value = dataUrl;
viseBildePrev(dataUrl);
st.className = “bilde-upload-status success”; st.textContent = “Bilde klart!”;
setTimeout(function() { st.style.display = “none”; }, 2500);
} catch(e) { st.className = “bilde-upload-status feil”; st.textContent = “Feil: “ + e.message; }
}

async function lastOppBildeAdd(input) {
var fil = input.files[0]; if (!fil) return; input.value = “”;
var st = document.getElementById(“addBildeStatus”);
st.style.display = “block”; st.className = “bilde-upload-status uploading”; st.textContent = fil.name + “…”;
try {
var dataUrl = await komprimerTilBase64(fil);
document.getElementById(“addBildeUrl”).value = dataUrl;
var prev = document.getElementById(“addBildePrev”);
prev.src = dataUrl; prev.style.display = “block”;
st.className = “bilde-upload-status success”; st.textContent = “Klar!”;
setTimeout(function() { st.style.display = “none”; }, 2000);
} catch(e) { st.className = “bilde-upload-status feil”; st.textContent = “Feil: “ + e.message; }
}

// –– LEGG TIL ––
function nesteNummer(pref) {
var maks = 0;
gjenstander.forEach(function(g) {
var escaped = pref.replace(/[-[]{}()*+?.,\^$|#\s]/g, “\$&”);
var re = new RegExp(”^” + escaped + “-(\d+)$”, “i”);
var m = g.id.match(re);
if (m) maks = Math.max(maks, parseInt(m[1]));
});
return maks + 1;
}

function autofyllHylle() {
var boksId = document.getElementById(“itemBoksId”) ? document.getElementById(“itemBoksId”).value : “”;
var boks = bokser.find(function(b) { return b.id === boksId; });
var hylleEl = document.getElementById(“itemHylle”);
if (!hylleEl) return;
if (boks && boks.hylleplassering) hylleEl.value = boks.hylleplassering;
else if (!boksId) hylleEl.value = “”;
}

async function leggTil(e) {
e.preventDefault();
var navn    = document.getElementById(“itemName”).value.trim();
var kat     = document.getElementById(“itemKategori”).value;
var enhet   = document.getElementById(“itemEnhet”).value.trim() || “stk”;
var antall  = parseInt(document.getElementById(“itemAntall”).value) || 1;
var pref    = (document.getElementById(“itemPrefix”).value.trim() || navn.slice(0,3)).toUpperCase();
var start   = parseInt(document.getElementById(“itemStartNr”).value) || 1;
var not     = document.getElementById(“itemNotater”).value.trim();
var bildeUrl = document.getElementById(“addBildeUrl”).value.trim();
var boksId  = document.getElementById(“itemBoksId”) ? document.getElementById(“itemBoksId”).value || null : null;
var hylle   = document.getElementById(“itemHylle”) ? document.getElementById(“itemHylle”).value.trim() : “”;
var btn = document.getElementById(“addBtn”);
btn.disabled = true; btn.textContent = “Legger til…”;
var nye = [];
for (var i = 0; i < antall; i++) {
nye.push({
id: pref + “-” + String(start + i).padStart(2, “0”),
navn: navn, kategori: kat, enhet: enhet,
serienummer: pref + “-” + String(start + i).padStart(3, “0”),
status: “Tilgjengelig”,
utlant_til: “”, utlansdato: “”, innleveringsdato: “”,
hylleplassering: hylle, notater: not,
bilde_url: bildeUrl.startsWith(“data:”) ? bildeUrl : konverterBildeUrl(bildeUrl),
boks_id: boksId || null,
er_bulk: false, antall_totalt: 1, antall_utlant: 0,
});
}
var r = await db.from(“gjenstander”).upsert(nye, {onConflict:“id”});
if (r.error) { visBanner(“Feil: “ + r.error.message, “error”); }
else {
visBanner(antall + “ gjenstand” + (antall > 1 ? “er” : “”) + “ lagt til”, “success”);
document.getElementById(“addItemForm”).reset();
document.getElementById(“itemAntall”).value = “1”;
document.getElementById(“addBildeUrl”).value = “”;
document.getElementById(“addBildePrev”).style.display = “none”;
oppdaterPrev();
await lastInn();
lukkLeggTilModal();
}
btn.disabled = false; btn.textContent = “Legg til i lageret”;
}

// –– SLETT ––
function bekreftSlett(id, navn, skipBekreft) {
_slettFn = async function() {
var r = await db.from(“gjenstander”).delete().eq(“id”, id);
if (!r.error) { lukkSlettModal(); await lastInn(); visBanner(“Slettet”, “success”); }
else visBanner(“Feil: “ + r.error.message, “error”);
};
if (skipBekreft) { _slettFn(); return; }
document.getElementById(“deleteItemName”).textContent = navn + “ (” + id + “)”;
document.getElementById(“deleteModal”).classList.add(“open”);
document.getElementById(“confirmDeleteBtn”).onclick = _slettFn;
setTimeout(function() { document.getElementById(“confirmDeleteBtn”).focus(); }, 50);
}
function lukkSlettModal() { document.getElementById(“deleteModal”).classList.remove(“open”); _slettFn = null; }

// –– QR VISNING ––
function apneQr(id, navn) {
_qrAktivId = id;
document.getElementById(“qrModalTitle”).textContent = navn;
var cont = document.getElementById(“qrContainer”);
cont.innerHTML = “”;
var url = APP_BASE_URL + “item.html?id=” + enc(id);
document.getElementById(“qrUrl”).textContent = url;
new QRCode(cont, { text: url, width: 160, height: 160, colorDark: “#000000”, colorLight: “#ffffff”, correctLevel: QRCode.CorrectLevel.H });
var iKo = printKo.includes(id);
var btn = document.getElementById(“leggIKoBtn”);
if (btn) { btn.textContent = iKo ? “I utskriftsko” : “Legg i utskriftsko”; btn.classList.toggle(“i-ko”, iKo); }
document.getElementById(“qrModal”).classList.add(“open”);
}

function lukkQrModal() {
document.getElementById(“qrModal”).classList.remove(“open”);
document.getElementById(“qrContainer”).innerHTML = “”;
_qrAktivId = null;
}

function lagQrCanvas(url, size) {
return new Promise(function(resolve) {
var wrap = document.createElement(“div”);
wrap.style.cssText = “position:absolute;left:-9999px;top:-9999px;visibility:hidden”;
document.body.appendChild(wrap);
new QRCode(wrap, { text: url, width: size, height: size, colorDark: “#000000”, colorLight: “#ffffff”, correctLevel: QRCode.CorrectLevel.H });
setTimeout(function() {
var canvas = wrap.querySelector(“canvas”);
var src = canvas ? canvas.toDataURL(“image/png”) : (wrap.querySelector(“img”)||{}).src || “”;
document.body.removeChild(wrap);
resolve(”<img src='" + src + "' width='190' height='190' style='display:block'>”);
}, 120);
});
}

function etikettHTML(g, qrHTML) {
return “<div class='print-label'><div class='print-label-qr'>” + qrHTML + “</div>” +
“<div class='print-label-info'><div class='print-label-navn'>” + g.navn + “</div>” +
“<div class='print-label-id'>” + g.id + “</div>” +
(g.hylleplassering ? “<div class='print-label-hylle'>” + g.hylleplassering + “</div>” : “”) +
“<div class='print-label-org'>1. Haugerud</div></div></div>”;
}

async function skrivUtEtikett() {
if (!_qrAktivId) return;
var g = gjenstander.find(function(x) { return x.id === _qrAktivId; });
var url = APP_BASE_URL + “item.html?id=” + enc(_qrAktivId);
var qrHTML = await lagQrCanvas(url, 110);
document.getElementById(“printArea”).innerHTML = etikettHTML(g, qrHTML);
await triggerPrint();
}

async function skrivUtAlle() {
if (!printKo.length) return;
var btn = document.getElementById(“printAlleBtn”);
btn.disabled = true; btn.textContent = “Genererer…”;
var etiketter = [];
for (var id of printKo) {
var g = gjenstander.find(function(x) { return x.id === id; });
if (!g) continue;
var url = APP_BASE_URL + “item.html?id=” + enc(id);
var qrHTML = await lagQrCanvas(url, 110);
etiketter.push(etikettHTML(g, qrHTML));
}
var PER_SIDE = 24;
var sider = [];
for (var i = 0; i < etiketter.length; i += PER_SIDE) sider.push(etiketter.slice(i, i + PER_SIDE));
document.getElementById(“printArea”).innerHTML = sider.map(function(side, idx) {
return “<div class='print-side" + (idx < sider.length-1 ? " print-side-break" : "") + "'>” + side.join(””) + “</div>”;
}).join(””);
await triggerPrint();
btn.disabled = false; btn.textContent = “Skriv ut alle”;
}

function triggerPrint() {
return new Promise(function(resolve) {
var area = document.getElementById(“printArea”);
area.style.removeProperty(“display”);
setTimeout(function() {
window.print();
setTimeout(function() { area.style.display = “none”; resolve(); }, 200);
}, 400);
});
}

// –– UTSKRIFTSKO ––
function toggleKo(id) {
if (printKo.includes(id)) { fjernFraKo(id); visBanner(“Fjernet fra ko”, “success”); }
else { printKo.push(id); oppdaterKoUI(); visBanner(“Lagt til i ko (” + printKo.length + “ stk)”, “success”); }
}

function leggIKo() {
if (!_qrAktivId || _qrAktivId.startsWith(“BOKS:”)) return;
var iKo = printKo.includes(_qrAktivId);
if (iKo) fjernFraKo(_qrAktivId);
else { printKo.push(_qrAktivId); visBanner(“Lagt til i ko”, “success”); }
var btn = document.getElementById(“leggIKoBtn”);
if (btn) { btn.textContent = !iKo ? “I utskriftsko” : “Legg i utskriftsko”; btn.classList.toggle(“i-ko”, !iKo); }
oppdaterKoUI();
}

function leggAlleIKo() {
gjenstander.forEach(function(g) { if (!printKo.includes(g.id)) printKo.push(g.id); });
visBanner(“Alle (” + printKo.length + “) lagt til i ko”, “success”);
oppdaterKoUI();
}

function fjernFraKo(id) { printKo = printKo.filter(function(x) { return x !== id; }); oppdaterKoUI(); }

function tomKo() { printKo = []; oppdaterKoUI(); visBanner(“Ko tomt”, “success”); }

function toggleDrawer() {
drawerOpen = !drawerOpen;
document.getElementById(“printDrawer”).classList.toggle(“open”, drawerOpen);
document.querySelector(”.btn-ko-lukk”).textContent = drawerOpen ? “v” : “^”;
}

function oppdaterKoUI() {
var n = printKo.length;
document.getElementById(“koTeller”).textContent = n;
document.getElementById(“drawerBadge”).textContent = n;
var toggleBtn = document.getElementById(“drawerToggleBtn”);
toggleBtn.style.display = n > 0 ? “flex” : “none”;
if (n > 0 && !drawerOpen) { drawerOpen = true; document.getElementById(“printDrawer”).classList.add(“open”); }
if (n === 0 && drawerOpen) { drawerOpen = false; document.getElementById(“printDrawer”).classList.remove(“open”); }
var printBtn = document.getElementById(“printAlleBtn”);
if (printBtn) printBtn.disabled = n === 0;
var liste = document.getElementById(“koListe”);
if (!liste) return;
liste.innerHTML = printKo.map(function(id) {
var g = gjenstander.find(function(x) { return x.id === id; });
if (!g) return “”;
return “<div class='ko-chip'><span class='ko-chip-id'>” + g.id + “</span><span>” + g.navn + “</span>” +
“<button class='ko-chip-fjern' onclick='fjernFraKo(\"" + id + "\")' title='Fjern'>x</button></div>”;
}).join(””);
}

// –– QR SCANNER ––
function apneScanner() {
skannede.clear();
document.getElementById(“scannerLog”).innerHTML = “”;
document.getElementById(“scanCount”).textContent = “0”;
document.getElementById(“scannerStatus”).textContent = “Starter kamera…”;
document.getElementById(“scannerModal”).classList.add(“open”);
setTimeout(startKamera, 100);
}

async function startKamera() {
var statusEl = document.getElementById(“scannerStatus”);
try {
html5QrScanner = new Html5Qrcode(“html5qr-scanner”, { verbose: false });
await html5QrScanner.start(
{ facingMode: “environment” },
{ fps: 15, qrbox: { width: 200, height: 200 }, aspectRatio: 1.0 },
function(decodedText) { behandleQrResultat(decodedText); },
function() {}
);
statusEl.textContent = “Scan en QR-kode…”;
} catch(e) {
statusEl.textContent = “Kamera ikke tilgjengelig: “ + e.message;
}
}

function spillScanLyd() {
try {
var ctx = new (window.AudioContext || window.webkitAudioContext)();
var osc = ctx.createOscillator();
var gain = ctx.createGain();
osc.connect(gain); gain.connect(ctx.destination);
osc.type = “square”; osc.frequency.setValueAtTime(1850, ctx.currentTime);
gain.gain.setValueAtTime(0.18, ctx.currentTime);
gain.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 0.12);
osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.12);
} catch(e) {}
}

function behandleQrResultat(url) {
var match = url.match(/[?&]id=([^&]+)/);
if (!match) { leggTilScanLog(null, “Ukjent QR: “ + url.slice(0,40), true); return; }
var id = decodeURIComponent(match[1]);
if (skannede.has(id)) return;
skannede.add(id);
var g = gjenstander.find(function(x) { return x.id === id; });
if (!g) { leggTilScanLog(null, “Ukjent ID: “ + id, true); return; }
valgte.add(id);
spillScanLyd();
leggTilScanLog(id, g.navn, false, g.hylleplassering);
document.getElementById(“scanCount”).textContent = skannede.size;
var statusEl = document.getElementById(“scannerStatus”);
statusEl.textContent = g.navn;
setTimeout(function() {
if (document.getElementById(“scannerModal”).classList.contains(“open”)) statusEl.textContent = “Scan neste…”;
}, 700);
}

function leggTilScanLog(id, tekst, feil, hylle) {
var log = document.getElementById(“scannerLog”);
var item = document.createElement(“div”);
item.className = “scanner-log-item” + (feil ? “ feil” : “”);
item.dataset.id = id || “”;
var label = document.createElement(“span”);
label.className = “scanner-log-label”;
label.textContent = tekst + (hylle ? “  “ + hylle : “”) + “  “ + (id||””);
item.appendChild(label);
if (!feil && id) {
var fjern = document.createElement(“button”);
fjern.className = “scanner-log-fjern”;
fjern.textContent = “x”;
fjern.onclick = function() {
valgte.delete(id); skannede.delete(id); item.remove();
document.getElementById(“scanCount”).textContent = skannede.size;
};
item.appendChild(fjern);
}
log.appendChild(item);
log.scrollTop = log.scrollHeight;
}

async function lukkScanner(visValgt) {
clearInterval(fokusTriggerInterval); fokusTriggerInterval = null;
if (html5QrScanner) {
try { await html5QrScanner.stop(); html5QrScanner.clear(); } catch(e) {}
html5QrScanner = null;
}
document.getElementById(“scannerModal”).classList.remove(“open”);
if (visValgt && valgte.size > 0) { filtrerOgVis(); oppdaterValg(); visBanner(valgte.size + “ gjenstander valgt”, “success”); }
}

// –– SAMMENDRAG ––
function viseSammendrag() {
var total = gjenstander.length;
var tilg  = gjenstander.filter(function(g) { return g.status === “Tilgjengelig”; }).length;
var utl   = gjenstander.filter(function(g) { return g.status === “Utlånt”; }).length;
var rep   = gjenstander.filter(function(g) { return g.status === “Til reparasjon”; }).length;
var tapt  = gjenstander.filter(function(g) { return g.status === “Tapt”; }).length;
var forf  = gjenstander.filter(function(g) { return g.status === “Utlånt” && g.innleveringsdato && new Date(g.innleveringsdato) < new Date(); }).length;
var kpis = [
{icon:”📦”, val:total, label:“Totalt”,       color:”#46bdc6”},
{icon:”✅”,   val:tilg,  label:“Tilgjengelig”, color:”#34d399”},
{icon:”📤”, val:utl,   label:“Utlånt”,       color:”#f87171”},
{icon:”🔧”, val:rep,   label:“Reparasjon”,   color:”#fbbf24”},
{icon:”❌”,  val:tapt,  label:“Tapt”,         color:”#94a3b8”},
];
if (forf > 0) kpis.push({icon:”⚠️”, val:forf, label:“Forfalt”, color:”#fb923c”});
document.getElementById(“kpiGrid”).innerHTML = kpis.map(function(k) {
return “<div class='kpi-card'><div class='kpi-icon'>” + k.icon + “</div><div class='kpi-value' style='color:" + k.color + "'>” + k.val + “</div><div class='kpi-label'>” + k.label + “</div></div>”;
}).join(””);

var kb = document.getElementById(“katTabell”);
kb.innerHTML = “”;
KATEGORIER.forEach(function(kat) {
var items = gjenstander.filter(function(g) { return g.kategori === kat; });
if (!items.length) return;
var kT = items.filter(function(g) { return g.status === “Tilgjengelig”; }).length;
var kU = items.filter(function(g) { return g.status === “Utlånt”; }).length;
var kR = items.filter(function(g) { return g.status === “Til reparasjon”; }).length;
var kL = items.filter(function(g) { return g.status === “Tapt”; }).length;
var pst = Math.round(kT / items.length * 100);
var farge = pst > 80 ? “#34d399” : pst > 50 ? “#fbbf24” : “#f87171”;
kb.innerHTML += “<tr><td class='kat-navn' style='padding-left:16px'>” + kat + “</td>” +
“<td class='center'>” + items.length + “</td><td class='center green-text fw'>” + kT + “</td>” +
“<td class='center'>” + (kU > 0 ? “<span class='red-text fw'>”+kU+”</span>” : “0”) + “</td>” +
“<td class='center'>” + (kR > 0 ? “<span class='orange-text'>”+kR+”</span>” : “0”) + “</td>” +
“<td class='center muted-text'>” + kL + “</td>” +
“<td style='padding-right:16px'><div class='andel-row'><div class='andel-bar'><div class='andel-fill' style='width:" + pst + "%;background:" + farge + "'></div></div><span class='andel-pst'>” + pst + “%</span></div></td></tr>”;
});

var ul = gjenstander.filter(function(g) { return g.status === “Utlånt”; });
document.getElementById(“utlant-count”).textContent = ul.length;
var ub = document.getElementById(“utlantTabell”);
ub.innerHTML = !ul.length
? “<tr><td colspan='7' class='empty-row'>Ingen utlante</td></tr>”
: ul.map(function(g) {
var f = g.innleveringsdato && new Date(g.innleveringsdato) < new Date();
return “<tr class='" + (f ? "row-forfalt" : "") + "'>” +
“<td class='mono' style='padding-left:16px'><a class='item-link' href='item.html?id=" + enc(g.id) + "'>” + g.id + “</a></td>” +
“<td>” + g.navn + “</td><td>” + (g.utlant_til||”-”) + “</td>” +
“<td class='mono small-text center'>” + formatDato(g.utlansdato) + “</td>” +
“<td class='mono small-text center " + (f ? "orange-text fw" : "") + "'>” + formatDato(g.innleveringsdato) + (f ? “ !” : “”) + “</td>” +
“<td class='center'>” + (f ? “<span class='badge-forfalt'>FORFALT</span>” : “OK”) + “</td>” +
“<td class='center'><button class='btn-action btn-edit' onclick='apneRediger(\"" + g.id + "\")'>✎️</button></td></tr>”;
}).join(””);
}

// –– BOKSER ––
async function visBokser() {
var tbody = document.getElementById(“bokserBody”);
if (!tbody) return;
if (!bokser.length) { tbody.innerHTML = “<tr><td colspan='5' class='empty-row'>Ingen bokser</td></tr>”; return; }
tbody.innerHTML = bokser.map(function(b) {
var gib    = gjenstander.filter(function(g) { return g.boks_id === b.id; });
var typer  = new Set(gib.map(function(g) { return g.navn; })).size;
var tilgj  = gib.filter(function(g) { return g.status === “Tilgjengelig”; }).length;
var totalt = gib.length;
var gjTekst = totalt === 0
? “<span class='muted-text'>Tom</span>”
: “<span class='green-text fw'>” + tilgj + “</span><span class='muted-text'>/” + totalt + “ stk “ + typer + “ type” + (typer !== 1 ? “r” : “”) + “</span>”;
return “<tr class='item-row'>” +
“<td class='tc mono'><a class='item-link' href='boks.html?id=" + enc(b.id) + "'>” + b.id + “</a></td>” +
“<td class='tc'><a class='item-name-link' href='boks.html?id=" + enc(b.id) + "'>” + b.navn + “</a></td>” +
“<td class='tc muted-text'>” + (b.hylleplassering||”-”) + “</td>” +
“<td class='tc'>” + gjTekst + “</td>” +
“<td class='tc'><div class='actions-cell'>” +
“<button class='btn-action btn-edit' onclick='window.location.href=\"boks.html?id=" + enc(b.id) + "\"'>Apne</button>” +
“<button class='btn-action btn-qr' onclick='apneBoksQr(\"" + b.id + "\",\"" + b.navn.replace(/"/g,"") + "\")'>QR</button>” +
“<button class='btn-action btn-delete' onclick='bekreftSlettBoks(\"" + b.id + "\",\"" + b.navn.replace(/"/g,"") + "\")'>Slett</button>” +
“</div></td></tr>”;
}).join(””);
}

function apneNyBoks() {
[“nyBoksHylle”,“nyBoksId”,“nyBoksNavn”,“nyBoksBeskrivelse”].forEach(function(id) {
var el = document.getElementById(id); if (el) el.value = “”;
});
var bildeUrl = document.getElementById(“nyBoksBildeUrl”); if (bildeUrl) bildeUrl.value = “”;
var prev = document.getElementById(“nyBoksBildePrev”); if (prev) prev.style.display = “none”;
var st = document.getElementById(“nyBoksBildeStatus”); if (st) st.style.display = “none”;
var inp = document.getElementById(“nyBoksBildeInput”); if (inp) inp.value = “”;
window._nyBoksBildeData = null;
document.getElementById(“nyBoksModal”).classList.add(“open”);
setTimeout(function() { var el = document.getElementById(“nyBoksHylle”); if (el) el.focus(); }, 100);
}
function lukkNyBoks() { document.getElementById(“nyBoksModal”).classList.remove(“open”); }

function genererBoksId() {
var hylle = (document.getElementById(“nyBoksHylle”) ? document.getElementById(“nyBoksHylle”).value : “”).trim().toUpperCase().replace(/\s+/g, “”);
var idEl = document.getElementById(“nyBoksId”); if (!idEl) return;
if (!hylle) { idEl.value = “”; return; }
var m = hylle.match(/^([A-Z]+)(\d+)$/);
var base = m ? “B-” + m[1] + m[2].padStart(2, “0”) : “B-” + hylle.replace(/[^A-Z0-9]/g, “”).slice(0, 6);
var id = base, n = 2;
while (bokser.find(function(b) { return b.id === id; })) { id = base + “-” + n; n++; }
idEl.value = id;
}

async function forhandsvisBoksBilde(input) {
var fil = input.files[0]; if (!fil) return;
var st = document.getElementById(“nyBoksBildeStatus”);
if (st) { st.style.display = “block”; st.className = “bilde-upload-status uploading”; st.textContent = “Laster opp…”; }
try {
var dataUrl = await komprimerTilBase64(fil);
window._nyBoksBildeData = dataUrl;
var prev = document.getElementById(“nyBoksBildePrev”);
if (prev) { prev.src = dataUrl; prev.style.display = “block”; }
if (st) { st.className = “bilde-upload-status success”; st.textContent = “Klar!”; setTimeout(function() { st.style.display = “none”; }, 2000); }
} catch(e) { if (st) { st.className = “bilde-upload-status feil”; st.textContent = “Feil: “ + e.message; } }
}

async function lagreNyBoks() {
var id    = document.getElementById(“nyBoksId”) ? document.getElementById(“nyBoksId”).value.trim() : “”;
var navn  = document.getElementById(“nyBoksNavn”) ? document.getElementById(“nyBoksNavn”).value.trim() : “”;
var hylle = document.getElementById(“nyBoksHylle”) ? document.getElementById(“nyBoksHylle”).value.trim() : “”;
var beskr = document.getElementById(“nyBoksBeskrivelse”) ? document.getElementById(“nyBoksBeskrivelse”).value.trim() : “”;
var bildeUrl = document.getElementById(“nyBoksBildeUrl”) ? document.getElementById(“nyBoksBildeUrl”).value.trim() : “”;
var bilde = window._nyBoksBildeData || (bildeUrl ? konverterBildeUrl(bildeUrl) : null);
if (!hylle) { visBanner(“Hylleplassering er påkrevd”, “error”); return; }
if (!id)    { visBanner(“Fyll inn hylleplassering for å generere ID”, “error”); return; }
if (!navn)  { visBanner(“Navn er påkrevd”, “error”); return; }
var btn = document.querySelector(”#nyBoksModal .btn-save”);
btn.disabled = true; btn.textContent = “Lagrer…”;
var r = await db.from(“bokser”).insert({ id: id, navn: navn, hylleplassering: hylle, beskrivelse: beskr || null, bilde_url: bilde || null });
if (r.error) { visBanner(“Feil: “ + r.error.message, “error”); }
else { lukkNyBoks(); await lastInnBokser(); visBanner(“Boks opprettet!”, “success”); settFane(“bokser”); }
btn.disabled = false; btn.textContent = “Opprett boks”;
}

function apneBoksQr(id, navn) {
document.getElementById(“qrModalTitle”).textContent = navn + “ (boks)”;
var cont = document.getElementById(“qrContainer”);
cont.innerHTML = “”;
var url = APP_BASE_URL + “boks.html?id=” + enc(id);
document.getElementById(“qrUrl”).textContent = url;
new QRCode(cont, { text: url, width: 200, height: 200, colorDark: “#000000”, colorLight: “#ffffff”, correctLevel: QRCode.CorrectLevel.H });
_qrAktivId = “BOKS:” + id;
document.getElementById(“qrModal”).classList.add(“open”);
}

function bekreftSlettBoks(id, navn) {
document.getElementById(“deleteItemName”).textContent = navn + “ (” + id + “)”;
document.getElementById(“deleteModal”).classList.add(“open”);
document.getElementById(“confirmDeleteBtn”).onclick = async function() {
var r = await db.from(“bokser”).delete().eq(“id”, id);
if (!r.error) { lukkSlettModal(); await lastInnBokser(); visBanner(“Boks slettet”, “success”); }
else visBanner(“Feil: “ + r.error.message, “error”);
};
}

function populerBoksSelect() {
[“editBoksId”,“itemBoksId”].forEach(function(selId) {
var sel = document.getElementById(selId);
if (!sel) return;
var curr = sel.value;
sel.innerHTML = “<option value=''>- Ingen boks —</option>” +
bokser.map(function(b) { return “<option value='" + b.id + "'>” + b.navn + “ (” + b.id + “)</option>”; }).join(””);
sel.value = curr;
});
}

// –– LEGG TIL MODAL ––
function apneLeggTilModal() {
var sel = document.getElementById(“itemBoksId”);
if (sel) {
sel.innerHTML = “<option value=''>- Ingen boks —</option>” +
bokser.map(function(b) { return “<option value='" + b.id + "'>” + b.navn + “ (” + b.id + “)</option>”; }).join(””);
}
document.getElementById(“leggTilModal”).classList.add(“open”);
document.body.style.overflow = “hidden”;
}

function lukkLeggTilModal() {
document.getElementById(“leggTilModal”).classList.remove(“open”);
document.body.style.overflow = “”;
}

function toggleAddBulk(cb) {
var el = document.getElementById(“addBulkFields”);
if (el) el.style.display = cb.checked ? “block” : “none”;
}

// –– FANER ––
function settFane(navn) {
document.querySelectorAll(”.tab”).forEach(function(t) { t.classList.toggle(“active”, t.dataset.tab === navn); });
document.querySelectorAll(”.hmeny-tab”).forEach(function(t) { t.classList.toggle(“active”, t.dataset.tab === navn); });
document.querySelectorAll(”.tab-content”).forEach(function(c) { c.classList.toggle(“active”, c.id === navn); });
document.getElementById(“hamburgerMeny”) && document.getElementById(“hamburgerMeny”).classList.remove(“open”);
document.getElementById(“hamburger”) && document.getElementById(“hamburger”).classList.remove(“open”);
if (navn === “sammendrag”) viseSammendrag();
if (navn === “bokser”) visBokser();
}

// –– PREVIEW ––
function oppdaterPrev() {
var navn  = document.getElementById(“itemName”) ? document.getElementById(“itemName”).value : “”;
var pref  = ((document.getElementById(“itemPrefix”) ? document.getElementById(“itemPrefix”).value.trim() : “”) || navn.slice(0,3) || “GJN”).toUpperCase();
var ant   = parseInt(document.getElementById(“itemAntall”) ? document.getElementById(“itemAntall”).value : 1) || 1;
var startEl = document.getElementById(“itemStartNr”);
if (startEl && pref.length >= 2) startEl.value = nesteNummer(pref);
var start = parseInt(startEl ? startEl.value : 1) || 1;
var vis = [];
for (var i = 0; i < Math.min(3, ant); i++) vis.push(pref + “-” + String(start + i).padStart(3, “0”));
var el = document.getElementById(“previewText”);
if (el) el.textContent = vis.join(”, “) + (ant > 3 ? “ … (” + ant + “ totalt)” : “”);
}

// –– SELECTS ––
function populerSelects() {
var filterKat = document.getElementById(“filterKategori”);
if (filterKat) filterKat.innerHTML = “<option value='Alle'>Alle kategorier</option>”;
[“itemKategori”,“editKategori”].forEach(function(id) {
var el = document.getElementById(id); if (el) el.innerHTML = “”;
});
KATEGORIER.forEach(function(k) {
if (filterKat) filterKat.innerHTML += “<option value='" + k + "'>” + k + “</option>”;
[“itemKategori”,“editKategori”].forEach(function(id) {
var el = document.getElementById(id);
if (el) el.innerHTML += “<option value='" + k + "'>” + k + “</option>”;
});
});
}

// –– LISTENERS ––
function setupListeners() {
document.getElementById(“searchInput”).addEventListener(“input”, filtrerOgVis);
document.getElementById(“filterKategori”).addEventListener(“change”, filtrerOgVis);
document.getElementById(“filterStatus”).addEventListener(“change”, filtrerOgVis);
document.querySelectorAll(”.tab”).forEach(function(btn) {
btn.addEventListener(“click”, function(e) { settFane(e.currentTarget.dataset.tab); });
});
document.querySelectorAll(”.hmeny-tab”).forEach(function(btn) {
btn.addEventListener(“click”, function(e) { settFane(e.currentTarget.dataset.tab); });
});
document.getElementById(“addItemForm”).addEventListener(“submit”, leggTil);
var utlanDatoEl = document.getElementById(“utlanDato”);
if (utlanDatoEl) utlanDatoEl.addEventListener(“change”, function() { oppdaterDatoVis(“utlanDato”,“utlanDatoVis”); });
var utlanFristEl = document.getElementById(“utlanFrist”);
if (utlanFristEl) utlanFristEl.addEventListener(“change”, function() { oppdaterDatoVis(“utlanFrist”,“utlanFristVis”); });
var utlanModalEl = document.getElementById(“utlanModal”);
if (utlanModalEl) utlanModalEl.addEventListener(“click”, function(e) { if (e.target.id === “utlanModal”) lukkUtlanModal(); });
[“itemName”,“itemPrefix”,“itemAntall”,“itemStartNr”].forEach(function(id) {
var el = document.getElementById(id);
if (el) el.addEventListener(“input”, oppdaterPrev);
});
document.getElementById(“editStatus”).addEventListener(“change”, function(e) { toggleUtlan(e.target.value); });
document.getElementById(“editBildeUrl”).addEventListener(“input”, function(e) { viseBildePrev(e.target.value); });
document.getElementById(“addBildeUrl”).addEventListener(“input”, function(e) {
var prev = document.getElementById(“addBildePrev”);
var url = konverterBildeUrl(e.target.value);
if (url) { prev.src = url; prev.style.display = “block”; } else { prev.style.display = “none”; }
});
[“editModal”,“qrModal”,“deleteModal”,“scannerModal”,“leggTilModal”,“batchRedigerModal”,“nyBoksModal”].forEach(function(id) {
var el = document.getElementById(id);
if (!el) return;
el.addEventListener(“click”, function(e) {
if (e.target.id === id) { lukkRedigerModal(); lukkQrModal(); lukkSlettModal(); lukkLeggTilModal(); lukkBatchRediger(); lukkNyBoks(); if (id === “scannerModal”) lukkScanner(); }
});
});
document.addEventListener(“keydown”, function(e) {
if (e.key === “Escape”) { lukkRedigerModal(); lukkQrModal(); lukkSlettModal(); lukkScanner(); lukkLeggTilModal(); lukkBatchRediger(); }
if (e.key === “Enter” && document.getElementById(“deleteModal”).classList.contains(“open”)) {
e.preventDefault(); if (_slettFn) _slettFn();
}
});
oppdaterPrev();
}