// Lokale KI-Sentiment-Analyse — komplett kostenlos, kein API-Key, kein Login.
// FinBERT (auf Finanznachrichten trainiert) läuft über Transformers.js direkt
// auf diesem Rechner. Beim ersten Start wird das Modell einmalig in ./models
// heruntergeladen (~110 MB), danach funktioniert es offline.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Modelle per Konfiguration austauschbar
const MODEL_EN = process.env.SENTIMENT_MODEL_EN || 'Xenova/finbert';
const MODEL_MULTI = process.env.SENTIMENT_MODEL_MULTI || 'Xenova/bert-base-multilingual-uncased-sentiment';

// Single-Flight: das Lade-Promise wird sofort gemerkt, damit parallele
// Anfragen dasselbe Modell-Laden abwarten statt es doppelt anzustoßen
let pipelines = { en: null, multi: null };
let loadState = { status: 'idle', error: null }; // idle | loading | ready | error

function getPipeline(lang) {
  const key = lang === 'de' ? 'multi' : 'en';
  if (pipelines[key]) return pipelines[key];

  loadState.status = 'loading';
  pipelines[key] = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.cacheDir = path.join(ROOT, 'models');
    const model = key === 'multi' ? MODEL_MULTI : MODEL_EN;
    const pipe = await pipeline('text-classification', model);
    loadState.status = 'ready';
    return pipe;
  })().catch((err) => {
    // Fehlversuch nicht festhalten — nächster Aufruf probiert es erneut
    pipelines[key] = null;
    loadState = { status: 'error', error: String(err?.message || err) };
    throw err;
  });
  return pipelines[key];
}

// Das mehrsprachige Modell liefert Sterne-Labels ("1 star" … "5 stars")
function mapStars(label) {
  const stars = parseInt(label, 10);
  if (stars <= 2) return 'negative';
  if (stars >= 4) return 'positive';
  return 'neutral';
}

// Grobe Spracherkennung als Fallback, wenn die Quelle keine Sprache angibt
export function detectLang(text) {
  const hits = (text.match(/\b(der|die|das|und|nicht|mit|für|über|wird|beim|einer?)\b/gi) || []).length;
  return hits >= 2 ? 'de' : 'en';
}

// Klassifiziert einen Text: {label: positive|negative|neutral, score: 0..1}
export async function classify(text, lang) {
  const language = lang || detectLang(text);
  try {
    const pipe = await getPipeline(language);
    const [result] = await pipe(text.slice(0, 500));
    const label = language === 'de' ? mapStars(result.label) : result.label.toLowerCase();
    return { label, score: Math.round(result.score * 100) / 100 };
  } catch {
    // Modell (noch) nicht verfügbar → neutral, App bleibt benutzbar
    return { label: 'neutral', score: 0, unavailable: true };
  }
}

// Mehrere Texte nacheinander (Modell arbeitet lokal, das ist schnell genug)
export async function classifyAll(items, getText, getLang) {
  const out = [];
  for (const item of items) {
    out.push(await classify(getText(item), getLang?.(item)));
  }
  return out;
}

export function sentimentStatus() {
  return loadState;
}

// Modell im Hintergrund vorwärmen, damit die erste echte Anfrage schnell ist
export function preload() {
  getPipeline('en').catch(() => {});
}
