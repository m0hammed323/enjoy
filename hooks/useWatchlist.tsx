import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { WatchlistItem } from '@/types';
import { getTitleById } from '@/data/titles';

interface WatchlistContextType {
  items: WatchlistItem[];
  isInWatchlist: (titleId: string) => boolean;
  toggleWatchlist: (titleId: string) => void;
  removeItem: (titleId: string) => void;
}

const WatchlistContext = createContext<WatchlistContextType | null>(null);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<WatchlistItem[]>([]);

  const isInWatchlist = useCallback(
    (titleId: string) => items.some((i) => i.titleId === titleId),
    [items]
  );

  const toggleWatchlist = useCallback((titleId: string) => {
    setItems((prev) => {
      const exists = prev.find((i) => i.titleId === titleId);
      if (exists) {
        return prev.filter((i) => i.titleId !== titleId);
      }
      return [...prev, { id: `w-${titleId}`, titleId, addedAt: Date.now() }];
    });
  }, []);

  const removeItem = useCallback((titleId: string) => {
    setItems((prev) => prev.filter((i) => i.titleId !== titleId));
  }, []);

  return (
    <WatchlistContext.Provider value={{ items, isInWatchlist, toggleWatchlist, removeItem }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error('useWatchlist must be used within WatchlistProvider');
  return ctx;
}

export function useWatchlistTitles() {
  const { items } = useWatchlist();
  return items
    .map((i) => getTitleById(i.titleId))
    .filter((t): t is NonNullable<typeof t> => t !== undefined);
}
