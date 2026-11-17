import { useCallback, useEffect, useRef, useState, createElement } from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Settings, Volume2, VolumeX, X } from 'lucide-react-native';
import Hls from 'hls.js';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/hooks/useI18n';
import { extractStreamUrl, StreamSource } from '@/utils/streamExtractor';

interface VideoPlayerProps {
  /** A direct media URL, an iframe URL, or an HTML embed snippet. */
  embedUrl: string;
  title: string;
  titleId: string;
  onClose: () => void;
  directStreamUrl?: string;
}

interface QualityLevel {
  height: number;
  bitrate: number;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function getEmbedSource(value: string): string | null {
  const input = value.trim();
  if (!input) return null;

  // Accept complete iframe/embed snippets as well as a raw iframe URL.
  const srcMatch = input.match(/<(?:iframe|embed|video)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i)
    || input.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
  if (srcMatch?.[1]) return srcMatch[1].replace(/&amp;/g, '&');
  if (/^https?:\/\//i.test(input) && !/\.(?:m3u8|mp4|webm|mov)(?:$|[?#])/i.test(input)) return input;
  return null;
}

function isMediaUrl(url: string): boolean {
  return /\.(?:m3u8|mp4|webm|mov)(?:$|[?#])/i.test(url);
}

function resumeKey(id: string) {
  return `enjoy-resume-${id}`;
}

export function VideoPlayer({ embedUrl, title, titleId, onClose, directStreamUrl }: VideoPlayerProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<View | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);
  const historyEntryRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [qualityMenuVisible, setQualityMenuVisible] = useState(false);
  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [selectedSource, setSelectedSource] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const disposeStream = useCallback(() => {
    hlsRef.current?.destroy();
    hlsRef.current = null;
    const video = videoRef.current;
    if (video) {
      if (titleId && video.currentTime > 5) {
        try { window.localStorage.setItem(resumeKey(titleId), String(video.currentTime)); } catch { /* storage is optional */ }
      }
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }, [titleId]);

  const restoreOrientation = useCallback(() => {
    if (Capacitor.isNativePlatform()) {
      ScreenOrientation.unlock().catch(() => {});
    } else if (Platform.OS === 'web' && typeof screen !== 'undefined') {
      (screen.orientation as any).unlock?.();
    }
  }, []);

  const finishClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    disposeStream();
    restoreOrientation();
    onClose();
  }, [disposeStream, onClose, restoreOrientation]);

  const close = useCallback(() => {
    // Remove the player's own browser-history entry without navigating away from the detail route.
    if (Platform.OS === 'web' && typeof window !== 'undefined' && historyEntryRef.current) {
      historyEntryRef.current = false;
      window.history.back();
    }
    finishClose();
  }, [finishClose]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.pushState({ ...(window.history.state || {}), enjoyVideoPlayer: true }, '', window.location.href);
      historyEntryRef.current = true;
      const onPopState = () => finishClose();
      window.addEventListener('popstate', onPopState);
      return () => window.removeEventListener('popstate', onPopState);
    }
    return undefined;
  }, [finishClose]);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => {});
    } else if (Platform.OS === 'web' && typeof screen !== 'undefined') {
      (screen.orientation as any).lock?.('landscape').catch(() => {});
    }
    return restoreOrientation;
  }, [restoreOrientation]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [close]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setLoading(true);
      setError('');
      setLevels([]);
      setSources([]);
      setSelectedLevel(-1);
      setSelectedSource(0);

      const rawInput = directStreamUrl || embedUrl;
      const embedSource = getEmbedSource(rawInput);
      if (embedSource && !isMediaUrl(embedSource)) {
        setLoading(false);
        return;
      }

      let availableSources: StreamSource[] = [];
      if (directStreamUrl || isMediaUrl(rawInput)) {
        availableSources = [{ url: rawInput, label: 'Auto' }];
      } else if (embedSource && isMediaUrl(embedSource)) {
        availableSources = [{ url: embedSource, label: 'Auto' }];
      } else {
        const extracted = await extractStreamUrl(rawInput);
        if (cancelled) return;
        availableSources = extracted.sources;
        if (!availableSources.length) {
          // If the supplied value is a page URL rather than a media URL, show that page as an embed.
          const pageUrl = getEmbedSource(rawInput);
          if (pageUrl) {
            setLoading(false);
            return;
          }
          setError(t('configError'));
          setLoading(false);
          return;
        }
      }

      if (cancelled) return;
      const video = videoRef.current;
      if (!video) return;
      setSources(availableSources);
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');

      let savedPosition = 0;
      if (titleId) {
        try { savedPosition = Number(window.localStorage.getItem(resumeKey(titleId)) || 0); } catch { /* resume is optional */ }
      }
      video.ontimeupdate = () => {
        setCurrentTime(video.currentTime || 0);
        if (video.buffered.length) setBuffered(video.buffered.end(video.buffered.length - 1));
      };
      video.ondurationchange = () => setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      video.onplay = () => setPlaying(true);
      video.onpause = () => setPlaying(false);
      video.onerror = () => {
        if (!cancelled) {
          setError('تعذر تشغيل الفيديو. تحقق من رابط التضمين أو رابط M3U8.');
          setLoading(false);
        }
      };

      const source = availableSources[0].url;
      if (/\.m3u8(?:$|[?#])/i.test(source) && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hlsRef.current = hls;
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
          if (cancelled) return;
          setLevels(data.levels.map((level) => ({ height: level.height || 0, bitrate: level.bitrate || 0 })));
          setLoading(false);
          if (savedPosition > 0) video.currentTime = savedPosition;
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || cancelled) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else {
            setError('تعذر تشغيل بث M3U8.');
            setLoading(false);
          }
        });
        hls.loadSource(source);
      } else {
        // Native HLS playback is used where Hls.js is unavailable (for example Safari/iOS).
        video.src = source;
        video.onloadedmetadata = () => {
          if (cancelled) return;
          setDuration(Number.isFinite(video.duration) ? video.duration : 0);
          if (savedPosition > 0 && savedPosition < video.duration - 10) video.currentTime = savedPosition;
          setLoading(false);
          video.play().catch(() => {});
        };
        video.load();
      }
    }

    start().catch(() => {
      if (!cancelled) {
        setError('تعذر تحميل الفيديو. تحقق من اتصالك بالإنترنت.');
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      disposeStream();
    };
  }, [directStreamUrl, embedUrl, titleId, disposeStream, t]);

  useEffect(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (controlsVisible && playing) {
      hideTimer.current = setTimeout(() => {
        setControlsVisible(false);
        setQualityMenuVisible(false);
      }, 4500);
    }
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [controlsVisible, playing]);

  const onStageTap = useCallback(() => {
    setControlsVisible((visible) => !visible);
    setQualityMenuVisible(false);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }, []);

  const seek = useCallback((delta: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = Math.max(0, Math.min(video.currentTime + delta, video.duration || 0));
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        await (stageRef.current as any)?.requestFullscreen?.();
        setIsFullscreen(true);
      }
    } catch { /* Fullscreen can require a user gesture or be unsupported. */ }
  }, []);

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const bufferedProgress = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;
  const embedSource = getEmbedSource(directStreamUrl || embedUrl);
  const isEmbed = !!embedSource && !isMediaUrl(embedSource);

  const renderEmbed = () => {
    if (!embedSource) return null;
    const html = /<(?:iframe|embed|video)\b/i.test(directStreamUrl || embedUrl)
      ? (directStreamUrl || embedUrl)
      : '';
    if (Platform.OS === 'web') {
      return createElement('iframe' as any, {
        src: html ? undefined : embedSource,
        srcDoc: html || undefined,
        title,
        allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
        allowFullScreen: true,
        frameBorder: '0',
        style: { width: '100%', height: '100%', border: 0, backgroundColor: '#000' },
      });
    }
    return <WebView source={html ? { html } : { uri: embedSource }} javaScriptEnabled domStorageEnabled allowsFullscreenVideo mediaPlaybackRequiresUserAction={false} style={styles.embed} />;
  };

  return (
    <View style={styles.overlay}>
      <StatusBar hidden style="light" />
      <View ref={stageRef as any} style={styles.stage}>
        {isEmbed ? renderEmbed() : <video ref={videoRef as any} style={styles.video as any} playsInline />}
        {!loading && !error && !isEmbed && (
          <Pressable style={styles.tapLayer} onPress={onStageTap} accessibilityLabel="Toggle player controls" />
        )}
        {loading && <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /><Text style={styles.message}>{t('loading')}</Text></View>}
        {!!error && <View style={styles.center}><Text style={styles.error}>{error}</Text><Pressable style={styles.retry} onPress={() => { setError(''); setLoading(true); setSources([]); }}><Text style={styles.retryText}>{t('retry')}</Text></Pressable></View>}

        {controlsVisible && !loading && !error && <>
          <View style={styles.topBar}>
            <Pressable style={styles.iconButton} onPress={close} accessibilityLabel={t('exitPlayer')}><X size={24} color="#fff" /></Pressable>
            <Text numberOfLines={1} style={styles.title}>{title}</Text>
          </View>
          {!isEmbed && <View style={styles.centerControls}>
            <Pressable style={styles.seekButton} onPress={() => seek(-10)}><RotateCcw size={26} color="#fff" /><Text style={styles.seekLabel}>10</Text></Pressable>
            <Pressable style={styles.playButton} onPress={togglePlay}>{playing ? <Pause size={34} color="#fff" fill="#fff" /> : <Play size={34} color="#fff" fill="#fff" />}</Pressable>
            <Pressable style={styles.seekButton} onPress={() => seek(10)}><RotateCw size={26} color="#fff" /><Text style={styles.seekLabel}>10</Text></Pressable>
          </View>}
          {!isEmbed && <View style={styles.bottomBar}>
            <Pressable style={styles.progressTrack} onPress={(event: any) => {
              const video = videoRef.current;
              const rect = event.currentTarget?.getBoundingClientRect?.();
              if (video && rect?.width && duration) video.currentTime = Math.max(0, Math.min(1, (event.nativeEvent?.locationX || event.clientX - rect.left || 0) / rect.width)) * duration;
            }}>
              <View style={[styles.bufferedTrack, { width: `${bufferedProgress}%` }]} />
              <View style={[styles.playedTrack, { width: `${progress}%` }]} />
            </Pressable>
            <View style={styles.bottomControls}>
              <Text style={styles.timeText}>{formatTime(currentTime)} / {formatTime(duration)}</Text>
              <View style={styles.spacer} />
              {!!levels.length && <Pressable style={styles.qualityButton} onPress={() => setQualityMenuVisible((value) => !value)}><Settings size={17} color="#fff" /><Text style={styles.qualityText}>{selectedLevel < 0 ? 'Auto' : `${levels[selectedLevel]?.height || ''}p`}</Text></Pressable>}
              <Pressable style={styles.iconButton} onPress={() => setMuted((value) => { const next = !value; if (videoRef.current) videoRef.current.muted = next; return next; })}>{muted ? <VolumeX size={20} color="#fff" /> : <Volume2 size={20} color="#fff" />}</Pressable>
              <Pressable style={styles.iconButton} onPress={toggleFullscreen}>{isFullscreen ? <Minimize size={20} color="#fff" /> : <Maximize size={20} color="#fff" />}</Pressable>
            </View>
          </View>}
          {qualityMenuVisible && <View style={styles.qualityMenu}>
            <Pressable style={styles.qualityItem} onPress={() => { if (hlsRef.current) hlsRef.current.currentLevel = -1; setSelectedLevel(-1); setQualityMenuVisible(false); }}><Text style={styles.qualityText}>Auto</Text></Pressable>
            {levels.map((level, index) => <Pressable key={`${level.height}-${index}`} style={styles.qualityItem} onPress={() => { if (hlsRef.current) hlsRef.current.currentLevel = index; setSelectedLevel(index); setQualityMenuVisible(false); }}><Text style={styles.qualityText}>{level.height ? `${level.height}p` : `${index + 1}`}</Text></Pressable>)}
            {sources.length > 1 && sources.map((source, index) => <Pressable key={`${source.url}-${index}`} style={styles.qualityItem} onPress={() => { setSelectedSource(index); setQualityMenuVisible(false); }}><Text style={styles.qualityText}>{source.label}</Text></Pressable>)}
          </View>}
        </>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 9999, backgroundColor: '#000' },
  stage: { flex: 1, position: 'relative', backgroundColor: '#000' },
  video: { width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000' },
  embed: { flex: 1, backgroundColor: '#000' },
  tapLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'transparent' },
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.65)', gap: Spacing.md, padding: Spacing.xl },
  message: { color: '#fff', fontSize: FontSize.md },
  error: { color: '#fff', fontSize: FontSize.md, textAlign: 'center' },
  retry: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  retryText: { color: '#fff', fontWeight: '700' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingTop: Spacing.lg, paddingBottom: Spacing.md, backgroundColor: 'rgba(0,0,0,0.55)' },
  title: { flex: 1, color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  centerControls: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 30 },
  playButton: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.56)' },
  seekButton: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.48)' },
  seekLabel: { color: '#fff', fontSize: 10, fontWeight: '800', marginTop: -2 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.lg, backgroundColor: 'rgba(0,0,0,0.64)' },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden', marginBottom: Spacing.sm },
  bufferedTrack: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: 'rgba(255,255,255,0.42)' },
  playedTrack: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: Colors.primary },
  bottomControls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  timeText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '600' },
  spacer: { flex: 1 },
  qualityButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: Radius.sm, backgroundColor: 'rgba(255,255,255,0.15)' },
  qualityText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '700' },
  qualityMenu: { position: 'absolute', right: Spacing.lg, bottom: 75, minWidth: 100, maxHeight: 220, padding: 6, borderRadius: Radius.md, backgroundColor: '#171717' },
  qualityItem: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
});
