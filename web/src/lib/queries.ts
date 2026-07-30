// TanStack-Query-Hooks: ein Hook je API-Endpunkt + Mutations mit
// automatischer Invalidierung (ersetzt die manuellen loadDashboard()-Ketten
// der v1 — und damit die Klasse „Werte veraltet nach Ändern/Löschen").
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  type Analyse,
  type ChartData,
  type Dashboard,
  type Kalender,
  type NewsFeed,
  type SearchResult,
  type TrendingItem,
  type WebLink,
} from './api';

export const useDashboard = () =>
  useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/api/dashboard') });

export const useNewsfeed = () =>
  useQuery({
    queryKey: ['newsfeed'],
    queryFn: () => api.get<NewsFeed>('/api/newsfeed'),
    staleTime: 5 * 60_000,
  });

export const useAnalyse = (symbol: string | null) =>
  useQuery({
    queryKey: ['analyse', symbol],
    queryFn: () => api.get<Analyse>(`/api/analyse/${encodeURIComponent(symbol!)}`),
    enabled: !!symbol,
    staleTime: 60_000,
    retry: 1,
  });

export const useHistory = (symbol: string | null, range: string) =>
  useQuery({
    queryKey: ['history', symbol, range],
    queryFn: () => api.get<ChartData>(`/api/history/${encodeURIComponent(symbol!)}?range=${range}`),
    enabled: !!symbol,
    staleTime: 60_000,
  });

export const useKalender = () =>
  useQuery({
    queryKey: ['kalender'],
    queryFn: () => api.get<Kalender>('/api/calendar'),
    staleTime: 10 * 60_000,
  });

export const useTrending = () =>
  useQuery({
    queryKey: ['trending'],
    queryFn: () => api.get<TrendingItem[]>('/api/trending'),
    staleTime: 10 * 60_000,
  });

export const useXAccounts = () =>
  useQuery({ queryKey: ['xusers'], queryFn: () => api.get<string[]>('/api/xusers') });

export const useWebLinks = () =>
  useQuery({ queryKey: ['weblinks'], queryFn: () => api.get<WebLink[]>('/api/weblinks') });

export const searchSymbols = (q: string) =>
  api.get<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`);

/** Mutations rund ums Depot: invalidieren Dashboard + News gemeinsam */
export function usePortfolioMutation<TInput>(fn: (input: TInput) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['newsfeed'] });
    },
  });
}

/** Mutations für Accounts & Links (X + Webseiten) */
export function useLinksMutation<TInput>(fn: (input: TInput) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['xusers'] });
      void qc.invalidateQueries({ queryKey: ['weblinks'] });
    },
  });
}
