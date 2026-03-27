let currentBoks = null;
let boksGjenstander = [];
let aktiveUtlan = [];

document.addEventListener("DOMContentLoaded", async () => {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) { visError("Ingen boks-ID i URL."); return; }
  await lastInnBoks(id);
  // Realtime
  db.channel("boks-" + id)
    .on("postgres_changes", { event: "*", schema: "public", table: "gjenstander" }, () => lastInnBoks(id))
    .on("postgres_changes", { event: "*", schema: "public", table: "utlanslogg" }, () => lastInnBoks(id))
    .subscribe();
});

async function lastInnBoks(id) {
  const { data: boks, error: bErr } = await db.from("bokser").select("*").eq("id", id).single();
  if (bErr || !boks) { visError("Fant ingen boks med ID: " + id); return; }
  currentBoks = boks;

  const { data: gjenstander } = await db.from("gjenstander").select("*").eq("boks_id", id);
  boksGjenstander = gjenstander || [];

  const gIds = boksGjenstander.map(g => g.id);
  let utlan = [];
  if (gIds.length > 0) {
    const { data } = await db.from("utlanslogg")
      .select("*")
      .in("gjenstand_id", gIds)
      .eq("status", "aktiv")
      .order("opprettet", { ascending: false });
    utlan = data || [];
  }
  aktiveUtlan = utlan;

  renderBoks();
}

function renderBoks() {
  document.getElementById("loadingState").style.display = "none";
  document.getElementById("boksContent").style.display  = "block";
  document.title = currentBoks.navn + " – 1. Haugerud";
  document.getElementById("boksNavn").textContent = currentBoks.navn;
  document.getElementById("boksHylle").textContent = currentBoks.hylleplassering ? "📍 " + currentBoks.hylleplassering : "";
  document.getElementById("boksBeskrivelse").textContent = currentBoks.beskrivelse || "";
  document.getElementById("boksIdInfo").textContent    = currentBoks.id;
  document.getElementById("boksHylleInfo").textContent = currentBoks.hylleplassering || "—";
  document.getElementById("boksBeskInfo").textContent  = currentBoks.beskrivelse || "—";

  // Bilde
  const bUrl = konverterBildeUrl(currentBoks.bilde_url);
  const bImg = document.getElementById("boksBilde");
  const bPh  = document.getElementById("bildePlaceholder");
  document.getElementById("boksBildeUrl").value = currentBoks.bilde_url || "";
  if (bUrl) {
    bImg.src = bUrl; bImg.style.display = "block"; bPh.style.display = "none";
    bImg.onerror = () => { bImg.style.display = "none"; bPh.style.display = "flex"; };
  } else {
    bImg.style.display = "none"; bPh.style.display = "flex";
  }

  const totalTilg = boksGjenstander.reduce((s, g) => s + tilgjengelig(g), 0);
  document.getElementById("boksTeller").textContent = boksGjenstander.length + " typer · " + totalTilg + " ledig";

  // Innhold-tabell
  const tbody = document.getElementById("boksInnhold");
  tbody.innerHTML = boksGjenstander.length === 0
    ? '<tr><td colspan="5" class="empty-row">Ingen gjenstander i boksen</td></tr>'
    : boksGjenstander.map(g => {
        const tilg = tilgjengelig(g);
        const utl  = g.antall_utlant || 0;
        const tot  = g.antall_totalt || 1;
        return `<tr>
          <td class="tc"><a class="item-name-link" href="item.html?id=${enc(g.id)}">${g.navn}</a></td>
          <td class="tc green-text fw">${tilg}</td>
          <td class="tc ${utl > 0 ? "red-text" : "muted-text"}">${utl}</td>
          <td class="tc muted-text">${tot}</td>
          <td class="tc">
            <div class="actions-cell">
              <button class="btn-action btn-edit" onclick="apneUtlanForGjenstand('${g.id}')">📤</button>
              <button class="btn-action btn-qr"  onclick="apneLeverForGjenstand('${g.id}')">📥</button>
            </div>
          </td>
        </tr>`;
      }).join("");

  // Aktive utlån
  document.getElementById("aktivUtlanCount").textContent = aktiveUtlan.length;
  const uTbody = document.getElementById("boksUtlanslogg");
  uTbody.innerHTML = aktiveUtlan.length === 0
    ? '<tr><td colspan="6" class="empty-row">Ingen aktive utlån ✅</td></tr>'
    : aktiveUtlan.map(u => {
        const g = boksGjenstander.find(x => x.id === u.gjenstand_id);
        const navn = g ? g.navn : u.gjenstand_id;
        const forfalt = u.innleveringsdato && new Date(u.innleveringsdato) < new Date();
        return `<tr class="${forfalt ? "row-forfalt" : ""}">
          <td style="padding-left:16px">${navn}</td>
          <td class="tc fw">${u.antall}</td>
          <td>${u.utlant_til || "—"}</td>
          <td class="tc mono small-text">${u.utlansdato || "—"}</td>
          <td class="tc mono small-text ${forfalt ? "orange-text fw" : ""}">${u.innleveringsdato || "—"}${forfalt ? " ⚠️" : ""}</td>
          <td class="tc">
            <button class="btn-action btn-qr" onclick="leverEnkelt(${u.id}, ${u.antall})" title="Lever inn alle">✅ Alle</button>
            <button class="btn-action btn-edit" onclick="leverDels(${u.id}, ${u.antall})" title="Lever inn delvis">✏️</button>
          </td>
        </tr>`;
      }).join("");
}

// ── Utlån ──────────────────────────────────────────────────────────────────
let _utlanGjenstandId = null;

function apneUtlan() { _utlanGjenstandId = null; byggUtlanModal(null); }
function apneUtlanForGjenstand(id) { _utlanGjenstandId = id; byggUtlanModal(id); }

function byggUtlanModal(forhåndsId) {
  const tilgj = boksGjenstander.filter(g => tilgjengelig(g) > 0);
  if (!tilgj.length) { visBanner("Ingenting tilgjengelig å låne ut", "error"); return; }

  let html = `
    <div class="form-field">
      <label>Gjenstand</label>
      <select id="utlanGjenstand" class="filter-input" style="width:100%" onchange="oppdaterMaks()">
        ${tilgj.map(g => `<option value="${g.id}" data-maks="${tilgjengelig(g)}" ${g.id === forhåndsId ? "selected" : ""}>${g.navn} (${tilgjengelig(g)} tilgj.)</option>`).join("")}
      </select>
    </div>
    <div class="form-field">
      <label>Antall</label>
      <input type="number" id="utlanAntall" value="1" min="1" style="width:100%">
    </div>
    <div class="form-field">
      <label>Låntaker *</label>
      <input type="text" id="utlanTil" placeholder="Navn eller gruppe" style="width:100%">
    </div>
    <div class="form-grid2">
      <div class="form-field"><label>Utlånsdato</label><input type="date" id="utlanDato" value="${iDag()}"></div>
      <div class="form-field"><label>Leveres inn</label><input type="date" id="utlanFrist"></div>
    </div>`;

  document.getElementById("utlanBody").innerHTML = html;
  oppdaterMaks();
  document.getElementById("utlanModal").classList.add("open");
}

function oppdaterMaks() {
  const sel = document.getElementById("utlanGjenstand");
  if (!sel) return;
  const maks = parseInt(sel.selectedOptions[0]?.dataset.maks || 1);
  const inp  = document.getElementById("utlanAntall");
  inp.max = maks;
  if (parseInt(inp.value) > maks) inp.value = maks;
}

async function lagreUtlan() {
  const gId   = document.getElementById("utlanGjenstand").value;
  const antall = parseInt(document.getElementById("utlanAntall").value);
  const til    = document.getElementById("utlanTil").value.trim();
  const dato   = document.getElementById("utlanDato").value;
  const frist  = document.getElementById("utlanFrist").value;
  const g = boksGjenstander.find(x => x.id === gId);
  if (!til)   { visBanner("Fyll inn låntaker", "error"); return; }
  if (!g)     { visBanner("Ugyldig gjenstand", "error"); return; }
  if (antall < 1 || antall > tilgjengelig(g)) { visBanner("Ugyldig antall", "error"); return; }

  const btn = document.querySelector("#utlanModal .btn-save");
  btn.disabled = true; btn.textContent = "Lagrer…";

  // Insert logg
  const { error: logErr } = await db.from("utlanslogg").insert({
    gjenstand_id: gId, boks_id: currentBoks.id,
    antall, utlant_til: til, utlansdato: dato, innleveringsdato: frist || null, status: "aktiv"
  });
  if (logErr) { visBanner("Feil: " + logErr.message, "error"); btn.disabled = false; btn.textContent = "💾 Registrer utlån"; return; }

  // Update antall_utlant on gjenstand
  const { error: gErr } = await db.from("gjenstander")
    .update({ antall_utlant: (g.antall_utlant || 0) + antall, status: "Utlånt", utlant_til: til, utlansdato: dato, innleveringsdato: frist || null })
    .eq("id", gId);
  if (gErr) visBanner("Advarsel: logg OK men gjenstand ikke oppdatert", "error");

  lukkUtlan();
  await lastInnBoks(currentBoks.id);
  visBanner(`✓ ${antall} × ${g.navn} utlånt til ${til}`, "success");
  btn.disabled = false; btn.textContent = "💾 Registrer utlån";
}

function lukkUtlan() { document.getElementById("utlanModal").classList.remove("open"); }

// ── Lever inn ──────────────────────────────────────────────────────────────
function apneLever() { byggLeverModal(null); }
function apneLeverForGjenstand(id) { byggLeverModal(id); }

function byggLeverModal(filterId) {
  const aktive = filterId ? aktiveUtlan.filter(u => u.gjenstand_id === filterId) : aktiveUtlan;
  if (!aktive.length) { visBanner("Ingen aktive utlån å levere inn", "error"); return; }
  const g = filterId ? boksGjenstander.find(x => x.id === filterId) : null;

  let html = `<div style="display:flex;flex-direction:column;gap:10px">`;
  for (const u of aktive) {
    const gj = boksGjenstander.find(x => x.id === u.gjenstand_id);
    html += `<div class="utlan-section" style="gap:8px">
      <div class="utlan-title">${gj ? gj.navn : u.gjenstand_id} — ${u.utlant_til || "?"} (lånt ${u.antall} stk)</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <label style="font-size:11px;color:var(--muted)">Lever inn:</label>
        <input type="number" id="lever_${u.id}" value="${u.antall}" min="1" max="${u.antall}"
          style="width:70px;padding:6px;background:rgba(255,255,255,0.07);border:1px solid rgba(70,189,198,0.25);border-radius:8px;color:#e2e8f0;font-size:13px">
        <button class="btn-batch-tilg" onclick="settAlleLever(${u.id},${u.antall})">Alle (${u.antall})</button>
      </div>
    </div>`;
  }
  html += `</div>`;

  document.getElementById("leverBody").innerHTML = html;
  document.getElementById("leverModal").classList.add("open");
}

function settAlleLever(logId, antall) {
  const inp = document.getElementById("lever_" + logId);
  if (inp) inp.value = antall;
}

async function lagreLever() {
  const aktive = aktiveUtlan;
  const btn = document.querySelector("#leverModal .btn-save");
  btn.disabled = true; btn.textContent = "Lagrer…";

  for (const u of aktive) {
    const inp = document.getElementById("lever_" + u.id);
    if (!inp) continue;
    const antallLevert = parseInt(inp.value) || 0;
    if (antallLevert <= 0) continue;

    const g = boksGjenstander.find(x => x.id === u.gjenstand_id);
    const nyttUtlant = Math.max(0, (g?.antall_utlant || 0) - antallLevert);
    const erFerdig = antallLevert >= u.antall;

    if (erFerdig) {
      await db.from("utlanslogg").update({ status: "levert", levert_dato: iDag() }).eq("id", u.id);
    } else {
      await db.from("utlanslogg").update({ antall: u.antall - antallLevert }).eq("id", u.id);
    }

    if (g) {
      const nyStatus = nyttUtlant === 0 ? "Tilgjengelig" : "Utlånt";
      await db.from("gjenstander").update({ antall_utlant: nyttUtlant, status: nyStatus }).eq("id", g.id);
    }
  }

  lukkLever();
  await lastInnBoks(currentBoks.id);
  visBanner("✅ Innlevering registrert", "success");
  btn.disabled = false; btn.textContent = "✅ Registrer innlevering";
}

function lukkLever() { document.getElementById("leverModal").classList.remove("open"); }

async function leverEnkelt(logId, antall) {
  const u = aktiveUtlan.find(x => x.id === logId);
  if (!u) return;
  const g = boksGjenstander.find(x => x.id === u.gjenstand_id);
  await db.from("utlanslogg").update({ status: "levert", levert_dato: iDag() }).eq("id", logId);
  if (g) {
    const nyttUtlant = Math.max(0, (g.antall_utlant || 0) - antall);
    await db.from("gjenstander").update({ antall_utlant: nyttUtlant, status: nyttUtlant === 0 ? "Tilgjengelig" : "Utlånt" }).eq("id", g.id);
  }
  await lastInnBoks(currentBoks.id);
  visBanner("✅ Levert inn", "success");
}

async function leverDels(logId, totalt) {
  byggLeverModal(null);
  // Scroll to that entry
  setTimeout(() => {
    const inp = document.getElementById("lever_" + logId);
    if (inp) inp.focus();
  }, 100);
}

// ── Bilde ──────────────────────────────────────────────────────────────────
async function lastOppBokseBilde(input) {
  const fil = input.files[0]; if (!fil) return; input.value = "";
  const st = document.getElementById("boksBildeStatus");
  st.style.display = "block"; st.className = "bilde-upload-status uploading"; st.textContent = "⟳ " + fil.name + "…";
  try {
    const dataUrl = await komprimerTilBase64(fil);
    const { error } = await db.from("bokser").update({ bilde_url: dataUrl }).eq("id", currentBoks.id);
    if (error) throw new Error(error.message);
    currentBoks.bilde_url = dataUrl;
    renderBoks();
    st.className = "bilde-upload-status success"; st.textContent = "✓ Bilde lagret!";
    setTimeout(() => st.style.display = "none", 2500);
  } catch (e) { st.className = "bilde-upload-status feil"; st.textContent = "❌ " + e.message; }
}

async function lagreBokseBildeUrl() {
  const url = document.getElementById("boksBildeUrl").value.trim();
  const { error } = await db.from("bokser").update({ bilde_url: url }).eq("id", currentBoks.id);
  if (!error) { currentBoks.bilde_url = url; renderBoks(); visBanner("✓ Bilde oppdatert", "success"); }
  else visBanner("Feil: " + error.message, "error");
}

// ── Helpers ────────────────────────────────────────────────────────────────
const tilgjengelig = g => Math.max(0, (g.antall_totalt || 1) - (g.antall_utlant || 0));
const enc  = s => encodeURIComponent(s);
const iDag = () => new Date().toISOString().split("T")[0];

function visError(msg) {
  document.getElementById("loadingState").style.display = "none";
  document.getElementById("errorState").style.display   = "flex";
  document.getElementById("errorMsg").textContent = msg;
}
function visBanner(tekst, type = "success") {
  const el = document.getElementById("banner");
  el.textContent = tekst; el.className = "banner banner-" + type; el.style.display = "block";
  setTimeout(() => el.style.display = "none", 3000);
}
document.getElementById("utlanModal")?.addEventListener("click", e => { if (e.target.id === "utlanModal") lukkUtlan(); });
document.getElementById("leverModal")?.addEventListener("click", e => { if (e.target.id === "leverModal") lukkLever(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") { lukkUtlan(); lukkLever(); } });
