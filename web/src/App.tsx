import { Link, usePathname } from '@/lib/router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import DashboardPage from '@/pages/Dashboard';
import AnalysePage from '@/pages/Analyse';
import KalenderPage from '@/pages/Kalender';

interface Status {
  sentiment?: { status?: string };
}

function KiStatus() {
  const { data } = useQuery({
    queryKey: ['status'],
    queryFn: () => api.get<Status>('/api/status'),
    refetchInterval: (q) => (q.state.data?.sentiment?.status === 'ready' ? false : 4000),
  });
  const state = data?.sentiment?.status;
  const text =
    state === 'ready' ? 'lokale KI bereit'
    : state === 'loading' ? 'KI-Modell lädt …'
    : state === 'error' ? 'KI nicht verfügbar'
    : 'lokale KI';
  const dot =
    state === 'ready' ? 'bg-up shadow-[0_0_8px_rgba(47,209,141,0.7)]'
    : state === 'error' ? 'bg-down'
    : 'bg-accent animate-pulse';
  return (
    <div className="flex items-center gap-2 font-mono text-micro tracking-wide text-ink3">
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      {text}
    </div>
  );
}

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/analyse', label: 'Analyse' },
  { to: '/kalender', label: 'Kalender' },
];

/** Seite anhand des Pfads wählen — alte v1-URLs (.html) bleiben gültig */
function Seite() {
  const pfad = usePathname();
  if (pfad.startsWith('/analyse')) return <AnalysePage />;
  if (pfad.startsWith('/kalender')) return <KalenderPage />;
  return <DashboardPage />;
}

export default function App() {
  const pfad = usePathname();
  const istAktiv = (to: string) =>
    to === '/' ? pfad === '/' || pfad.startsWith('/index') : pfad.startsWith(to);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Sprungmarke für Tastatur-Nutzer (nur bei Fokus sichtbar) */}
      <a
        href="#inhalt"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-sm focus:bg-accent focus:px-4 focus:py-2 focus:text-small focus:font-semibold focus:text-[#0b1524]"
      >
        Zum Inhalt springen
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1460px] items-center gap-7 px-5">
          <Link to="/" className="font-display text-display-sm font-bold tracking-tight text-ink">
            Stock<span className="text-accent">pit</span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  'flex h-control-sm items-center rounded-md px-3.5 text-base font-medium transition-colors',
                  istAktiv(n.to)
                    ? 'bg-accent-soft text-accent'
                    : 'text-ink2 hover:bg-panel2 hover:text-ink'
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            <KiStatus />
          </div>
        </div>
        {/* Statische Signal-Linie (keine Animation — die sah aus wie Dauer-Laden) */}
        <div
          aria-hidden
          className="h-px w-full"
          style={{
            background:
              'linear-gradient(90deg, rgba(107,165,255,0.5) 0%, rgba(107,165,255,0.12) 38%, transparent 72%)',
          }}
        />
      </header>

      <main id="inhalt" className="mx-auto w-full max-w-[1460px] flex-1 px-5 pb-16 pt-7">
        <Seite />
      </main>

      <footer className="border-t border-line py-5 text-center text-micro text-ink3">
        <b className="font-semibold text-ink2">Stockpit</b> läuft komplett lokal · Alle Angaben
        ohne Gewähr — keine Anlageberatung.
      </footer>
    </div>
  );
}
