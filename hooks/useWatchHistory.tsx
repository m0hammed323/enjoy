import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

export interface HistoryEntry {
  id: string;
  titleId: string;
  episodeId?: string;
  label: string;
  subtitle?: string;
  poster?: string;
  mediaType?: 'channel' | 'movie' | 'series';
  url: string;
  timestamp: number;
}

export type NewHistoryEntry = Omit<HistoryEntry, 'id' | 'timestamp'>;

interface WatchHistoryContextType {
  history: HistoryEntry[];
  addToHistory: (entry: NewHistoryEntry) => void;
  removeFromHistory: (id: string) => void;
  isWatched: (titleId: string, episodeId?: string) => boolean;
  clearHistory: () => void;
}

const WatchHistoryContext = createContext<WatchHistoryContextType | null>(null);
const STORAGE_KEY = 'enjoy_watch_history';
const MAX_HISTORY = 50;

let globalHistoryRecorder: ((entry: NewHistoryEntry) => void) | null = null;

export function recordPlaybackHistory(entry: NewHistoryEntry): void {
  if (globalHistoryRecorder) {
    globalHistoryRecorder(entry);
  }
}

function loadHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
  } catch {
    // ignore
  }
}

export function WatchHistoryProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const addToHistory = useCallback((entry: NewHistoryEntry) => {
    setHistory((prev) => {
      const filtered = prev.filter((h) =>
        entry.episodeId
          ? !(h.titleId === entry.titleId && h.episodeId === entry.episodeId)
          : !(h.titleId === entry.titleId && !h.episodeId)
      );
      const next = [
        { ...entry, id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: Date.now() },
        ...filtered,
      ].slice(0, MAX_HISTORY);
      saveHistory(next);
      return next;
    });
  }, []);

  useEffect(() => {
    globalHistoryRecorder = addToHistory;
    return () => {
      if (globalHistoryRecorder === addToHistory) {
        globalHistoryRecorder = null;
      }
    };
  }, [addToHistory]);

  const removeFromHistory = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h.id !== id);
      saveHistory(next);
      return next;
    });
  }, []);

  const isWatched = useCallback(
    (titleId: string, episodeId?: string) =>
      history.some((h) =>
        episodeId
          ? h.titleId === titleId && h.episodeId === episodeId
          : h.titleId === titleId && !h.episodeId
      ),
    [history]
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  return (
    <WatchHistoryContext.Provider value={{ history, addToHistory, removeFromHistory, isWatched, clearHistory }}>
      {children}
    </WatchHistoryContext.Provider>
  );
}

export function useWatchHistory() {
  const ctx = useContext(WatchHistoryContext);
  if (!ctx) throw new Error('useWatchHistory must be used within WatchHistoryProvider');
  return ctx;
}
