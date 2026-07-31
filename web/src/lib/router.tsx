// Mini-Router für 3 Seiten — ersetzt react-router-dom (Audit-Altlasten in
// SSR-Features, die wir nie nutzen, plus 16 KB Bundle). History-API pur.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface RouterState {
  url: string;
  navigate: (to: string, opts?: { replace?: boolean; scroll?: boolean }) => void;
}

const RouterContext = createContext<RouterState>({ url: '/', navigate: () => {} });

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [url, setUrl] = useState(() => location.pathname + location.search);

  useEffect(() => {
    const onPop = () => setUrl(location.pathname + location.search);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string, opts?: { replace?: boolean; scroll?: boolean }) => {
    // replace für Filter-/Zeitraumwechsel: füllt die Verlaufsliste nicht zu,
    // der Zurück-Button springt trotzdem zur vorherigen Ansicht
    if (opts?.replace) history.replaceState(null, '', to);
    else history.pushState(null, '', to);
    setUrl(to);
    if (opts?.scroll !== false && !opts?.replace) window.scrollTo({ top: 0 });
  }, []);

  return <RouterContext.Provider value={{ url, navigate }}>{children}</RouterContext.Provider>;
}

export function useNavigate() {
  return useContext(RouterContext).navigate;
}

/**
 * Einzelnen Query-Parameter setzen/entfernen, ohne die anderen zu verlieren.
 * Damit landen Filter und Zeiträume in der URL (teilbar, Zurück-Button, F5-fest).
 */
export function useSetParam() {
  const { url, navigate } = useContext(RouterContext);
  return useCallback(
    (schluessel: string, wert: string | null) => {
      const [pfad, query = ''] = url.split('?');
      const params = new URLSearchParams(query);
      if (wert == null) params.delete(schluessel);
      else params.set(schluessel, wert);
      const suffix = params.toString();
      navigate(suffix ? `${pfad}?${suffix}` : pfad, { replace: true });
    },
    [url, navigate]
  );
}

export function usePathname() {
  return useContext(RouterContext).url.split('?')[0];
}

export function useSearchParams(): URLSearchParams {
  const { url } = useContext(RouterContext);
  const i = url.indexOf('?');
  return new URLSearchParams(i === -1 ? '' : url.slice(i));
}

/** Interner Link: navigiert clientseitig, lässt Strg/Cmd-Klick (neuer Tab) durch */
export function Link({
  to,
  onClick,
  ...props
}: React.ComponentProps<'a'> & { to: string }) {
  const navigate = useNavigate();
  return (
    <a
      href={to}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to);
      }}
      {...props}
    />
  );
}
