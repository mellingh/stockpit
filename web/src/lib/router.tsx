// Mini-Router für 3 Seiten — ersetzt react-router-dom (Audit-Altlasten in
// SSR-Features, die wir nie nutzen, plus 16 KB Bundle). History-API pur.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface RouterState {
  url: string;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterState>({ url: '/', navigate: () => {} });

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [url, setUrl] = useState(() => location.pathname + location.search);

  useEffect(() => {
    const onPop = () => setUrl(location.pathname + location.search);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    history.pushState(null, '', to);
    setUrl(to);
    window.scrollTo({ top: 0 });
  }, []);

  return <RouterContext.Provider value={{ url, navigate }}>{children}</RouterContext.Provider>;
}

export function useNavigate() {
  return useContext(RouterContext).navigate;
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
