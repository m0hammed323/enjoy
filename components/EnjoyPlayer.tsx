
export function parseM3UPlaylist(rawText: string): M3UChannel[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed: M3UChannel[] = [];
  let pendingName = '';
  let pendingGroup = 'قنوات عامة';
  let pendingLogo = '';

  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const commaIdx = line.lastIndexOf(',');

      pendingGroup = groupMatch?.[1]?.trim() || 'قنوات عامة';
      pendingLogo = logoMatch?.[1]?.trim() || '';

      pendingName =
        commaIdx !== -1
          ? line.slice(commaIdx + 1).trim()
          : `قناة ${parsed.length + 1}`;

    } else if (!line.startsWith('#') && /^https?:\/\//i.test(line)) {
      parsed.push({
        id: `ch_${parsed.length}_${Math.random().toString(36).slice(2, 7)}`,
        name: pendingName || `قناة ${parsed.length + 1}`,
        url: line,
        group: pendingGroup,
        logo: pendingLogo,
      });

      pendingName = '';
      pendingGroup = 'قنوات عامة';
      pendingLogo = '';
    }
  }

  return parsed;
}
