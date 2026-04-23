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
// Returnerer true hvis det er OK å aktivere, false ellers.
// Når riktig passord er angitt én gang i session, huskes det til fanen lukkes.
function krevAdminPassord() {
  try {
    if (sessionStorage.getItem(ADMIN_UNLOCK_KEY) === "1") return true;
  } catch (e) {}
  var input = window.prompt("Skriv inn passord for å aktivere administrer-modus:");
  if (input === null) return false;
  if (input !== ADMIN_PASSORD) {
    window.alert("Feil passord");
    return false;
  }
  try { sessionStorage.setItem(ADMIN_UNLOCK_KEY, "1"); } catch (e) {}
  return true;
}
