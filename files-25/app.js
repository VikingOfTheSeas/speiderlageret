const KATEGORIER = ["Camping","Kjøkken","Sikkerhet","Utstyr","Navigasjon","Verktøy","Belysning","Vann","Kommunikasjon","Annet"];
const STATUSER   = ["Tilgjengelig","Utlånt","Til reparasjon","Tapt"];

let gjenstander = [];
let sortField   = "id";
let sortDir     = "asc";
let editingId   = null;
let valgte      = new Set();
let scannerStream = null;
let skannede    = new Set();

document.addEventListener("DOMContentLoaded", async () => {
  populerSelects();
  setupListeners();
  await lastInn();
  setupRealtime();
  // Auto-open scanner if redirected from item page scan button
  if (new URLSearchParams(location.search).get("scan") === "1") {
    history.replaceState({}, "", location.pathname);
    setTimeout(() => apneScanner(), 400);
  }
});

// ── Supabase ───────────────────────────────────────────────────────────────
async function lastInn() {
  document.getElementById("itemsBody").innerHTML =
    `<tr><td colspan="9" class="empty-row loading-text">Laster…</td></tr>`;
  const { data, error } = await db.from("gjenstander").select("*").order("id");
  if (error) { visBanner("Feil: " + error.message, "error"); return; }
  gjenstander = data || [];
  filtrerOgVis();
  oppdaterStats();
  viseSammendrag();
}

function setupRealtime() {
  db.channel("lager")
    .on("postgres_changes", { event: "*", schema: "public", table: "gjenstander" }, async () => {
      await lastInn();
    }).subscribe();
}

// ── Filtrering ─────────────────────────────────────────────────────────────
function filtrerOgVis() {
  const sok  = document.getElementById("searchInput").value.toLowerCase();
  const kat  = document.getElementById("filterKategori").value;
  const stat = document.getElementById("filterStatus").value;

  let liste = gjenstander.filter(g => {
    const treff = !sok ||
      g.id.toLowerCase().includes(sok) ||
      g.navn.toLowerCase().includes(sok) ||
      (g.serienummer || "").toLowerCase().includes(sok) ||
      (g.utlant_til || "").toLowerCase().includes(sok) ||
      (g.hylleplassering || "").toLowerCase().includes(sok);
    return treff
      && (kat  === "Alle" || g.kategori === kat)
      && (stat === "Alle" || g.status   === stat);
  });

  liste.sort((a, b) => {
    const av = String(a[sortField] || "").toLowerCase();
    const bv = String(b[sortField] || "").toLowerCase();
    return sortDir === "asc" ? av.localeCompare(bv, "no") : bv.localeCompare(av, "no");
  });

  visTabell(liste);
  document.getElementById("count-shown").textContent = liste.length;
  document.getElementById("count-total").textContent  = gjenstander.length;
}

// ── Tabell ─────────────────────────────────────────────────────────────────
function visTabell(liste) {
  const tbody = document.getElementById("itemsBody");
  if (!liste.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-row">Ingen gjenstander</td></tr>`;
    return;
  }
  tbody.innerHTML = liste.map(g => {
    const sn  = g.navn.replace(/'/g, "\\'");
    const sel = valgte.has(g.id);
    return `<tr class="item-row row-${sk(g.status)}${sel ? " row-selected" : ""}" data-id="${g.id}">
      <td class="tc"><input type="checkbox" class="row-checkbox" value="${g.id}" onchange="oppdaterValg()" ${sel ? "checked" : ""}></td>
      <td class="tc"><a class="item-link mono" href="item.html?id=${enc(g.id)}">${g.id}</a></td>
      <td class="tc"><a class="item-name-link" href="item.html?id=${enc(g.id)}">${g.navn}</a></td>
      <td class="tc">
        <select class="inline-status status-select-${sk(g.status)}" onchange="raskStatus('${g.id}',this)">
          ${STATUSER.map(s => `<option${s===g.status?" selected":""}>${s}</option>`).join("")}
        </select>
      </td>
      <td class="tc">
        <div class="actions-cell">
          <button class="btn-action btn-edit"   onclick="apneRediger('${g.id}')">✏️</button>
          <button class="btn-action btn-qr" onclick="event.shiftKey ? toggleKo('${g.id}') : apneQr('${g.id}','${sn}')" title="Shift+klikk for å legge til/fjerne fra utskriftskø">⬛</button>
          <button class="btn-action btn-delete" onclick="event.shiftKey ? bekreftSlett('${g.id}','${sn}',true) : bekreftSlett('${g.id}','${sn}')">🗑️</button>
        </div>
      </td>
      <td class="tc col-extra col-extra-text mono small-text">${g.hylleplassering || '<span class="dash">—</span>'}</td>
      <td class="tc col-extra col-extra-text">${g.kategori || "—"}</td>
      <td class="tc col-extra col-extra-text small-text">${g.utlant_til || '<span class="dash">—</span>'}</td>
      <td class="tc col-extra col-extra-text mono small-text">${g.serienummer || "—"}</td>
    </tr>`;
  }).join("");
}

function oppdaterStats() {
  document.getElementById("stat-total").textContent        = gjenstander.length;
  document.getElementById("stat-tilgjengelig").textContent = gjenstander.filter(g => g.status === "Tilgjengelig").length;
  document.getElementById("stat-utlant").textContent       = gjenstander.filter(g => g.status === "Utlånt").length;
}

// ── Multi-select ───────────────────────────────────────────────────────────
function oppdaterValg() {
  valgte.clear();
  document.querySelectorAll(".row-checkbox:not(#selectAll):checked").forEach(cb => valgte.add(cb.value));
  const bar = document.getElementById("batchBar");
  bar.style.display = valgte.size > 0 ? "flex" : "none";
  document.getElementById("batchCount").textContent = valgte.size + " valgt";
  // Update row highlighting
  document.querySelectorAll(".item-row").forEach(row => {
    row.classList.toggle("row-selected", valgte.has(row.dataset.id));
  });
}

function toggleSelectAll(el) {
  document.querySelectorAll(".row-checkbox:not(#selectAll)").forEach(cb => cb.checked = el.checked);
  oppdaterValg();
}

function clearValg() {
  valgte.clear();
  document.querySelectorAll(".row-checkbox").forEach(cb => cb.checked = false);
  document.getElementById("batchBar").style.display = "none";
  document.querySelectorAll(".item-row").forEach(r => r.classList.remove("row-selected"));
}

async function batchTilgjengelig() {
  if (!valgte.size) return;
  const ids = [...valgte];
  for (const id of ids) {
    const g = gjenstander.find(x => x.id === id);
    if (g) await db.from("gjenstander").upsert({...g, status:"Tilgjengelig", utlant_til:"", utlansdato:"", innleveringsdato:""}, {onConflict:"id"});
  }
  clearValg();
  await lastInn();
  visBanner("✓ " + ids.length + " satt til Tilgjengelig", "success");
}

async function batchUtlan() {
  if (!valgte.size) return;
  const ids = [...valgte];
  window._batchIds = ids;
  const g = gjenstander.find(x => x.id === ids[0]);
  if (!g) return;
  apneRediger(ids[0]);
  document.getElementById("editModalTitle").textContent = "Utlån for " + ids.length + " gjenstander";
  document.getElementById("editStatus").value = "Utlånt";
  toggleUtlan("Utlånt");
}

// ── QR Scanner (Html5Qrcode) ────────────────────────────────────────────────
let html5QrScanner = null;

function apneScanner() {
  skannede.clear();
  document.getElementById("scannerLog").innerHTML = "";
  document.getElementById("scanCount").textContent = "0";
  document.getElementById("scannerStatus").textContent = "Starter kamera…";
  document.getElementById("scannerModal").classList.add("open");
  setTimeout(startKamera, 100); // Let modal open first
}

async function startKamera() {
  const statusEl = document.getElementById("scannerStatus");
  try {
    html5QrScanner = new Html5Qrcode("html5qr-scanner");

    await html5QrScanner.start(
      { facingMode: "environment" },
      {
        fps: 15,
        qrbox: { width: 200, height: 200 },
        aspectRatio: 1.0,
        videoConstraints: {
          facingMode: "environment",
          width:  { ideal: 3840 },
          height: { ideal: 2160 }
        }
      },
      (decodedText) => {
        behandleQrResultat(decodedText);
      },
      () => {} // Ignore scan failures silently
    );

    statusEl.textContent = "Scan en QR-kode…";
  } catch (e) {
    statusEl.textContent = "❌ Kamera ikke tilgjengelig: " + e.message;
  }
}

function behandleQrResultat(url) {
  const match = url.match(/[?&]id=([^&]+)/);
  if (!match) {
    leggTilScanLog(null, "Ukjent QR: " + url.slice(0, 40), true);
    return;
  }
  const id = decodeURIComponent(match[1]);
  if (skannede.has(id)) return;
  skannede.add(id);

  const g = gjenstander.find(x => x.id === id);
  if (!g) { leggTilScanLog(null, "Ukjent ID: " + id, true); return; }

  valgte.add(id);
  leggTilScanLog(id, g.navn, false, g.hylleplassering);
  document.getElementById("scanCount").textContent = skannede.size;

  const statusEl = document.getElementById("scannerStatus");
  statusEl.textContent = "✓ " + g.navn;
  setTimeout(() => {
    if (document.getElementById("scannerModal").classList.contains("open"))
      statusEl.textContent = "Scan neste…";
  }, 700);
}

function leggTilScanLog(id, tekst, feil, hylle) {
  const log = document.getElementById("scannerLog");

  const item = document.createElement("div");
  item.className = "scanner-log-item" + (feil ? " feil" : "");
  item.dataset.id = id || "";

  const label = document.createElement("span");
  label.className = "scanner-log-label";
  label.textContent = tekst + (hylle ? "  📍" + hylle : "") + "  · " + id;
  item.appendChild(label);

  if (!feil && id) {
    const fjern = document.createElement("button");
    fjern.className = "scanner-log-fjern";
    fjern.textContent = "✕";
    fjern.onclick = () => {
      valgte.delete(id);
      skannede.delete(id);
      item.remove();
      document.getElementById("scanCount").textContent = skannede.size;
    };
    item.appendChild(fjern);
  }

  log.appendChild(item);
  log.scrollTop = log.scrollHeight;
}

async function lukkScanner(visValgt) {
  if (html5QrScanner) {
    try {
      await html5QrScanner.stop();
      html5QrScanner.clear();
    } catch(_) {}
    html5QrScanner = null;
  }
  if (scannerStream) { scannerStream.getTracks().forEach(t => t.stop()); scannerStream = null; }
  document.getElementById("scannerModal").classList.remove("open");
  if (visValgt && valgte.size > 0) {
    filtrerOgVis();
    oppdaterValg();
    visBanner("📷 " + valgte.size + " gjenstander valgt", "success");
  }
}

// ── Rask status ────────────────────────────────────────────────────────────
async function raskStatus(id, sel) {
  const ny = sel.value;
  const g  = gjenstander.find(x => x.id === id);
  if (!g || g.status === ny) return;
  if (ny === "Utlånt" && !g.utlant_til) { apneRediger(id, "Utlånt"); sel.value = g.status; return; }
  const ok = { ...g, status: ny };
  if (ny !== "Utlånt") { ok.utlant_til = ""; ok.utlansdato = ""; ok.innleveringsdato = ""; }
  sel.className = "inline-status status-select-" + sk(ny);
  document.querySelector(`[data-id="${id}"]`).className = "item-row row-" + sk(ny);
  const { error } = await db.from("gjenstander").upsert(ok, { onConflict: "id" });
  if (error) { visBanner("Feil: " + error.message, "error"); sel.value = g.status; }
  else { Object.assign(g, ok); oppdaterStats(); viseSammendrag(); visBanner("✓ " + ny, "success"); }
}

// ── Rediger ────────────────────────────────────────────────────────────────
function apneRediger(id, forceStatus) {
  const g = gjenstander.find(x => x.id === id);
  if (!g) return;
  editingId = id;
  document.getElementById("editModalTitle").textContent  = g.navn;
  document.getElementById("editNavn").value              = g.navn || "";
  document.getElementById("editKategori").value          = g.kategori || "Annet";
  document.getElementById("editSerienummer").value       = g.serienummer || "";
  document.getElementById("editHylle").value             = g.hylleplassering || "";
  document.getElementById("editBildeUrl").value          = g.bilde_url || "";
  document.getElementById("editStatus").value            = forceStatus || g.status || "Tilgjengelig";
  document.getElementById("editUtlantTil").value         = g.utlant_til || "";
  document.getElementById("editUtlansdato").value        = g.utlansdato || "";
  document.getElementById("editInnlevering").value       = g.innleveringsdato || "";
  document.getElementById("editNotater").value           = g.notater || "";
  viseBildePrev(g.bilde_url);
  toggleUtlan(forceStatus || g.status);
  document.getElementById("editModal").classList.add("open");
  document.body.style.overflow = "hidden";
}

function lukkRedigerModal() {
  document.getElementById("editModal").classList.remove("open");
  document.body.style.overflow = "";
  editingId = null;
  window._batchIds = null;
}

function toggleUtlan(s) {
  document.getElementById("utlanSection").style.display = s === "Utlånt" ? "block" : "none";
}

function viseBildePrev(url) {
  const konv = konverterBildeUrl(url);
  const img  = document.getElementById("editBildePrev");
  const ing  = document.getElementById("editBildeIngen");
  if (konv) {
    img.src = konv; img.style.display = "block"; ing.style.display = "none";
    img.onerror = () => { img.style.display = "none"; ing.style.display = "flex"; ing.textContent = "⚠️ Bildet lastet ikke"; };
  } else {
    img.style.display = "none"; ing.style.display = "flex"; ing.textContent = "Ingen bilde";
  }
}

async function lagreRediger() {
  const btn = document.getElementById("saveEditBtn");
  btn.disabled = true; btn.textContent = "Lagrer…";

  const status      = document.getElementById("editStatus").value;
  const utlant_til  = document.getElementById("editUtlantTil").value.trim();
  const utlansdato  = document.getElementById("editUtlansdato").value;
  const innlevering = document.getElementById("editInnlevering").value;

  // Batch mode
  if (window._batchIds && window._batchIds.length > 1) {
    for (const id of window._batchIds) {
      const g = gjenstander.find(x => x.id === id);
      if (g) await db.from("gjenstander").upsert({...g, status, utlant_til, utlansdato, innleveringsdato: innlevering}, {onConflict:"id"});
    }
    clearValg();
    await lastInn();
    lukkRedigerModal();
    visBanner("✓ " + window._batchIds.length + " oppdatert!", "success");
    btn.disabled = false; btn.textContent = "💾 Lagre";
    return;
  }

  if (!editingId) return;
  const bildeRaw = document.getElementById("editBildeUrl").value.trim();
  const oppdatert = {
    id: editingId,
    navn:             document.getElementById("editNavn").value.trim(),
    kategori:         document.getElementById("editKategori").value,
    serienummer:      document.getElementById("editSerienummer").value.trim(),
    hylleplassering:  document.getElementById("editHylle").value.trim(),
    bilde_url:        bildeRaw.startsWith("data:") ? bildeRaw : konverterBildeUrl(bildeRaw),
    status, utlant_til, utlansdato, innleveringsdato: innlevering,
    notater: document.getElementById("editNotater").value.trim(),
  };
  const { error } = await db.from("gjenstander").upsert(oppdatert, { onConflict: "id" });
  if (error) { visBanner("Feil: " + error.message, "error"); }
  else { await lastInn(); lukkRedigerModal(); visBanner("✓ Lagret!", "success"); }
  btn.disabled = false; btn.textContent = "💾 Lagre";
}

// ── Bildeopplasting ────────────────────────────────────────────────────────
async function lastOppBilde(input) {
  const fil = input.files[0]; if (!fil) return; input.value = "";
  const st = document.getElementById("bildeUploadStatus");
  st.style.display = "block"; st.className = "bilde-upload-status uploading"; st.textContent = "⟳ " + fil.name + "…";
  try {
    const dataUrl = await komprimerTilBase64(fil);
    document.getElementById("editBildeUrl").value = dataUrl;
    viseBildePrev(dataUrl);
    st.className = "bilde-upload-status success"; st.textContent = "✓ Bilde klart!";
    setTimeout(() => st.style.display = "none", 2500);
  } catch (e) { st.className = "bilde-upload-status feil"; st.textContent = "❌ " + e.message; }
}

async function lastOppBildeAdd(input) {
  const fil = input.files[0]; if (!fil) return; input.value = "";
  const st = document.getElementById("addBildeStatus");
  st.style.display = "block"; st.className = "bilde-upload-status uploading"; st.textContent = "⟳ " + fil.name + "…";
  try {
    const dataUrl = await komprimerTilBase64(fil);
    document.getElementById("addBildeUrl").value = dataUrl;
    const prev = document.getElementById("addBildePrev");
    prev.src = dataUrl; prev.style.display = "block";
    st.className = "bilde-upload-status success"; st.textContent = "✓ Klar!";
    setTimeout(() => st.style.display = "none", 2000);
  } catch (e) { st.className = "bilde-upload-status feil"; st.textContent = "❌ " + e.message; }
}

// ── Legg til ───────────────────────────────────────────────────────────────
async function leggTil(e) {
  e.preventDefault();
  const navn    = document.getElementById("itemName").value.trim();
  const kat     = document.getElementById("itemKategori").value;
  const enhet   = document.getElementById("itemEnhet").value.trim() || "stk";
  const antall  = parseInt(document.getElementById("itemAntall").value) || 1;
  const pref    = (document.getElementById("itemPrefix").value.trim() || navn.slice(0, 3)).toUpperCase();
  const start   = parseInt(document.getElementById("itemStartNr").value) || 1;
  const not     = document.getElementById("itemNotater").value.trim();
  const bildeUrl = document.getElementById("addBildeUrl").value.trim();
  const btn = document.getElementById("addBtn");
  btn.disabled = true; btn.textContent = "Legger til…";
  const nye = Array.from({ length: antall }, (_, i) => ({
    id: `${pref}-${String(start + i).padStart(2, "0")}`,
    navn, kategori: kat, enhet,
    serienummer: `${pref}-${String(start + i).padStart(3, "0")}`,
    status: "Tilgjengelig",
    utlant_til: "", utlansdato: "", innleveringsdato: "",
    hylleplassering: "", notater: not,
    bilde_url: bildeUrl.startsWith("data:") ? bildeUrl : konverterBildeUrl(bildeUrl),
  }));
  const { error } = await db.from("gjenstander").upsert(nye, { onConflict: "id" });
  if (error) { visBanner("Feil: " + error.message, "error"); }
  else {
    visBanner(`✓ ${antall} gjenstand${antall > 1 ? "er" : ""} lagt til`, "success");
    document.getElementById("addItemForm").reset();
    document.getElementById("itemAntall").value = "1";
    document.getElementById("addBildeUrl").value = "";
    document.getElementById("addBildePrev").style.display = "none";
    oppdaterPrev();
    await lastInn();
    settFane("lager");
  }
  btn.disabled = false; btn.textContent = "➕ Legg til";
}

// ── Slett ──────────────────────────────────────────────────────────────────
let _slettFn = null;

function bekreftSlett(id, navn, skipBekreft) {
  _slettFn = async () => {
    const { error } = await db.from("gjenstander").delete().eq("id", id);
    if (!error) { lukkSlettModal(); await lastInn(); visBanner("🗑️ Slettet", "success"); }
    else visBanner("Feil: " + error.message, "error");
  };
  if (skipBekreft) { _slettFn(); return; }
  document.getElementById("deleteItemName").textContent = `"${navn}" (${id})`;
  document.getElementById("deleteModal").classList.add("open");
  document.getElementById("confirmDeleteBtn").onclick = _slettFn;
  // Focus confirm button so Enter works immediately
  setTimeout(() => document.getElementById("confirmDeleteBtn").focus(), 50);
}
function lukkSlettModal() { document.getElementById("deleteModal").classList.remove("open"); _slettFn = null; }

// ── QR visning & utskrift ──────────────────────────────────────────────────
let _qrAktivId = null;
let printKo    = []; // [id, id, ...]
let drawerOpen = false;

function apneQr(id, navn) {
  _qrAktivId = id;
  document.getElementById("qrModalTitle").textContent = navn;
  const cont = document.getElementById("qrContainer");
  cont.innerHTML = "";
  const url = APP_BASE_URL + "item.html?id=" + enc(id);
  document.getElementById("qrUrl").textContent = url;
  new QRCode(cont, { text: url, width: 160, height: 160, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
  // Update "legg i kø" button state
  const iKo = printKo.includes(id);
  const btn = document.getElementById("leggIKoBtn");
  if (btn) { btn.textContent = iKo ? "✓ I utskriftskø" : "➕ Legg i utskriftskø"; btn.classList.toggle("i-ko", iKo); }
  document.getElementById("qrModal").classList.add("open");
}

function lukkQrModal() {
  document.getElementById("qrModal").classList.remove("open");
  document.getElementById("qrContainer").innerHTML = "";
  _qrAktivId = null;
}

// Lag QR som data-URL og returner Promise<string> (img tag)
function lagQrCanvas(url, size) {
  return new Promise(resolve => {
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:absolute;left:-9999px;top:-9999px;visibility:hidden";
    document.body.appendChild(wrap);
    new QRCode(wrap, { text: url, width: size, height: size, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
    setTimeout(() => {
      const canvas = wrap.querySelector("canvas");
      if (canvas) {
        const dataUrl = canvas.toDataURL("image/png");
        document.body.removeChild(wrap);
        resolve(`<img src="${dataUrl}" width="190" height="190" style="display:block">`);
      } else {
        const img = wrap.querySelector("img");
        const src = img ? img.src : "";
        document.body.removeChild(wrap);
        resolve(`<img src="${src}" width="190" height="190" style="display:block">`);
      }
    }, 120);
  });
}

async function skrivUtEtikett() {
  if (!_qrAktivId) return;
  const g   = gjenstander.find(x => x.id === _qrAktivId);
  const url = APP_BASE_URL + "item.html?id=" + enc(_qrAktivId);
  const qrHTML = await lagQrCanvas(url, 110);
  document.getElementById("printArea").innerHTML = etikettHTML(g, qrHTML);
  await triggerPrint();
}

async function skrivUtAlle() {
  if (!printKo.length) return;
  const btn = document.getElementById("printAlleBtn");
  btn.disabled = true; btn.textContent = "Genererer…";

  // Generate all QR codes first
  const etiketter = [];
  for (const id of printKo) {
    const g = gjenstander.find(x => x.id === id);
    if (!g) continue;
    const url    = APP_BASE_URL + "item.html?id=" + enc(id);
    const qrHTML = await lagQrCanvas(url, 110);
    etiketter.push(etikettHTML(g, qrHTML));
  }

  // Split into pages of 24 (3 cols × 8 rows on A4 portrait)
  const PER_SIDE = 24;
  const sider = [];
  for (let i = 0; i < etiketter.length; i += PER_SIDE) {
    sider.push(etiketter.slice(i, i + PER_SIDE));
  }

  // Wrap each page in a div with page-break-after
  document.getElementById("printArea").innerHTML = sider.map((side, idx) =>
    `<div class="print-side${idx < sider.length - 1 ? " print-side-break" : ""}">${side.join("")}</div>`
  ).join("");

  await triggerPrint();
  btn.disabled = false; btn.textContent = "🖨️ Skriv ut alle";
}

// Show printArea, print, then hide again
function triggerPrint() {
  return new Promise(resolve => {
    const area = document.getElementById("printArea");
    area.style.removeProperty("display"); // let @media print take over
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        area.style.display = "none";
        resolve();
      }, 200);
    }, 400);
  });
}

function etikettHTML(g, qrHTML) {
  return `<div class="print-label">
    <div class="print-label-qr">${qrHTML}</div>
    <div class="print-label-info">
      <div class="print-label-navn">${g.navn}</div>
      <div class="print-label-id">${g.id}</div>
      ${g.hylleplassering ? `<div class="print-label-hylle">📍 ${g.hylleplassering}</div>` : ""}
      <div class="print-label-org">1. Haugerud</div>
    </div>
  </div>`;
}

function toggleKo(id) {
  const iKo = printKo.includes(id);
  if (iKo) {
    fjernFraKo(id);
    visBanner("Fjernet fra kø", "success");
  } else {
    printKo.push(id);
    oppdaterKoUI();
    visBanner("➕ Lagt til i kø (" + printKo.length + " stk)", "success");
  }
}

function leggIKo() {
  if (!_qrAktivId) return;
  const iKo = printKo.includes(_qrAktivId);
  if (iKo) {
    fjernFraKo(_qrAktivId);
  } else {
    printKo.push(_qrAktivId);
    visBanner("➕ Lagt til i kø", "success");
  }
  // Update button
  const btn = document.getElementById("leggIKoBtn");
  if (btn) { btn.textContent = !iKo ? "✓ I utskriftskø" : "➕ Legg i utskriftskø"; btn.classList.toggle("i-ko", !iKo); }
  oppdaterKoUI();
}

function leggAlleIKo() {
  gjenstander.forEach(g => { if (!printKo.includes(g.id)) printKo.push(g.id); });
  visBanner("✓ Alle (" + printKo.length + ") lagt til i kø", "success");
  oppdaterKoUI();
}

function fjernFraKo(id) {
  printKo = printKo.filter(x => x !== id);
  oppdaterKoUI();
}

function tømKo() {
  printKo = [];
  oppdaterKoUI();
  visBanner("Kø tømt", "success");
}

function toggleDrawer() {
  drawerOpen = !drawerOpen;
  document.getElementById("printDrawer").classList.toggle("open", drawerOpen);
  document.querySelector(".btn-ko-lukk").textContent = drawerOpen ? "▼" : "▲";
}

function oppdaterKoUI() {
  const n = printKo.length;
  document.getElementById("koTeller").textContent = n;
  document.getElementById("drawerBadge").textContent = n;
  const toggleBtn = document.getElementById("drawerToggleBtn");
  toggleBtn.style.display = n > 0 ? "flex" : "none";
  // Auto-open drawer when items added
  if (n > 0 && !drawerOpen) { drawerOpen = true; document.getElementById("printDrawer").classList.add("open"); document.querySelector(".btn-ko-lukk").textContent = "▼"; }
  if (n === 0 && drawerOpen) { drawerOpen = false; document.getElementById("printDrawer").classList.remove("open"); }
  const printBtn = document.getElementById("printAlleBtn");
  if (printBtn) printBtn.disabled = n === 0;
  // Render chips
  const liste = document.getElementById("koListe");
  if (!liste) return;
  liste.innerHTML = printKo.map(id => {
    const g = gjenstander.find(x => x.id === id);
    if (!g) return "";
    return `<div class="ko-chip">
      <span class="ko-chip-id">${g.id}</span>
      <span>${g.navn}</span>
      <button class="ko-chip-fjern" onclick="fjernFraKo('${id}')" title="Fjern">×</button>
    </div>`;
  }).join("");
}

// ── Sammendrag ─────────────────────────────────────────────────────────────
function viseSammendrag() {
  const total = gjenstander.length;
  const tilg  = gjenstander.filter(g => g.status === "Tilgjengelig").length;
  const utl   = gjenstander.filter(g => g.status === "Utlånt").length;
  const rep   = gjenstander.filter(g => g.status === "Til reparasjon").length;
  const tapt  = gjenstander.filter(g => g.status === "Tapt").length;
  const forf  = gjenstander.filter(g => g.status === "Utlånt" && g.innleveringsdato && new Date(g.innleveringsdato) < new Date()).length;

  document.getElementById("kpiGrid").innerHTML = [
    { icon: "📦", val: total, label: "Totalt",       color: "#46bdc6" },
    { icon: "✅", val: tilg,  label: "Tilgjengelig", color: "#34d399" },
    { icon: "📤", val: utl,   label: "Utlånt",       color: "#f87171" },
    { icon: "🔧", val: rep,   label: "Reparasjon",   color: "#fbbf24" },
    { icon: "❌", val: tapt,  label: "Tapt",         color: "#94a3b8" },
    ...(forf > 0 ? [{ icon: "⚠️", val: forf, label: "Forfalt", color: "#fb923c" }] : []),
  ].map(k => `<div class="kpi-card"><div class="kpi-icon">${k.icon}</div><div class="kpi-value" style="color:${k.color}">${k.val}</div><div class="kpi-label">${k.label}</div></div>`).join("");

  const kb = document.getElementById("katTabell");
  kb.innerHTML = "";
  KATEGORIER.forEach(kat => {
    const items = gjenstander.filter(g => g.kategori === kat);
    if (!items.length) return;
    const kT = items.filter(g => g.status === "Tilgjengelig").length;
    const kU = items.filter(g => g.status === "Utlånt").length;
    const kR = items.filter(g => g.status === "Til reparasjon").length;
    const kL = items.filter(g => g.status === "Tapt").length;
    const pst = Math.round(kT / items.length * 100);
    const farge = pst > 80 ? "#34d399" : pst > 50 ? "#fbbf24" : "#f87171";
    kb.innerHTML += `<tr>
      <td class="kat-navn" style="padding-left:16px">${kat}</td>
      <td class="center">${items.length}</td>
      <td class="center green-text fw">${kT}</td>
      <td class="center">${kU > 0 ? `<span class="red-text fw">${kU}</span>` : "0"}</td>
      <td class="center">${kR > 0 ? `<span class="orange-text">${kR}</span>` : "0"}</td>
      <td class="center muted-text">${kL}</td>
      <td style="padding-right:16px"><div class="andel-row"><div class="andel-bar"><div class="andel-fill" style="width:${pst}%;background:${farge}"></div></div><span class="andel-pst">${pst}%</span></div></td>
    </tr>`;
  });

  const ul = gjenstander.filter(g => g.status === "Utlånt");
  document.getElementById("utlant-count").textContent = ul.length;
  const ub = document.getElementById("utlantTabell");
  ub.innerHTML = !ul.length
    ? `<tr><td colspan="7" class="empty-row">Ingen utlånte ✅</td></tr>`
    : ul.map(g => {
        const f = g.innleveringsdato && new Date(g.innleveringsdato) < new Date();
        return `<tr class="${f ? "row-forfalt" : ""}">
          <td class="mono" style="padding-left:16px"><a class="item-link" href="item.html?id=${enc(g.id)}">${g.id}</a></td>
          <td>${g.navn}</td><td>${g.utlant_til || "—"}</td>
          <td class="mono small-text center">${g.utlansdato || "—"}</td>
          <td class="mono small-text center ${f ? "orange-text fw" : ""}">${g.innleveringsdato || "—"}${f ? " ⚠️" : ""}</td>
          <td class="center">${f ? '<span class="badge-forfalt">FORFALT</span>' : "OK"}</td>
          <td class="center"><button class="btn-action btn-edit" onclick="apneRediger('${g.id}')">✏️</button></td>
        </tr>`;
      }).join("");
}

// ── Helpers ────────────────────────────────────────────────────────────────
const sk  = s => ({ Tilgjengelig: "tilgjengelig", "Utlånt": "utlant", "Til reparasjon": "reparasjon", Tapt: "tapt" }[s] || "tilgjengelig");
const enc = s => encodeURIComponent(s);

function settFane(navn) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === navn));
  document.querySelectorAll(".hmeny-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === navn));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === navn));
  // Close hamburger menu
  document.getElementById("hamburgerMeny")?.classList.remove("open");
  document.getElementById("hamburger")?.classList.remove("open");
  if (navn === "sammendrag") viseSammendrag();
}

function setSorter(felt) {
  sortDir = sortField === felt && sortDir === "asc" ? "desc" : "asc";
  sortField = felt;
  filtrerOgVis();
}

function oppdaterPrev() {
  const navn  = document.getElementById("itemName")?.value || "";
  const pref  = (document.getElementById("itemPrefix")?.value || navn.slice(0, 3) || "GJN").toUpperCase();
  const ant   = parseInt(document.getElementById("itemAntall")?.value) || 1;
  const start = parseInt(document.getElementById("itemStartNr")?.value) || 1;
  const vis   = Array.from({ length: Math.min(3, ant) }, (_, i) => `${pref}-${String(start + i).padStart(3, "0")}`);
  const el    = document.getElementById("previewText");
  if (el) el.textContent = vis.join(", ") + (ant > 3 ? ` … (${ant} totalt)` : "");
}

function populerSelects() {
  const filterKat = document.getElementById("filterKategori");
  if (filterKat) { filterKat.innerHTML = '<option value="Alle">Alle kategorier</option>'; }
  ["itemKategori", "editKategori"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });
  KATEGORIER.forEach(k => {
    if (filterKat) filterKat.innerHTML += `<option value="${k}">${k}</option>`;
    ["itemKategori", "editKategori"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML += `<option value="${k}">${k}</option>`;
    });
  });
}

function visBanner(tekst, type = "success") {
  const el = document.getElementById("banner");
  el.textContent = tekst; el.className = "banner banner-" + type; el.style.display = "block";
  setTimeout(() => el.style.display = "none", 3000);
}

function setupListeners() {
  document.getElementById("searchInput").addEventListener("input", filtrerOgVis);
  document.getElementById("filterKategori").addEventListener("change", filtrerOgVis);
  document.getElementById("filterStatus").addEventListener("change", filtrerOgVis);
  document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", e => settFane(e.currentTarget.dataset.tab)));
  document.querySelectorAll(".hmeny-tab").forEach(btn => btn.addEventListener("click", e => settFane(e.currentTarget.dataset.tab)));
  document.getElementById("addItemForm").addEventListener("submit", leggTil);
  ["itemName","itemPrefix","itemAntall","itemStartNr"].forEach(id => document.getElementById(id)?.addEventListener("input", oppdaterPrev));
  document.getElementById("editStatus").addEventListener("change", e => toggleUtlan(e.target.value));
  document.getElementById("editBildeUrl").addEventListener("input", e => viseBildePrev(e.target.value));
  document.getElementById("addBildeUrl").addEventListener("input", e => {
    const prev = document.getElementById("addBildePrev");
    const url = konverterBildeUrl(e.target.value);
    if (url) { prev.src = url; prev.style.display = "block"; } else { prev.style.display = "none"; }
  });
  ["editModal","qrModal","deleteModal","scannerModal"].forEach(id =>
    document.getElementById(id).addEventListener("click", e => {
      if (e.target.id === id) { lukkRedigerModal(); lukkQrModal(); lukkSlettModal(); if(id==="scannerModal") lukkScanner(); }
    }));
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { lukkRedigerModal(); lukkQrModal(); lukkSlettModal(); lukkScanner(); }
    if (e.key === "Enter" && document.getElementById("deleteModal").classList.contains("open")) {
      e.preventDefault();
      if (_slettFn) _slettFn();
    }
  });
  oppdaterPrev();
}
