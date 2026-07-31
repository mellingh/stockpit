// Sanfte Existenz-Prüfung für neu hinzugefügte X-Accounts und Web-Links.
// Ziel: Tippfehler abfangen ("stockanalysiss.com", "@thestockwhal"), ohne
// funktionierende Seiten mit Bot-Schutz auszusperren. Deshalb gilt:
// eindeutig kaputt (DNS-Fehler, 404/410) → ablehnen; alles Unklare (403, 429,
// Timeout, kein Netz) → durchlassen. Falsch-Ablehnungen wären schlimmer als
// eine fehlende Prüfung.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';
const TIMEOUT_S = '6';

/**
 * Gibt es diesen X-Account? Geprüft über den öffentlichen oEmbed-Endpunkt von X
 * (kein Key, kein Login): existierender Name → 200, erfundener → 404.
 * @returns {Promise<boolean|null>} null = konnte nicht geprüft werden
 */
export async function xHandleExistiert(handle) {
  try {
    const res = await fetch(
      `https://publish.twitter.com/oembed?url=https://twitter.com/${encodeURIComponent(handle)}`,
      { redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(7000) }
    );
    if (res.status === 404) return false;
    if (res.ok) return true;
    return null; // 403/429/5xx → keine Aussage
  } catch {
    return null; // offline oder Zeitüberschreitung
  }
}

/** Interne/private Adressen prüfen wir nicht an (und geben sie auch nicht frei) */
function istPrivat(hostname) {
  return (
    /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?)$/i.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /\.local$/i.test(hostname)
  );
}

/**
 * Antwortet die Seite? Ruft die URL per curl auf (breiter kompatibel als Nodes
 * fetch, das manche Seiten am TLS-Fingerprint erkennen).
 * @returns {Promise<{ok: boolean, grund: string|null}>}
 */
export async function urlErreichbar(url) {
  let ziel;
  try {
    ziel = new URL(url);
  } catch {
    return { ok: false, grund: 'Ungültige URL' };
  }
  if (istPrivat(ziel.hostname)) {
    return { ok: false, grund: 'Adressen im lokalen Netz können hier nicht verlinkt werden' };
  }
  const argumente = [
    '-s', '-o', process.platform === 'win32' ? 'NUL' : '/dev/null', '-L', '--max-time', TIMEOUT_S,
    '-A', UA, '-w', '%{http_code}', ziel.href,
  ];
  let code;
  try {
    const { stdout } = await run('curl', argumente, { windowsHide: true, timeout: 12_000 });
    code = stdout.trim().slice(-3);
  } catch (err) {
    // Wichtig: curl endet bei DNS-/Verbindungsfehlern mit Exit-Code ≠ 0, schreibt
    // den Statuscode aber trotzdem nach stdout ("000"). Ohne diese Auswertung
    // rutschte jede Tippfehler-Domain durch.
    code = String(err?.stdout ?? '').trim().slice(-3);
    if (!/^\d{3}$/.test(code)) return { ok: true, grund: null }; // curl fehlt → nicht im Weg stehen
  }
  if (code === '000') {
    return { ok: false, grund: `„${ziel.hostname}" antwortet nicht — Tippfehler in der Adresse?` };
  }
  if (code === '404' || code === '410') {
    return { ok: false, grund: `Die Seite gibt es dort nicht (HTTP ${code}) — Adresse prüfen.` };
  }
  return { ok: true, grund: null }; // 200/3xx sowieso, 403/429/5xx = Bot-Schutz, kein Beweis
}
