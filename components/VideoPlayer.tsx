import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform, BackHandler } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  X, Play, Pause, Settings as SettingsIcon,
  RotateCcw, RotateCw, Volume2, VolumeX,
  Lock, Unlock, Maximize, Minimize, SkipBack, SkipForward,
} from 'lucide-react-native';
import { Colors, FontSize, Spacing, Radius } from '@/constants/theme';
import { useI18n } from '@/hooks/useI18n';
import { extractStreamUrl, StreamSource } from '@/utils/streamExtractor';
import Hls from 'hls.js';

interface VideoPlayerProps {
  embedUrl: string;
  title: string;
  titleId: string;
  onClose: () => void;
}

interface HlsLevel {
  height: number;
  bitrate: number;
  url: string;
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getResumeKey(titleId: string): string {
  return `resume_${titleId}`;
}

function saveResumePosition(titleId: string, seconds: number) {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(getResumeKey(titleId), String(seconds));
  } catch {}
}

function getResumePosition(titleId: string): number {
  try {
    if (typeof window !== 'undefined') {
      const val = window.localStorage.getItem(getResumeKey(titleId));
      return val ? parseFloat(val) : 0;
    }
  } catch {}
  return 0;
}

function clearResumePosition(titleId: string) {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(getResumeKey(titleId));
  } catch {}
}

export function VideoPlayer({ embedUrl, title, titleId, onClose }: VideoPlayerProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedPosRef = useRef(0);
  const closingRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [levels, setLevels] = useState<HlsLevel[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [selectedSourceIdx, setSelectedSourceIdx] = useState(0);
  const [muted, setMuted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);

  const lockOrientation = useCallback(async (landscape: boolean) => {
    if (Platform.OS !== 'web') {
      try {
        const { ScreenOrientation } = await import('@capacitor/screen-orientation');
        if (landscape) await ScreenOrientation.lock({ orientation: 'landscape' });
        else await ScreenOrientation.unlock();
      } catch {}
    } else if (typeof document !== 'undefined') {
      try {
        if (landscape && document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else if (!landscape && document.exitFullscreen && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      } catch {}
    }
  }, []);

  const hideSystemUI = useCallback(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--status-bar-style', 'hidden');
    }
  }, []);

  const showSystemUI = useCallback(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.style.removeProperty('--status-bar-style');
    }
  }, []);

  const destroyPlayer = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      if (titleId && video.currentTime > 5) saveResumePosition(titleId, video.currentTime);
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    lockOrientation(false);
    showSystemUI();
  }, [lockOrientation, showSystemUI, titleId]);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    destroyPlayer();
    onClose();
  }, [destroyPlayer, onClose]);

  // Always consume the first Android back press while the player is mounted.
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });
    return () => backHandler.remove();
  }, [handleClose]);

  // Automatically hide playback controls after a short idle period; tapping toggles them back.
  useEffect(() => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    if (!showControls || !playing) return;
    hideTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
      setShowQualityMenu(false);
    }, 4000);
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [showControls, playing]);

  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (video && !video.paused && video.currentTime > 0 && titleId) {
        savedPosRef.current = video.currentTime;
        saveResumePosition(titleId, video.currentTime);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [titleId]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);
      hideSystemUI();
      lockOrientation(true);
      const savedPos = titleId ? getResumePosition(titleId) : 0;
      const { sources: extracted, poster } = await extractStreamUrl(embedUrl);
      if (cancelled) return;
      if (extracted.length === 0) {
        setError(t('loading'));
        setLoading(false);
        return;
      }
      setSources(extracted);
      setSelectedSourceIdx(0);
      const video = videoRef.current;
      if (!video) return;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('controls', 'false');
      video.ontimeupdate = () => {
        setCurrentTime(video.currentTime);
        if (video.buffered.length > 0) setBuffered(video.buffered.end(video.buffered.length - 1));
      };
      video.ondurationchange = () => setDuration(video.duration || 0);
      video.onplay = () => setPlaying(true);
      video.onpause = () => setPlaying(false);
      video.onloadedmetadata = () => {
        setDuration(video.duration || 0);
        if (savedPos > 10 && savedPos < (video.duration || Infinity) - 10) {
          setShowResumePrompt(true);
          savedPosRef.current = savedPos;
        }
      };

      const primary = extracted[0];
      if (primary.url.includes('.m3u8') && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hlsRef.current = hls;
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
          if (cancelled) return;
          const hlsLevels: HlsLevel[] = data.levels.map((level: any) => ({
            height: level.height || 0,
            bitrate: level.bitrate || 0,
            url: level.url || '',
          }));
          setLevels(hlsLevels);
          if (hlsLevels.length > 0) {
            hls.startLevel = 0;
            hls.currentLevel = 0;
            setCurrentLevel(0);
          }
          setLoading(false);
          video.play().then(() => setPlaying(true)).catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else {
            destroyPlayer();
            setError('Playback error');
            setLoading(false);
          }
        });
        hls.loadSource(primary.url);
      } else {
        video.src = primary.url;
        video.addEventListener('loadedmetadata', () => {
          if (cancelled) return;
          setLoading(false);
          video.play().then(() => setPlaying(true)).catch(() => {});
        }, { once: true });
        video.addEventListener('error', () => {
          if (!cancelled) {
            setError('Playback error');
            setLoading(false);
          }
        }, { once: true });
      }
      if (poster) video.poster = poster;
    }

    init();
    return () => {
      cancelled = true;
      destroyPlayer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedUrl, titleId]);

  const toggleControls = useCallback(() => {
    if (locked || loading || error || showResumePrompt) return;
    setShowControls((visible) => !visible);
    setShowQualityMenu(false);
  }, [locked, loading, error, showResumePrompt]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().then(() => setPlaying(true)).catch(() => {});
    else video.pause();
  }, []);

  const seekBy = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.currentTime + seconds, video.duration || 0));
    setCurrentTime(video.currentTime);
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    }
  }, []);

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
    const wasPlaying = !video.paused;
    const time = video.currentTime;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    setLoading(true);
    if (sources[idx].url.includes('.m3u8') && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hlsRef.current = hls;
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        const hlsLevels: HlsLevel[] = data.levels.map((level: any) => ({
          height: level.height || 0,
          bitrate: level.bitrate || 0,
          url: level.url || '',
        }));
        setLevels(hlsLevels);
        if (hlsLevels.length > 0) {
          hls.startLevel = 0;
          hls.currentLevel = 0;
          setCurrentLevel(0);
        } else setCurrentLevel(-1);
        setLoading(false);
        if (time > 0) video.currentTime = time;
        if (wasPlaying) video.play().then(() => setPlaying(true)).catch(() => {});
      });
      hls.loadSource(sources[idx].url);
    } else {
      video.src = sources[idx].url;
      video.addEventListener('loadedmetadata', () => {
        setLoading(false);
        if (time > 0) video.currentTime = time;
        if (wasPlaying) video.play().then(() => setPlaying(true)).catch(() => {});
      }, { once: true });
    }
  }, [sources]);

  const handleResume = useCallback(() => {
    const video = videoRef.current;
    if (video && savedPosRef.current > 0) {
      video.currentTime = savedPosRef.current;
      setCurrentTime(savedPosRef.current);
    }
    setShowResumePrompt(false);
  }, []);

  const handleRestart = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      setCurrentTime(0);
    }
    setShowResumePrompt(false);
    if (titleId) clearResumePosition(titleId);
  }, [titleId]);

  const qualityLabel = (level: HlsLevel, idx: number) => level.height > 0 ? `${level.height}p` : `${idx + 1}`;
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;
  const onProgressBarClick = useCallback((event: any) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX || event.touches?.[0]?.clientX || 0;
    video.currentTime = Math.max(0, Math.min(((clickX - rect.left) / rect.width) * duration, duration));
    setCurrentTime(video.currentTime);
  }, [duration]);

  return (
    <View style={styles.overlay}>
      <StatusBar hidden style="light" />
      <View style={styles.playerContainer}>
        <video
          ref={videoRef as any}
          style={{ width: '100%', height: '100%', objectFit: 'contain' as const, backgroundColor: '#000' }}
          playsInline
          controls={false}
        />

        {/* This layer is behind the controls, so any tap on the video toggles the UI. */}
        {!loading && !error && !showResumePrompt && !locked && (
          <Pressable style={styles.tapArea} onPress={toggleControls} accessibilityLabel="Toggle player controls" />
        )}

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>{t('loading')}</Text>
          </View>
        )}
        {error && <View style={styles.loadingOverlay}><Text style={styles.errorText}>{error}</Text></View>}

        {showResumePrompt && !loading && !error && (
          <View style={styles.resumeOverlay}>
            <View style={styles.resumeCard}>
              <Text style={styles.resumeTitle}>{t('resume')} {formatTime(savedPosRef.current)}</Text>
              <View style={styles.resumeButtons}>
                <Pressable style={styles.resumeBtn} onPress={handleRestart}><Text style={styles.resumeBtnText}>{t('restart')}</Text></Pressable>
                <Pressable style={[styles.resumeBtn, styles.resumeBtnPrimary]} onPress={handleResume}>
                  <Play size={16} color={Colors.background} fill={Colors.background} />
                  <Text style={styles.resumeBtnTextPrimary}>{t('play')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {locked && (
          <View style={styles.lockOverlay} onTouchStart={() => setLocked(false)}>
            <View style={styles.lockBadge}>
              <Unlock size={20} color={Colors.textPrimary} />
              <Text style={styles.lockText}>{t('unlockPlayer')}</Text>
            </View>
          </View>
        )}

        {showControls && !loading && !error && !locked && (
          <>
            <View style={styles.topBar}>
              <Pressable style={styles.iconBtn} onPress={handleClose}><X size={24} color={Colors.textPrimary} /></Pressable>
              <Text style={styles.videoTitle} numberOfLines={1}>{title}</Text>
              <Pressable style={styles.iconBtn} onPress={() => setLocked(true)}><Lock size={20} color={Colors.textPrimary} /></Pressable>
            </View>
            <View style={styles.centerControls}>
              <Pressable style={styles.seekBtn} onPress={() => seekBy(-10)}><RotateCcw size={28} color={Colors.textPrimary} /><Text style={styles.seekLabel}>10</Text></Pressable>
              <Pressable style={styles.playBtn} onPress={togglePlay}>
                {playing ? <Pause size={36} color={Colors.textPrimary} fill={Colors.textPrimary} /> : <Play size={36} color={Colors.textPrimary} fill={Colors.textPrimary} />}
              </Pressable>
              <Pressable style={styles.seekBtn} onPress={() => seekBy(10)}><RotateCw size={28} color={Colors.textPrimary} /><Text style={styles.seekLabel}>10</Text></Pressable>
            </View>
            <View style={styles.bottomBar}>
              <View style={styles.progressContainer} onClick={onProgressBarClick} onTouchStart={onProgressBarClick}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressBuffered, { width: `${bufferedPercent}%` }]} />
                  <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                  <View style={[styles.progressThumb, { left: `${progressPercent}%` }]} />
                </View>
              </View>
              <View style={styles.controlsRow}>
                <Pressable style={styles.iconBtnSmall} onPress={togglePlay}>{playing ? <Pause size={20} color={Colors.textPrimary} /> : <Play size={20} color={Colors.textPrimary} />}</Pressable>
                <Pressable style={styles.iconBtnSmall} onPress={() => seekBy(-10)}><SkipBack size={20} color={Colors.textPrimary} /></Pressable>
                <Pressable style={styles.iconBtnSmall} onPress={() => seekBy(10)}><SkipForward size={20} color={Colors.textPrimary} /></Pressable>
                <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                <Text style={styles.timeSeparator}>/</Text>
                <Text style={styles.timeText}>{formatTime(duration)}</Text>
                <View style={styles.spacer} />
                <Pressable style={styles.iconBtnSmall} onPress={toggleMute}>{muted ? <VolumeX size={20} color={Colors.textPrimary} /> : <Volume2 size={20} color={Colors.textPrimary} />}</Pressable>
                <Pressable style={styles.qualityBtn} onPress={() => setShowQualityMenu((visible) => !visible)}>
                  <SettingsIcon size={18} color={Colors.textPrimary} />
                  <Text style={styles.qualityBtnText}>{currentLevel >= 0 && levels[currentLevel] ? qualityLabel(levels[currentLevel], currentLevel) : sources[selectedSourceIdx]?.label || t('auto')}</Text>
                </Pressable>
                <Pressable style={styles.iconBtnSmall} onPress={toggleFullscreen}>{isFullscreen ? <Minimize size={20} color={Colors.textPrimary} /> : <Maximize size={20} color={Colors.textPrimary} />}</Pressable>
              </View>
            </View>
          </>
        )}

        {showQualityMenu && !loading && !error && !locked && (
          <View style={styles.qualityMenu}>
            <Text style={styles.qualityMenuTitle}>{t('selectQuality')}</Text>
            {levels.map((level, idx) => (
              <Pressable key={`lvl-${idx}`} style={[styles.qualityItem, currentLevel === idx && styles.qualityItemActive]} onPress={() => changeQuality(idx)}>
                <Text style={[styles.qualityItemText, currentLevel === idx && styles.qualityItemTextActive]}>{qualityLabel(level, idx)}</Text>
              </Pressable>
            ))}
            {sources.length > 1 && <>
              {levels.length > 0 && <View style={styles.qualityDivider} />}
              {sources.map((source, idx) => (
                <Pressable key={`src-${idx}`} style={[styles.qualityItem, selectedSourceIdx === idx && styles.qualityItemActive]} onPress={() => changeSource(idx)}>
                  <Text style={[styles.qualityItemText, selectedSourceIdx === idx && styles.qualityItemTextActive]}>{source.label}</Text>
                </Pressable>
              ))}
            </>}
            {levels.length === 0 && sources.length <= 1 && <Text style={styles.noQuality}>{t('auto')}</Text>}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 9999 },
  playerContainer: { flex: 1, position: 'relative' },
  tapArea: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'transparent' },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)' },
  loadingText: { color: Colors.textPrimary, fontSize: FontSize.md, marginTop: Spacing.md },
  errorText: { color: Colors.error, fontSize: FontSize.lg },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: Spacing.lg, paddingBottom: Spacing.md, backgroundColor: 'rgba(0,0,0,0.5)', gap: Spacing.md },
  videoTitle: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '600', flex: 1 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  iconBtnSmall: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  centerControls: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: Spacing.xl },
  playBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  seekBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  seekLabel: { color: Colors.textPrimary, fontSize: 10, fontWeight: '800', marginTop: -2 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.lg },
  progressContainer: { width: '100%', height: 24, justifyContent: 'center', cursor: 'pointer' },
  progressTrack: { width: '100%', height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, position: 'relative' },
  progressBuffered: { position: 'absolute', top: 0, left: 0, height: '100%', backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2 },
  progressFill: { position: 'absolute', top: 0, left: 0, height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },
  progressThumb: { position: 'absolute', top: -6, width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.primary, marginLeft: -8, borderWidth: 2, borderColor: '#fff' },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  timeText: { color: Colors.textPrimary, fontSize: FontSize.xs, fontWeight: '600' },
  timeSeparator: { color: Colors.textMuted, fontSize: FontSize.xs },
  spacer: { flex: 1 },
  qualityBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.sm, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: Radius.sm },
  qualityBtnText: { color: Colors.textPrimary, fontSize: FontSize.xs, fontWeight: '600' },
  qualityMenu: { position: 'absolute', bottom: 72, right: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.sm, minWidth: 140, borderWidth: 1, borderColor: Colors.border },
  qualityMenuTitle: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '700', textTransform: 'uppercase', paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, marginBottom: Spacing.xs },
  qualityItem: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.sm },
  qualityItemActive: { backgroundColor: Colors.primary },
  qualityItemText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
  qualityItemTextActive: { color: Colors.textPrimary, fontWeight: '700' },
  qualityDivider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.xs },
  noQuality: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center', paddingVertical: Spacing.sm },
  resumeOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  resumeCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center', gap: Spacing.lg, minWidth: 280 },
  resumeTitle: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700', textAlign: 'center' },
  resumeButtons: { flexDirection: 'row', gap: Spacing.md },
  resumeBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2, borderRadius: Radius.md, backgroundColor: Colors.surfaceLighter },
  resumeBtnPrimary: { backgroundColor: Colors.textPrimary },
  resumeBtnText: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  resumeBtnTextPrimary: { color: Colors.background, fontSize: FontSize.md, fontWeight: '700' },
  lockOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  lockBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.md },
  lockText: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '600' },
});
