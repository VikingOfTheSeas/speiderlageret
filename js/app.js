// ════════════════════════════════════════════════════
// HAUGERUD SPEIDERLAG — APP.JS
// ════════════════════════════════════════════════════

const KATEGORIER = ["Camping","Kjøkken","Sikkerhet","Utstyr","Navigasjon","Verktøy","Belysning","Vann","Kommunikasjon","Annet"];
const STATUSER   = ["Tilgjengelig","Utlånt","Til reparasjon","Tapt"];

let gjenstander   = [];
let filteredItems = [];
let sortField     = "id";
let sortDirection = "asc";
let editingId     = null;
let qrInstance    = null;

// ── Bootstrap ──────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  populateSelects();
  setupEventListeners();
  await loadItems();
  updateStats();
  displaySummary();
  setupRealtimeSync();
});

// ── Supabase: last alle gjenstander ────────────────────────────────────────
async function loadItems() {
  showTableLoading(true);
  try {
    const { data, error } = await db.from("gjenstander").select("*").order("id");
    if (error) throw error;
    gjenstander = data || [];
  } catch (e) {
    console.error("Feil ved lasting:", e);
    showBanner("Kunne ikke laste data fra Supabase. Sjekk config.js", "error");
  }
  showTableLoading(false);
  filterAndDisplay();
}

// ── Supabase: lagre / opprett ───────────────────────────────────────────────
async function upsertItem(item) {
  const { error } = await db.from("gjenstander").upsert(item, { onConflict: "id" });
  if (error) { showBanner("Feil ved lagring: " + error.message, "error"); return false; }
  return true;
}

// ── Supabase: slett ────────────────────────────────────────────────────────
async function deleteItemDB(id) {
  const { error } = await db.from("gjenstander").delete().eq("id", id);
  if (error) { showBanner("Feil ved sletting: " + error.message, "error"); return false; }
  return true;
}

// ── Supabase: realtime ─────────────────────────────────────────────────────
function setupRealtimeSync() {
  db.channel("gjenstander-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "gjenstander" }, async () => {
      await loadItems();
      displaySummary();
    })
    .subscribe();
}

// ── Filtrering og visning ──────────────────────────────────────────────────
function filterAndDisplay() {
  const searchTerm    = document.getElementById("searchInput").value.toLowerCase();
  const kategoriFilter = document.getElementById("filterKategori").value;
  const statusFilter   = document.getElementById("filterStatus").value;

  filteredItems = gjenstander.filter(g => {
    const t = searchTerm;
    const matchSearch = !t ||
      g.navn.toLowerCase().includes(t) ||
      g.id.toLowerCase().includes(t) ||
      (g.serienummer||"").toLowerCase().includes(t) ||
      (g.utlant_til||"").toLowerCase().includes(t) ||
      (g.hylleplassering||"").toLowerCase().includes(t);
    return matchSearch &&
      (kategoriFilter === "Alle" || g.kategori === kategoriFilter) &&
      (statusFilter   === "Alle" || g.status   === statusFilter);
  });

  filteredItems.sort((a, b) => {
    const av = String(a[sortField] || "").toLowerCase();
    const bv = String(b[sortField] || "").toLowerCase();
    const cmp = av.localeCompare(bv, "no");
    return sortDirection === "asc" ? cmp : -cmp;
  });

  displayTable();
  updateStats();
}

// ── Tabell ─────────────────────────────────────────────────────────────────
function displayTable() {
  const tbody = document.getElementById("itemsBody");
  tbody.innerHTML = "";

  if (filteredItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">Ingen gjenstander funnet</td></tr>`;
    document.getElementById("count-shown").textContent = 0;
    document.getElementById("count-total").textContent = gjenstander.length;
    return;
  }

  filteredItems.forEach(g => {
    const tr = document.createElement("tr");
    tr.className = "item-row row-" + statusClass(g.status);
    tr.innerHTML = `
      <td><a class="item-link mono" href="item.html?id=${encodeURIComponent(g.id)}">${g.id}</a></td>
      <td class="item-name">${g.navn}</td>
      <td class="muted-text">${g.kategori || "—"}</td>
      <td class="mono muted-text">${g.serienummer || "—"}</td>
      <td>${statusBadge(g.status)}</td>
      <td>${g.utlant_til || '<span class="dash">—</span>'}</td>
      <td class="mono small-text">${g.hylleplassering || '<span class="dash">—</span>'}</td>
      <td class="actions-cell">
        <button class="btn-action btn-edit"   onclick="openEditModal('${g.id}')" title="Rediger">✏️</button>
        <button class="btn-action btn-qr"     onclick="openQrModal('${g.id}', '${g.navn}')" title="QR-kode">⬛</button>
        <button class="btn-action btn-delete" onclick="confirmDelete('${g.id}', '${g.navn.replace(/'/g,"\\'")}')">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("count-shown").textContent = filteredItems.length;
  document.getElementById("count-total").textContent  = gjenstander.length;
}

function statusBadge(status) {
  return `<span class="status-badge status-${statusClass(status)}">${status}</span>`;
}

function statusClass(status) {
  const map = { "Tilgjengelig": "tilgjengelig", "Utlånt": "utlant", "Til reparasjon": "reparasjon", "Tapt": "tapt" };
  return map[status] || "tilgjengelig";
}

// ── Rask statusendring direkte i tabellen ──────────────────────────────────
async function quickStatusChange(id, selectEl) {
  const newStatus = selectEl.value;
  const g = gjenstander.find(x => x.id === id);
  if (!g || g.status === newStatus) return;

  // Hvis vi setter til Utlånt og det mangler info, åpne modal
  if (newStatus === "Utlånt" && !g.utlant_til) {
    openEditModal(id);
    // Reset select til gammel verdi — modal tar over
    selectEl.value = g.status;
    return;
  }

  // Oppdater UI med en gang (optimistisk)
  const tr = document.querySelector(`[data-id="${id}"]`);
  if (tr) {
    tr.className = "item-row row-" + statusClass(newStatus);
    selectEl.className = "inline-status status-select-" + statusClass(newStatus);
  }

  const ok = await upsertItem({ ...g, status: newStatus });
  if (ok) {
    g.status = newStatus;
    if (newStatus !== "Utlånt") {
      g.utlant_til = "";
      g.utlansdato = "";
      g.innleveringsdato = "";
    }
    updateStats();
    displaySummary();
    showBanner("✓ Status oppdatert til: " + newStatus, "success");
  } else {
    // Tilbakestill ved feil
    selectEl.value = g.status;
    if (tr) tr.className = "item-row row-" + statusClass(g.status);
  }
}

// ── Stats ──────────────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById("stat-total").textContent        = gjenstander.length;
  document.getElementById("stat-tilgjengelig").textContent = gjenstander.filter(g => g.status === "Tilgjengelig").length;
  document.getElementById("stat-utlant").textContent       = gjenstander.filter(g => g.status === "Utlånt").length;
}

// ── Sammendrag ─────────────────────────────────────────────────────────────
function displaySummary() {
  // KPI
  const total    = gjenstander.length;
  const tilg     = gjenstander.filter(g => g.status === "Tilgjengelig").length;
  const utlant   = gjenstander.filter(g => g.status === "Utlånt").length;
  const rep      = gjenstander.filter(g => g.status === "Til reparasjon").length;
  const tapt     = gjenstander.filter(g => g.status === "Tapt").length;
  const forfalt  = gjenstander.filter(g => {
    if (g.status !== "Utlånt" || !g.innleveringsdato) return false;
    return new Date(g.innleveringsdato) < new Date();
  }).length;

  document.getElementById("kpiGrid").innerHTML = `
    <div class="kpi-card" style="border-color:rgba(70,189,198,0.3)">
      <div class="kpi-icon">📦</div><div class="kpi-value" style="color:#46bdc6">${total}</div>
      <div class="kpi-label">Totalt</div></div>
    <div class="kpi-card" style="border-color:rgba(52,211,153,0.3)">
      <div class="kpi-icon">✅</div><div class="kpi-value" style="color:#34d399">${tilg}</div>
      <div class="kpi-label">Tilgjengelig</div></div>
    <div class="kpi-card" style="border-color:rgba(248,113,113,0.3)">
      <div class="kpi-icon">📤</div><div class="kpi-value" style="color:#f87171">${utlant}</div>
      <div class="kpi-label">Utlånt</div></div>
    <div class="kpi-card" style="border-color:rgba(251,191,36,0.3)">
      <div class="kpi-icon">🔧</div><div class="kpi-value" style="color:#fbbf24">${rep}</div>
      <div class="kpi-label">Til reparasjon</div></div>
    <div class="kpi-card" style="border-color:rgba(148,163,184,0.3)">
      <div class="kpi-icon">❌</div><div class="kpi-value" style="color:#94a3b8">${tapt}</div>
      <div class="kpi-label">Tapt</div></div>
    ${forfalt > 0 ? `<div class="kpi-card kpi-alert">
      <div class="kpi-icon">⚠️</div><div class="kpi-value" style="color:#fb923c">${forfalt}</div>
      <div class="kpi-label">Forfalt</div></div>` : ""}
  `;

  // Kategori-tabell
  const katTabell = document.getElementById("katTabell");
  katTabell.innerHTML = "";
  KATEGORIER.forEach(kat => {
    const items = gjenstander.filter(g => g.kategori === kat);
    if (items.length === 0) return;
    const kTilg = items.filter(g => g.status === "Tilgjengelig").length;
    const kUtl  = items.filter(g => g.status === "Utlånt").length;
    const kRep  = items.filter(g => g.status === "Til reparasjon").length;
    const kTapt = items.filter(g => g.status === "Tapt").length;
    const andel = Math.round((kTilg / items.length) * 100);
    katTabell.innerHTML += `
      <tr>
        <td class="kat-navn">${kat}</td>
        <td class="center">${items.length}</td>
        <td class="center green-text fw">${kTilg}</td>
        <td class="center">${kUtl > 0 ? `<span class="red-text fw">${kUtl}</span>` : "0"}</td>
        <td class="center">${kRep > 0 ? `<span class="orange-text">${kRep}</span>` : "0"}</td>
        <td class="center muted-text">${kTapt}</td>
        <td>
          <div class="andel-row">
            <div class="andel-bar"><div class="andel-fill" style="width:${andel}%;background:${andel>80?'#34d399':andel>50?'#fbbf24':'#f87171'}"></div></div>
            <span class="andel-pst muted-text">${andel}%</span>
          </div>
        </td>
      </tr>`;
  });

  // Utlånte gjenstander
  const utlantTabell = document.getElementById("utlantTabell");
  const utlanteItems = gjenstander.filter(g => g.status === "Utlånt");
  if (utlanteItems.length === 0) {
    utlantTabell.innerHTML = `<tr><td colspan="7" class="empty-row">Ingen gjenstander er utlånt for øyeblikket ✅</td></tr>`;
  } else {
    utlantTabell.innerHTML = "";
    utlanteItems.forEach(g => {
      const forfalt = g.innleveringsdato && new Date(g.innleveringsdato) < new Date();
      utlantTabell.innerHTML += `
        <tr class="${forfalt ? "row-forfalt" : ""}">
          <td class="mono"><a class="item-link" href="item.html?id=${g.id}">${g.id}</a></td>
          <td>${g.navn}</td>
          <td>${g.utlant_til || "—"}</td>
          <td class="mono small-text">${g.utlansdato || "—"}</td>
          <td class="mono small-text ${forfalt ? "orange-text fw" : ""}">${g.innleveringsdato || "—"}</td>
          <td>${forfalt ? '<span class="badge-forfalt">⚠️ FORFALT</span>' : '<span class="badge-ok">OK</span>'}</td>
          <td><button class="btn-action btn-edit" onclick="openEditModal('${g.id}')">✏️</button></td>
        </tr>`;
    });
  }

  document.getElementById("utlant-count").textContent = utlanteItems.length;
}

// ── Edit Modal ─────────────────────────────────────────────────────────────
function openEditModal(id) {
  const g = gjenstander.find(x => x.id === id);
  if (!g) return;
  editingId = id;

  document.getElementById("editModalTitle").textContent = g.navn;
  document.getElementById("editNavn").value            = g.navn || "";
  document.getElementById("editKategori").value        = g.kategori || "Annet";
  document.getElementById("editSerienummer").value     = g.serienummer || "";
  document.getElementById("editHylle").value           = g.hylleplassering || "";
  document.getElementById("editBildeUrl").value        = g.bilde_url || "";
  document.getElementById("editStatus").value          = g.status || "Tilgjengelig";
  document.getElementById("editUtlantTil").value       = g.utlant_til || "";
  document.getElementById("editUtlansdato").value      = g.utlansdato || "";
  document.getElementById("editInnlevering").value     = g.innleveringsdato || "";
  document.getElementById("editNotater").value         = g.notater || "";

  toggleUtlanFields(g.status);
  document.getElementById("editModal").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeEditModal() {
  document.getElementById("editModal").classList.remove("open");
  document.body.style.overflow = "";
  editingId = null;
}

function toggleUtlanFields(status) {
  const vis = status === "Utlånt";
  document.getElementById("utlanSection").style.display = vis ? "block" : "none";
}

async function saveEdit() {
  if (!editingId) return;
  const btn = document.getElementById("saveEditBtn");
  btn.disabled = true;
  btn.textContent = "Lagrer…";

  const updated = {
    id:               editingId,
    navn:             document.getElementById("editNavn").value.trim(),
    kategori:         document.getElementById("editKategori").value,
    serienummer:      document.getElementById("editSerienummer").value.trim(),
    hylleplassering:  document.getElementById("editHylle").value.trim(),
    bilde_url:        document.getElementById("editBildeUrl").value.trim(),
    status:           document.getElementById("editStatus").value,
    utlant_til:       document.getElementById("editUtlantTil").value.trim(),
    utlansdato:       document.getElementById("editUtlansdato").value,
    innleveringsdato: document.getElementById("editInnlevering").value,
    notater:          document.getElementById("editNotater").value.trim(),
  };

  const ok = await upsertItem(updated);
  if (ok) {
    await loadItems();
    displaySummary();
    closeEditModal();
    showBanner("✓ Endringer lagret", "success");
  }
  btn.disabled = false;
  btn.textContent = "Lagre endringer";
}

// ── Legg til gjenstander ───────────────────────────────────────────────────
async function addNewItems(e) {
  e.preventDefault();
  const navn     = document.getElementById("itemName").value.trim();
  const kategori = document.getElementById("itemKategori").value;
  const enhet    = document.getElementById("itemEnhet").value.trim() || "stk";
  const antall   = parseInt(document.getElementById("itemAntall").value) || 1;
  const prefiks  = document.getElementById("itemPrefix").value.trim().toUpperCase() || navn.slice(0, 3).toUpperCase();
  const startNr  = parseInt(document.getElementById("itemStartNr").value) || 1;
  const notater  = document.getElementById("itemNotater").value.trim();

  const btn = document.getElementById("addBtn");
  btn.disabled = true;
  btn.textContent = "Legger til…";

  const nye = [];
  for (let i = 0; i < antall; i++) {
    const nr = startNr + i;
    nye.push({
      id:              `${prefiks}-${String(nr).padStart(2,"0")}`,
      navn, kategori, enhet,
      serienummer:     `${prefiks}-${String(nr).padStart(3,"0")}`,
      status:          "Tilgjengelig",
      utlant_til:      "",
      utlansdato:      "",
      innleveringsdato:"",
      hylleplassering: "",
      notater,
      bilde_url:       "",
    });
  }

  const { error } = await db.from("gjenstander").upsert(nye, { onConflict: "id" });
  if (error) {
    showBanner("Feil: " + error.message, "error");
  } else {
    showBanner(`✓ ${antall} gjenstand${antall > 1 ? "er" : ""} lagt til`, "success");
    document.getElementById("addItemForm").reset();
    document.getElementById("itemAntall").value = "1";
    updatePreview();
    await loadItems();
    displaySummary();
    setTab("lager");
  }
  btn.disabled = false;
  btn.textContent = "➕ Legg til";
}

// ── Slett ──────────────────────────────────────────────────────────────────
function confirmDelete(id, navn) {
  document.getElementById("deleteItemName").textContent = `"${navn}" (${id})`;
  document.getElementById("deleteModal").classList.add("open");
  document.getElementById("confirmDeleteBtn").onclick = async () => {
    const ok = await deleteItemDB(id);
    if (ok) {
      document.getElementById("deleteModal").classList.remove("open");
      await loadItems();
      displaySummary();
      showBanner("🗑️ Gjenstand slettet", "success");
    }
  };
}

function closeDeleteModal() {
  document.getElementById("deleteModal").classList.remove("open");
}

// ── QR Modal ───────────────────────────────────────────────────────────────
function openQrModal(id, navn) {
  document.getElementById("qrModalTitle").textContent = navn;
  const container = document.getElementById("qrContainer");
  container.innerHTML = "";
  const url = APP_BASE_URL + "item.html?id=" + encodeURIComponent(id);
  document.getElementById("qrUrl").textContent = url;

  new QRCode(container, {
    text: url,
    width: 220,
    height: 220,
    colorDark: "#0a1628",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H,
  });

  document.getElementById("qrModal").classList.add("open");
}

function closeQrModal() {
  document.getElementById("qrModal").classList.remove("open");
  document.getElementById("qrContainer").innerHTML = "";
}

function printQr() {
  window.print();
}

// ── Serienummer-forhåndsvisning ────────────────────────────────────────────
function updatePreview() {
  const navn   = document.getElementById("itemName")?.value || "";
  const pref   = document.getElementById("itemPrefix")?.value?.toUpperCase() || navn.slice(0,3).toUpperCase() || "GJN";
  const antall = parseInt(document.getElementById("itemAntall")?.value) || 1;
  const start  = parseInt(document.getElementById("itemStartNr")?.value) || 1;
  const vis    = Array.from({length: Math.min(3, antall)}, (_, i) => `${pref}-${String(start+i).padStart(3,"0")}`);
  const tekst  = vis.join(", ") + (antall > 3 ? ` … (${antall} totalt)` : "");
  const el     = document.getElementById("previewText");
  if (el) el.textContent = tekst;
}

// ── Tab-navigasjon ─────────────────────────────────────────────────────────
function setTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === name));
  if (name === "sammendrag") displaySummary();
}

// ── Sortering ──────────────────────────────────────────────────────────────
function setSorter(felt) {
  sortDirection = sortField === felt && sortDirection === "asc" ? "desc" : "asc";
  sortField = felt;
  filterAndDisplay();
}

// ── UI-hjelpere ────────────────────────────────────────────────────────────
function showTableLoading(vis) {
  const tbody = document.getElementById("itemsBody");
  if (vis) tbody.innerHTML = `<tr><td colspan="8" class="empty-row loading-text">⟳ Laster fra Supabase…</td></tr>`;
}

function showBanner(tekst, type = "success") {
  const el = document.getElementById("banner");
  el.textContent = tekst;
  el.className = "banner banner-" + type;
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 3500);
}

function populateSelects() {
  ["filterKategori", "itemKategori", "editKategori"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isFilter = id === "filterKategori";
    el.innerHTML = isFilter ? '<option value="Alle">Alle kategorier</option>' : "";
    KATEGORIER.forEach(k => el.innerHTML += `<option value="${k}">${k}</option>`);
  });
}

function setupEventListeners() {
  document.getElementById("searchInput").addEventListener("input", filterAndDisplay);
  document.getElementById("filterKategori").addEventListener("change", filterAndDisplay);
  document.getElementById("filterStatus").addEventListener("change", filterAndDisplay);

  document.querySelectorAll(".tab").forEach(btn =>
    btn.addEventListener("click", e => setTab(e.currentTarget.dataset.tab)));

  document.getElementById("addItemForm").addEventListener("submit", addNewItems);

  ["itemName","itemPrefix","itemAntall","itemStartNr"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", updatePreview);
  });

  document.getElementById("editStatus").addEventListener("change", e =>
    toggleUtlanFields(e.target.value));

  // Lukk modal ved klikk utenfor
  document.getElementById("editModal").addEventListener("click", e => {
    if (e.target === document.getElementById("editModal")) closeEditModal();
  });
  document.getElementById("qrModal").addEventListener("click", e => {
    if (e.target === document.getElementById("qrModal")) closeQrModal();
  });
  document.getElementById("deleteModal").addEventListener("click", e => {
    if (e.target === document.getElementById("deleteModal")) closeDeleteModal();
  });

  // ESC-tast
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeEditModal(); closeQrModal(); closeDeleteModal(); }
  });

  updatePreview();
}
