const KATEGORIER = ["Camping","Kjøkken","Sikkerhet","Utstyr","Navigasjon","Verktøy","Belysning","Vann","Kommunikasjon","Annet"];
const STATUSER   = ["Tilgjengelig","Utlånt","Til reparasjon","Tapt"];

let gjenstander = [];
let sortField   = "id";
let sortDir     = "asc";
let editingId   = null;

document.addEventListener("DOMContentLoaded", async () => {
  populerSelects();
  setupListeners();
  await lastInn();
  setupRealtime();
});

// ── Supabase ───────────────────────────────────────────────────────────────
async function lastInn() {
  document.getElementById("itemsBody").innerHTML =
    `<tr><td colspan="8" class="empty-row loading-text">Laster…</td></tr>`;
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
    })
    .subscribe();
}

// ── Filtrering ─────────────────────────────────────────────────────────────
function filtrerOgVis() {
  const sok  = document.getElementById("searchInput").value.toLowerCase();
  const kat  = document.getElementById("filterKategori").value;
  const stat = document.getElementById("filterStatus").value;

  let liste = gjenstander.filter(g => {
    const sokTreff = !sok ||
      g.id.toLowerCase().includes(sok) ||
      g.navn.toLowerCase().includes(sok) ||
      (g.serienummer   || "").toLowerCase().includes(sok) ||
      (g.utlant_til    || "").toLowerCase().includes(sok) ||
      (g.hylleplassering || "").toLowerCase().includes(sok);
    return sokTreff
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
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">Ingen gjenstander</td></tr>`;
    return;
  }
  tbody.innerHTML = liste.map(g => {
    const sn = g.navn.replace(/'/g, "\\'");
    return `<tr class="item-row row-${sk(g.status)}" data-id="${g.id}">
      <td><a class="item-link mono" href="item.html?id=${enc(g.id)}">${g.id}</a></td>
      <td><a class="item-name-link" href="item.html?id=${enc(g.id)}">${g.navn}</a></td>
      <td class="col-hide-sm muted-text">${g.kategori || "—"}</td>
      <td class="col-hide-md mono muted-text">${g.serienummer || "—"}</td>
      <td>
        <select class="inline-status status-select-${sk(g.status)}" onchange="raskStatus('${g.id}',this)">
          ${STATUSER.map(s => `<option${s===g.status?" selected":""}>${s}</option>`).join("")}
        </select>
      </td>
      <td class="col-hide-sm small-text">${g.utlant_til || '<span class="dash">—</span>'}</td>
      <td class="col-hide-md mono small-text">${g.hylleplassering || '<span class="dash">—</span>'}</td>
      <td>
        <div class="actions-cell">
          <button class="btn-action btn-edit"   onclick="apneRediger('${g.id}')">✏️</button>
          <button class="btn-action btn-qr"     onclick="apneQr('${g.id}','${sn}')">⬛</button>
          <button class="btn-action btn-delete" onclick="bekreftSlett('${g.id}','${sn}')">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join("");
}

function oppdaterStats() {
  document.getElementById("stat-total").textContent        = gjenstander.length;
  document.getElementById("stat-tilgjengelig").textContent = gjenstander.filter(g => g.status === "Tilgjengelig").length;
  document.getElementById("stat-utlant").textContent       = gjenstander.filter(g => g.status === "Utlånt").length;
}

// ── Rask status ────────────────────────────────────────────────────────────
async function raskStatus(id, sel) {
  const ny = sel.value;
  const g  = gjenstander.find(x => x.id === id);
  if (!g || g.status === ny) return;
  if (ny === "Utlånt" && !g.utlant_til) { apneRediger(id); sel.value = g.status; return; }
  const ok = { ...g, status: ny };
  if (ny !== "Utlånt") { ok.utlant_til = ""; ok.utlansdato = ""; ok.innleveringsdato = ""; }
  sel.className = "inline-status status-select-" + sk(ny);
  document.querySelector(`[data-id="${id}"]`).className = "item-row row-" + sk(ny);
  const { error } = await db.from("gjenstander").upsert(ok, { onConflict: "id" });
  if (error) { visBanner("Feil: " + error.message, "error"); sel.value = g.status; }
  else { Object.assign(g, ok); oppdaterStats(); viseSammendrag(); visBanner("✓ " + ny, "success"); }
}

// ── Rediger ────────────────────────────────────────────────────────────────
function apneRediger(id) {
  const g = gjenstander.find(x => x.id === id);
  if (!g) return;
  editingId = id;
  document.getElementById("editModalTitle").textContent  = g.navn;
  document.getElementById("editNavn").value              = g.navn || "";
  document.getElementById("editKategori").value          = g.kategori || "Annet";
  document.getElementById("editSerienummer").value       = g.serienummer || "";
  document.getElementById("editHylle").value             = g.hylleplassering || "";
  document.getElementById("editBildeUrl").value          = g.bilde_url || "";
  document.getElementById("editStatus").value            = g.status || "Tilgjengelig";
  document.getElementById("editUtlantTil").value         = g.utlant_til || "";
  document.getElementById("editUtlansdato").value        = g.utlansdato || "";
  document.getElementById("editInnlevering").value       = g.innleveringsdato || "";
  document.getElementById("editNotater").value           = g.notater || "";
  viseBildePrev(g.bilde_url);
  toggleUtlan(g.status);
  document.getElementById("editModal").classList.add("open");
  document.body.style.overflow = "hidden";
}

function lukkRedigerModal() {
  document.getElementById("editModal").classList.remove("open");
  document.body.style.overflow = "";
  editingId = null;
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
  if (!editingId) return;
  const btn = document.getElementById("saveEditBtn");
  btn.disabled = true; btn.textContent = "Lagrer…";
  const bildeRaw = document.getElementById("editBildeUrl").value.trim();
  const oppdatert = {
    id: editingId,
    navn:             document.getElementById("editNavn").value.trim(),
    kategori:         document.getElementById("editKategori").value,
    serienummer:      document.getElementById("editSerienummer").value.trim(),
    hylleplassering:  document.getElementById("editHylle").value.trim(),
    bilde_url:        bildeRaw.startsWith("data:") ? bildeRaw : konverterBildeUrl(bildeRaw),
    status:           document.getElementById("editStatus").value,
    utlant_til:       document.getElementById("editUtlantTil").value.trim(),
    utlansdato:       document.getElementById("editUtlansdato").value,
    innleveringsdato: document.getElementById("editInnlevering").value,
    notater:          document.getElementById("editNotater").value.trim(),
  };
  const { error } = await db.from("gjenstander").upsert(oppdatert, { onConflict: "id" });
  if (error) { visBanner("Feil: " + error.message, "error"); }
  else { await lastInn(); lukkRedigerModal(); visBanner("✓ Lagret!", "success"); }
  btn.disabled = false; btn.textContent = "💾 Lagre";
}

// ── Bildeopplasting ────────────────────────────────────────────────────────
async function lastOppBilde(input) {
  const fil = input.files[0];
  if (!fil) return;
  input.value = "";
  const st = document.getElementById("bildeUploadStatus");
  st.style.display = "block"; st.className = "bilde-upload-status uploading";
  st.textContent = "⟳ Behandler " + fil.name + "…";
  try {
    const dataUrl = await komprimerTilBase64(fil);
    document.getElementById("editBildeUrl").value = dataUrl;
    viseBildePrev(dataUrl);
    st.className = "bilde-upload-status success"; st.textContent = "✓ Bilde klart!";
    setTimeout(() => st.style.display = "none", 2500);
  } catch (e) {
    st.className = "bilde-upload-status feil"; st.textContent = "❌ " + e.message;
  }
}

// ── Legg til ───────────────────────────────────────────────────────────────
async function leggTil(e) {
  e.preventDefault();
  const navn   = document.getElementById("itemName").value.trim();
  const kat    = document.getElementById("itemKategori").value;
  const enhet  = document.getElementById("itemEnhet").value.trim() || "stk";
  const antall = parseInt(document.getElementById("itemAntall").value) || 1;
  const pref   = (document.getElementById("itemPrefix").value.trim() || navn.slice(0, 3)).toUpperCase();
  const start  = parseInt(document.getElementById("itemStartNr").value) || 1;
  const not    = document.getElementById("itemNotater").value.trim();
  const btn    = document.getElementById("addBtn");
  btn.disabled = true; btn.textContent = "Legger til…";
  const nye = Array.from({ length: antall }, (_, i) => ({
    id: `${pref}-${String(start + i).padStart(2, "0")}`,
    navn, kategori: kat, enhet,
    serienummer: `${pref}-${String(start + i).padStart(3, "0")}`,
    status: "Tilgjengelig",
    utlant_til: "", utlansdato: "", innleveringsdato: "",
    hylleplassering: "", notater: not, bilde_url: "",
  }));
  const { error } = await db.from("gjenstander").upsert(nye, { onConflict: "id" });
  if (error) { visBanner("Feil: " + error.message, "error"); }
  else {
    visBanner(`✓ ${antall} gjenstand${antall > 1 ? "er" : ""} lagt til`, "success");
    document.getElementById("addItemForm").reset();
    document.getElementById("itemAntall").value = "1";
    oppdaterPrev();
    await lastInn();
    settFane("lager");
  }
  btn.disabled = false; btn.textContent = "➕ Legg til";
}

// ── Slett ──────────────────────────────────────────────────────────────────
function bekreftSlett(id, navn) {
  document.getElementById("deleteItemName").textContent = `"${navn}" (${id})`;
  document.getElementById("deleteModal").classList.add("open");
  document.getElementById("confirmDeleteBtn").onclick = async () => {
    const { error } = await db.from("gjenstander").delete().eq("id", id);
    if (!error) { lukkSlettModal(); await lastInn(); visBanner("🗑️ Slettet", "success"); }
    else visBanner("Feil: " + error.message, "error");
  };
}
function lukkSlettModal() { document.getElementById("deleteModal").classList.remove("open"); }

// ── QR ─────────────────────────────────────────────────────────────────────
function apneQr(id, navn) {
  document.getElementById("qrModalTitle").textContent = navn;
  const cont = document.getElementById("qrContainer");
  cont.innerHTML = "";
  const url = APP_BASE_URL + "item.html?id=" + enc(id);
  document.getElementById("qrUrl").textContent = url;
  new QRCode(cont, { text: url, width: 220, height: 220, colorDark: "#0a1628", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
  document.getElementById("qrModal").classList.add("open");
}
function lukkQrModal() { document.getElementById("qrModal").classList.remove("open"); document.getElementById("qrContainer").innerHTML = ""; }

// ── Sammendrag ─────────────────────────────────────────────────────────────
function viseSammendrag() {
  const total  = gjenstander.length;
  const tilg   = gjenstander.filter(g => g.status === "Tilgjengelig").length;
  const utlant = gjenstander.filter(g => g.status === "Utlånt").length;
  const rep    = gjenstander.filter(g => g.status === "Til reparasjon").length;
  const tapt   = gjenstander.filter(g => g.status === "Tapt").length;
  const forfalt = gjenstander.filter(g => g.status === "Utlånt" && g.innleveringsdato && new Date(g.innleveringsdato) < new Date()).length;

  document.getElementById("kpiGrid").innerHTML = [
    { icon: "📦", val: total,   label: "Totalt",         color: "#46bdc6" },
    { icon: "✅", val: tilg,    label: "Tilgjengelig",   color: "#34d399" },
    { icon: "📤", val: utlant,  label: "Utlånt",         color: "#f87171" },
    { icon: "🔧", val: rep,     label: "Til reparasjon", color: "#fbbf24" },
    { icon: "❌", val: tapt,    label: "Tapt",           color: "#94a3b8" },
    ...(forfalt > 0 ? [{ icon: "⚠️", val: forfalt, label: "Forfalt", color: "#fb923c" }] : []),
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
const sk  = s => ({ Tilgjengelig: "tilgjengelig", Utlånt: "utlant", "Til reparasjon": "reparasjon", Tapt: "tapt" }[s] || "tilgjengelig");
const enc = s => encodeURIComponent(s);

function settFane(navn) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === navn));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === navn));
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
  ["filterKategori", "itemKategori", "editKategori"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === "filterKategori") el.innerHTML = '<option value="Alle">Alle kategorier</option>';
    else el.innerHTML = "";
    KATEGORIER.forEach(k => el.innerHTML += `<option value="${k}">${k}</option>`);
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
  document.getElementById("addItemForm").addEventListener("submit", leggTil);
  ["itemName", "itemPrefix", "itemAntall", "itemStartNr"].forEach(id => document.getElementById(id)?.addEventListener("input", oppdaterPrev));
  document.getElementById("editStatus").addEventListener("change", e => toggleUtlan(e.target.value));
  document.getElementById("editBildeUrl").addEventListener("input", e => viseBildePrev(e.target.value));
  ["editModal", "qrModal", "deleteModal"].forEach(id =>
    document.getElementById(id).addEventListener("click", e => {
      if (e.target.id === id) { lukkRedigerModal(); lukkQrModal(); lukkSlettModal(); }
    }));
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { lukkRedigerModal(); lukkQrModal(); lukkSlettModal(); }
  });
  oppdaterPrev();
}
