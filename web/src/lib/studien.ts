// Lexikon für clinicaltrials.gov-Rohwerte. Liegt hier, weil zwei Seiten es
// brauchen: der Studien-Block im Analyse-Report und die Pipeline der Bewertung.
// Unbekanntes bleibt stehen, statt falsch geraten zu werden.

/** „PHASE2" → „Phase 2" */
export const PHASE_DE: Record<string, string> = {
  EARLY_PHASE1: 'Frühe Phase 1',
  PHASE1: 'Phase 1',
  PHASE2: 'Phase 2',
  PHASE3: 'Phase 3',
  PHASE4: 'Phase 4',
  NA: 'Ohne Phase',
};

export type BadgeVariante = 'pos' | 'neg' | 'chip' | 'warn' | 'neu';

// Farben angelehnt an clinicaltrials.gov (Micha, Runde 32): laufend = grün,
// abgebrochen/zurückgezogen/pausiert = rot, fertig = blau, wartend = gold
export const STUDIEN_STATUS_DE: Record<string, { label: string; variante: BadgeVariante }> = {
  RECRUITING: { label: 'Rekrutiert', variante: 'pos' },
  ACTIVE_NOT_RECRUITING: { label: 'Aktiv', variante: 'pos' },
  ENROLLING_BY_INVITATION: { label: 'Aufnahme auf Einladung', variante: 'pos' },
  NOT_YET_RECRUITING: { label: 'Noch nicht rekrutierend', variante: 'warn' },
  COMPLETED: { label: 'Abgeschlossen', variante: 'chip' },
  TERMINATED: { label: 'Abgebrochen', variante: 'neg' },
  SUSPENDED: { label: 'Pausiert', variante: 'neg' },
  WITHDRAWN: { label: 'Zurückgezogen', variante: 'neg' },
  UNKNOWN: { label: 'Status unbekannt', variante: 'neu' },
  // Expanded-Access-Studien haben eigene Status (Micha fand rohes „AVAILABLE")
  AVAILABLE: { label: 'Verfügbar', variante: 'pos' },
  NO_LONGER_AVAILABLE: { label: 'Nicht mehr verfügbar', variante: 'neg' },
  TEMPORARILY_NOT_AVAILABLE: { label: 'Vorübergehend nicht verfügbar', variante: 'warn' },
  APPROVED_FOR_MARKETING: { label: 'Zugelassen', variante: 'chip' },
};
