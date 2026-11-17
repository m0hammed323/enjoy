export interface StreamSource {
  url: string;
  label: string;
}

export async function extractStreamUrl(embedUrl: string): Promise<{ sources: StreamSource[]; poster: string }> {
  let html = '';

  try {
    const CapacitorHttp = (window as any).CapacitorHttp || (window as any).Capacitor?.Plugins?.CapacitorHttp;
    if (CapacitorHttp) {
      const resp = await CapacitorHttp.get({ url: embedUrl });
      html = resp.data || '';
    }
  } catch {
    // fall through to fetch
  }

  if (!html) {
    try {
      const resp = await fetch(embedUrl, { cache: 'no-store' });
      html = await resp.text();
    } catch {
      return { sources: [], poster: '' };
    }
  }

  const sources: StreamSource[] = [];
  const sourceRegex = /file:"([^"]*)"[^}]*label:"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = sourceRegex.exec(html)) !== null) {
    sources.push({ url: match[1], label: match[2] });
  }

  if (sources.length === 0) {
    const singleUrl = html.match(/sources:\s*\[\{file:"([^"]*)"/);
    if (singleUrl) {
      sources.push({ url: singleUrl[1], label: 'Auto' });
    }
  }

  if (sources.length === 0) {
    const mp4Match = html.match(/(https?:\/\/[^\s"'<>]+\.mp4)/i);
    const m3u8Match = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8)/i);
    if (m3u8Match) {
      sources.push({ url: m3u8Match[1], label: 'Auto' });
    } else if (mp4Match) {
      sources.push({ url: mp4Match[1], label: 'Auto' });
    }
  }

  const posterMatch = html.match(/image:\s*"([^"]*)"/);
  const poster = posterMatch ? posterMatch[1] : '';

  sources.sort((a, b) => {
    const aRes = parseInt(a.label.replace(/\D/g, ''), 10) || 0;
    const bRes = parseInt(b.label.replace(/\D/g, ''), 10) || 0;
    return aRes - bRes;
  });

  return { sources, poster };
}
