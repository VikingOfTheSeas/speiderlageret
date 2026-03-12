const PASSORD     = "Petter Bøckman";
const SESSION_KEY = "speider_auth";

function sjekkInnlogget() { return sessionStorage.getItem(SESSION_KEY) === "ok"; }
function loggUt() { sessionStorage.removeItem(SESSION_KEY); location.href = "index.html"; }

(function () {
  if (sjekkInnlogget()) return;

  document.addEventListener("DOMContentLoaded", function () {
    document.body.innerHTML = `
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'DM Sans',sans-serif;background:linear-gradient(135deg,#0a1628,#0d2137,#0a1a2e);min-height:100vh;display:flex;align-items:center;justify-content:center;}
        .login-box{background:rgba(255,255,255,0.03);border:1px solid rgba(70,189,198,0.25);border-radius:20px;padding:48px 40px;width:90%;max-width:380px;text-align:center}
        h1{font-size:22px;font-weight:700;color:#46bdc6;margin:12px 0 6px}
        p{font-size:13px;color:#64748b;margin-bottom:28px}
        input{width:100%;padding:13px 16px;background:rgba(255,255,255,0.07);border:1px solid rgba(70,189,198,0.25);border-radius:10px;color:#e2e8f0;font-size:15px;font-family:inherit;text-align:center;letter-spacing:1px;outline:none;margin-bottom:12px}
        button{width:100%;padding:13px;background:linear-gradient(135deg,#46bdc6,#1a8a92);color:#0a1628;font-size:15px;font-weight:700;border:none;border-radius:10px;cursor:pointer;font-family:inherit}
        .feil{display:none;color:#f87171;font-size:13px;margin-top:12px}
      </style>
      <div class="login-box">
        <div style="font-size:48px">⚜️</div>
        <h1>Speiderlageret</h1>
        <p>Haugerud Speiderlag — Felles lagersystem</p>
        <input type="password" id="pw" placeholder="Passord…">
        <button onclick="forsok()">Logg inn →</button>
        <div class="feil" id="feil">❌ Feil passord</div>
      </div>
      <script>
        document.getElementById("pw").addEventListener("keydown",e=>{if(e.key==="Enter")forsok()});
        function forsok(){
          if(document.getElementById("pw").value==="Petter Bøckman"){
            sessionStorage.setItem("speider_auth","ok");location.reload();
          } else {
            document.getElementById("feil").style.display="block";
            document.getElementById("pw").value="";
          }
        }
      </script>`;
  });
})();
