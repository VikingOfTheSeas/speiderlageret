// Passord med unicode-escape for å unnga kodingsproblemer med norske tegn
var PASSORD = "Petter B\u00f8ckman";
var SESSION_KEY = "speider_auth";

function sjekkInnlogget() { return sessionStorage.getItem(SESSION_KEY) === "ok"; }
function loggUt() { sessionStorage.removeItem(SESSION_KEY); location.href = "index.html"; }

if (!sjekkInnlogget()) {
  document.addEventListener("DOMContentLoaded", function () {
    visLogin();
  });
}

function visLogin() {
  document.body.style.cssText = "margin:0;padding:0;background:linear-gradient(135deg,#0a1628,#0d2137,#0a1a2e);min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;";
  document.body.innerHTML = "";

  var st = document.createElement("style");
  st.textContent = ".lb{background:rgba(255,255,255,0.04);border:1px solid rgba(70,189,198,0.3);border-radius:20px;padding:40px;width:90%;max-width:360px;text-align:center;color:#e2e8f0}.lb h1{color:#46bdc6;margin:10px 0 6px;font-size:22px}.lb p{color:#64748b;font-size:13px;margin-bottom:24px}.lb input{display:block;width:100%;padding:12px;background:rgba(255,255,255,0.08);border:1px solid rgba(70,189,198,0.3);border-radius:10px;color:#e2e8f0;font-size:15px;text-align:center;outline:none;margin-bottom:10px;box-sizing:border-box}.lb button{width:100%;padding:12px;background:#46bdc6;color:#0a1628;font-size:15px;font-weight:700;border:none;border-radius:10px;cursor:pointer}.lb .feil{color:#f87171;font-size:13px;margin-top:10px;min-height:20px}";
  document.head.appendChild(st);

  var div = document.createElement("div");
  div.className = "lb";
  div.innerHTML = "<div style='font-size:44px'>&#x26DC;&#xFE0F;</div><h1>Speiderlageret</h1><p>Haugerud Speiderlag</p>";

  var inp = document.createElement("input");
  inp.type = "password";
  inp.placeholder = "Passord\u2026";
  div.appendChild(inp);

  var btn = document.createElement("button");
  btn.textContent = "Logg inn";
  div.appendChild(btn);

  var feil = document.createElement("div");
  feil.className = "feil";
  div.appendChild(feil);

  document.body.appendChild(div);
  inp.focus();

  function forsok() {
    var v = inp.value;
    if (v === PASSORD) {
      sessionStorage.setItem(SESSION_KEY, "ok");
      location.reload();
    } else {
      feil.textContent = "\u274C Feil passord";
      inp.value = "";
      inp.focus();
    }
  }

  btn.onclick = forsok;
  inp.onkeydown = function(e) { if (e.key === "Enter") forsok(); };
}
