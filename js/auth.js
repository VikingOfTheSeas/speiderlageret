// ════════════════════════════════════════════════════
// ENKEL PASSORD-BESKYTTELSE
// ════════════════════════════════════════════════════

const PASSORD = "Petter Bøckman";
const SESSION_KEY = "speider_auth";

function sjekkInnlogget() {
  return sessionStorage.getItem(SESSION_KEY) === "ok";
}

function loggInn(input) {
  if (input === PASSORD) {
    sessionStorage.setItem(SESSION_KEY, "ok");
    return true;
  }
  return false;
}

function loggUt() {
  sessionStorage.removeItem(SESSION_KEY);
  window.location.href = "index.html";
}

// Kjøres på alle sider — vis login-skjerm hvis ikke innlogget
function beskyttSide() {
  if (sjekkInnlogget()) return; // allerede logget inn, fortsett

  // Skjul alt innhold
  document.body.style.display = "none";

  // Vis login-overlay
  const overlay = document.createElement("div");
  overlay.id = "loginOverlay";
  overlay.innerHTML = `
    <div class="login-box">
      <div class="login-icon">⚜️</div>
      <div class="login-title">Speiderlageret</div>
      <div class="login-sub">Haugerud Speiderlag — Felles lagersystem</div>
      <div class="login-form">
        <input type="password" id="passordInput" placeholder="Skriv inn passord…" autocomplete="current-password">
        <button onclick="forsokInnlogging()">Logg inn →</button>
      </div>
      <div class="login-feil" id="loginFeil" style="display:none">❌ Feil passord, prøv igjen</div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.display = "block";

  // Enter-tast
  document.getElementById("passordInput").addEventListener("keydown", e => {
    if (e.key === "Enter") forsokInnlogging();
  });

  // Fokus på input
  setTimeout(() => document.getElementById("passordInput")?.focus(), 100);
}

function forsokInnlogging() {
  const input = document.getElementById("passordInput").value;
  if (loggInn(input)) {
    document.getElementById("loginOverlay").remove();
  } else {
    const feil = document.getElementById("loginFeil");
    feil.style.display = "block";
    const inp = document.getElementById("passordInput");
    inp.value = "";
    inp.focus();
    inp.classList.add("shake");
    setTimeout(() => inp.classList.remove("shake"), 500);
  }
}
