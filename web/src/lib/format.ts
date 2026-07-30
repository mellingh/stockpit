// Deutsche Formatierung — portiert aus public/js/ui.js (v1)

const nfEur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const nfEur2 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtEur = (v: number | null | undefined, cents = false) =>
  v == null ? '–' : (cents ? nfEur2 : nfEur).format(v);

export const fmtNum = (v: number | null | undefined, digits = 2) =>
  v == null || Number.isNaN(v)
    ? '–'
    : new Intl.NumberFormat('de-DE', { maximumFractionDigits: digits }).format(v);

export const fmtMoney = (v: number | null | undefined, currency?: string | null) =>
  v == null
    ? '–'
    : new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency || 'EUR' }).format(v);

export function fmtPct(v: number | null | undefined, signed = true) {
  if (v == null || Number.isNaN(v)) return '–';
  const s = signed && v > 0 ? '+' : '';
  return `${s}${nf2.format(v)} %`;
}

/** Prozentwert, der als Bruch (0.34) geliefert wird */
export const fmtPctFrac = (v: number | null | undefined) => (v == null ? '–' : fmtPct(v * 100, false));

export function fmtCompact(v: number | null | undefined) {
  if (v == null) return '–';
  if (Math.abs(v) >= 1e12) return `${nf2.format(v / 1e12)} Bio.`;
  if (Math.abs(v) >= 1e9) return `${nf2.format(v / 1e9)} Mrd.`;
  if (Math.abs(v) >= 1e6) return `${nf2.format(v / 1e6)} Mio.`;
  return fmtNum(v, 0);
}

type DateLike = string | number | Date | null | undefined;

const toDate = (d: DateLike) =>
  typeof d === 'number' ? new Date(d < 1e12 ? d * 1000 : d) : new Date(d ?? NaN);

export function fmtDate(d: DateLike) {
  const date = toDate(d);
  if (!d || Number.isNaN(date.getTime())) return '–';
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtAgo(d: DateLike) {
  const date = toDate(d);
  if (Number.isNaN(date.getTime())) return '';
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 60) return `vor ${mins} Min.`;
  if (mins < 60 * 24) return `vor ${Math.round(mins / 60)} Std.`;
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
}

export const signClass = (v: number | null | undefined) =>
  v == null ? 'text-ink3' : v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-ink3';

/** EPS-Schreibweise: +1,07 / -0,52 */
export const fmtEps = (v: number) => (v > 0 ? '+' : '') + v.toFixed(2).replace('.', ',');
