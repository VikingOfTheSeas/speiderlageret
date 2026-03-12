// ════════════════════════════════════════════════════
// PASSORD-BESKYTTELSE
// ════════════════════════════════════════════════════
 
const PASSORD    = "Petter Bøckman";
const SESSION_KEY = "speider_auth";
 
function sjekkInnlogget() {
  return sessionStorage.getItem(SESSION_KEY) === "ok";
}
function loggInn(input) {
  if (input === PASSORD) { sessionStorage.setItem(SESSION_KEY, "ok"); return true; }
  return false;
}
function loggUt() {
  sessionStorage.removeItem(SESSION_KEY);
  window.location.href = "index.html";
}
 
function beskyttSide() {
  if (sjekkInnlogget()) return;
 
  // Skjul alt
  document.body.innerHTML = "";
  document.body.style.cssText = "margin:0;padding:0;background:linear-gradient(135deg,#0a1628,#0d2137,#0a1a2e);min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:'DM Sans',sans-serif;";
 
  document.body.innerHTML = `
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(70,189,198,0.25);border-radius:20px;padding:48px 40px;width:90%;max-width:380px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,0.4);">
      <div style="font-size:48px;margin-bottom:16px">⚜️</div>
      <div style="font-size:22px;font-weight:700;color:#46bdc6;margin-bottom:8px">Speiderlageret</div>
      <div style="font-size:13px;color:#64748b;margin-bottom:32px;line-height:1.6">Haugerud Speiderlag — Felles lagersystem</div>
      <input type="password" id="passordInput" placeholder="Skriv inn passord…"
        style="width:100%;padding:13px 16px;background:rgba(255,255,255,0.07);border:1px solid rgba(70,189,198,0.25);border-radius:10px;color:#e2e8f0;font-size:15px;font-family:inherit;text-align:center;letter-spacing:1px;box-sizing:border-box;outline:none;margin-bottom:12px">
      <button onclick="forsokInnlogging()"
        style="width:100%;padding:13px;background:linear-gradient(135deg,#46bdc6,#1a8a92);color:#0a1628;font-size:15px;font-weight:700;border:none;border-radius:10px;cursor:pointer;font-family:inherit">
        Logg inn →
      </button>
      <div id="loginFeil" style="display:none;color:#f87171;font-size:13px;margin-top:14px;font-weight:500">❌ Feil passord, prøv igjen</div>
    </div>
  `;
 
  const inp = document.getElementById("passordInput");
  inp.focus();
  inp.addEventListener("keydown", e => { if (e.key === "Enter") forsokInnlogging(); });
}
 
function forsokInnlogging() {
  const input = document.getElementById("passordInput").value;
  if (loggInn(input)) {
    window.location.reload();
  } else {
    document.getElementById("loginFeil").style.display = "block";
    const inp = document.getElementById("passordInput");
    inp.value = "";
    inp.style.borderColor = "rgba(248,113,113,0.6)";
    inp.focus();
    setTimeout(() => { inp.style.borderColor = "rgba(70,189,198,0.25)"; }, 1500);
  }
}
 
// Kjør umiddelbart
beskyttSide();
