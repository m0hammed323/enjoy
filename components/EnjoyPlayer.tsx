import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar as NativeStatusBar } from '@capacitor/status-bar';
import Hls from 'hls.js';
import { Lock, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Settings, Tv, Unlock, Volume2, VolumeX, X } from 'lucide-react-native';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { registerBackInterceptor } from '@/utils/backNavigation';

export interface PlayerChannel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
}

export interface PlayerQuality {
  label: string;
  url?: string;
  height?: number;
  bitrate?: number;
}

type FitMode = 'contain' | 'cover' | 'fill' | 'zoom';

export interface EnjoyPlayerProps {
  title: string;
  subtitle?: string;
  url: string;
  qualities?: Array<string | PlayerQuality>;
  channels?: PlayerChannel[];
  forceLandscape?: boolean;
  isLive?: boolean;
  onClose: () => void;
}

/** Parse an M3U/M3U8 playlist into channel entries. */
export function parseM3UPlaylist(text: string, baseUrl = ''): PlayerChannel[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const result: PlayerChannel[] = [];
  let pending: Omit<PlayerChannel, 'url'> | null = null;
  for (const line of lines) {
    if (line.startsWith('#EXTINF')) {
      const name = line.split(',').slice(1).join(',').trim() || 'قناة';
      const attr = (key: string) => line.match(new RegExp(`${key}=["']([^"']*)["']`, 'i'))?.[1] || '';
      pending = {
        id: `${result.length}-${name}`,
        name,
        logo: attr('tvg-logo') || undefined,
        group: attr('group-title') || undefined,
      };
    } else if (line && !line.startsWith('#')) {
      if (!pending) pending = { id: `${result.length}-${line}`, name: line, group: undefined, logo: undefined };
      let streamUrl = line;
      try { if (baseUrl) streamUrl = new URL(line, baseUrl).toString(); } catch { /* retain supplied URL */ }
      result.push({ ...pending, url: streamUrl });
      pending = null;
    }
  }
  return result;
}

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${minutes}:${String(secs).padStart(2, '0')}`;
};

const fitOptions: Array<{ mode: FitMode; label: string }> = [
  { mode: 'contain', label: 'ملاءمة (Fit)' },
  { mode: 'cover', label: 'ملء الشاشة (Fill)' },
  { mode: 'fill', label: 'تمديد (Stretch)' },
  { mode: 'zoom', label: 'تكبير (Zoom)' },
];

const isPlaylistUrl = (value: string) => /\.m3u(?!8)(?:$|[?#])/i.test(value);
const isVideoUrl = (value: string) => /\.(?:m3u8|mp4|webm|mov|m4v)(?:$|[?#])/i.test(value);

export function EnjoyPlayer({ title, subtitle, url, qualities = [], channels = [], forceLandscape = true, isLive = false, onClose }: EnjoyPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<View | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef(0);
  const closedRef = useRef(false);
  const lockedRef = useRef(false);
  const popoverRef = useRef(false);
  const drawerRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [activeChannel, setActiveChannel] = useState<PlayerChannel | null>(null);
  const [loadedChannels, setLoadedChannels] = useState<PlayerChannel[]>(channels);
  const [channelSearch, setChannelSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [locked, setLocked] = useState(false);
  const [unlockHint, setUnlockHint] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [fitOpen, setFitOpen] = useState(false);
  const [fit, setFit] = useState<FitMode>('contain');
  const [fitBadge, setFitBadge] = useState('');
  const [seekFeedback, setSeekFeedback] = useState('');
  const [levels, setLevels] = useState<Array<{ height: number; bitrate: number }>>([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  lockedRef.current = locked;
  popoverRef.current = qualityOpen || fitOpen;
  drawerRef.current = drawerOpen;
  const currentUrl = activeChannel?.url || url;
  const live = isLive || !!activeChannel;
  const visibleChannels = useMemo(() => loadedChannels.filter((channel) => `${channel.name} ${channel.group || ''}`.toLowerCase().includes(channelSearch.toLowerCase())), [loadedChannels, channelSearch]);

  const restoreBars = useCallback(async () => {
    try { await NativeStatusBar.show(); } catch { /* plugin may not be available on web */ }
    if (typeof document !== 'undefined' && document.fullscreenElement && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch { /* fullscreen exit is best effort */ }
    }
    setFullscreen(false);
  }, []);

  const showBars = useCallback(async () => {
    try { await NativeStatusBar.show(); } catch { /* plugin may not be available on web */ }
    if (typeof document !== 'undefined' && document.fullscreenElement && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch { /* browser fullscreen may be unsupported */ }
    }
    setFullscreen(false);
  }, []);

  const hideBars = useCallback(async () => {
    try { await NativeStatusBar.hide(); } catch { /* plugin may not be available on web */ }
    if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.fullscreenElement) {
      try { await (stageRef.current as any)?.requestFullscreen?.(); setFullscreen(true); } catch { /* requires user gesture or unsupported */ }
    }
  }, []);

  const closePlayer = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    const video = videoRef.current;
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    void restoreBars();
    if (Capacitor.isNativePlatform()) void ScreenOrientation.unlock().catch(() => {});
    else if (typeof screen !== 'undefined') (screen.orientation as any)?.unlock?.();
    onCloseRef.current();
  }, [restoreBars]);

  // Back stack: dismiss drawer/popover, respect screen lock, then close the player.
  useEffect(() => registerBackInterceptor(() => {
    if (drawerRef.current) { setDrawerOpen(false); return true; }
    if (popoverRef.current) { setQualityOpen(false); setFitOpen(false); return true; }
    if (lockedRef.current) { setUnlockHint(true); setTimeout(() => setUnlockHint(false), 1800); return true; }
    closePlayer();
    return true;
  }, 500), [closePlayer]);

  useEffect(() => {
    if (!forceLandscape) return undefined;
    if (Capacitor.isNativePlatform()) {
      void ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => {});
    } else if (typeof screen !== 'undefined') {
      void (screen.orientation as any)?.lock?.('landscape')?.catch?.(() => {});
    }
    return () => {
      if (Capacitor.isNativePlatform()) void ScreenOrientation.unlock().catch(() => {});
      else if (typeof screen !== 'undefined') (screen.orientation as any)?.unlock?.();
    };
  }, [forceLandscape]);

  useEffect(() => {
    let cancelled = false;
    let sourceUrl = currentUrl;
    setLoading(true);
    setError('');
    setLevels([]);
    setSelectedLevel(-1);
    hlsRef.current?.destroy();
    hlsRef.current = null;

    const load = async () => {
      if (sourceUrl.trim().startsWith('#EXTM3U') || isPlaylistUrl(sourceUrl)) {
        if (sourceUrl.trim().startsWith('#EXTM3U')) {
          const parsed = parseM3UPlaylist(sourceUrl);
          setLoadedChannels(parsed);
          if (!parsed.length) { setError('لم يتم العثور على قنوات في القائمة.'); setLoading(false); return; }
          setActiveChannel(parsed[0]);
          return;
        }
        try {
          const response = await fetch(sourceUrl);
          if (!response.ok) throw new Error('playlist request failed');
          const parsed = parseM3UPlaylist(await response.text(), sourceUrl);
          if (cancelled) return;
          setLoadedChannels(parsed);
          if (!parsed.length) throw new Error('empty playlist');
          setActiveChannel(parsed[0]);
          return;
        } catch {
          if (!cancelled) { setError('تعذر تحميل قائمة القنوات.'); setLoading(false); }
          return;
        }
      }

      const video = videoRef.current;
      if (!video) return;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.ontimeupdate = () => {
        setTime(video.currentTime || 0);
        if (video.buffered.length) setBuffered(video.buffered.end(video.buffered.length - 1));
      };
      video.ondurationchange = () => setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      video.onplay = () => setPlaying(true);
      video.onpause = () => setPlaying(false);
      video.onerror = () => { if (!cancelled) { setError('تعذر تشغيل الفيديو أو البث.'); setLoading(false); } };

      if (/\.m3u8(?:$|[?#])/i.test(sourceUrl) && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: live, capLevelToPlayerSize: true });
        hlsRef.current = hls;
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
          if (cancelled) return;
          setLevels(data.levels.map((level) => ({ height: level.height || 0, bitrate: level.bitrate || 0 })).sort((a, b) => b.height - a.height));
          setLoading(false);
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || cancelled) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else { setError('تعذر استعادة البث.'); setLoading(false); }
        });
        hls.loadSource(sourceUrl);
      } else if (isVideoUrl(sourceUrl) || /^(blob:|https?:)/i.test(sourceUrl)) {
        video.src = sourceUrl;
        video.onloadedmetadata = () => { if (!cancelled) { setDuration(Number.isFinite(video.duration) ? video.duration : 0); setLoading(false); video.play().catch(() => {}); } };
        video.load();
      } else {
        // Non-media page URLs retain the embed experience supported by the legacy player.
        setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; hlsRef.current?.destroy(); hlsRef.current = null; };
  }, [currentUrl, live]);

  useEffect(() => {
    if (!channels.length) return;
    setLoadedChannels(channels);
  }, [channels]);

  useEffect(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (controlsVisible && playing && !locked) {
      hideTimer.current = setTimeout(() => {
        setControlsVisible(false);
        setQualityOpen(false);
        setFitOpen(false);
        void hideBars();
      }, 4000);
    }
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [controlsVisible, playing, locked, hideBars]);

  const toggleControls = useCallback(() => {
    if (locked) { setUnlockHint(true); setTimeout(() => setUnlockHint(false), 1800); return; }
    const show = !controlsVisible;
    setControlsVisible(show);
    setQualityOpen(false);
    setFitOpen(false);
    if (show) void showBars();
    else void hideBars();
  }, [controlsVisible, hideBars, locked, showBars]);

  const seek = useCallback((amount: number) => {
    const video = videoRef.current;
    if (!video || live) return;
    video.currentTime = Math.max(0, Math.min(video.currentTime + amount, video.duration || 0));
    setSeekFeedback(amount < 0 ? '-10 ثوانٍ' : '+10 ثوانٍ');
    setTimeout(() => setSeekFeedback(''), 900);
  }, [live]);

  const onStageTouchEnd = (event: any) => {
    if (locked) { setUnlockHint(true); setTimeout(() => setUnlockHint(false), 1800); return; }
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      const width = (stageRef.current as any)?.getBoundingClientRect?.().width || 0;
      const x = event.nativeEvent?.pageX ?? event.nativeEvent?.locationX ?? 0;
      if (width && x < width / 3) seek(-10);
      else if (width && x > width * 2 / 3) seek(10);
      lastTapRef.current = 0;
    } else lastTapRef.current = now;
  };

  const setQuality = (index: number) => {
    if (hlsRef.current) hlsRef.current.currentLevel = index;
    setSelectedLevel(index);
    setQualityOpen(false);
  };

  const customQualities = qualities.map((quality) => typeof quality === 'string' ? { label: quality } : quality);
  const qualityOptions = useMemo(() => {
    const auto: PlayerQuality[] = [{ label: 'Auto' }];
    const parsed: PlayerQuality[] = levels.filter((level) => [1080, 720, 480, 360].includes(level.height)).map((level) => ({ label: `${level.height}p`, height: level.height, bitrate: level.bitrate }));
    const combined = [...auto, ...(customQualities.length ? customQualities : parsed)];
    return combined.filter((item, index) => combined.findIndex((other) => other.label === item.label) === index);
  }, [customQualities, levels]);
  const progress = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
  const bufferedProgress = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;
  const fitLabel = fitOptions.find((option) => option.mode === fit)?.label || 'ملاءمة';
  const customCurrent = customQualities.find((quality) => quality.label === qualityOptions[selectedLevel + 1]?.label);
  const embedUrl = !isVideoUrl(currentUrl) && !currentUrl.trim().startsWith('#EXTM3U') && !isPlaylistUrl(currentUrl) ? currentUrl : '';

  return (
    <View ref={stageRef as any} style={styles.overlay} onTouchEnd={onStageTouchEnd}>
      {embedUrl ? <iframe src={embedUrl} title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen style={{ width: '100%', height: '100%', border: 0, background: '#000' }} /> : <video ref={videoRef as any} style={[styles.video as any, { objectFit: fit === 'zoom' ? 'cover' : fit, transform: fit === 'zoom' ? [{ scale: 1.15 }] : undefined }]} playsInline />}
      {!loading && !error && !embedUrl && !locked && <Pressable style={styles.tapLayer} onPress={toggleControls} accessibilityLabel="Toggle player controls" />}
      {loading && <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /><Text style={styles.message}>جارٍ التحميل…</Text></View>}
      {!!error && <View style={styles.center}><Text style={styles.error}>{error}</Text><Pressable style={styles.actionButton} onPress={() => { setError(''); setLoading(true); setActiveChannel(null); }}><Text style={styles.actionText}>إعادة المحاولة</Text></Pressable></View>}

      {seekFeedback ? <View pointerEvents="none" style={styles.seekFeedback}><Text style={styles.seekFeedbackText}>{seekFeedback}</Text></View> : null}
      {fitBadge ? <View pointerEvents="none" style={styles.fitBadge}><Text style={styles.actionText}>{fitBadge}</Text></View> : null}
      {locked ? <View style={styles.lockOverlay} pointerEvents="box-none">
        <Pressable style={styles.unlockButton} onPress={() => { setLocked(false); setControlsVisible(true); setUnlockHint(false); void showBars(); }}><Unlock color="#fff" size={20} /><Text style={styles.actionText}>اضغط لفتح القفل</Text></Pressable>
        {unlockHint ? <Text style={styles.unlockHint}>اضغط لفتح القفل</Text> : null}
      </View> : null}

      {controlsVisible && !loading && !error && !locked && <>
        <View style={styles.topBar}>
          <Pressable style={styles.iconButton} onPress={closePlayer} accessibilityLabel="إغلاق المشغل"><X color="#fff" size={23} /></Pressable>
          <View style={styles.titleArea}><Text numberOfLines={1} style={styles.title}>{activeChannel?.name || title}</Text>{subtitle ? <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text> : null}</View>
          <Pressable style={styles.iconButton} onPress={() => { setLocked(true); setControlsVisible(false); setQualityOpen(false); setFitOpen(false); void hideBars(); }} accessibilityLabel="قفل الشاشة"><Lock color="#fff" size={19} /></Pressable>
          <Pressable style={styles.iconButton} onPress={() => setMuted((value) => { const next = !value; if (videoRef.current) videoRef.current.muted = next; return next; })}>{muted ? <VolumeX color="#fff" size={19} /> : <Volume2 color="#fff" size={19} />}</Pressable>
          {loadedChannels.length > 0 ? <Pressable style={styles.pillButton} onPress={() => { setDrawerOpen(true); setQualityOpen(false); setFitOpen(false); void showBars(); }}><Tv size={16} color="#fff" /><Text style={styles.actionText}>القنوات</Text></Pressable> : null}
        </View>
        {!embedUrl && <View style={styles.centerControls}>
          {!live && <Pressable style={styles.seekButton} onPress={() => seek(-10)}><RotateCcw size={23} color="#fff" /><Text style={styles.seekLabel}>-10s</Text></Pressable>}
          <Pressable style={styles.playButton} onPress={() => { const video = videoRef.current; if (!video) return; if (video.paused) video.play().catch(() => {}); else video.pause(); }}>{playing ? <Pause size={32} color="#fff" fill="#fff" /> : <Play size={32} color="#fff" fill="#fff" />}</Pressable>
          {!live && <Pressable style={styles.seekButton} onPress={() => seek(10)}><RotateCw size={23} color="#fff" /><Text style={styles.seekLabel}>+10s</Text></Pressable>}
        </View>}
        {!live && !embedUrl && <View style={styles.bottomBar}>
          <Pressable style={styles.progressTrack} onPress={(event: any) => {
            const video = videoRef.current;
            const rect = event.currentTarget?.getBoundingClientRect?.();
            const location = event.nativeEvent?.locationX ?? event.nativeEvent?.offsetX ?? 0;
            if (video && rect?.width && duration) video.currentTime = Math.max(0, Math.min(1, location / rect.width)) * duration;
          }}><View style={[styles.bufferedTrack, { width: `${bufferedProgress}%` }]} /><View style={[styles.playedTrack, { width: `${progress}%` }]} /></Pressable>
          <View style={styles.bottomControls}><Text style={styles.timeText}>{formatTime(time)} / {formatTime(duration)}</Text><View style={styles.spacer} />
            <Pressable style={styles.pillButton} onPress={() => { setFitOpen((value) => !value); setQualityOpen(false); }}><Text style={styles.actionText}>{fitLabel}</Text></Pressable>
            {!!qualityOptions.length && <Pressable style={styles.pillButton} onPress={() => { setQualityOpen((value) => !value); setFitOpen(false); }}><Settings size={16} color="#fff" /><Text style={styles.actionText}>{selectedLevel < 0 ? 'Auto' : qualityOptions[selectedLevel + 1]?.label}</Text></Pressable>}
            <Pressable style={styles.iconButton} onPress={() => { if (typeof document !== 'undefined' && document.fullscreenElement) void showBars(); else void hideBars(); }}>{fullscreen ? <Minimize size={19} color="#fff" /> : <Maximize size={19} color="#fff" />}</Pressable>
          </View>
        </View>}
        {qualityOpen && <View style={styles.menu}>{qualityOptions.map((option, index) => <Pressable key={option.label} style={styles.menuItem} onPress={() => {
          if (option.url) { setActiveChannel(null); if (videoRef.current) { videoRef.current.src = option.url; videoRef.current.play().catch(() => {}); } }
          else if (customQualities.length && option.label !== 'Auto') {
            const q = customQualities.find((item) => item.label === option.label);
            if (q?.url && videoRef.current) { videoRef.current.src = q.url; videoRef.current.play().catch(() => {}); }
            else setQuality(index === 0 ? -1 : levels.findIndex((level) => level.height === q?.height));
          } else setQuality(index === 0 ? -1 : levels.findIndex((level) => level.height === option.height));
          setQualityOpen(false);
        }}><Text style={styles.actionText}>{option.label}</Text></Pressable>)}</View>}
        {fitOpen && <View style={[styles.menu, styles.fitMenu]}>{fitOptions.map((option) => <Pressable key={option.mode} style={styles.menuItem} onPress={() => { setFit(option.mode); setFitBadge(option.label); setFitOpen(false); setTimeout(() => setFitBadge(''), 1600); }}><Text style={styles.actionText}>{option.label}</Text></Pressable>)}</View>}
      </>}

      {drawerOpen && <View style={styles.drawerBackdrop}>
        <Pressable style={styles.drawerScrim} onPress={() => setDrawerOpen(false)} />
        <View style={styles.drawer}>
          <View style={styles.drawerHeader}><Text style={styles.drawerTitle}>القنوات</Text><Pressable style={styles.iconButton} onPress={() => setDrawerOpen(false)}><X size={20} color="#fff" /></Pressable></View>
          <TextInput value={channelSearch} onChangeText={setChannelSearch} placeholder="ابحث عن قناة…" placeholderTextColor="#999" style={styles.searchInput} />
          <ScrollView keyboardShouldPersistTaps="handled">{visibleChannels.map((channel) => <Pressable key={channel.id} style={styles.channelRow} onPress={() => { setActiveChannel(channel); setDrawerOpen(false); setControlsVisible(true); }}>
            {channel.logo ? <Image source={{ uri: channel.logo }} style={styles.logo} /> : <Tv size={24} color="#aaa" />}
            <View style={{ flex: 1 }}><Text style={styles.channelName}>{channel.name}</Text>{channel.group ? <Text style={styles.subtitle}>{channel.group}</Text> : null}</View>
            {activeChannel?.id === channel.id ? <Text style={styles.liveTag}>LIVE</Text> : null}
          </Pressable>)}</ScrollView>
        </View>
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 9999, backgroundColor: '#000', overflow: 'hidden' },
  video: { width: '100%', height: '100%', backgroundColor: '#000' },
  tapLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'transparent' },
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.65)', gap: Spacing.md, padding: Spacing.xl },
  message: { color: '#fff', fontSize: FontSize.md }, error: { color: '#fff', fontSize: FontSize.md, textAlign: 'center' },
  actionButton: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  actionText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '700' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, backgroundColor: 'rgba(0,0,0,0.55)' },
  titleArea: { flex: 1 }, title: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' }, subtitle: { color: '#bbb', fontSize: FontSize.xs },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  pillButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 8, borderRadius: Radius.sm, backgroundColor: 'rgba(255,255,255,0.16)' },
  centerControls: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  playButton: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  seekButton: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' }, seekLabel: { color: '#fff', fontSize: 10, fontWeight: '800' },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.lg, backgroundColor: 'rgba(0,0,0,0.68)' },
  progressTrack: { height: 6, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden', marginBottom: Spacing.sm },
  bufferedTrack: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: 'rgba(255,255,255,0.45)' }, playedTrack: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: Colors.primary },
  bottomControls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }, timeText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '600' }, spacer: { flex: 1 },
  menu: { position: 'absolute', right: Spacing.lg, bottom: 78, minWidth: 120, maxHeight: 240, padding: 6, borderRadius: Radius.md, backgroundColor: '#171717' }, fitMenu: { right: 150 }, menuItem: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  lockOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }, unlockButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.lg, backgroundColor: 'rgba(0,0,0,0.78)' }, unlockHint: { position: 'absolute', bottom: 36, color: '#fff', backgroundColor: '#222', padding: 10, borderRadius: 8 },
  seekFeedback: { position: 'absolute', top: '45%', alignSelf: 'center', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.68)' }, seekFeedbackText: { color: '#fff', fontSize: FontSize.lg, fontWeight: '800' }, fitBadge: { position: 'absolute', top: 60, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  drawerBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.45)' }, drawerScrim: { flex: 1 }, drawer: { width: 'min(360px, 85%)', maxWidth: 360, backgroundColor: '#111', padding: Spacing.md, paddingTop: Spacing.xl }, drawerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md }, drawerTitle: { color: '#fff', fontSize: FontSize.xl, fontWeight: '800' }, searchInput: { height: 42, borderRadius: Radius.md, backgroundColor: '#242424', color: '#fff', paddingHorizontal: Spacing.md, marginBottom: Spacing.sm }, channelRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#333' }, logo: { width: 40, height: 40, resizeMode: 'contain' }, channelName: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' }, liveTag: { color: '#fff', backgroundColor: '#d22', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4, fontSize: 10, fontWeight: '800' },
});

export default EnjoyPlayer;
