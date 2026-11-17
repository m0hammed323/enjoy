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
  PanResponder,
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
  X,
  Check,
  AlertCircle,
  RefreshCw,
  SkipBack,
  SkipForward,
  Sun,
} from 'lucide-react-native';
import { getCapacitorPlugin, registerBackInterceptor } from '@/utils/backNavigation';

// لوحة ألوان SportsTV (Obsidian & Prestige Gold)
const PRESTIGE_GOLD = '#FFC72C';
const PRESTIGE_GOLD_DARK = '#E6A800';
const OBSIDIAN_SHEET = '#07080C';
const OBSIDIAN_SETTINGS = '#0A0C12';
const OBSIDIAN_CHIP = '#161A28';
const LIVE_RED = '#E50914';
const PITCH_GREEN = '#00E676';
const ELECTRIC_EMERALD = '#10B981';
const DARK_INK = '#08090D';

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

export interface EnjoyPlayerProps {
  title?: string;
  subtitle?: string;
  url?: string;
  src?: string;
  embedCode?: string;
  qualities?: VideoQualityOption[];
  channels?: M3UChannel[];
  forceLandscape?: boolean;
  onClose?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
}

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

/**
 * محلل قوائم M3U / IPTV لاستخراج أسماء القنوات وتصنيفاتها وروابط البث
 */
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
        id: `ch_${parsed.length}_${Math.random().toString(36).slice(2, 7)}`,
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

/**
 * تنظيف الرابط واستخراج البث المباشر فقط بدون أي إطار تضمين خارجي
 */
function extractStreamSource(rawInput: string): {
  streamUrl: string;
  isM3uList: boolean;
} {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return { streamUrl: '', isM3uList: false };

  let extracted = trimmed;
  if (trimmed.startsWith('<')) {
    const directMatch = trimmed.match(
      /https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4|m3u|ts|webm|mkv)(?:\?[^"'\s<>]*)?/i
    );
    if (directMatch?.[0]) {
      extracted = directMatch[0].trim();
    } else {
      const srcMatch = trimmed.match(/src=["']([^"']+)["']/i);
      if (srcMatch?.[1]) extracted = srcMatch[1].trim();
    }
  }

  const lower = extracted.toLowerCase();
  const isM3uList =
    extracted.startsWith('#EXTM3U') ||
    ((lower.includes('.m3u') || lower.includes('type=m3u') || lower.includes('output=m3u')) &&
      !lower.includes('.m3u8'));

  return { streamUrl: extracted, isM3uList };
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

export function EnjoyPlayer({
  title = 'Enjoy Stream',
  subtitle,
  url,
  src,
  embedCode,
  qualities = [],
  channels = [],
  forceLandscape = true,
  onClose,
  onNext,
  onPrevious,
}: EnjoyPlayerProps) {
  const rawInput = url || src || embedCode || '';
  const initialSource = useMemo(() => extractStreamSource(rawInput), [rawInput]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);
  const progressBarRef = useRef<any>(null);

  // حالة المصدر والتشغيل
  const [activeUrl, setActiveUrl] = useState<string>(initialSource.streamUrl);
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

  // الصوت والسطوع (نفس إيماءات PlayerScreen في sports-tv)
  const [volumeLevel, setVolumeLevel] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [brightnessLevel, setBrightnessLevel] = useState(1);
  const [gestureVolumeHud, setGestureVolumeHud] = useState<number | null>(null);
  const [gestureBrightnessHud, setGestureBrightnessHud] = useState<number | null>(null);

  // حالات الواجهة والتحكم
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isScreenLocked, setIsScreenLocked] = useState(false);
  const [isUnlockPillVisible, setIsUnlockPillVisible] = useState(true);
  const [resizeIndex, setResizeIndex] = useState(0);
  const [resizeToast, setResizeToast] = useState<string | null>(null);
  const [seekFeedbackText, setSeekFeedbackText] = useState<string | null>(null);

  // القوائم السفلية (Bottom Sheets): الجودات + القنوات السريعة
  const [availableQualities, setAvailableQualities] = useState<VideoQualityOption[]>(qualities);
  const [selectedQualityIdx, setSelectedQualityIdx] = useState<number>(0);
  const [showQualitySheet, setShowQualitySheet] = useState(false);

  const [m3uChannels, setM3uChannels] = useState<M3UChannel[]>(channels);
  const [showQuickChannelSheet, setShowQuickChannelSheet] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('الكل');
  const [sheetSearch, setSheetSearch] = useState('');

  // المراجع والمؤقتات
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureHudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTime = useRef(0);
  const lastTapX = useRef(0);

  // مراجع الإيماءات الرأسية (سطوع يسار / صوت يمين)
  const isLockedRef = useRef(isScreenLocked);
  isLockedRef.current = isScreenLocked;
  const volumeRef = useRef(volumeLevel);
  volumeRef.current = volumeLevel;
  const brightnessRef = useRef(brightnessLevel);
  brightnessRef.current = brightnessLevel;
  const dragStartRef = useRef<{ x: number; startVal: number; side: 'left' | 'right' | null }>({
    x: 0,
    startVal: 1,
    side: null,
  });

  // مزامنة أشرطة نظام الهاتف (الساعة والبطارية وأزرار التنقل) مع إظهار/إخفاء عناصر التحكم
  const showSystemBars = !isScreenLocked && isControlsVisible;
  useEffect(() => {
    (async () => {
      try {
        const capStatusBar = getCapacitorPlugin('StatusBar');
        if (showSystemBars) {
          if (capStatusBar?.show) await capStatusBar.show();
        } else {
          if (capStatusBar?.hide) await capStatusBar.hide();
          if (typeof document !== 'undefined' && !document.fullscreenElement) {
            document.documentElement.requestFullscreen?.().catch(() => {});
          }
        }
      } catch {
        // تجاهل في المتصفح العادي
      }
    })();
  }, [showSystemBars]);

  // قفل الشاشة بالعرض تلقائياً عند الفتح وإرجاعها عند الإغلاق
  const lockLandscape = useCallback(async () => {
    if (!forceLandscape) return;
    try {
      const capOrientation = getCapacitorPlugin('ScreenOrientation');
      if (capOrientation?.lock) {
        await capOrientation.lock({ orientation: 'landscape' });
      } else if (typeof screen !== 'undefined' && (screen as any).orientation?.lock) {
        await (screen as any).orientation.lock('landscape').catch(() => {});
      }
    } catch {
      // تجاهل
    }
  }, [forceLandscape]);

  const restoreOrientation = useCallback(async () => {
    try {
      if (typeof document !== 'undefined' && document.fullscreenElement) {
        await document.exitFullscreen?.().catch(() => {});
      }
      const capStatusBar = getCapacitorPlugin('StatusBar');
      if (capStatusBar?.show) await capStatusBar.show();

      const capOrientation = getCapacitorPlugin('ScreenOrientation');
      if (capOrientation?.unlock) {
        await capOrientation.unlock();
      } else if (typeof screen !== 'undefined' && (screen as any).orientation?.unlock) {
        (screen as any).orientation.unlock();
      }
    } catch {
      // تجاهل
    }
  }, []);

  // إخفاء وإيقاف أي مشغل تضمين قديم في الصفحة تماماً
  useEffect(() => {
    lockLandscape();

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
      restoreOrientation();
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
      if (resizeToastTimer.current) clearTimeout(resizeToastTimer.current);
      if (seekFeedbackTimer.current) clearTimeout(seekFeedbackTimer.current);
      if (gestureHudTimer.current) clearTimeout(gestureHudTimer.current);
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    };
  }, [lockLandscape, restoreOrientation]);

  const handleExitPlayer = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    restoreOrientation();
    if (onClose) onClose();
  }, [onClose, restoreOrientation]);

  // ترتيب أولويات زر الرجوع في الموبايل (نفس BackHandler في PlayerScreen.kt)
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

  // تحليل المدخل وقائمة M3U
  useEffect(() => {
    const nextRaw = url || src || embedCode || '';
    const parsed = extractStreamSource(nextRaw);
    setActiveTitle(title);
    setActiveGroup(subtitle || '');

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
            setActiveUrl(list[0].url);
            setActiveTitle(list[0].name);
            setActiveGroup(list[0].group || 'بث مباشر');
          } else if (!cancelled) {
            setErrorMsg('تعذر العثور على قنوات صالحة داخل ملف M3U');
            setIsBuffering(false);
          }
        } catch {
          if (!cancelled) {
            setErrorMsg('تعذر تحميل قائمة قنوات M3U');
            setIsBuffering(false);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    } else {
      setActiveUrl(parsed.streamUrl);
      if (channels.length > 0) setM3uChannels(channels);
    }
  }, [url, src, embedCode, title, subtitle, channels]);

  // تشغيل البث المباشر HLS / M3U8 و MP4
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

    const startPlayback = () => {
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    };

    const fallbackToNative = () => {
      if (fellBackToNative || destroyed) return;
      fellBackToNative = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.src = activeUrl;
      if (qualities.length > 0) setAvailableQualities(qualities);
      startPlayback();
    };

    const lower = activeUrl.toLowerCase();
    const isDirectFile = /\.(mp4|webm|mov|mkv|avi|mp3|aac)(\?|#|$)/i.test(lower);
    const isExplicitHls = lower.includes('.m3u8') || lower.includes('m3u8');

    if (isDirectFile) {
      fallbackToNative();
    } else {
      ensureHlsLibrary().then((Hls) => {
        if (destroyed) return;
        if (Hls && Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 60,
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
            startPlayback();
          });

          hls.on(Hls.Events.LEVEL_LOADED, (_: any, data: any) => {
            if (!destroyed && data?.details) {
              setIsLiveStream(Boolean(data.details.live));
            }
          });

          hls.on(Hls.Events.ERROR, (_: any, data: any) => {
            if (data?.fatal) {
              if (
                !isExplicitHls &&
                (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
                  data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT ||
                  data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR)
              ) {
                fallbackToNative();
                return;
              }
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                hls.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                hls.recoverMediaError();
              } else {
                fallbackToNative();
              }
            }
          });
        } else {
          fallbackToNative();
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

  // إخفاء تلقائي لعناصر التحكم بعد 4 ثوانٍ أثناء التشغيل
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

  // التقديم والتأخير 10 ثوانٍ مع إشعار عائم ذهبي
  const seekBySeconds = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    const nextTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
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

  // معالجة النقر (لمسة واحدة للإخفاء/الإظهار، ولمستين للتقديم/التأخير/الإيقاف)
  const handleTapGesture = useCallback(
    (tapX: number) => {
      lockLandscape();

      if (isLockedRef.current) {
        setIsUnlockPillVisible((prev) => !prev);
        return;
      }

      const now = Date.now();
      const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 800;

      if (now - lastTapTime.current < 260 && Math.abs(tapX - lastTapX.current) < 90) {
        if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
        lastTapTime.current = 0;

        if (tapX < screenWidth * 0.4) {
          seekBySeconds(-10);
        } else if (tapX > screenWidth * 0.6) {
          seekBySeconds(10);
        } else {
          togglePlayPause();
        }
        return;
      }

      lastTapTime.current = now;
      lastTapX.current = tapX;

      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      singleTapTimer.current = setTimeout(() => {
        setIsControlsVisible((prev) => !prev);
      }, 230);
    },
    [lockLandscape, seekBySeconds, togglePlayPause]
  );

  // إيماءات السحب الرأسي للسطوع (يسار) والصوت (يمين) والنقر على الشاشة
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 10,
        onPanResponderGrant: (evt) => {
          const x = evt.nativeEvent.locationX ?? evt.nativeEvent.pageX ?? 200;
          const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 800;
          if (x < screenWidth * 0.45) {
            dragStartRef.current = { x, startVal: brightnessRef.current, side: 'left' };
          } else if (x > screenWidth * 0.55) {
            dragStartRef.current = { x, startVal: volumeRef.current, side: 'right' };
          } else {
            dragStartRef.current = { x, startVal: 1, side: null };
          }
        },
        onPanResponderMove: (_, gs) => {
          if (isLockedRef.current || Math.abs(gs.dy) < 12) return;
          const { side, startVal } = dragStartRef.current;
          if (!side) return;

          const delta = -gs.dy / 260;
          if (side === 'left') {
            const nextBright = Math.max(0.15, Math.min(1, startVal + delta));
            setBrightnessLevel(nextBright);
            setGestureBrightnessHud(nextBright);
            setGestureVolumeHud(null);
          } else if (side === 'right') {
            const nextVol = Math.max(0, Math.min(1, startVal + delta));
            setVolumeLevel(nextVol);
            setIsMuted(nextVol === 0);
            if (videoRef.current) videoRef.current.volume = nextVol;
            setGestureVolumeHud(nextVol);
            setGestureBrightnessHud(null);
          }

          if (gestureHudTimer.current) clearTimeout(gestureHudTimer.current);
          gestureHudTimer.current = setTimeout(() => {
            setGestureVolumeHud(null);
            setGestureBrightnessHud(null);
          }, 900);
        },
        onPanResponderRelease: (evt, gs) => {
          if (Math.abs(gs.dx) < 10 && Math.abs(gs.dy) < 10) {
            const tapX = evt.nativeEvent.locationX ?? evt.nativeEvent.pageX ?? 200;
            handleTapGesture(tapX);
          }
        },
      }),
    [handleTapGesture]
  );

  // تبديل أبعاد العرض
  const cycleResizeMode = () => {
    const nextIdx = (resizeIndex + 1) % RESIZE_MODES.length;
    setResizeIndex(nextIdx);
    setResizeToast(RESIZE_MODES[nextIdx].label);
    if (resizeToastTimer.current) clearTimeout(resizeToastTimer.current);
    resizeToastTimer.current = setTimeout(() => setResizeToast(null), 1500);
  };

  // تبديل الجودة
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

  // التنقل بين القنوات (السابق / التالي)
  const handlePreviousItem = () => {
    if (m3uChannels.length > 1) {
      const idx = m3uChannels.findIndex((c) => c.url === activeUrl);
      const prevIdx = idx <= 0 ? m3uChannels.length - 1 : idx - 1;
      const prevCh = m3uChannels[prevIdx];
      setActiveUrl(prevCh.url);
      setActiveTitle(prevCh.name);
      setActiveGroup(prevCh.group || 'بث مباشر');
    } else if (onPrevious) {
      onPrevious();
    } else if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  };

  const handleNextItem = () => {
    if (m3uChannels.length > 1) {
      const idx = m3uChannels.findIndex((c) => c.url === activeUrl);
      const nextIdx = idx === -1 || idx >= m3uChannels.length - 1 ? 0 : idx + 1;
      const nextCh = m3uChannels[nextIdx];
      setActiveUrl(nextCh.url);
      setActiveTitle(nextCh.name);
      setActiveGroup(nextCh.group || 'بث مباشر');
    } else if (onNext) {
      onNext();
    }
  };

  // النقر على شريط التقديم للأفلام والمسلسلات
  const handleScrubberPress = (evt: any) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const touchX = evt?.nativeEvent?.locationX ?? 0;
    const barWidth =
      progressBarRef.current?.clientWidth ||
      (typeof window !== 'undefined' ? window.innerWidth - 130 : 300);
    const ratio = Math.max(0, Math.min(1, touchX / barWidth));
    const targetTime = ratio * duration;
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const isVodContent = !isLiveStream && duration > 1;
  const currentResize = RESIZE_MODES[resizeIndex];
  const currentQualityLabel = availableQualities[selectedQualityIdx]?.label || 'تلقائي';

  const progressFraction = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const bufferFraction = duration > 0 ? Math.min(1, Math.max(progressFraction, bufferedEnd / duration)) : 0;

  // استخراج التصنيفات الديناميكية من قائمة القنوات
  const dynamicCategories = useMemo(() => {
    const groups = new Set<string>(['الكل']);
    m3uChannels.forEach((ch) => {
      if (ch.group && ch.group.trim()) groups.add(ch.group.trim());
    });
    return Array.from(groups);
  }, [m3uChannels]);

  const filteredSheetChannels = useMemo(() => {
    let list = m3uChannels;
    if (selectedCategoryFilter !== 'الكل') {
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
  }, [m3uChannels, selectedCategoryFilter, sheetSearch]);

  return (
    <View nativeID="enjoy-player-root" style={styles.rootContainer}>
      <StatusBar hidden={!showSystemBars} style="light" />

      {/* 1. شاشة الفيديو الوحيدة (بدون أي مشغل تضمين خارجي) */}
      {Platform.OS === 'web' && (
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted={isMuted}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => {
            setIsBuffering(false);
            setIsPlaying(true);
            setErrorMsg(null);
          }}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            setCurrentTime(v.currentTime);
            if (v.buffered.length > 0) {
              setBufferedEnd(v.buffered.end(v.buffered.length - 1));
            }
          }}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration);
            setIsBuffering(false);
          }}
          onError={() => {
            setIsBuffering(false);
            setErrorMsg('تعذر تشغيل البث حالياً');
          }}
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#000000',
            objectFit: currentResize.objectFit,
            transform: currentResize.scale > 1 ? `scale(${currentResize.scale})` : 'none',
            filter: `brightness(${brightnessLevel})`,
            transition: 'transform 0.22s ease',
          }}
        />
      )}

      {/* 2. طبقة الإيماءات واللمس (سطوع يسار / صوت يمين / لمسة إخفاء / لمستين تقديم وتأخير) */}
      <View {...panResponder.panHandlers} style={styles.gestureLayer} />

      {/* مؤشر الصوت العائم (يمين الشاشة) */}
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

      {/* مؤشر السطوع العائم (يسار الشاشة) */}
      {gestureBrightnessHud !== null && (
        <View pointerEvents="none" style={styles.brightnessHudBox}>
          <Sun size={28} color={PRESTIGE_GOLD} />
          <Text style={styles.hudPercentText}>{Math.round(gestureBrightnessHud * 100)}%</Text>
        </View>
      )}

      {/* إشعار التقديم والتأخير (+10 ثوانٍ / -10 ثوانٍ) */}
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

      {/* إشعار تغيير أبعاد العرض (أعلى المنتصف) */}
      {resizeToast && (
        <View pointerEvents="none" style={styles.resizeToastWrapper}>
          <View style={styles.resizeToastPill}>
            <Maximize size={16} color={ELECTRIC_EMERALD} />
            <Text style={styles.resizeToastText}>{resizeToast}</Text>
          </View>
        </View>
      )}

      {/* مؤشر التحميل الذهبي */}
      {isBuffering && !errorMsg && (
        <View pointerEvents="none" style={styles.centerOverlay}>
          <ActivityIndicator size="large" color={PRESTIGE_GOLD} />
          <Text style={styles.connectingText}>جاري الاتصال بالبث...</Text>
        </View>
      )}

      {/* تنبيه الخطأ وإعادة المحاولة */}
      {errorMsg && (
        <View style={styles.centerOverlay}>
          <View style={styles.errorCard}>
            <AlertCircle size={42} color={LIVE_RED} />
            <Text style={styles.errorTitle}>{errorMsg}</Text>
            <Pressable
              style={styles.retryBtn}
              onPress={() => {
                setErrorMsg(null);
                setReconnectTick((n) => n + 1);
              }}
            >
              <RefreshCw size={18} color="#00391A" />
              <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* زر إلغاء قفل الشاشة العائم (لمسة يختفي، لمسة يظهر) */}
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

      {/* 3. واجهة التحكم الكاملة (تطابق تصميم PlayerScreen في sports-tv) */}
      {isControlsVisible && !isScreenLocked && (
        <View
          pointerEvents="box-none"
          style={[
            styles.hudGradientOverlay,
            Platform.OS === 'web'
              ? ({
                  backgroundImage:
                    'linear-gradient(180deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0) 65%, rgba(0,0,0,0.94) 100%)',
                } as any)
              : null,
          ]}
        >
          {/* الشريط العلوي */}
          <View style={styles.topBar}>
            <Pressable style={styles.topIconBtn} onPress={handleExitPlayer}>
              <ArrowRight size={22} color="#FFF" />
            </Pressable>

            <View style={styles.topTitleArea}>
              <Text numberOfLines={1} style={styles.topTitleText}>
                {activeTitle}
              </Text>
              <View style={styles.topBadgesRow}>
                <View
                  style={[
                    styles.typeBadge,
                    { backgroundColor: isVodContent ? PRESTIGE_GOLD : LIVE_RED },
                  ]}
                >
                  <Text
                    style={[
                      styles.typeBadgeText,
                      { color: isVodContent ? DARK_INK : '#FFF' },
                    ]}
                  >
                    {isVodContent ? 'VOD' : 'LIVE'}
                  </Text>
                </View>

                <Pressable
                  style={styles.qualityTopPill}
                  onPress={() => setShowQualitySheet(true)}
                >
                  <Text style={styles.qualityTopPillText}>{currentQualityLabel}</Text>
                </Pressable>

                {activeGroup ? (
                  <Text numberOfLines={1} style={styles.groupSubtitleText}>
                    {activeGroup}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* أزرار الشريط العلوي: كتم الصوت + الأبعاد + إعدادات الجودة + قفل الشاشة */}
            <View style={styles.topActionsRow}>
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
            </View>
          </View>

          {/* أزرار المنتصف (LTR ثابت: يسار ترجيع 10ث - وسط تشغيل/إيقاف ذهبي - يمين تقديم 10ث) */}
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

          {/* المنطقة السفلية: شريط الوقت للأفلام OR شريط البث المباشر + أزرار التنقل */}
          <View style={styles.bottomArea}>
            {isVodContent ? (
              <View style={styles.vodScrubberRow}>
                <View style={styles.timeBadge}>
                  <Text style={styles.currentTimeText}>
                    {formatMediaDuration(currentTime)}
                  </Text>
                </View>

                <Pressable
                  ref={progressBarRef}
                  style={styles.scrubberHitArea}
                  onPress={handleScrubberPress}
                >
                  <View style={styles.scrubberTrack}>
                    <View
                      style={[
                        styles.scrubberBuffered,
                        { width: `${bufferFraction * 100}%` },
                      ]}
                    />
                    <View
                      style={[
                        styles.scrubberWatched,
                        { width: `${progressFraction * 100}%` },
                      ]}
                    />
                  </View>
                  <View
                    style={[
                      styles.scrubberThumb,
                      { left: `${progressFraction * 100}%` },
                    ]}
                  />
                </Pressable>

                <View style={styles.timeBadge}>
                  <Text style={styles.totalDurationText}>
                    {formatMediaDuration(duration)}
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

                  <Text style={styles.liveRealtimeLabel}>
                    {isBuffering
                      ? 'جاري تحميل البث...'
                      : 'بث حي فائق السرعة (Real-time)'}
                  </Text>
                </View>

                <View style={styles.liveTrackBg}>
                  <View
                    style={[
                      styles.liveTrackBuffer,
                      { width: `${bufferFraction * 100}%` },
                    ]}
                  />
                  <View
                    style={[
                      styles.liveTrackActive,
                      { width: isBuffering ? '35%' : '100%' },
                    ]}
                  />
                </View>
              </View>
            )}

            {/* صف الأزرار السفلي (LTR ثابت: السابق - تجديد البث - القنوات - التالي) */}
            <View style={styles.bottomButtonsRow}>
              <Pressable style={styles.navSkipBtn} onPress={handlePreviousItem}>
                <SkipBack size={28} color="#FFF" />
              </Pressable>

              <Pressable
                style={styles.reconnectPillBtn}
                onPress={() => setReconnectTick((n) => n + 1)}
              >
                <RefreshCw size={15} color={PITCH_GREEN} />
                <Text style={styles.reconnectPillText}>تجديد البث</Text>
              </Pressable>

              {m3uChannels.length > 0 && (
                <Pressable
                  style={styles.quickChannelsBtn}
                  onPress={() => setShowQuickChannelSheet(true)}
                >
                  <Tv size={17} color={PRESTIGE_GOLD} />
                  <Text style={styles.quickChannelsBtnText}>
                    القنوات ({m3uChannels.length})
                  </Text>
                </Pressable>
              )}

              <Pressable style={styles.navSkipBtn} onPress={handleNextItem}>
                <SkipForward size={28} color="#FFF" />
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* 4. قائمة القنوات السريعة السفلية (Bottom Sheet بتصميم Obsidian & Gold) */}
      {showQuickChannelSheet && (
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setShowQuickChannelSheet(false)}
          />
          <View style={styles.channelsSheetContainer}>
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitleText}>
                قائمة القنوات ({filteredSheetChannels.length})
              </Text>
              <Pressable onPress={() => setShowQuickChannelSheet(false)}>
                <Text style={styles.sheetCloseGold}>إغلاق ✕</Text>
              </Pressable>
            </View>

            {/* شرائح تصفية الأقسام */}
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

            {/* مربع البحث */}
            <View style={styles.sheetSearchBox}>
              <Search size={16} color="#888" />
              <TextInput
                value={sheetSearch}
                onChangeText={setSheetSearch}
                placeholder="ابحث عن أي قناة..."
                placeholderTextColor="#777"
                style={styles.sheetSearchInput}
              />
            </View>

            {/* قائمة القنوات */}
            <ScrollView style={{ maxHeight: 220 }}>
              {filteredSheetChannels.map((ch) => {
                const isSelected = ch.url === activeUrl;
                return (
                  <Pressable
                    key={ch.id}
                    style={[
                      styles.channelCardRow,
                      isSelected && styles.channelCardRowSelected,
                    ]}
                    onPress={() => {
                      const parsedCh = extractStreamSource(ch.url);
                      setActiveUrl(parsedCh.streamUrl);
                      setActiveTitle(ch.name);
                      setActiveGroup(ch.group || 'بث مباشر');
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
                      <Text style={styles.channelCardSub}>
                        {ch.group || 'بث مباشر'}
                      </Text>
                    </View>

                    {isSelected && (
                      <View style={styles.nowPlayingBadge}>
                        <Text style={styles.nowPlayingBadgeText}>يعمل الآن</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}

      {/* 5. قائمة إعدادات الجودة السفلية (CompactQualityChips الذهبية) */}
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
                <Text style={styles.sheetTitleText}>إعدادات الجودة</Text>
              </View>
              <Pressable onPress={() => setShowQualitySheet(false)}>
                <Text style={styles.sheetCloseMuted}>إغلاق ✕</Text>
              </Pressable>
            </View>

            <View style={styles.qualityChipsGrid}>
              {(availableQualities.length > 0
                ? availableQualities
                : [{ label: 'تلقائي', url: activeUrl }]
              ).map((q, idx) => {
                const isSelected = idx === selectedQualityIdx;
                return (
                  <Pressable
                    key={`${q.label}_${idx}`}
                    style={[
                      styles.compactQualityChip,
                      isSelected
                        ? styles.compactQualityChipSelected
                        : styles.compactQualityChipUnselected,
                    ]}
                    onPress={() => handleSelectQuality(idx)}
                  >
                    {isSelected ? (
                      <Check size={15} color={DARK_INK} />
                    ) : (
                      <Tv size={15} color={PRESTIGE_GOLD} />
                    )}
                    <Text
                      style={[
                        styles.compactQualityText,
                        isSelected && { color: DARK_INK, fontWeight: '900' },
                      ]}
                    >
                      {q.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
    backgroundColor: '#000000',
    zIndex: 999999,
  },
  gestureLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
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
    zIndex: 22,
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
    zIndex: 22,
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
    zIndex: 20,
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
    zIndex: 25,
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
    zIndex: 35,
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
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    zIndex: 12,
  },
  topBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  topIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  scrubberHitArea: {
    flex: 1,
    height: 28,
    justifyContent: 'center',
  },
  scrubberTrack: {
    height: 3.5,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    overflow: 'hidden',
  },
  scrubberBuffered: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  scrubberWatched: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: PRESTIGE_GOLD,
  },
  scrubberThumb: {
    position: 'absolute',
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: PRESTIGE_GOLD,
    marginLeft: -6.5,
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
  liveTrackBuffer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
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
    width: 42,
    height: 42,
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
    zIndex: 50,
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
});

export default EnjoyPlayer;
