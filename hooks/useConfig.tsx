import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { RemoteConfig, Title, Channel } from '@/types';
import { m3uToTitles, parseM3UChannels } from '@/data/m3uParser';
import { setTitles as setGlobalTitles } from '@/data/titles';

const CONFIG_URL = 'https://raw.githubusercontent.com/m0hammed323/tv-config/main/config.json';
const CHANNELS_URL = 'https://raw.githubusercontent.com/m0hammed323/tv-config/main/channels.m3u';

type ConfigStatus = 'loading' | 'ready' | 'error';

interface ConfigContextType {
  config: RemoteConfig | null;
  titles: Title[];
  channels: Channel[];
  status: ConfigStatus;
  error: string | null;
  retry: () => void;
  announcementShown: boolean;
  setAnnouncementShown: (v: boolean) => void;
}

const ConfigContext = createContext<ConfigContextType | null>(null);

async function fetchWithNoCache(url: string): Promise<Response> {
  const sep = url.includes('?') ? '&' : '?';
  return fetch(`${url}${sep}t=${Date.now()}`, { cache: 'no-store' });
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<RemoteConfig | null>(null);
  const [titles, setTitlesState] = useState<Title[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [status, setStatus] = useState<ConfigStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [announcementShown, setAnnouncementShown] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const configResp = await fetchWithNoCache(CONFIG_URL);
      if (!configResp.ok) throw new Error(`Config fetch failed: ${configResp.status}`);
      const cfg: RemoteConfig = await configResp.json();
      setConfig(cfg);

      const allTitles: Title[] = [];

      if (cfg.movies_url) {
        const moviesResp = await fetchWithNoCache(cfg.movies_url);
        if (moviesResp.ok) {
          const m3uContent = await moviesResp.text();
          const parsed = m3uToTitles(m3uContent);
          allTitles.push(...parsed);
        }
      }

      if (cfg.stream_url) {
        try {
          const streamResp = await fetchWithNoCache(cfg.stream_url);
          if (streamResp.ok) {
            const streamContent = await streamResp.text();
            if (streamContent.includes('#EXTM3U')) {
              const streamTitles = m3uToTitles(streamContent);
              allTitles.push(...streamTitles);
            }
          }
        } catch {
          // stream_url is optional
        }
      }

      setTitlesState(allTitles);
      setGlobalTitles(allTitles);

      // Load channels
      try {
        const channelsResp = await fetchWithNoCache(CHANNELS_URL);
        if (channelsResp.ok) {
          const channelsContent = await channelsResp.text();
          if (channelsContent.includes('#EXTM3U')) {
            setChannels(parseM3UChannels(channelsContent));
          }
        }
      } catch {
        // channels are optional
      }

      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ConfigContext.Provider
      value={{ config, titles, channels, status, error, retry: load, announcementShown, setAnnouncementShown }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be used within ConfigProvider');
  return ctx;
}
