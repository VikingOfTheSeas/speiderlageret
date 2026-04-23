// Passord-innlogging er fjernet. Filen beholdes som en tynn stubb
// slik at eksisterende kall til loggUt() og sjekkInnlogget() fortsatt
// fungerer uten å tvinge brukeren gjennom en innloggingsskjerm.
var SESSION_KEY = "speider_auth";
var ADMIN_UNLOCK_KEY = "adminUnlocked";
var ADMIN_PASSORD = "Terje Marstein";

function sjekkInnlogget() { return true; }
function loggUt() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(ADMIN_UNLOCK_KEY);
  } catch (e) {}
  location.href = "index.html";
}

// Krev passord før man kan aktivere administrer-modus.
// Returnerer Promise<boolean> — true hvis det er OK å aktivere, false ellers.
// Når riktig passord er angitt én gang i session, huskes det til fanen lukkes.
function krevAdminPassord() {
  return new Promise(function(resolve) {
    try {
      if (sessionStorage.getItem(ADMIN_UNLOCK_KEY) === "1") return resolve(true);
    } catch (e) {}

    // Sørg for at shake-keyframe er injisert én gang
    if (!document.getElementById("admin-pw-style")) {
      var st = document.createElement("style");
      st.id = "admin-pw-style";
      st.textContent =
        "@keyframes adminPwShake{" +
        "10%,90%{transform:translate3d(-1px,0,0) scale(1)}" +
        "20%,80%{transform:translate3d(2px,0,0) scale(1)}" +
        "30%,50%,70%{transform:translate3d(-4px,0,0) scale(1)}" +
        "40%,60%{transform:translate3d(4px,0,0) scale(1)}" +
        "}" +
        "#adminPwInput:focus{border-color:rgba(70,189,198,0.6)!important;background:rgba(255,255,255,0.08)!important}" +
        "#adminPwOk:hover{filter:brightness(1.1)}" +
        "#adminPwCancel:hover{background:rgba(255,255,255,0.12)!important;color:#e2e8f0!important}";
      document.head.appendChild(st);
    }

    var overlay = document.createElement("div");
    overlay.id = "adminPassordOverlay";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:10000;background:rgba(5,12,25,0.82);" +
      "backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);" +
      "display:flex;align-items:center;justify-content:center;padding:16px;" +
      "opacity:0;transition:opacity .18s;font-family:'DM Sans',system-ui,sans-serif;";

    overlay.innerHTML =
      "<div class='admin-pw-card' style=\"background:#0d2137;border:1px solid rgba(70,189,198,0.28);border-radius:16px;padding:26px 24px 22px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,0.55);transform:scale(.96) translateY(8px);transition:transform .18s\">" +
        "<div style='font-size:40px;text-align:center;line-height:1;margin-bottom:10px'>🔒</div>" +
        "<h2 style='margin:0 0 6px;font-size:17px;font-weight:700;text-align:center;color:#46bdc6;letter-spacing:.2px'>Administrer-modus</h2>" +
        "<p style='margin:0 0 18px;font-size:13px;text-align:center;color:#94a3b8;line-height:1.4'>Skriv inn passord for å fortsette.</p>" +
        "<input type='password' id='adminPwInput' placeholder='Passord…' autocomplete='current-password' style=\"width:100%;box-sizing:border-box;padding:11px 14px;background:rgba(255,255,255,0.06);border:1px solid rgba(70,189,198,0.25);border-radius:10px;color:#e2e8f0;font-size:14px;font-family:inherit;outline:none;transition:border-color .12s,background .12s\">" +
        "<div id='adminPwErr' style='min-height:18px;font-size:12px;color:#f87171;margin-top:8px;font-weight:600;text-align:center;opacity:0;transition:opacity .15s'></div>" +
        "<div style='display:flex;gap:10px;margin-top:10px'>" +
          "<button id='adminPwCancel' style=\"flex:1;padding:10px 16px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#94a3b8;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;transition:background .12s,color .12s\">Avbryt</button>" +
          "<button id='adminPwOk' style=\"flex:1;padding:10px 20px;background:linear-gradient(135deg,#46bdc6,#2d8a92);border:none;border-radius:8px;color:#0a1628;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;transition:filter .12s\">🔓 Lås opp</button>" +
        "</div>" +
      "</div>";

    document.body.appendChild(overlay);

    var card = overlay.querySelector(".admin-pw-card");
    var input = overlay.querySelector("#adminPwInput");
    var err = overlay.querySelector("#adminPwErr");
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Fade/scale inn
    requestAnimationFrame(function() {
      overlay.style.opacity = "1";
      card.style.transform = "scale(1) translateY(0)";
    });
    setTimeout(function() { try { input.focus(); } catch (e) {} }, 90);

    var done = false;
    function lukk(ok) {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey);
      overlay.style.opacity = "0";
      card.style.transform = "scale(.96) translateY(8px)";
      document.body.style.overflow = prevOverflow;
      setTimeout(function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 180);
      resolve(ok);
    }

    function submit() {
      if (input.value === ADMIN_PASSORD) {
        try { sessionStorage.setItem(ADMIN_UNLOCK_KEY, "1"); } catch (e) {}
        lukk(true);
        return;
      }
      err.textContent = "❌ Feil passord";
      err.style.opacity = "1";
      card.style.animation = "none";
      void card.offsetWidth; // reflow for å re-trigge animasjonen
      card.style.animation = "adminPwShake .35s cubic-bezier(.36,.07,.19,.97) both";
      input.value = "";
      input.focus();
    }

    function onKey(e) {
      if (e.key === "Enter") { e.preventDefault(); submit(); }
      else if (e.key === "Escape") { e.preventDefault(); lukk(false); }
    }

    overlay.querySelector("#adminPwOk").onclick = submit;
    overlay.querySelector("#adminPwCancel").onclick = function() { lukk(false); };
    overlay.addEventListener("click", function(e) { if (e.target === overlay) lukk(false); });
    document.addEventListener("keydown", onKey);
  });
}
