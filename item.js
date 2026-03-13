let currentItem = null;

document.addEventListener("DOMContentLoaded", async () => {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) { visError("Ingen ID i URL."); return; }
  const { data, error } = await db.from("gjenstander").select("*").eq("id", id).single();
  if (error || !data) { visError("Fant ingen gjenstand med ID: " + id); return; }
  currentItem = data;
  renderItem(data);
  db.channel("item-" + id)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "gjenstander", filter: `id=eq.${id}` },
      p => { currentItem = p.new; renderItem(p.new); })
    .subscribe();
});

function renderItem(g) {
  document.title = g.navn + " – 1. Haugerud";
  document.getElementById("loadingState").style.display = "none";
  document.getElementById("itemContent").style.display  = "block";
  document.getElementById("itemNavn").textContent         = g.navn;
  document.getElementById("itemId").textContent           = g.id;
  document.getElementById("itemKategori").textContent     = g.kategori  || "—";
  document.getElementById("itemSerienummer").textContent  = g.serienummer || "—";
  document.getElementById("itemHylleHeader").textContent  = g.hylleplassering || "—";
  document.getElementById("hylleLabelBig").textContent    = g.hylleplassering || "—";
  document.getElementById("itemHylle").textContent        = g.hylleplassering || "—";
  document.getElementById("itemKategori2").textContent    = g.kategori  || "—";
  document.getElementById("itemSerienummer2").textContent = g.serienummer || "—";
  document.getElementById("itemEnhet").textContent        = g.enhet     || "stk";
  document.getElementById("itemNotater").textContent      = g.notater   || "—";

  const statusEl = document.getElementById("itemStatus");
  statusEl.textContent = g.status;
  statusEl.className = "status-badge status-" + sk(g.status);
  renderQknapper(g.status);

  const banner = document.getElementById("utlanBanner");
  if (g.status === "Utlånt") {
    banner.style.display = "block";
    document.getElementById("bannerTil").textContent  = g.utlant_til || "—";
    document.getElementById("bannerDato").textContent = g.utlansdato || "—";
    const fristEl = document.getElementById("bannerFrist");
    const forfalt = g.innleveringsdato && new Date(g.innleveringsdato) < new Date();
    fristEl.textContent = (g.innleveringsdato || "—") + (forfalt ? " ⚠️" : "");
    fristEl.className = "utlan-banner-val mono" + (forfalt ? " forfalt-text" : "");
  } else { banner.style.display = "none"; }

  const bildeUrl = konverterBildeUrl(g.bilde_url);
  const img = document.getElementById("hylleBilde");
  const ph  = document.getElementById("bildePlaceholder");
  document.getElementById("newBildeUrl").value = g.bilde_url || "";
  if (bildeUrl) {
    img.src = bildeUrl; img.style.display = "block"; ph.style.display = "none";
    img.onerror = () => { img.style.display = "none"; ph.style.display = "flex"; };
  } else { img.style.display = "none"; ph.style.display = "flex"; }

  const qrEl = document.getElementById("qrCode");
  qrEl.innerHTML = "";
  const url = APP_BASE_URL + "item.html?id=" + encodeURIComponent(g.id);
  document.getElementById("qrUrl").textContent = url;
  new QRCode(qrEl, { text: url, width: 190, height: 190, colorDark: "#0a1628", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
}

function renderQknapper(gjeldende) {
  const btns = [
    { label: "✅ Tilgjengelig", val: "Tilgjengelig",   cls: "qbtn-tilg" },
    { label: "📤 Lån ut",       val: "Utlånt",         cls: "qbtn-utlant" },
    { label: "🔧 Reparasjon",   val: "Til reparasjon", cls: "qbtn-rep" },
    { label: "❌ Tapt",         val: "Tapt",            cls: "qbtn-tapt" },
  ];
  document.getElementById("quickStatusBtns").innerHTML = btns.map(b =>
    `<button class="qbtn ${b.cls}${b.val === gjeldende ? " qbtn-active" : ""}"
             onclick="endreStatus('${b.val}')"
             ${b.val === gjeldende ? "disabled" : ""}>${b.label}</button>`
  ).join("");
}

async function endreStatus(ny) {
  if (!currentItem) return;
  if (ny === "Utlånt") { apneLanModal(); return; }
  const oppdatert = { ...currentItem, status: ny, utlant_til: "", utlansdato: "", innleveringsdato: "" };
  const { error } = await db.from("gjenstander").upsert(oppdatert, { onConflict: "id" });
  if (!error) { currentItem = oppdatert; renderItem(oppdatert); visBanner("✓ " + ny, "success"); }
  else visBanner("Feil: " + error.message, "error");
}

function apneLanModal() {
  document.getElementById("loanTil").value    = currentItem?.utlant_til    || "";
  document.getElementById("loanDato").value   = currentItem?.utlansdato    || new Date().toISOString().split("T")[0];
  document.getElementById("loanFrist").value  = currentItem?.innleveringsdato || "";
  document.getElementById("loanNotater").value = currentItem?.notater      || "";
  document.getElementById("loanModal").classList.add("open");
}
function lukkLanModal() { document.getElementById("loanModal").classList.remove("open"); }

async function lagreLan() {
  const til = document.getElementById("loanTil").value.trim();
  if (!til) { visBanner("Skriv hvem som låner!", "error"); return; }
  const oppdatert = {
    ...currentItem, status: "Utlånt", utlant_til: til,
    utlansdato:       document.getElementById("loanDato").value,
    innleveringsdato: document.getElementById("loanFrist").value,
    notater:          document.getElementById("loanNotater").value.trim() || currentItem.notater,
  };
  const { error } = await db.from("gjenstander").upsert(oppdatert, { onConflict: "id" });
  if (!error) { currentItem = oppdatert; lukkLanModal(); renderItem(oppdatert); visBanner("✓ Utlån registrert", "success"); }
  else visBanner("Feil: " + error.message, "error");
}

async function lastOppBildeItem(input) {
  const fil = input.files[0]; if (!fil) return; input.value = "";
  const st = document.getElementById("bildeUploadStatus");
  st.style.display = "block"; st.className = "bilde-upload-status uploading"; st.textContent = "⟳ " + fil.name + "…";
  try {
    const dataUrl = await komprimerTilBase64(fil);
    const oppdatert = { ...currentItem, bilde_url: dataUrl };
    const { error } = await db.from("gjenstander").upsert(oppdatert, { onConflict: "id" });
    if (error) throw new Error(error.message);
    currentItem = oppdatert; renderItem(oppdatert);
    st.className = "bilde-upload-status success"; st.textContent = "✓ Bilde lagret!";
    setTimeout(() => st.style.display = "none", 2500);
  } catch (e) { st.className = "bilde-upload-status feil"; st.textContent = "❌ " + e.message; }
}

async function lagreBildeUrl() {
  const url = document.getElementById("newBildeUrl").value.trim();
  const konv = konverterBildeUrl(url);
  const oppdatert = { ...currentItem, bilde_url: konv || url };
  const { error } = await db.from("gjenstander").upsert(oppdatert, { onConflict: "id" });
  if (!error) { currentItem = oppdatert; renderItem(oppdatert); visBanner("✓ Bilde oppdatert", "success"); }
  else visBanner("Feil: " + error.message, "error");
}

const sk = s => ({ Tilgjengelig: "tilgjengelig", "Utlånt": "utlant", "Til reparasjon": "reparasjon", Tapt: "tapt" }[s] || "tilgjengelig");
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
document.getElementById("loanModal")?.addEventListener("click", e => { if (e.target.id === "loanModal") lukkLanModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") lukkLanModal(); });
