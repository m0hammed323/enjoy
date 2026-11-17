import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Lock,
  Unlock,
  Maximize,
  Settings,
  ArrowRight,
  Volume2,
  VolumeX,
  Tv,
  Search,
  Check,
  AlertCircle,
  RefreshCw,
  SkipBack,
  SkipForward,
  Sun,
  Star,
  Shield,
  ShieldOff,
  PictureInPicture2,
} from 'lucide-react-native';
import { getCapacitorPlugin, registerBackInterceptor } from '@/utils/backNavigation';

const PRESTIGE_GOLD = '#FFC72C';
const PRESTIGE_GOLD_DARK = '#E6A800';
const OBSIDIAN_SHEET = '#07080C';
const OBSIDIAN_SETTINGS = '#0A0C12';
const OBSIDIAN_CHIP = '#161A28';
const LIVE_RED = '#E50914';
const PITCH_GREEN = '#00E676';
const ELECTRIC_EMERALD = '#10B981';
const DARK_INK = '#08090D';

const FAV_CATEGORY = 'المفضلة';
const ALL_CATEGORY = 'الكل';
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SLEEP_OPTIONS = [0, 15, 30, 60];
const EMBED_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-forms';

export interface VideoQualityOption {
  label: string;
  url: string;
  levelIndex?: number;
}

export interface M3UChannel {
  id: string;
  name: string;
  url: string;
  group?: string;
  logo?: string;
}

export interface SubtitleTrack {
  label: string;
  url: string;
  lang?: string;
}

export interface EnjoyPlayerProps {
  title?: string;
  subtitle?: string;
  url?: string;
  src?: string;
  embedCode?: string;
  qualities?: VideoQualityOption[];
  channels?: M3UChannel[];
  subtitles?: SubtitleTrack[];
  forceLandscape?: boolean;
  onClose?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
}

// ثوابت ثابتة الهوية لتجنب إعادة تشغيل الـ effects مع كل render
const EMPTY_QUALITIES: VideoQualityOption[] = [];
const EMPTY_CHANNELS: M3UChannel[] = [];
const EMPTY_SUBTITLES: SubtitleTrack[] = [];

type ResizeModeKey = 'FIT' | 'FILL' | 'ZOOM' | '16:9';

const RESIZE_MODES: {
  key: ResizeModeKey;
  label: string;
  objectFit: 'contain' | 'cover' | 'fill';
  scale: number;
}[] = [
  { key: 'FIT', label: 'ملاءمة (Fit)', objectFit: 'contain', scale: 1 },
  { key: 'FILL', label: 'ملء الشاشة (Fill)', objectFit: 'fill', scale: 1 },
  { key: 'ZOOM', label: 'تكبير (Zoom)', objectFit: 'cover', scale: 1.16 },
  { key: '16:9', label: 'عريض (16:9)', objectFit: 'cover', scale: 1 },
];

function readStore(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeStore(key: string, value: string) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {}
}

export function parseM3UPlaylist(rawText: string): M3UChannel[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed: M3UChannel[] = [];
  let pendingName = '';
  let pendingGroup = 'قنوات عامة';
  let pendingLogo = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXTINF:')) {
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const commaIdx = line.lastIndexOf(',');
      pendingGroup = groupMatch?.[1]?.trim() || 'قنوات عامة';
      pendingLogo = logoMatch?.[1]?.trim() || '';
      pendingName =
        commaIdx !== -1 ? line.slice(commaIdx + 1).trim() : `قناة ${parsed.length + 1}`;
    } else if (!line.startsWith('#') && /^https?:\/\//i.test(line)) {
      parsed.push({
        id: `ch_${parsed.length}${Math.random().toString(36).slice(2, 7)}`,
        name: pendingName || `قناة ${parsed.length + 1}`,
        url: line,
        group: pendingGroup,
        logo: pendingLogo,
      });
      pendingName = '';
    }
  }
  return parsed;
}

function extractStreamSource(rawInput: string): {
  streamUrl: string;
  isM3uList: boolean;
  isEmbed: boolean;
} {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return { streamUrl: '', isM3uList: false, isEmbed: false };

  let extracted = trimmed;
  let isEmbed = false;

  if (trimmed.startsWith('<')) {
    const directMatch = trimmed.match(
      /https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4|m3u|ts|webm|mkv)(?:\?[^"'\s<>]*)?/i
    );
    if (directMatch?.[0]) {
      extracted = directMatch[0].trim();
    } else {
      const srcMatch = trimmed.match(/src=["']([^"']+)["']/i);
      if (srcMatch?.[1]) {
        extracted = srcMatch[1].trim();
        if (extracted.startsWith('//')) extracted = `https:${extracted}`;
        isEmbed = true;
      }
    }
  }

  const lower = extracted.toLowerCase();
  const isM3uList =
    !isEmbed &&
    (extracted.startsWith('#EXTM3U') ||
      ((lower.includes('.m3u') || lower.includes('type=m3u') || lower.includes('output=m3u')) &&
        !lower.includes('.m3u8')));

  return { streamUrl: extracted, isM3uList, isEmbed };
}

function formatMediaDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '00:00';
  const total = Math.floor(sec);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

function ensureHlsLibrary(): Promise<any> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if ((window as any).Hls) return Promise.resolve((window as any).Hls);

  return new Promise((resolve) => {
    const existing = document.getElementById('enjoy-hls-cdn');
    if (existing) {
      existing.addEventListener('load', () => resolve((window as any).Hls || null));
      existing.addEventListener('error', () => resolve(null));
      return;
    }
    const script = document.createElement('script');
    script.id = 'enjoy-hls-cdn';
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
    script.async = true;
    script.onload = () => resolve((window as any).Hls || null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

function SettingChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.compactQualityChip,
        selected ? styles.compactQualityChipSelected : styles.compactQualityChipUnselected,
      ]}
      onPress={onPress}
    >
      {selected ? <Check size={15} color={DARK_INK} /> : null}
      <Text
        style={[styles.compactQualityText, selected && { color: DARK_INK, fontWeight: '900' }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function EnjoyPlayer({
  title = 'Enjoy Video',
  subtitle,
  url,
  src,
  embedCode,
  qualities = EMPTY_QUALITIES,
  channels = EMPTY_CHANNELS,
  subtitles = EMPTY_SUBTITLES,
  forceLandscape = true,
  onClose,
  onNext,
  onPrevious,
}: EnjoyPlayerProps) {
  const rawInput = url || src || embedCode || '';
  const initialSource = useMemo(() => extractStreamSource(rawInput), [rawInput]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const [activeUrl, setActiveUrl] = useState<string>(
    initialSource.isEmbed ? '' : initialSource.streamUrl
  );
  const [embedUrl, setEmbedUrl] = useState<string | null>(
    initialSource.isEmbed ? initialSource.streamUrl : null
  );
  const [embedStrict, setEmbedStrict] = useState(true);
  const [activeTitle, setActiveTitle] = useState<string>(title);
  const [activeGroup, setActiveGroup] = useState<string>(subtitle || '');
  const [reconnectTick, setReconnectTick] = useState(0);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [isLiveStream, setIsLiveStream] = useState(false);

  const [volumeLevel, setVolumeLevel] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [brightnessLevel, setBrightnessLevel] = useState(1);
  const [gestureVolumeHud, setGestureVolumeHud] = useState<number | null>(null);
  const [gestureBrightnessHud, setGestureBrightnessHud] = useState<number | null>(null);

  // تبدأ الشاشة نظيفة تماماً: لمسة واحدة تُظهر/تُخفي كل شيء
  const [isControlsVisible, setIsControlsVisible] = useState(false);
  const [isScreenLocked, setIsScreenLocked] = useState(false);
  const [isUnlockPillVisible, setIsUnlockPillVisible] = useState(true);
  const [resizeIndex, setResizeIndex] = useState(0);
  const [resizeToast, setResizeToast] = useState<string | null>(null);
  const [seekFeedbackText, setSeekFeedbackText] = useState<string | null>(null);

  const [availableQualities, setAvailableQualities] = useState<VideoQualityOption[]>(qualities);
  const [selectedQualityIdx, setSelectedQualityIdx] = useState<number>(0);
  const [showQualitySheet, setShowQualitySheet] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [subtitleIdx, setSubtitleIdx] = useState(-1);
  const [sleepMinutes, setSleepMinutes] = useState(0);

  const [m3uChannels, setM3uChannels] = useState<M3UChannel[]>(channels);
  const [showQuickChannelSheet, setShowQuickChannelSheet] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>(ALL_CATEGORY);
  const [sheetSearch, setSheetSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const raw = readStore('enjoy_favorites');
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  });

  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureHudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTime = useRef(0);
  const lastTapX = useRef(0);
  const lastSaveRef = useRef(0);
  const errorRetryRef = useRef(0);
  const exitRef = useRef<() => void>(() => {});
  const touchDragRef = useRef<{
    startX: number;
    startY: number;
    startVal: number;
    side: 'left' | 'right' | null;
    moved: boolean;
  } | null>(null);

  const hideAllSystemBars = useCallback(async () => {
    try {
      const capStatusBar = getCapacitorPlugin('StatusBar');
      if (capStatusBar?.setOverlaysWebView) {
        await capStatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
      }
      if (capStatusBar?.hide) {
        await capStatusBar.hide().catch(() => {});
      }
      const capNavBar =
        getCapacitorPlugin('NavigationBar') || getCapacitorPlugin('AndroidFullScreen');
      if (capNavBar?.hide) {
        await capNavBar.hide().catch(() => {});
      }
      if (capNavBar?.immersiveMode) {
        await capNavBar.immersiveMode().catch(() => {});
      }
      if (typeof document !== 'undefined' && !document.fullscreenElement) {
        document.documentElement
          .requestFullscreen?.({ navigationUI: 'hide' } as any)
          .catch(() => {});
      }
    } catch {}
  }, []);

  const showAllSystemBars = useCallback(async () => {
    try {
      const capStatusBar = getCapacitorPlugin('StatusBar');
      if (capStatusBar?.show) {
        await capStatusBar.show().catch(() => {});
      }
      const capNavBar =
        getCapacitorPlugin('NavigationBar') || getCapacitorPlugin('AndroidFullScreen');
      if (capNavBar?.show) {
        await capNavBar.show().catch(() => {});
      }
    } catch {}
  }, []);

  // شريط الهاتف يتبع الواجهة: أزرار ظاهرة = شريط ظاهر، أزرار مخفية = شاشة كاملة نظيفة
  useEffect(() => {
    const shouldShow = isControlsVisible && !isScreenLocked;
    if (shouldShow) {
      (async () => {
        await showAllSystemBars();
        try {
          if (typeof document !== 'undefined' && document.fullscreenElement) {
            await document.exitFullscreen?.().catch(() => {});
          }
        } catch {}
      })();
    } else {
      hideAllSystemBars();
    }
  }, [isControlsVisible, isScreenLocked, hideAllSystemBars, showAllSystemBars]);

  const lockLandscape = useCallback(async () => {
    if (!forceLandscape) return;
    try {
      const capOrientation = getCapacitorPlugin('ScreenOrientation');
      if (capOrientation?.lock) {
        await capOrientation.lock({ orientation: 'landscape' });
      } else if (typeof screen !== 'undefined' && (screen as any).orientation?.lock) {
        await (screen as any).orientation.lock('landscape').catch(() => {});
      }
    } catch {}
  }, [forceLandscape]);

  const restoreOrientationAndBars = useCallback(async () => {
    try {
      if (typeof document !== 'undefined' && document.fullscreenElement) {
        await document.exitFullscreen?.().catch(() => {});
      }
      await showAllSystemBars();
      const capOrientation = getCapacitorPlugin('ScreenOrientation');
      if (capOrientation?.unlock) {
        await capOrientation.unlock();
      } else if (typeof screen !== 'undefined' && (screen as any).orientation?.unlock) {
        (screen as any).orientation.unlock();
      }
    } catch {}
  }, [showAllSystemBars]);

  useEffect(() => {
    lockLandscape();
    hideAllSystemBars();

    const hiddenNodes: { el: HTMLElement; prevDisplay: string }[] = [];
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const rootNode = document.getElementById('enjoy-player-root');
      document.querySelectorAll('iframe, video, embed, object').forEach((node) => {
        if (rootNode && rootNode.contains(node)) return;
        const htmlEl = node as HTMLElement;
        if (node.tagName === 'VIDEO') {
          try {
            (node as HTMLVideoElement).pause();
            (node as HTMLVideoElement).src = '';
          } catch {}
        }
        hiddenNodes.push({ el: htmlEl, prevDisplay: htmlEl.style.display });
        htmlEl.style.display = 'none';
      });
    }

    return () => {
      hiddenNodes.forEach(({ el, prevDisplay }) => {
        el.style.display = prevDisplay;
      });
      restoreOrientationAndBars();
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
      if (resizeToastTimer.current) clearTimeout(resizeToastTimer.current);
      if (seekFeedbackTimer.current) clearTimeout(seekFeedbackTimer.current);
      if (gestureHudTimer.current) clearTimeout(gestureHudTimer.current);
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    };
  }, [lockLandscape, hideAllSystemBars, restoreOrientationAndBars]);

  const handleExitPlayer = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      } catch {}
    }
    restoreOrientationAndBars();
    if (onClose) onClose();
  }, [onClose, restoreOrientationAndBars]);

  exitRef.current = handleExitPlayer;

  useEffect(() => {
    return registerBackInterceptor(() => {
      if (isScreenLocked) {
        setIsScreenLocked(false);
        setIsControlsVisible(true);
        return true;
      }
      if (showQualitySheet) {
        setShowQualitySheet(false);
        return true;
      }
      if (showQuickChannelSheet) {
        setShowQuickChannelSheet(false);
        return true;
      }
      handleExitPlayer();
      return true;
    });
  }, [isScreenLocked, showQualitySheet, showQuickChannelSheet, handleExitPlayer]);

  // تشغيل عنصر مباشر (قناة / فيديو) وإلغاء وضع التضمين
  const playDirect = useCallback((nextUrl: string, nextTitle: string, group?: string) => {
    setEmbedUrl(null);
    setActiveUrl(nextUrl);
    setActiveTitle(nextTitle);
    setActiveGroup(group || 'فيديو');
    errorRetryRef.current = 0;
  }, []);

  useEffect(() => {
    const nextRaw = url || src || embedCode || '';
    const parsed = extractStreamSource(nextRaw);
    setActiveTitle(title);
    setActiveGroup(subtitle || '');

    if (parsed.isEmbed) {
      setEmbedUrl(parsed.streamUrl);
      setActiveUrl('');
      setIsBuffering(true);
      setErrorMsg(null);
      if (channels.length > 0) setM3uChannels(channels);
      return;
    }

    if (parsed.isM3uList) {
      let cancelled = false;
      (async () => {
        try {
          setIsBuffering(true);
          setErrorMsg(null);
          const rawText = parsed.streamUrl.startsWith('#EXTM3U')
            ? parsed.streamUrl
            : await (await fetch(parsed.streamUrl)).text();
          const list = parseM3UPlaylist(rawText);
          if (!cancelled && list.length > 0) {
            setM3uChannels(list);
            setEmbedUrl(null);
            setActiveUrl(list[0].url);
            setActiveTitle(list[0].name);
            setActiveGroup(list[0].group || 'فيديو');
          } else if (!cancelled) {
            setErrorMsg('تعذر العثور على روابط تشغيل صالحة');
            setIsBuffering(false);
          }
        } catch {
          if (!cancelled) {
            setErrorMsg('تعذر تحميل قائمة التشغيل');
            setIsBuffering(false);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    } else {
      setEmbedUrl(null);
      setActiveUrl(parsed.streamUrl);
      if (channels.length > 0) setM3uChannels(channels);
    }
  }, [url, src, embedCode, title, subtitle, channels]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !videoRef.current || !activeUrl) return;
    const video = videoRef.current;
    let destroyed = false;
    let fellBackToNative = false;

    setIsBuffering(true);
    setErrorMsg(null);
    setCurrentTime(0);
    setDuration(0);
    setIsLiveStream(false);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const attemptAutoPlay = () => {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            if (!destroyed) {
              setIsPlaying(true);
              setIsBuffering(false);
            }
          })
          .catch(() => {
            video.muted = true;
            setIsMuted(true);
            video
              .play()
              .then(() => {
                if (!destroyed) {
                  setIsPlaying(true);
                  setIsBuffering(false);
                }
              })
              .catch(() => {
                if (!destroyed) {
                  setIsPlaying(false);
                  setIsBuffering(false);
                }
              });
          });
      }
    };

    const loadDirectVideo = () => {
      if (fellBackToNative || destroyed) return;
      fellBackToNative = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.src = activeUrl;
      video.load();
      setIsLiveStream(false);
      if (qualities.length > 0) setAvailableQualities(qualities);
      attemptAutoPlay();
    };

    const lower = activeUrl.toLowerCase();
    const isHlsManifest = lower.includes('.m3u8') || lower.includes('m3u8');

    if (!isHlsManifest) {
      setAvailableQualities(qualities);
      loadDirectVideo();
    } else {
      ensureHlsLibrary().then((Hls) => {
        if (destroyed) return;
        if (Hls && Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 90,
          });
          hlsRef.current = hls;
          hls.loadSource(activeUrl);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, (_: any, data: any) => {
            if (destroyed) return;
            const levels = data?.levels || [];
            if (levels.length > 0) {
              const autoOpt: VideoQualityOption = {
                label: 'تلقائي',
                url: activeUrl,
                levelIndex: -1,
              };
              const levelOpts: VideoQualityOption[] = levels
                .map((lvl: any, idx: number) => ({
                  label: lvl.height ? `${lvl.height}p` : `جودة ${idx + 1}`,
                  url: activeUrl,
                  levelIndex: idx,
                }))
                .reverse();
              setAvailableQualities([autoOpt, ...levelOpts]);
              setSelectedQualityIdx(0);
            }
            attemptAutoPlay();
          });

          hls.on(Hls.Events.LEVEL_LOADED, (_: any, data: any) => {
            if (!destroyed && data?.details) {
              const isEndlessLive =
                Boolean(data.details.live) && !Number.isFinite(data.details.totalduration);
              setIsLiveStream(isEndlessLive);
            }
          });

          hls.on(Hls.Events.ERROR, (_: any, data: any) => {
            if (data?.fatal) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                hls.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                hls.recoverMediaError();
              } else {
                loadDirectVideo();
              }
            }
          });
        } else {
          loadDirectVideo();
        }
      });
    }

    return () => {
      destroyed = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeUrl, reconnectTick, qualities]);

  // سرعة التشغيل
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate, activeUrl]);

  // الترجمة
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const apply = () => {
      for (let i = 0; i < v.textTracks.length; i++) {
        v.textTracks[i].mode = i === subtitleIdx ? 'showing' : 'disabled';
      }
    };
    apply();
    const t = setTimeout(apply, 600);
    return () => clearTimeout(t);
  }, [subtitleIdx, activeUrl]);

  // مؤقت النوم
  useEffect(() => {
    if (!sleepMinutes) return;
    const t = setTimeout(() => {
      setSleepMinutes(0);
      if (videoRef.current) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        exitRef.current();
      }
    }, sleepMinutes * 60000);
    return () => clearTimeout(t);
  }, [sleepMinutes]);

  useEffect(() => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    if (
      isControlsVisible &&
      isPlaying &&
      !isScreenLocked &&
      !showQualitySheet &&
      !showQuickChannelSheet
    ) {
      hideControlsTimer.current = setTimeout(() => {
        setIsControlsVisible(false);
      }, 4000);
    }
    return () => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, [isControlsVisible, isPlaying, isScreenLocked, showQualitySheet, showQuickChannelSheet]);

  const seekBySeconds = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    const maxDur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity;
    const nextTime = Math.max(0, Math.min(maxDur, video.currentTime + delta));
    video.currentTime = nextTime;
    setCurrentTime(nextTime);

    setSeekFeedbackText(delta > 0 ? '+10 ثوانٍ' : '-10 ثوانٍ');
    if (seekFeedbackTimer.current) clearTimeout(seekFeedbackTimer.current);
    seekFeedbackTimer.current = setTimeout(() => setSeekFeedbackText(null), 850);
  }, []);

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const togglePip = useCallback(() => {
    const video = videoRef.current as any;
    if (!video || typeof document === 'undefined') return;
    try {
      if ((document as any).pictureInPictureElement) {
        (document as any).exitPictureInPicture?.().catch(() => {});
      } else {
        video.requestPictureInPicture?.().catch(() => {});
      }
    } catch {}
  }, []);

  const toggleFavorite = useCallback((chUrl: string) => {
    setFavorites((prev) => {
      const next = prev.includes(chUrl) ? prev.filter((u) => u !== chUrl) : [...prev, chUrl];
      writeStore('enjoy_favorites', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleVideoSurfaceTap = useCallback(
    (clientX: number) => {
      lockLandscape();

      if (isScreenLocked) {
        setIsUnlockPillVisible((prev) => !prev);
        return;
      }

      const now = Date.now();
      const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 800;

      if (now - lastTapTime.current < 260 && Math.abs(clientX - lastTapX.current) < 90) {
        if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
        lastTapTime.current = 0;

        if (clientX < screenWidth * 0.4) {
          seekBySeconds(-10);
        } else if (clientX > screenWidth * 0.6) {
          seekBySeconds(10);
        } else {
          togglePlayPause();
        }
        return;
      }

      lastTapTime.current = now;
      lastTapX.current = clientX;

      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      singleTapTimer.current = setTimeout(() => {
        setIsControlsVisible((prev) => !prev);
      }, 220);
    },
    [isScreenLocked, lockLandscape, seekBySeconds, togglePlayPause]
  );

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 800;
    const side =
      touch.clientX < screenWidth * 0.45
        ? 'left'
        : touch.clientX > screenWidth * 0.55
        ? 'right'
        : null;
    touchDragRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startVal: side === 'left' ? brightnessLevel : volumeLevel,
      side,
      moved: false,
    };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const drag = touchDragRef.current;
    const touch = e.touches[0];
    if (!drag || !touch || isScreenLocked) return;

    const dy = drag.startY - touch.clientY;
    if (Math.abs(dy) > 14) {
      drag.moved = true;
      if (!drag.side) return;
      const delta = dy / 240;

      if (drag.side === 'left') {
        const nextBright = Math.max(0.2, Math.min(1, drag.startVal + delta));
        setBrightnessLevel(nextBright);
        setGestureBrightnessHud(nextBright);
        setGestureVolumeHud(null);
      } else {
        const nextVol = Math.max(0, Math.min(1, drag.startVal + delta));
        setVolumeLevel(nextVol);
        setIsMuted(nextVol === 0);
        if (videoRef.current) {
          videoRef.current.muted = nextVol === 0;
          videoRef.current.volume = nextVol;
        }
        setGestureVolumeHud(nextVol);
        setGestureBrightnessHud(null);
      }

      if (gestureHudTimer.current) clearTimeout(gestureHudTimer.current);
      gestureHudTimer.current = setTimeout(() => {
        setGestureVolumeHud(null);
        setGestureBrightnessHud(null);
      }, 900);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const drag = touchDragRef.current;
    touchDragRef.current = null;
    if (drag && !drag.moved) {
      const changed = e.changedTouches[0];
      handleVideoSurfaceTap(changed ? changed.clientX : drag.startX);
    }
  };

  const cycleResizeMode = () => {
    const nextIdx = (resizeIndex + 1) % RESIZE_MODES.length;
    setResizeIndex(nextIdx);
    setResizeToast(RESIZE_MODES[nextIdx].label);
    if (resizeToastTimer.current) clearTimeout(resizeToastTimer.current);
    resizeToastTimer.current = setTimeout(() => setResizeToast(null), 1500);
  };

  const handleSelectQuality = (index: number) => {
    const chosen = availableQualities[index];
    if (!chosen) return;
    setSelectedQualityIdx(index);
    setShowQualitySheet(false);

    if (hlsRef.current && typeof chosen.levelIndex === 'number') {
      hlsRef.current.currentLevel = chosen.levelIndex;
    } else if (chosen.url && chosen.url !== activeUrl && videoRef.current) {
      const savedTime = videoRef.current.currentTime;
      setActiveUrl(chosen.url);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.currentTime = savedTime;
      }, 400);
    }
  };

  const handlePreviousItem = () => {
    if (m3uChannels.length > 1) {
      const idx = m3uChannels.findIndex((c) => c.url === activeUrl);
      const prevIdx = idx <= 0 ? m3uChannels.length - 1 : idx - 1;
      const prevCh = m3uChannels[prevIdx];
      playDirect(prevCh.url, prevCh.name, prevCh.group);
    } else if (onPrevious) {
      onPrevious();
    } else if (videoRef.current) {
      videoRef.current.currentTime = 0;
      setCurrentTime(0);
    }
  };

  const handleNextItem = () => {
    if (m3uChannels.length > 1) {
      const idx = m3uChannels.findIndex((c) => c.url === activeUrl);
      const nextIdx = idx === -1 || idx >= m3uChannels.length - 1 ? 0 : idx + 1;
      const nextCh = m3uChannels[nextIdx];
      playDirect(nextCh.url, nextCh.name, nextCh.group);
    } else if (onNext) {
      onNext();
    } else {
      seekBySeconds(10);
    }
  };

  const seekAtClientX = (clientX: number) => {
    const video = videoRef.current;
    const bar = progressBarRef.current;
    if (!video || !bar) return;
    const effectiveDuration =
      Number.isFinite(video.duration) && video.duration > 0 ? video.duration : duration;
    if (!effectiveDuration || effectiveDuration <= 0) return;

    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const targetTime = ratio * effectiveDuration;
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const showVodScrubber = !isLiveStream;
  const currentResize = RESIZE_MODES[resizeIndex];
  const currentQualityLabel = availableQualities[selectedQualityIdx]?.label || 'تلقائي';
  const isEmbedMode = embedUrl !== null;

  const progressFraction =
    duration > 0 && Number.isFinite(duration) ? Math.min(1, currentTime / duration) : 0;
  const bufferFraction =
    duration > 0 && Number.isFinite(duration)
      ? Math.min(1, Math.max(progressFraction, bufferedEnd / duration))
      : 0;

  const dynamicCategories = useMemo(() => {
    const groups = new Set<string>();
    m3uChannels.forEach((ch) => {
      if (ch.group && ch.group.trim()) groups.add(ch.group.trim());
    });
    return [ALL_CATEGORY, ...(favorites.length > 0 ? [FAV_CATEGORY] : []), ...Array.from(groups)];
  }, [m3uChannels, favorites]);

  const filteredSheetChannels = useMemo(() => {
    let list = m3uChannels;
    if (selectedCategoryFilter === FAV_CATEGORY) {
      list = list.filter((ch) => favorites.includes(ch.url));
    } else if (selectedCategoryFilter !== ALL_CATEGORY) {
      list = list.filter((ch) => (ch.group || '').trim() === selectedCategoryFilter);
    }
    if (sheetSearch.trim()) {
      const q = sheetSearch.trim().toLowerCase();
      list = list.filter(
        (ch) =>
          ch.name.toLowerCase().includes(q) || (ch.group || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [m3uChannels, selectedCategoryFilter, sheetSearch, favorites]);

  return (
    <View nativeID="enjoy-player-root" style={styles.rootContainer}>
      <StatusBar hidden style="light" />

      {Platform.OS === 'web' && isEmbedMode && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            backgroundColor: '#000000',
          }}
        >
          <iframe
            key={`${embedUrl}_${embedStrict}_${reconnectTick}`}
            src={embedUrl as string}
            title="embedded-player"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            {...(embedStrict ? { sandbox: EMBED_SANDBOX } : {})}
            onLoad={() => setIsBuffering(false)}
            style={{
              width: '100%',
              height: '100%',
              border: 0,
              backgroundColor: '#000000',
              filter: `brightness(${brightnessLevel})`,
            }}
          />
        </div>
      )}

      {Platform.OS === 'web' && !isEmbedMode && (
        <div
          onClick={(e) => {
            if ((e.target as HTMLElement)?.closest('[data-player-control="true"]')) return;
            handleVideoSurfaceTap(e.clientX);
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            backgroundColor: '#000000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <video
            ref={videoRef}
            playsInline
            autoPlay
            preload="auto"
            muted={isMuted}
            {...(subtitles.length > 0 ? { crossOrigin: 'anonymous' as const } : {})}
            onLoadStart={() => setIsBuffering(true)}
            onCanPlay={() => setIsBuffering(false)}
            onWaiting={() => setIsBuffering(true)}
            onPlaying={() => {
              errorRetryRef.current = 0;
              setIsBuffering(false);
              setIsPlaying(true);
              setErrorMsg(null);
            }}
            onPause={() => setIsPlaying(false)}
            onEnded={() => writeStore(`enjoy_pos_${activeUrl}`, '0')}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              setCurrentTime(v.currentTime);
              if (Number.isFinite(v.duration) && v.duration > 0 && v.duration !== duration) {
                setDuration(v.duration);
              }
              if (v.buffered.length > 0) {
                setBufferedEnd(v.buffered.end(v.buffered.length - 1));
              }
              const now = Date.now();
              if (
                now - lastSaveRef.current > 5000 &&
                Number.isFinite(v.duration) &&
                v.duration > 60
              ) {
                lastSaveRef.current = now;
                writeStore(`enjoy_pos_${activeUrl}`, String(v.currentTime));
              }
            }}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              const d = v.duration;
              if (Number.isFinite(d) && d > 0) {
                setDuration(d);
                setIsLiveStream(false);
                const saved = parseFloat(readStore(`enjoy_pos_${activeUrl}`) || '0');
                if (saved > 5 && saved < d - 10) v.currentTime = saved;
              }
              v.playbackRate = playbackRate;
              setIsBuffering(false);
            }}
            onDurationChange={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) {
                setDuration(d);
                setIsLiveStream(false);
              }
            }}
            onError={() => {
              if (errorRetryRef.current < 2) {
                errorRetryRef.current += 1;
                setIsBuffering(true);
                setTimeout(() => setReconnectTick((n) => n + 1), 1500);
                return;
              }
              setIsBuffering(false);
              setErrorMsg('تعذر تشغيل الفيديو — تأكد من صحة الرابط أو أعد المحاولة');
            }}
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: '#000000',
              objectFit: currentResize.objectFit,
              transform: currentResize.scale > 1 ? `scale(${currentResize.scale})` : 'none',
              filter: `brightness(${brightnessLevel})`,
              transition: 'transform 0.22s ease',
              pointerEvents: 'none',
            }}
          >
            {subtitles.map((s, i) => (
              <track
                key={`${s.url}_${i}`}
                kind="subtitles"
                src={s.url}
                label={s.label}
                srcLang={s.lang || 'ar'}
              />
            ))}
          </video>
        </div>
      )}

      {isEmbedMode && !isControlsVisible && (
        <Pressable
          style={styles.embedHotspot}
          onPress={() => setIsControlsVisible(true)}
        />
      )}

      {gestureVolumeHud !== null && (
        <View pointerEvents="none" style={styles.volumeHudBox}>
          {gestureVolumeHud === 0 ? (
            <VolumeX size={28} color={LIVE_RED} />
          ) : (
            <Volume2 size={28} color={PITCH_GREEN} />
          )}
          <Text style={styles.hudPercentText}>{Math.round(gestureVolumeHud * 100)}%</Text>
        </View>
      )}

      {gestureBrightnessHud !== null && (
        <View pointerEvents="none" style={styles.brightnessHudBox}>
          <Sun size={28} color={PRESTIGE_GOLD} />
          <Text style={styles.hudPercentText}>{Math.round(gestureBrightnessHud * 100)}%</Text>
        </View>
      )}

      {seekFeedbackText && (
        <View pointerEvents="none" style={styles.centerOverlay}>
          <View style={styles.seekPill}>
            {seekFeedbackText.includes('+') ? (
              <RotateCw size={26} color={PRESTIGE_GOLD} />
            ) : (
              <RotateCcw size={26} color={PRESTIGE_GOLD} />
            )}
            <Text style={styles.seekPillText}>{seekFeedbackText}</Text>
          </View>
        </View>
      )}

      {resizeToast && (
        <View pointerEvents="none" style={styles.resizeToastWrapper}>
          <View style={styles.resizeToastPill}>
            <Maximize size={16} color={ELECTRIC_EMERALD} />
            <Text style={styles.resizeToastText}>{resizeToast}</Text>
          </View>
        </View>
      )}

      {isBuffering && !errorMsg && (
        <View pointerEvents="none" style={styles.centerOverlay}>
          <ActivityIndicator size="large" color={PRESTIGE_GOLD} />
          <Text style={styles.connectingText}>جاري تحميل الفيديو...</Text>
        </View>
      )}

      {errorMsg && (
        <View style={styles.centerOverlay}>
          <View style={styles.errorCard}>
            <AlertCircle size={42} color={LIVE_RED} />
            <Text style={styles.errorTitle}>{errorMsg}</Text>
            <Pressable
              style={styles.retryBtn}
              onPress={() => {
                errorRetryRef.current = 0;
                setErrorMsg(null);
                setReconnectTick((n) => n + 1);
              }}
            >
              <RefreshCw size={18} color="#00391A" />
              <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
            </Pressable>
            {activeUrl ? (
              <Pressable
                style={styles.embedFallbackBtn}
                onPress={() => {
                  setErrorMsg(null);
                  setEmbedUrl(activeUrl);
                  setActiveUrl('');
                  setIsBuffering(true);
                }}
              >
                <Text style={styles.embedFallbackText}>تشغيل كصفحة تضمين</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      )}

      {isScreenLocked && isUnlockPillVisible && (
        <View style={styles.unlockBottomWrapper}>
          <Pressable
            style={styles.unlockPill}
            onPress={() => {
              setIsScreenLocked(false);
              setIsControlsVisible(true);
            }}
          >
            <Lock size={20} color={PRESTIGE_GOLD} />
            <Text style={styles.unlockPillText}>
              الشاشة مقفلة • اضغط لإلغاء القفل (أو المس الشاشة لإخفاء هذا الزر)
            </Text>
          </Pressable>
        </View>
      )}

      {isControlsVisible && !isScreenLocked && (
        <View
          pointerEvents="box-none"
          style={[
            styles.hudGradientOverlay,
            Platform.OS === 'web'
              ? ({
                  backgroundImage: isEmbedMode
                    ? 'linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 30%)'
                    : 'linear-gradient(180deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0) 65%, rgba(0,0,0,0.95) 100%)',
                } as any)
              : null,
          ]}
        >
          <View pointerEvents="box-none" style={styles.topBar}>
            <Pressable style={styles.topIconBtn} onPress={handleExitPlayer}>
              <ArrowRight size={22} color="#FFF" />
            </Pressable>

            <View pointerEvents="box-none" style={styles.topTitleArea}>
              <Text numberOfLines={1} style={styles.topTitleText}>
                {activeTitle}
              </Text>
              <View style={styles.topBadgesRow}>
                <View
                  style={[
                    styles.typeBadge,
                    {
                      backgroundColor: isEmbedMode
                        ? ELECTRIC_EMERALD
                        : showVodScrubber
                        ? PRESTIGE_GOLD
                        : LIVE_RED,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.typeBadgeText,
                      { color: isEmbedMode || showVodScrubber ? DARK_INK : '#FFF' },
                    ]}
                  >
                    {isEmbedMode ? 'EMBED' : showVodScrubber ? 'VIDEO' : 'LIVE'}
                  </Text>
                </View>

                {!isEmbedMode && (
                  <Pressable
                    style={styles.qualityTopPill}
                    onPress={() => setShowQualitySheet(true)}
                  >
                    <Text style={styles.qualityTopPillText}>{currentQualityLabel}</Text>
                  </Pressable>
                )}

                {!isEmbedMode && playbackRate !== 1 ? (
                  <View style={styles.qualityTopPill}>
                    <Text style={styles.qualityTopPillText}>{playbackRate}x</Text>
                  </View>
                ) : null}

                {activeGroup ? (
                  <Text numberOfLines={1} style={styles.groupSubtitleText}>
                    {activeGroup}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.topActionsRow}>
              {isEmbedMode ? (
                <>
                  <Pressable
                    style={styles.topIconBtn}
                    onPress={() => {
                      setEmbedStrict((s) => !s);
                      setIsBuffering(true);
                    }}
                  >
                    {embedStrict ? (
                      <Shield size={20} color={PITCH_GREEN} />
                    ) : (
                      <ShieldOff size={20} color={LIVE_RED} />
                    )}
                  </Pressable>
                  <Pressable
                    style={styles.topIconBtn}
                    onPress={() => {
                      setIsBuffering(true);
                      setReconnectTick((n) => n + 1);
                    }}
                  >
                    <RefreshCw size={20} color="#FFF" />
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    style={styles.topIconBtn}
                    onPress={() => {
                      const nextMute = !isMuted;
                      setIsMuted(nextMute);
                      if (videoRef.current) videoRef.current.muted = nextMute;
                    }}
                  >
                    {isMuted ? (
                      <VolumeX size={20} color={LIVE_RED} />
                    ) : (
                      <Volume2 size={20} color="#FFF" />
                    )}
                  </Pressable>

                  <Pressable style={styles.topIconBtn} onPress={togglePip}>
                    <PictureInPicture2 size={20} color="#FFF" />
                  </Pressable>

                  <Pressable style={styles.topIconBtn} onPress={cycleResizeMode}>
                    <Maximize size={20} color="#FFF" />
                  </Pressable>

                  <Pressable
                    style={styles.topIconBtn}
                    onPress={() => setShowQualitySheet(true)}
                  >
                    <Settings size={20} color={PRESTIGE_GOLD} />
                  </Pressable>

                  <Pressable
                    style={styles.topIconBtn}
                    onPress={() => {
                      setIsUnlockPillVisible(true);
                      setIsScreenLocked(true);
                      setIsControlsVisible(false);
                    }}
                  >
                    <Unlock size={20} color="#FFF" />
                  </Pressable>
                </>
              )}
            </View>
          </View>

          {!isEmbedMode && (
            <View pointerEvents="box-none" style={styles.centerControlsRow}>
              <Pressable style={styles.seekCenterBtn} onPress={() => seekBySeconds(-10)}>
                <RotateCcw size={34} color="#FFF" />
                <Text style={styles.seek10TinyText}>10</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.goldPlayBtn,
                  Platform.OS === 'web'
                    ? ({
                        backgroundImage: `linear-gradient(135deg, ${PRESTIGE_GOLD}, ${PRESTIGE_GOLD_DARK})`,
                      } as any)
                    : null,
                ]}
                onPress={togglePlayPause}
              >
                {isPlaying ? (
                  <Pause size={38} color={DARK_INK} fill={DARK_INK} />
                ) : (
                  <Play size={38} color={DARK_INK} fill={DARK_INK} />
                )}
              </Pressable>

              <Pressable style={styles.seekCenterBtn} onPress={() => seekBySeconds(10)}>
                <RotateCw size={34} color="#FFF" />
                <Text style={styles.seek10TinyText}>10</Text>
              </Pressable>
            </View>
          )}

          {!isEmbedMode && (
            <View pointerEvents="box-none" style={styles.bottomArea}>
              {showVodScrubber ? (
                <View style={styles.vodScrubberRow}>
                  <View style={styles.timeBadge}>
                    <Text style={styles.currentTimeText}>
                      {formatMediaDuration(currentTime)}
                    </Text>
                  </View>

                  {Platform.OS === 'web' && (
                    <div
                      ref={progressBarRef}
                      data-player-control="true"
                      onClick={(e) => {
                        e.stopPropagation();
                        seekAtClientX(e.clientX);
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        if (e.touches[0]) seekAtClientX(e.touches[0].clientX);
                      }}
                      onTouchMove={(e) => {
                        e.stopPropagation();
                        if (e.touches[0]) seekAtClientX(e.touches[0].clientX);
                      }}
                      style={{
                        flex: 1,
                        height: 28,
                        display: 'flex',
                        alignItems: 'center',
                        position: 'relative',
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: 'rgba(255, 255, 255, 0.25)',
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: 0,
                            width: `${bufferFraction * 100}%`,
                            backgroundColor: 'rgba(255, 255, 255, 0.45)',
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: 0,
                            width: `${progressFraction * 100}%`,
                            backgroundColor: PRESTIGE_GOLD,
                          }}
                        />
                      </div>
                      <div
                        style={{
                          position: 'absolute',
                          left: `${progressFraction * 100}%`,
                          width: 14,
                          height: 14,
                          borderRadius: 7,
                          backgroundColor: PRESTIGE_GOLD,
                          border: '2px solid #FFFFFF',
                          transform: 'translateX(-50%)',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                        }}
                      />
                    </div>
                  )}

                  <View style={styles.timeBadge}>
                    <Text style={styles.totalDurationText}>
                      {duration > 0 ? formatMediaDuration(duration) : '--:--'}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.liveTimelineWrapper}>
                  <View style={styles.liveLabelsRow}>
                    <Pressable
                      style={styles.liveStatusPill}
                      onPress={() => setReconnectTick((n) => n + 1)}
                    >
                      <View
                        style={[
                          styles.liveStatusDot,
                          { backgroundColor: isBuffering ? PRESTIGE_GOLD : LIVE_RED },
                        ]}
                      />
                      <Text style={styles.liveStatusText}>
                        {isBuffering ? 'تخزين مؤقت • Buffering' : 'مباشر • LIVE'}
                      </Text>
                    </Pressable>
                    <Text style={styles.liveRealtimeLabel}>بث حي فائق السرعة</Text>
                  </View>
                  <View style={styles.liveTrackBg}>
                    <View style={[styles.liveTrackActive, { width: '100%' }]} />
                  </View>
                </View>
              )}

              <View style={styles.bottomButtonsRow}>
                <Pressable style={styles.navSkipBtn} onPress={handlePreviousItem}>
                  <SkipBack size={28} color="#FFF" />
                </Pressable>

                <Pressable
                  style={styles.reconnectPillBtn}
                  onPress={() => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = 0;
                      setCurrentTime(0);
                      videoRef.current.play().catch(() => {});
                    } else {
                      setReconnectTick((n) => n + 1);
                    }
                  }}
                >
                  <RefreshCw size={15} color={PITCH_GREEN} />
                  <Text style={styles.reconnectPillText}>إعادة التشغيل</Text>
                </Pressable>

                {m3uChannels.length > 0 && (
                  <Pressable
                    style={styles.quickChannelsBtn}
                    onPress={() => setShowQuickChannelSheet(true)}
                  >
                    <Tv size={17} color={PRESTIGE_GOLD} />
                    <Text style={styles.quickChannelsBtnText}>
                      القائمة ({m3uChannels.length})
                    </Text>
                  </Pressable>
                )}

                <Pressable style={styles.navSkipBtn} onPress={handleNextItem}>
                  <SkipForward size={28} color="#FFF" />
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}

      {showQuickChannelSheet && (
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setShowQuickChannelSheet(false)}
          />
          <View style={styles.channelsSheetContainer}>
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitleText}>
                قائمة التشغيل ({filteredSheetChannels.length})
              </Text>
              <Pressable onPress={() => setShowQuickChannelSheet(false)}>
                <Text style={styles.sheetCloseGold}>إغلاق ✕</Text>
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryChipsRow}
            >
              {dynamicCategories.map((cat) => {
                const selected = selectedCategoryFilter === cat;
                return (
                  <Pressable
                    key={cat}
                    style={[
                      styles.categoryChip,
                      selected ? styles.categoryChipSelected : styles.categoryChipUnselected,
                    ]}
                    onPress={() => setSelectedCategoryFilter(cat)}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        selected && { color: DARK_INK, fontWeight: '800' },
                      ]}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.sheetSearchBox}>
              <Search size={16} color="#888" />
              <TextInput
                value={sheetSearch}
                onChangeText={setSheetSearch}
                placeholder="ابحث..."
                placeholderTextColor="#777"
                style={styles.sheetSearchInput}
              />
            </View>

            <ScrollView style={{ maxHeight: 220 }}>
              {filteredSheetChannels.map((ch) => {
                const isSelected = ch.url === activeUrl;
                const isFav = favorites.includes(ch.url);
                return (
                  <Pressable
                    key={ch.id}
                    style={[
                      styles.channelCardRow,
                      isSelected && styles.channelCardRowSelected,
                    ]}
                    onPress={() => {
                      const parsedCh = extractStreamSource(ch.url);
                      playDirect(parsedCh.streamUrl, ch.name, ch.group);
                      setShowQuickChannelSheet(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.channelCardTitle,
                          isSelected && { color: PRESTIGE_GOLD, fontWeight: '800' },
                        ]}
                      >
                        {ch.name}
                      </Text>
                      <Text style={styles.channelCardSub}>{ch.group || 'فيديو'}</Text>
                    </View>

                    {isSelected && (
                      <View style={styles.nowPlayingBadge}>
                        <Text style={styles.nowPlayingBadgeText}>يعمل الآن</Text>
                      </View>
                    )}

                    <Pressable style={styles.starBtn} onPress={() => toggleFavorite(ch.url)}>
                      <Star
                        size={18}
                        color={PRESTIGE_GOLD}
                        fill={isFav ? PRESTIGE_GOLD : 'transparent'}
                      />
                    </Pressable>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}

      {showQualitySheet && (
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setShowQualitySheet(false)}
          />
          <View style={styles.settingsSheetContainer}>
            <View style={styles.sheetHeaderRow}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                <Settings size={18} color={PRESTIGE_GOLD} />
                <Text style={styles.sheetTitleText}>الإعدادات</Text>
              </View>
              <Pressable onPress={() => setShowQualitySheet(false)}>
                <Text style={styles.sheetCloseMuted}>إغلاق ✕</Text>
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.settingsSectionTitle}>الجودة</Text>
              <View style={styles.qualityChipsGrid}>
                {(availableQualities.length > 0
                  ? availableQualities
                  : [{ label: 'تلقائي', url: activeUrl }]
                ).map((q, idx) => (
                  <SettingChip
                    key={`${q.label}_${idx}`}
                    label={q.label}
                    selected={idx === selectedQualityIdx}
                    onPress={() => handleSelectQuality(idx)}
                  />
                ))}
              </View>

              <Text style={styles.settingsSectionTitle}>سرعة التشغيل</Text>
              <View style={styles.qualityChipsGrid}>
                {SPEEDS.map((sp) => (
                  <SettingChip
                    key={sp}
                    label={sp === 1 ? 'عادي' : `${sp}x`}
                    selected={playbackRate === sp}
                    onPress={() => setPlaybackRate(sp)}
                  />
                ))}
              </View>

              {subtitles.length > 0 && (
                <>
                  <Text style={styles.settingsSectionTitle}>الترجمة</Text>
                  <View style={styles.qualityChipsGrid}>
                    <SettingChip
                      label="بدون"
                      selected={subtitleIdx === -1}
                      onPress={() => setSubtitleIdx(-1)}
                    />
                    {subtitles.map((s, i) => (
                      <SettingChip
                        key={`${s.url}_${i}`}
                        label={s.label}
                        selected={subtitleIdx === i}
                        onPress={() => setSubtitleIdx(i)}
                      />
                    ))}
                  </View>
                </>
              )}

              <Text style={styles.settingsSectionTitle}>مؤقت النوم</Text>
              <View style={[styles.qualityChipsGrid, { marginBottom: 6 }]}>
                {SLEEP_OPTIONS.map((m) => (
                  <SettingChip
                    key={m}
                    label={m === 0 ? 'إيقاف' : `${m} د`}
                    selected={sleepMinutes === m}
                    onPress={() => setSleepMinutes(m)}
                  />
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100vw' as any,
    height: '100vh' as any,
    backgroundColor: '#000000',
    zIndex: 999999,
    overflow: 'hidden',
  },
  volumeHudBox: {
    position: 'absolute',
    right: 28,
    top: '38%',
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.5)',
    paddingHorizontal: 14,
    paddingVertical: 18,
    alignItems: 'center',
    zIndex: 25,
  },
  brightnessHudBox: {
    position: 'absolute',
    left: 28,
    top: '38%',
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 199, 44, 0.5)',
    paddingHorizontal: 14,
    paddingVertical: 18,
    alignItems: 'center',
    zIndex: 25,
  },
  hudPercentText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
    marginTop: 8,
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 22,
  },
  seekPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: PRESTIGE_GOLD,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  seekPillText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '900',
  },
  resizeToastWrapper: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    zIndex: 28,
  },
  resizeToastPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.88)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ELECTRIC_EMERALD,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  resizeToastText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  connectingText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
  },
  errorCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.5)',
    paddingHorizontal: 24,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 12,
  },
  errorTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PITCH_GREEN,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#00391A',
    fontWeight: '800',
    fontSize: 13,
  },
  unlockBottomWrapper: {
    position: 'absolute',
    bottom: 36,
    alignSelf: 'center',
    zIndex: 40,
  },
  unlockPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.90)',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: PRESTIGE_GOLD,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  unlockPillText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  hudGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    zIndex: 15,
  },
  topBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  topIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitleArea: {
    flex: 1,
    alignItems: 'flex-end',
    paddingHorizontal: 8,
  },
  topTitleText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  topBadgesRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  typeBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '900',
  },
  qualityTopPill: {
    borderRadius: 4,
    backgroundColor: 'rgba(255, 199, 44, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 199, 44, 0.6)',
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  qualityTopPillText: {
    color: PRESTIGE_GOLD,
    fontSize: 9,
    fontWeight: '900',
  },
  groupSubtitleText: {
    color: PRESTIGE_GOLD,
    fontSize: 11,
    fontWeight: '600',
  },
  topActionsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 2,
  },
  centerControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 34,
  },
  seekCenterBtn: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seek10TinyText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
    marginTop: -2,
  },
  goldPlayBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: PRESTIGE_GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomArea: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 10,
  },
  vodScrubberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timeBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  currentTimeText: {
    color: PRESTIGE_GOLD,
    fontSize: 11,
    fontWeight: '800',
  },
  totalDurationText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  liveTimelineWrapper: {
    gap: 6,
  },
  liveLabelsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveStatusPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveStatusText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '900',
  },
  liveRealtimeLabel: {
    color: PRESTIGE_GOLD,
    fontSize: 11,
    fontWeight: '700',
  },
  liveTrackBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  },
  liveTrackActive: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: PRESTIGE_GOLD,
  },
  bottomButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navSkipBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reconnectPillBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  reconnectPillText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  quickChannelsBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0C0E16',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 199, 44, 0.45)',
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  quickChannelsBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
    zIndex: 55,
  },
  channelsSheetContainer: {
    backgroundColor: OBSIDIAN_SHEET,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 199, 44, 0.25)',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
  },
  settingsSheetContainer: {
    backgroundColor: OBSIDIAN_SETTINGS,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 199, 44, 0.25)',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 26,
  },
  sheetHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitleText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  sheetCloseGold: {
    color: PRESTIGE_GOLD,
    fontSize: 12,
    fontWeight: '800',
    padding: 4,
  },
  sheetCloseMuted: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontWeight: '700',
    padding: 4,
  },
  categoryChipsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    paddingBottom: 10,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryChipSelected: {
    backgroundColor: PRESTIGE_GOLD,
    borderColor: PRESTIGE_GOLD,
  },
  categoryChipUnselected: {
    backgroundColor: '#141824',
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  categoryChipText: {
    color: '#FFF',
    fontSize: 11,
  },
  sheetSearchBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#11141E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 10,
  },
  sheetSearchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 12,
    textAlign: 'right',
  },
  channelCardRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#0E111A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  channelCardRowSelected: {
    backgroundColor: 'rgba(255, 199, 44, 0.15)',
    borderColor: PRESTIGE_GOLD,
  },
  channelCardTitle: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  channelCardSub: {
    color: '#888',
    fontSize: 11,
    textAlign: 'right',
    marginTop: 2,
  },
  nowPlayingBadge: {
    backgroundColor: PRESTIGE_GOLD,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  nowPlayingBadgeText: {
    color: DARK_INK,
    fontSize: 10,
    fontWeight: '900',
  },
  qualityChipsGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
  },
  compactQualityChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  compactQualityChipSelected: {
    backgroundColor: PRESTIGE_GOLD,
    borderColor: PRESTIGE_GOLD,
  },
  compactQualityChipUnselected: {
    backgroundColor: OBSIDIAN_CHIP,
    borderColor: 'rgba(255, 199, 44, 0.25)',
  },
  compactQualityText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  settingsSectionTitle: {
    color: PRESTIGE_GOLD,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
    marginTop: 8,
    marginBottom: 8,
  },
  starBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 6,
  },
  embedHotspot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    zIndex: 12,
  },
  embedFallbackBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 199, 44, 0.6)',
  },
  embedFallbackText: {
    color: PRESTIGE_GOLD,
    fontSize: 12,
    fontWeight: '800',
  },
});

export default EnjoyPlayer;
