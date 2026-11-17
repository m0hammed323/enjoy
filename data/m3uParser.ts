import { Title, Episode, ContentType, Channel } from '@/types';

interface ParsedEntry {
  name: string;
  logo: string;
  group: string;
  embedUrl: string;
}

export function parseM3UChannels(content: string): Channel[] {
  const lines = content.split('\n');
  const channels: Channel[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF')) {
      const nameMatch = line.match(/,(.+)$/);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/);
      const groupMatch = line.match(/group-title="([^"]*)"/);

      const nextLine = (lines[i + 1] || '').trim();
      const urlMatch = nextLine.match(/(https?:\/\/[^\s<>"]+)/i);

      if (nameMatch && urlMatch) {
        channels.push({
          id: `ch-${channels.length}-${nameMatch[1].trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 20)}`,
          name: nameMatch[1].trim(),
          logo: logoMatch ? logoMatch[1].trim() : '',
          group: groupMatch ? groupMatch[1].trim() : 'Other',
          streamUrl: urlMatch[1].trim(),
        });
      }
    }
  }
  return channels;
}

export function parseM3U(content: string): ParsedEntry[] {
  const lines = content.split('\n');
  const entries: ParsedEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF')) {
      const nameMatch = line.match(/,(.+)$/);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/);
      const groupMatch = line.match(/group-title="([^"]*)"/);

      const nextLine = (lines[i + 1] || '').trim();
      const embedMatch = nextLine.match(/SRC="([^"]*)"/i) || nextLine.match(/src="([^"]*)"/i) || nextLine.match(/(https?:\/\/[^\s<>"]+)/i);

      if (nameMatch && embedMatch) {
        entries.push({
          name: nameMatch[1].trim(),
          logo: logoMatch ? logoMatch[1].trim() : '',
          group: groupMatch ? groupMatch[1].trim() : '',
          embedUrl: embedMatch[1].trim(),
        });
      }
    }
  }
  return entries;
}

function extractYear(name: string): number {
  const match = name.match(/\b(19\d{2}|20\d{2})\b/);
  return match ? parseInt(match[1], 10) : 2025;
}

function generateId(name: string, index: number): string {
  return `m3u-${index}-${name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 20)}`;
}

function parseEpisodeInfo(name: string): { season: number; episode: number; title: string } | null {
  const seasonMatch = name.match(/الجزء\s*(\d+)/);
  const episodeMatch = name.match(/الحلقة\s*(\d+)/);
  if (seasonMatch && episodeMatch) {
    const cleanTitle = name.replace(/الجزء\s*\d+/, '').replace(/الحلقة\s*\d+/, '').trim();
    return {
      season: parseInt(seasonMatch[1], 10),
      episode: parseInt(episodeMatch[1], 10),
      title: cleanTitle || name,
    };
  }
  return null;
}

export function m3uToTitles(content: string): Title[] {
  const entries = parseM3U(content);
  const titles: Title[] = [];

  const seriesGroups: Record<string, ParsedEntry[]> = {};

  entries.forEach((entry, index) => {
    const isSeriesGroup = entry.group.includes('مسلسلات') || entry.group.toLowerCase().includes('series');
    const episodeInfo = parseEpisodeInfo(entry.name);

    if (isSeriesGroup || episodeInfo) {
      const seriesName = entry.name.replace(/\s*الجزء\s*\d+/g, '').replace(/\s*الحلقة\s*\d+/g, '').trim();
      if (!seriesGroups[seriesName]) seriesGroups[seriesName] = [];
      seriesGroups[seriesName].push({ ...entry, name: entry.name });
    } else {
      titles.push({
        id: generateId(entry.name, index),
        title: entry.name,
        type: 'movie' as ContentType,
        year: extractYear(entry.name),
        rating: 7.5 + Math.random() * 2,
        quality: 'HD',
        duration: 0,
        genres: ['Action', 'Drama'],
        description: entry.name,
        poster: entry.logo,
        backdrop: entry.logo,
        embedUrl: entry.embedUrl,
        featured: index < 3,
        trending: index < 10,
        isNew: index < 5,
        cast: [],
        director: '',
        country: '',
        language: '',
        group: entry.group,
      });
    }
  });

  Object.entries(seriesGroups).forEach(([seriesName, eps], idx) => {
    const firstLogo = eps[0].logo;
    const episodes: Episode[] = eps
      .map((e) => {
        const info = parseEpisodeInfo(e.name);
        return {
          id: generateId(e.name, idx * 100 + (info?.episode || 0)),
          season: info?.season || 1,
          episode: info?.episode || 1,
          title: info?.title || e.name,
          duration: 0,
          description: e.name,
          thumbnail: e.logo,
          embedUrl: e.embedUrl,
        };
      })
      .sort((a, b) => a.season - b.season || a.episode - b.episode);

    titles.push({
      id: generateId(seriesName, titles.length),
      title: seriesName,
      type: 'series' as ContentType,
      year: 2025,
      rating: 8.0 + Math.random() * 1.5,
      quality: 'HD',
      duration: 0,
      genres: ['Drama'],
      description: seriesName,
      poster: firstLogo,
      backdrop: firstLogo,
      embedUrl: episodes[0]?.embedUrl || '',
      featured: false,
      trending: false,
      isNew: false,
      cast: [],
      director: '',
      country: '',
      language: '',
      group: 'مسلسلات',
      episodes,
    });
  });

  return titles;
}
