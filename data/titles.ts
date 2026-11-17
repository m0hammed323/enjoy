import { Title } from '@/types';

let _titles: Title[] = [];

export function setTitles(titles: Title[]): void {
  _titles = titles;
}

export function getTitles(): Title[] {
  return _titles;
}

export function getTitleById(id: string): Title | undefined {
  return _titles.find((t) => t.id === id);
}

export function getFeatured(): Title[] {
  return _titles.filter((t) => t.featured).slice(0, 5);
}

export function getTrending(): Title[] {
  return _titles.filter((t) => t.trending).slice(0, 20);
}

export function getNewReleases(): Title[] {
  return _titles.filter((t) => t.isNew).slice(0, 20);
}

export function getMovies(): Title[] {
  return _titles.filter((t) => t.type === 'movie');
}

export function getSeries(): Title[] {
  return _titles.filter((t) => t.type === 'series');
}

export function getByGenre(genre: string): Title[] {
  return _titles.filter((t) => t.genres.includes(genre));
}

export function getByGroup(group: string): Title[] {
  return _titles.filter((t) => t.group === group);
}

export function getAllGroups(): string[] {
  const groups = new Set<string>();
  _titles.forEach((t) => { if (t.group) groups.add(t.group); });
  return Array.from(groups);
}

export function getAllGenres(): string[] {
  const genres = new Set<string>();
  _titles.forEach((t) => t.genres.forEach((g) => genres.add(g)));
  return Array.from(genres);
}

export const ALL_GENRES: string[] = [
  'Action', 'Drama', 'Comedy', 'Thriller', 'Sci-Fi', 'Horror', 'Romance', 'Documentary', 'Animation', 'Crime',
];
