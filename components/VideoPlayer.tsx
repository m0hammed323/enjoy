import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { X, Play, Pause, Settings as SettingsIcon } from 'lucide-react-native';
import { Colors, FontSize, Spacing, Radius } from '@/constants/theme';
import { useI18n } from '@/hooks/useI18n';
import { extractStreamUrl, StreamSource } from '@/utils/streamExtractor';
import Hls from 'hls.js';

interface VideoPlayerProps {
  embedUrl: string;
  title: string;
  onClose: () => void;
}

interface HlsLevel {
  height: number;
  bitrate: number;
  url: string;
}

export function VideoPlayer({ embedUrl, title, onClose }: VideoPlayerProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [levels, setLevels] = useState<HlsLevel[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [selectedSourceIdx, setSelectedSourceIdx] = useState(0);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lockOrientation = useCallback(async (landscape: boolean) => {
    if (Platform.OS !== 'web') {
      try {
        const { ScreenOrientation } = await import('@capacitor/screen-orientation');
        if (landscape) {
          await ScreenOrientation.lock({ orientation: 'landscape' });
        } else {
          await ScreenOrientation.unlock();
        }
      } catch {
        // orientation plugin not available
      }
    }
  }, []);

  const destroyPlayer = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    lockOrientation(false);
  }, [lockOrientation]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);

      const { sources: extracted, poster } = await extractStreamUrl(embedUrl);
      if (cancelled) return;

      if (extracted.length === 0) {
        setError(t('loading'));
        setLoading(false);
        return;
      }

      setSources(extracted);
      setSelectedSourceIdx(0);
      const primary = extracted[0];
      const video = videoRef.current;
      if (!video) return;

      video.setAttribute('playsinline', 'true');
      video.setAttribute('controls', 'false');

      const isM3U8 = primary.url.includes('.m3u8');

      if (isM3U8 && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hlsRef.current = hls;
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
          if (cancelled) return;
          const hlsLevels: HlsLevel[] = data.levels.map((l: any) => ({
            height: l.height || 0,
            bitrate: l.bitrate || 0,
            url: l.url || '',
          }));
          setLevels(hlsLevels);

          // Start at lowest quality
          if (hlsLevels.length > 0) {
            hls.startLevel = 0;
            hls.currentLevel = 0;
            setCurrentLevel(0);
          }

          setLoading(false);
          video.play().then(() => setPlaying(true)).catch(() => {});
        });

        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                destroyPlayer();
                setError('Playback error');
                setLoading(false);
                break;
            }
          }
        });

        hls.loadSource(primary.url);
      } else {
        // Native HLS (Safari) or direct MP4
        video.src = primary.url;
        video.addEventListener('loadedmetadata', () => {
          if (cancelled) return;
          setLoading(false);
          video.play().then(() => setPlaying(true)).catch(() => {});
        }, { once: true });

        video.addEventListener('error', () => {
          if (cancelled) return;
          setError('Playback error');
          setLoading(false);
        }, { once: true });
      }

      if (poster) {
        video.poster = poster;
      }
    }

    init();
    lockOrientation(true);

    return () => {
      cancelled = true;
      destroyPlayer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedUrl]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  }, []);

  const handleControls = useCallback(() => {
    setShowControls(true);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 4000);
  }, [playing]);

  const changeQuality = useCallback((levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
      setCurrentLevel(levelIndex);
    }
    setShowQualityMenu(false);
  }, []);

  const changeSource = useCallback((idx: number) => {
    setSelectedSourceIdx(idx);
    setShowQualityMenu(false);
    const video = videoRef.current;
    if (!video || !sources[idx]) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isM3U8 = sources[idx].url.includes('.m3u8');
    setLoading(true);

    if (isM3U8 && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hlsRef.current = hls;
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        const hlsLevels: HlsLevel[] = data.levels.map((l: any) => ({
          height: l.height || 0,
          bitrate: l.bitrate || 0,
          url: l.url || '',
        }));
        setLevels(hlsLevels);
        if (hlsLevels.length > 0) {
          hls.startLevel = 0;
          hls.currentLevel = 0;
          setCurrentLevel(0);
        } else {
          setCurrentLevel(-1);
        }
        setLoading(false);
        video.play().then(() => setPlaying(true)).catch(() => {});
      });
      hls.loadSource(sources[idx].url);
    } else {
      video.src = sources[idx].url;
      video.addEventListener('loadedmetadata', () => {
        setLoading(false);
        video.play().then(() => setPlaying(true)).catch(() => {});
      }, { once: true });
    }
  }, [sources]);

  const qualityLabel = (level: HlsLevel, idx: number): string => {
    if (level.height > 0) return `${level.height}p`;
    return `${idx + 1}`;
  };

  return (
    <View style={styles.overlay}>
      <View
        ref={containerRef}
        style={styles.playerContainer}
        onTouchStart={handleControls}
        onClick={handleControls}
      >
        <video
          ref={videoRef as any}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain' as const,
            backgroundColor: '#000',
          }}
          playsInline
          controls={false}
        />

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>{t('loading')}</Text>
          </View>
        )}

        {error && (
          <View style={styles.loadingOverlay}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {showControls && !loading && !error && (
          <>
            <View style={styles.topBar}>
              <Pressable style={styles.closeBtn} onPress={() => { destroyPlayer(); onClose(); }}>
                <X size={24} color={Colors.textPrimary} />
              </Pressable>
              <Text style={styles.videoTitle} numberOfLines={1}>{title}</Text>
            </View>

            <View style={styles.centerControls}>
              <Pressable style={styles.playBtn} onPress={togglePlay}>
                {playing ? (
                  <Pause size={32} color={Colors.textPrimary} fill={Colors.textPrimary} />
                ) : (
                  <Play size={32} color={Colors.textPrimary} fill={Colors.textPrimary} />
                )}
              </Pressable>
            </View>

            <View style={styles.bottomBar}>
              <Pressable
                style={styles.qualityBtn}
                onPress={() => setShowQualityMenu(!showQualityMenu)}
              >
                <SettingsIcon size={18} color={Colors.textPrimary} />
                <Text style={styles.qualityBtnText}>
                  {t('quality')}: {currentLevel >= 0 && levels[currentLevel]
                    ? qualityLabel(levels[currentLevel], currentLevel)
                    : sources[selectedSourceIdx]?.label || t('auto')}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {showQualityMenu && !loading && !error && (
          <View style={styles.qualityMenu}>
            <Text style={styles.qualityMenuTitle}>{t('selectQuality')}</Text>

            {levels.length > 0 ? (
              levels.map((level, idx) => (
                <Pressable
                  key={`lvl-${idx}`}
                  style={[styles.qualityItem, currentLevel === idx && styles.qualityItemActive]}
                  onPress={() => changeQuality(idx)}
                >
                  <Text style={[styles.qualityItemText, currentLevel === idx && styles.qualityItemTextActive]}>
                    {qualityLabel(level, idx)}
                  </Text>
                </Pressable>
              ))
            ) : null}

            {sources.length > 1 && (
              <>
                {levels.length > 0 && <View style={styles.qualityDivider} />}
                {sources.map((src, idx) => (
                  <Pressable
                    key={`src-${idx}`}
                    style={[styles.qualityItem, selectedSourceIdx === idx && styles.qualityItemActive]}
                    onPress={() => changeSource(idx)}
                  >
                    <Text style={[styles.qualityItemText, selectedSourceIdx === idx && styles.qualityItemTextActive]}>
                      {src.label}
                    </Text>
                  </Pressable>
                ))}
              </>
            )}

            {levels.length === 0 && sources.length <= 1 && (
              <Text style={styles.noQuality}>{t('auto')}</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    zIndex: 9999,
  },
  playerContainer: {
    flex: 1,
    position: 'relative',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  loadingText: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    marginTop: Spacing.md,
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSize.lg,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.5)',
    gap: Spacing.md,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
    flex: 1,
  },
  centerControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  qualityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.sm,
  },
  qualityBtnText: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  qualityMenu: {
    position: 'absolute',
    bottom: 60,
    right: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    minWidth: 140,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  qualityMenuTitle: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  qualityItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  qualityItemActive: {
    backgroundColor: Colors.primary,
  },
  qualityItemText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  qualityItemTextActive: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  qualityDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
  noQuality: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },
});
