import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { getTitleById } from '@/data/titles';
import { Title } from '@/types';

interface FavoritesContextType {
  favoriteIds: string[];
  isFavorite: (titleId: string) => boolean;
  toggleFavorite: (titleId: string) => void;
}

const FavoritesContext = createContext<FavoritesContextType | null>(null);
const STORAGE_KEY = 'enjoy_favorites';

function loadFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function saveFavorites(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  useEffect(() => {
    setFavoriteIds(loadFavorites());
  }, []);

  const isFavorite = useCallback(
    (titleId: string) => favoriteIds.includes(titleId),
    [favoriteIds]
  );

  const toggleFavorite = useCallback((titleId: string) => {
    setFavoriteIds((prev) => {
      const next = prev.includes(titleId)
        ? prev.filter((id) => id !== titleId)
        : [...prev, titleId];
      saveFavorites(next);
      return next;
    });
  }, []);

  return (
    <FavoritesContext.Provider value={{ favoriteIds, isFavorite, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider');
  return ctx;
}

export function useFavoriteTitles(): Title[] {
  const { favoriteIds } = useFavorites();
  return favoriteIds
    .map((id) => getTitleById(id))
    .filter((t): t is NonNullable<typeof t> => t !== undefined);
}
