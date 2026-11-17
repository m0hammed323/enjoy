import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Settings, Volume2, VolumeX, X } from 'lucide-react-native';
import Hls from 'hls.js';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/hooks/useI18n';
import { extractStreamUrl, StreamSource } from '@/utils/streamExtractor';

interface SportsTVPlayerProps {
  embedUrl: string;
  title: string;
  titleId: string;
  onClose: () => void;
  /** Use a stream URL directly for live channels instead of treating it as an embed page. */
  directStreamUrl?: string;
  isLive?: boolean;
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

function resumeKey(id: string) {
  return `sports-tv-resume-${id}`;
}

/** Full-screen player controls adapted for enjoy's Expo/Capacitor player runtime. */
export function SportsTVPlayer({ embedUrl, title, titleId, onClose, directStreamUrl, isLive = false }: SportsTVPlayerProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [qualityMenuVisible, setQualityMenuVisible] = useState(false);
  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(true);

  const disposeStream = useCallback(() => {
    hlsRef.current?.destroy();
    hlsRef.current = null;
    const video = videoRef.current;
    if (video) {
      if (!isLive && titleId && video.currentTime > 5) {
        try { window.localStorage.setItem(resumeKey(titleId), String(video.currentTime)); } catch {}
      }
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }, [isLive, titleId]);

  const close = useCallback(() => {
    disposeStream();
    onClose();
  }, [disposeStream, onClose]);

  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => listener.remove();
  }, [close]);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      setLoading(true);
      setError('');
      setLevels([]);
      setSelectedLevel(-1);
      let sources: StreamSource[];
      if (directStreamUrl) {
        sources = [{ url: directStreamUrl, label: 'Auto' }];
      } else {
        const extracted = await extractStreamUrl(embedUrl);
        sources = extracted.sources;
      }
      if (cancelled) return;
      if (!sources.length) {
        setError(t('configError'));
        setLoading(false);
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.setAttribute('playsinline', 'true');
      video.ontimeupdate = () => {
        setCurrentTime(video.currentTime || 0);
        if (video.buffered.length) setBuffered(video.buffered.end(video.buffered.length - 1));
      };
      video.ondurationchange = () => setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      video.onplay = () => setPlaying(true);
      video.onpause = () => setPlaying(false);
      video.onerror = () => {
        if (!cancelled) {
          setError('تعذر تشغيل البث. تحقق من الرابط أو أعد المحاولة.');
          setLoading(false);
        }
      };
      if (!isLive && titleId) {
        try {
          const saved = Number(window.localStorage.getItem(resumeKey(titleId)) || 0);
          if (saved > 0) video.onloadedmetadata = () => {
            if (saved < video.duration - 10) video.currentTime = saved;
          };
        } catch { /* resume is optional */ }
      }

      const source = sources[0].url;
      if (source.toLowerCase().includes('.m3u8') && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: isLive });
        hlsRef.current = hls;
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
          if (cancelled) return;
          const available = data.levels.map((level) => ({ height: level.height || 0, bitrate: level.bitrate || 0 }));
          setLevels(available);
          setLoading(false);
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || cancelled) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else {
            setError('تعذر تشغيل البث. تحقق من الرابط أو أعد المحاولة.');
            setLoading(false);
          }
        });
        hls.loadSource(source);
      } else {
        video.src = source;
        video.onloadedmetadata = () => {
          if (!cancelled) {
            setDuration(Number.isFinite(video.duration) ? video.duration : 0);
            setLoading(false);
            video.play().catch(() => {});
          }
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
  }, [directStreamUrl, embedUrl, isLive, titleId, disposeStream, t]);

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

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const seek = (delta: number) => {
    const video = videoRef.current;
    if (!video || isLive) return;
    video.currentTime = Math.max(0, Math.min(video.currentTime + delta, video.duration || 0));
  };

  const toggleFullscreen = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    }
  };

  const chooseQuality = (index: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
      setSelectedLevel(index);
    }
    setQualityMenuVisible(false);
  };

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const bufferedProgress = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;

  return (
    <View style={styles.overlay}>
      <StatusBar hidden style="light" />
      <View style={styles.stage}>
        <video ref={videoRef as any} style={styles.video as any} playsInline />
        {!loading && !error && <Pressable style={styles.tapLayer} onPress={() => setControlsVisible((visible) => !visible)} />}
        {loading && <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /><Text style={styles.message}>{t('loading')}</Text></View>}
        {!!error && <View style={styles.center}><Text style={styles.error}>{error}</Text><Pressable style={styles.retry} onPress={() => { setError(''); setLoading(true); videoRef.current?.load(); }}><Text style={styles.retryText}>{t('retry')}</Text></Pressable></View>}

        {controlsVisible && !loading && !error && <>
          <View style={styles.topBar}>
            <Pressable style={styles.iconButton} onPress={close}><X size={24} color="#fff" /></Pressable>
            <View style={styles.titleArea}><Text numberOfLines={1} style={styles.title}>{title}</Text><Text style={[styles.badge, isLive && styles.liveBadge]}>{isLive ? 'LIVE' : 'VOD'}</Text></View>
            <Pressable style={styles.iconButton} onPress={() => setMuted((value) => { const next = !value; if (videoRef.current) videoRef.current.muted = next; return next; })}>{muted ? <VolumeX size={21} color="#fff" /> : <Volume2 size={21} color="#fff" />}</Pressable>
          </View>
          <View style={styles.centerControls}>
            {!isLive && <Pressable style={styles.seekButton} onPress={() => seek(-10)}><RotateCcw size={26} color="#fff" /><Text style={styles.seekLabel}>10</Text></Pressable>}
            <Pressable style={styles.playButton} onPress={togglePlay}>{playing ? <Pause size={34} color="#fff" fill="#fff" /> : <Play size={34} color="#fff" fill="#fff" />}</Pressable>
            {!isLive && <Pressable style={styles.seekButton} onPress={() => seek(10)}><RotateCw size={26} color="#fff" /><Text style={styles.seekLabel}>10</Text></Pressable>}
          </View>
          <View style={styles.bottomBar}>
            {!isLive && <Pressable style={styles.progressTrack} onPress={(event: any) => {
              const video = videoRef.current;
              const rect = event.currentTarget?.getBoundingClientRect?.();
              if (video && rect?.width && duration) video.currentTime = ((event.nativeEvent?.locationX || 0) / rect.width) * duration;
            }}>
              <View style={[styles.bufferedTrack, { width: `${bufferedProgress}%` }]} /><View style={[styles.playedTrack, { width: `${progress}%` }]} />
            </Pressable>}
            <View style={styles.bottomControls}>
              {!isLive && <Text style={styles.timeText}>{formatTime(currentTime)} / {formatTime(duration)}</Text>}
              <View style={styles.spacer} />
              {!!levels.length && <Pressable style={styles.qualityButton} onPress={() => setQualityMenuVisible((value) => !value)}><Settings size={17} color="#fff" /><Text style={styles.qualityText}>{selectedLevel >= 0 ? `${levels[selectedLevel]?.height}p` : 'Auto'}</Text></Pressable>}
              <Pressable style={styles.iconButton} onPress={toggleFullscreen}>{isFullscreen ? <Minimize size={20} color="#fff" /> : <Maximize size={20} color="#fff" />}</Pressable>
            </View>
          </View>
          {qualityMenuVisible && <View style={styles.qualityMenu}><Pressable style={styles.qualityItem} onPress={() => chooseQuality(-1)}><Text style={styles.qualityText}>Auto</Text></Pressable>{levels.map((level, index) => <Pressable key={`${level.height}-${index}`} style={styles.qualityItem} onPress={() => chooseQuality(index)}><Text style={styles.qualityText}>{level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)} kbps`}</Text></Pressable>)}</View>}
        </>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, backgroundColor: '#000' },
  stage: { flex: 1, position: 'relative', backgroundColor: '#000' },
  video: { width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000' },
  tapLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'transparent' },
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.65)', gap: Spacing.md, padding: Spacing.xl },
  message: { color: '#fff', fontSize: FontSize.md },
  error: { color: '#fff', fontSize: FontSize.md, textAlign: 'center' },
  retry: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  retryText: { color: '#fff', fontWeight: '700' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingTop: Spacing.lg, paddingBottom: Spacing.md, backgroundColor: 'rgba(0,0,0,0.58)' },
  titleArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title: { color: '#fff', fontSize: FontSize.md, fontWeight: '700', flexShrink: 1 },
  badge: { color: '#111', backgroundColor: '#d8b15a', overflow: 'hidden', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3, fontSize: 9, fontWeight: '900' },
  liveBadge: { color: '#fff', backgroundColor: '#dc2626' },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  centerControls: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 30 },
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
  qualityMenu: { position: 'absolute', right: Spacing.lg, bottom: 75, minWidth: 100, padding: 6, borderRadius: Radius.md, backgroundColor: '#171717' },
  qualityItem: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
});
