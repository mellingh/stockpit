// clinicaltrials.gov API v2 — offizielle, kostenlose US-Behörden-API (kein Key).
// Für Biotech-/Pharma-Aktien: laufende klinische Studien des Unternehmens,
// weil Studienergebnisse dort die stärksten Kurstreiber sind.
import { cached, DAY } from './cache.js';

const FIELDS = [
  'protocolSection.identificationModule.nctId',
  'protocolSection.identificationModule.briefTitle',
  'protocolSection.statusModule.overallStatus',
  'protocolSection.statusModule.primaryCompletionDateStruct',
  'protocolSection.designModule.phases',
  'protocolSection.conditionsModule.conditions',
  'protocolSection.sponsorCollaboratorsModule.leadSponsor',
].join(',');

async function query(params, seitenGroesse = 25) {
  const url = new URL('https://clinicaltrials.gov/api/v2/studies');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('pageSize', String(seitenGroesse));
  url.searchParams.set('sort', 'LastUpdatePostDate:desc');
  url.searchParams.set('fields', FIELDS);
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`clinicaltrials.gov: HTTP ${res.status}`);
  const json = await res.json();
  return json.studies || [];
}

function toEntry(s) {
  const p = s.protocolSection || {};
  return {
    nctId: p.identificationModule?.nctId,
    title: p.identificationModule?.briefTitle,
    status: p.statusModule?.overallStatus,
    completion: p.statusModule?.primaryCompletionDateStruct?.date ?? null,
    phases: p.designModule?.phases ?? [],
    conditions: (p.conditionsModule?.conditions ?? []).slice(0, 3),
    sponsor: p.sponsorCollaboratorsModule?.leadSponsor?.name ?? null,
    link: `https://clinicaltrials.gov/study/${p.identificationModule?.nctId}`,
  };
}

export function getTrials(companyName) {
  const name = cleanCompanyName(companyName);
  return cached(`trials:${name.toLowerCase()}`, DAY, async () => {
    // 1. Versuch: direkte Sponsor-Suche (wortbasiert)
    let studies = await query({ 'query.spons': name });

    // 2. Fallback: Volltextsuche + Sponsor-Filter. Nötig, weil die Sponsor-
    // Suche nur ganze Wörter matcht ("Moderna" findet "ModernaTX, Inc." nicht).
    if (studies.length < 5) {
      const byTerm = await query({ 'query.term': name }).catch(() => []);
      const needle = name.toLowerCase();
      const filtered = byTerm.filter((s) =>
        (s.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name || '')
          .toLowerCase()
          .includes(needle)
      );
      const known = new Set(studies.map((s) => s.protocolSection?.identificationModule?.nctId));
      studies = [...studies, ...filtered.filter((s) => !known.has(s.protocolSection?.identificationModule?.nctId))];
    }

    return studies.slice(0, 12).map(toEntry);
  });
}

/**
 * Dieselbe Suche, aber vollständig: für das Pipeline-Panel der Bewertung.
 *
 * `getTrials` liefert bewusst nur zwölf Studien — im Analyse-Report ist das
 * eine Leseliste. Die Bewertung fragt etwas anderes: woraus soll das künftige
 * Geschäft kommen? Dafür zählt jedes laufende Programm, und bei Moderna oder
 * Insmed sind das weit mehr als zwölf.
 */
export function getPipelineStudien(companyName) {
  const name = cleanCompanyName(companyName);
  return cached(`pipeline:${name.toLowerCase()}`, DAY, async () => {
    const studies = await query({ 'query.spons': name }, 100);
    if (studies.length >= 5) return studies.map(toEntry);

    // Gleicher Rückfall wie oben: die Sponsor-Suche matcht nur ganze Wörter.
    const nadel = name.toLowerCase();
    const perBegriff = await query({ 'query.term': name }, 100).catch(() => []);
    const bekannt = new Set(studies.map((s) => s.protocolSection?.identificationModule?.nctId));
    return [
      ...studies,
      ...perBegriff.filter((s) =>
        !bekannt.has(s.protocolSection?.identificationModule?.nctId)
        && (s.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name || '').toLowerCase().includes(nadel)),
    ].map(toEntry);
  });
}

// "BioNTech SE" → "BioNTech"; Suffixe stören die Sponsor-Suche
function cleanCompanyName(name) {
  return (name || '')
    .replace(/,?\s+(Inc|Corp|Corporation|Ltd|LLC|PLC|SE|AG|SA|NV|Co)\.?$/i, '')
    .trim();
}
