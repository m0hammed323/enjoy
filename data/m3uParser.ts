import { Title, Episode, ContentType, Channel, ChannelQuality } from '@/types';

interface ParsedEntry {
  name: string;
  logo: string;
  group: string;
  embedUrl: string;
}

const QUALITY_BRACKET_REGEX =
  /[\[\(\{]\s*(?:4K\vert{}UHD\vert{}8K\vert{}2K\vert{}FHD\vert{}FULL\s*HD\vert{}HD\vert{}SD\vert{}HQ\vert{}LQ\vert{}LOW\vert{}HIGH\vert{}MED\vert{}MEDIUM\vert{}AUTO\vert{}HEVC\vert{}H\.?265\vert{}H\.?264\vert{}1080P?\vert{}720P?\vert{}576P?\vert{}480P?\vert{}360P?\vert{}240P?\vert{}50\s*FPS\vert{}60\s*FPS\vert{}BACKUP\vert{}BKP\vert{}MAIN\vert{}VIP\vert{}SERVER\s*\d*\vert{}S\d+\vert{}جودة\s*عالية\vert{}جودة\s*متوسطة\vert{}جودة\s*منخفضة\vert{}جودة\s*ضعيفة\vert{}اتش\s*دي\vert{}اس\s*دي\vert{}فول\s*اتش\s*دي\vert{}فور\s*كي\vert{}سيرفر\s*\d*\vert{}احتياطي\vert{}بديل)\s*[\]\)\}]/gi;

const QUALITY_TOKEN_REGEX =
  /(?:^|[\s\-_|:/•]+)(?:4K|UHD|8K|2K|FHD|FULL\s*HD|HD|SD|HQ|LQ|LOW|HIGH|HEVC|H\.?265|H\.?264|1080P?|720P?|576P?|480P?|360P?|240P?|50\s*FPS|60\s*FPS|BACKUP|BKP|VIP|اتش\s*دي|اس\s*دي|فول\s*اتش\s*دي|فور\s*كي|جودة\s*عالية|جودة\s*متوسطة|جودة\s*منخفضة|جودة\s*ضعيفة|احتياطي|بديل)(?=$|[\s\-_|:/•]+)/gi;

function normalizeChannelName(name: string): string {
  const cleaned = name
    .replace(QUALITY_BRACKET_REGEX, ' ')
    .replace(QUALITY_TOKEN_REGEX, ' ')
    .replace(/^[\s\-_|:/•]+|[\s\-_|:/•]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || name.trim();
}

function toCanonicalKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0600-\u06FFa-z0-9]/g, '');
}

function detectQualityLabel(name: string, url = ''): string {
  const combined = `${name} ${url}`.toUpperCase();
  if (combined.includes('4K') || combined.includes('UHD') || combined.includes('2160')) return '4K';
  if (combined.includes('1080') || combined.includes('FHD') || combined.includes('FULL HD') || name.includes('فول اتش دي') || name.includes('جودة عالية')) return 'FHD';
  if (combined.includes('720')) return '720p';
  if (combined.includes('576') || combined.includes('480') || combined.includes('SD') || name.includes('اس دي') || name.includes('جودة متوسطة')) return 'SD';
  if (combined.includes('360') || combined.includes('240') || combined.includes('LOW') || combined.includes('LQ') || name.includes('منخفضة') || name.includes('ضعيفة')) return 'LOW';
  if (combined.includes('HD') || name.includes('اتش دي')) return 'HD';
  return 'AUTO';
}

const QUALITY_RANK: Record<string, number> = {
  '4K': 1,
  'FHD': 2,
  'HD': 3,
  '720p': 4,
  'SD': 5,
  '480p': 6,
  'LOW': 7,
  'AUTO': 8,
};

function getQualityRank(label: string): number {
  const base = label.split(' ')[0];
  return QUALITY_RANK[base] ?? 9;
}

export function parseM3UChannels(content: string): Channel[] {
  const lines = content.split('\n');
  const rawEntries: { name: string; logo: string; group: string; url: string }[] = [];
  const seenUrls = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF')) {
      const nameMatch = line.match(/,(.+)$/);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const groupMatch = line.match(/group-title="([^"]*)"/i);

      const nextLine = (lines[i + 1] || '').trim();
      const urlMatch = nextLine.match(/(https?:\/\/[^\s<>"]+)/i);

      if (nameMatch && urlMatch) {
        const cleanUrl = urlMatch[1].trim();
        if (seenUrls.has(cleanUrl)) continue;
        seenUrls.add(cleanUrl);

        rawEntries.push({
          name: nameMatch[1].trim(),
          logo: logoMatch ? logoMatch[1].trim() : '',
          group: groupMatch ? groupMatch[1].trim() : 'أخرى',
          url: cleanUrl,
        });
      }
    }
  }

  const grouped: Record<string, Channel> = {};

  rawEntries.forEach((entry, index) => {
    const baseName = normalizeChannelName(entry.name);
    const cleanGroup = normalizeChannelName(entry.group) || entry.group;
    const baseQualityLabel = detectQualityLabel(entry.name, entry.url);

    const canonicalName = toCanonicalKey(baseName);
    const canonicalGroup = toCanonicalKey(cleanGroup);
    const key = canonicalName.length >= 3
      ? canonicalName
      : `${canonicalName || 'ch'}-${canonicalGroup || index}`;

    if (grouped[key]) {
      const existing = grouped[key];
      if (!existing.logo && entry.logo) {
        existing.logo = entry.logo;
      }
      if (!existing.qualities.some((q) => q.url === entry.url)) {
        const sameLabelCount = existing.qualities.filter(
          (q) => q.label === baseQualityLabel || q.label.startsWith(`${baseQualityLabel} `)
        ).length;
        const finalLabel = sameLabelCount > 0 ? `${baseQualityLabel} ${sameLabelCount + 1}` : baseQualityLabel;
        existing.qualities.push({ label: finalLabel, url: entry.url });
      }
    } else {
      const safeIdPart = toCanonicalKey(baseName).slice(0, 24) || 'channel';
      grouped[key] = {
        id: `ch-${index}-${safeIdPart}`,
        name: baseName,
        logo: entry.logo,
        group: entry.group,
        streamUrl: entry.url,
        qualities: [{ label: baseQualityLabel, url: entry.url }],
      };
    }
  });

  return Object.values(grouped).map((channel) => {
    const sortedQualities = [...channel.qualities].sort(
      (a, b) => getQualityRank(a.label) - getQualityRank(b.label)
    );
    return {
      ...channel,
      qualities: sortedQualities,
      streamUrl: sortedQualities[0]?.url || channel.streamUrl,
    };
  });
}

export function parseM3U(content: string): ParsedEntry[] {
  const lines = content.split('\n');
  const entries: ParsedEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF')) {
      const nameMatch = line.match(/,(.+)$/);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const groupMatch = line.match(/group-title="([^"]*)"/i);

      const nextLine = (lines[i + 1] || '').trim();
      const embedMatch =
        nextLine.match(/SRC="([^"]*)"/i) ||
        nextLine.match(/src="([^"]*)"/i) ||
        nextLine.match(/(https?:\/\/[^\s<>"]+)/i);

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
