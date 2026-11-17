export type ContentType = 'movie' | 'series';

export interface Episode {
  id: string;
  season: number;
  episode: number;
  title: string;
  duration: number;
  description: string;
  thumbnail: string;
  embedUrl: string;
}

export interface Title {
  id: string;
  title: string;
  type: ContentType;
  year: number;
  rating: number;
  quality: string;
  duration: number;
  genres: string[];
  description: string;
  poster: string;
  backdrop: string;
  logo?: string;
  embedUrl: string;
  featured: boolean;
  trending: boolean;
  isNew: boolean;
  episodes?: Episode[];
  cast: string[];
  director: string;
  country: string;
  language: string;
  group: string;
}

export interface WatchlistItem {
  id: string;
  titleId: string;
  addedAt: number;
}

export interface RemoteConfig {
  app_name: string;
  app_icon: string;
  app_version: string;
  force_update: boolean;
  update_url: string;
  update_notes: string;
  maintenance_mode: boolean;
  maintenance_msg: string;
  announcement: {
    active: boolean;
    title: string;
    message: string;
  };
  channels_url: string;
  movies_url: string;
  stream_url: string;
}
