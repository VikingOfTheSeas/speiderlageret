// Passord-innlogging er fjernet. Filen beholdes som en tynn stubb
// slik at eksisterende kall til loggUt() og sjekkInnlogget() fortsatt
// fungerer uten å tvinge brukeren gjennom en innloggingsskjerm.
var SESSION_KEY = "speider_auth";

function sjekkInnlogget() { return true; }
function loggUt() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  location.href = "index.html";
}
