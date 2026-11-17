import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { RemoteConfig, Title } from '@/types';
import { m3uToTitles } from '@/data/m3uParser';

const CONFIG_URL = 'https://raw.githubusercontent.com/m0hammed323/tv-config/main/config.json';

type ConfigStatus = 'loading' | 'ready' | 'error';

interface ConfigContextType {
  config: RemoteConfig | null;
  titles: Title[];
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
  const [titles, setTitles] = useState<Title[]>([]);
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

      if (cfg.movies_url) {
        const moviesResp = await fetchWithNoCache(cfg.movies_url);
        if (moviesResp.ok) {
          const m3uContent = await moviesResp.text();
          const parsed = m3uToTitles(m3uContent);
          setTitles(parsed);
        }
      }

      if (cfg.stream_url) {
        try {
          const streamResp = await fetchWithNoCache(cfg.stream_url);
          if (streamResp.ok) {
            const streamContent = await streamResp.text();
            if (streamContent.includes('#EXTM3U')) {
              const streamTitles = m3uToTitles(streamContent);
              setTitles((prev) => [...prev, ...streamTitles]);
            }
          }
        } catch {
          // stream_url is optional
        }
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
      value={{ config, titles, status, error, retry: load, announcementShown, setAnnouncementShown }}
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
