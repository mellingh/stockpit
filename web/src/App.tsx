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
    <div className="flex items-center gap-2 font-mono text-[11px] tracking-wide text-ink3">
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
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-[54px] w-full max-w-[1460px] items-center gap-7 px-5">
          <Link to="/" className="font-display text-[19px] font-bold tracking-tight text-ink">
            Stock<span className="text-accent">pit</span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  'rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors',
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
        {/* Puls-Linie: der Markt-Herzschlag als Signatur-Element */}
        <div
          aria-hidden
          className="h-px w-full animate-pulse-sweep"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, transparent 35%, rgba(94,158,255,0.65) 50%, transparent 65%, transparent 100%)',
            backgroundSize: '50% 100%',
            backgroundRepeat: 'no-repeat',
          }}
        />
      </header>

      <main className="mx-auto w-full max-w-[1460px] flex-1 px-5 pb-16 pt-7">
        <Seite />
      </main>

      <footer className="border-t border-line py-5 text-center text-[12px] text-ink3">
        <b className="font-semibold text-ink2">Stockpit</b> läuft komplett lokal · Alle Angaben
        ohne Gewähr — keine Anlageberatung.
      </footer>
    </div>
  );
}
