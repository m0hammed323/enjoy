import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { getTitleById } from '@/data/titles';
import { useConfig } from '@/hooks/useConfig';
import { Title, Channel } from '@/types';

interface FavoritesContextType {
  favoriteIds: string[];
  isFavorite: (titleId: string) => boolean;
  toggleFavorite: (titleId: string) => void;
  favoriteChannelIds: string[];
  isChannelFavorite: (channelId: string) => boolean;
  toggleChannelFavorite: (channelId: string) => void;
}

const FavoritesContext = createContext<FavoritesContextType | null>(null);
const STORAGE_KEY = 'enjoy_favorites';
const CHANNEL_STORAGE_KEY = 'enjoy_favorite_channels';

function loadList(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function saveList(key: string, ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoriteChannelIds, setFavoriteChannelIds] = useState<string[]>([]);

  useEffect(() => {
    setFavoriteIds(loadList(STORAGE_KEY));
    setFavoriteChannelIds(loadList(CHANNEL_STORAGE_KEY));
  }, []);

  const isFavorite = useCallback(
    (titleId: string) => favoriteIds.includes(titleId),
    [favoriteIds]
  );

  const toggleFavorite = useCallback((titleId: string) => {
    setFavoriteIds((prev) => {
      const next = prev.includes(titleId)
        ? prev.filter((id) => id !== titleId)
        : [titleId, ...prev];
      saveList(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const isChannelFavorite = useCallback(
    (channelId: string) => favoriteChannelIds.includes(channelId),
    [favoriteChannelIds]
  );

  const toggleChannelFavorite = useCallback((channelId: string) => {
    setFavoriteChannelIds((prev) => {
      const next = prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [channelId, ...prev];
      saveList(CHANNEL_STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <FavoritesContext.Provider
      value={{
        favoriteIds,
        isFavorite,
        toggleFavorite,
        favoriteChannelIds,
        isChannelFavorite,
        toggleChannelFavorite,
      }}
    >
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

export function useFavoriteChannels(): Channel[] {
  const { favoriteChannelIds } = useFavorites();
  const { channels } = useConfig();
  return favoriteChannelIds
    .map((id) => channels.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined);
}
