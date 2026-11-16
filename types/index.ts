export type ContentType = 'movie' | 'series';

export type Genre =
  | 'Action'
  | 'Drama'
  | 'Comedy'
  | 'Thriller'
  | 'Sci-Fi'
  | 'Horror'
  | 'Romance'
  | 'Documentary'
  | 'Animation'
  | 'Crime';

export interface Episode {
  id: string;
  season: number;
  episode: number;
  title: string;
  duration: number;
  description: string;
  thumbnail: string;
}

export interface Title {
  id: string;
  title: string;
  type: ContentType;
  year: number;
  rating: number;
  quality: string;
  duration: number;
  genres: Genre[];
  description: string;
  poster: string;
  backdrop: string;
  logo?: string;
  trailerUrl: string;
  featured: boolean;
  trending: boolean;
  isNew: boolean;
  episodes?: Episode[];
  cast: string[];
  director: string;
  country: string;
  language: string;
}

export interface WatchlistItem {
  id: string;
  titleId: string;
  addedAt: number;
}
