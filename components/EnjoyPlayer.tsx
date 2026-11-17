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
  X,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react-native';
import { getCapacitorPlugin, registerBackInterceptor } from '@/utils/backNavigation';

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
}

type AspectMode = 'contain' | 'cover' | 'fill' | 'zoom';
type PlayerSourceMode = 'video' | 'embed';

const ASPECT_MODES: { key: AspectMode; label: string; zoomScale: number }[] = [
  { key: 'contain', label: 'ملاءمة (Fit)', zoomScale: 1 },
  { key: 'cover', label: 'ملء الشاشة (Fill)', zoomScale: 1.12 },
  { key: 'fill', label: 'تمديد (Stretch)', zoomScale: 1.22 },
  { key: 'zoom', label: 'تكبير (Zoom)', zoomScale: 1.32 },
];

/**
 * محلل قوائم M3U / IPTV لاستخراج أسماء القنوات وتصنيفاتها وروابط البث بدقة
 */
export function parseM3UPlaylist(rawText: string): M3UChannel[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed: M3UChannel[] = [];
  let pendingName = '';
  let pendingGroup = 'الكل';
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
 * تحليل الرابط أو كود التضمين لتحديد طريقة التشغيل المثلى
 */
function analyzeMediaInput(rawInput: string): {
  mode: PlayerSourceMode;
  cleanUrl: string;
  rawHtml: string | null;
  isM3uList: boolean;
} {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return { mode: 'video', cleanUrl: '', rawHtml: null, isM3uList: false };
  }

  // 1. إذا كان المدخل كود HTML تضمين (<iframe ...> أو <embed ...>)
  if (trimmed.startsWith('<') || /<iframe[\s>]/i.test(trimmed)) {
    const iframeSrcMatch = trimmed.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframeSrcMatch?.[1]) {
      return {
        mode: 'embed',
        cleanUrl: iframeSrcMatch[1].trim(),
        rawHtml: null,
        isM3uList: false,
      };
    }
    const wrappedHtml = `<!DOCTYPE html><html dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}html,body{width:100%;height:100%;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center}iframe,video,embed,object{width:100%!important;height:100%!important;border:0!important}</style></head><body>${trimmed}</body></html>`;
    return {
      mode: 'embed',
      cleanUrl: '',
      rawHtml: wrappedHtml,
      isM3uList: false,
    };
  }

  const lower = trimmed.toLowerCase();

  // 2. إذا كان ملف أو محتوى قائمة قنوات M3U
  const isM3uList =
    trimmed.startsWith('#EXTM3U') ||
    ((lower.includes('.m3u') || lower.includes('type=m3u') || lower.includes('output=m3u')) &&
      !lower.includes('.m3u8'));

  if (isM3uList) {
    return { mode: 'video', cleanUrl: trimmed, rawHtml: null, isM3uList: true };
  }

  // 3. إذا كان رابط فيديو مباشر أو بث HLS
  const isDirectStream =
    /\.(mp4|m3u8|webm|mkv|mov|ts|mp3|aac)(\?|#|$)/i.test(lower) ||
    lower.includes('.m3u8') ||
    lower.startsWith('blob:');

  if (isDirectStream) {
    return { mode: 'video', cleanUrl: trimmed, rawHtml: null, isM3uList: false };
  }

  // 4. أي رابط صفحة خارجية أو سيرفر تضمين يفتح في وضع Embed بسلاسة
  return { mode: 'embed', cleanUrl: trimmed, rawHtml: null, isM3uList: false };
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
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
  title = 'مشغل Enjoy',
  subtitle,
  url,
  src,
  embedCode,
  qualities = [],
  channels = [],
  forceLandscape = true,
  onClose,
}: EnjoyPlayerProps) {
  const initialRawInput = embedCode || url || src || '';
  const initialAnalysis = useMemo(() => analyzeMediaInput(initialRawInput), [initialRawInput]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);
  const progressBarRef = useRef<any>(null);

  // حالة المصدر والتشغيل
  const [sourceMode, setSourceMode] = useState<PlayerSourceMode>(initialAnalysis.mode);
  const [activeUrl, setActiveUrl] = useState<string>(initialAnalysis.cleanUrl);
  const [activeRawHtml, setActiveRawHtml] = useState<string | null>(initialAnalysis.rawHtml);
  const [activeTitle, setActiveTitle] = useState<string>(title);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [isLiveStream, setIsLiveStream] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // حالات الواجهة والنظام
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [unlockHintVisible, setUnlockHintVisible] = useState(false);
  const [aspectIndex, setAspectIndex] = useState(0);
  const [badgeText, setBadgeText] = useState<string | null>(null);
  const [seekRipple, setSeekRipple] = useState<'forward' | 'backward' | null>(null);

  // الجودات وقنوات M3U
  const [availableQualities, setAvailableQualities] = useState<VideoQualityOption[]>(qualities);
  const [selectedQualityIdx, setSelectedQualityIdx] = useState<number>(0);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  const [m3uChannels, setM3uChannels] = useState<M3UChannel[]>(channels);
  const [showChannelsDrawer, setShowChannelsDrawer] = useState(false);
  const [channelSearch, setChannelSearch] = useState('');

  // المراجع والمؤقتات
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unlockHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const badgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTime = useRef(0);
  const lastTapSide = useRef<'left' | 'center' | 'right'>('center');

  const showTempBadge = useCallback((text: string) => {
    setBadgeText(text);
    if (badgeTimer.current) clearTimeout(badgeTimer.current);
    badgeTimer.current = setTimeout(() => setBadgeText(null), 1400);
  }, []);

  // إخفاء وإظهار أشرطة نظام الهاتف (شريط الساعة والبطارية وأزرار التنقل)
  const syncSystemBars = useCallback(async (visible: boolean) => {
    try {
      const capStatusBar = getCapacitorPlugin('StatusBar');
      if (visible) {
        if (capStatusBar?.show) await capStatusBar.show();
      } else {
        if (capStatusBar?.hide) await capStatusBar.hide();
        if (typeof document !== 'undefined' && !document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        }
      }
    } catch {
      // تجاهل في المتصفح
    }
  }, []);

  // قفل الشاشة بالعرض تلقائياً فور فتح الفيلم أو المسلسل أو القناة
  const lockLandscapeOrientation = useCallback(async () => {
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

  const restoreDefaultOrientation = useCallback(async () => {
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

  // إخفاء أي مشغل أو iframe خلفي في الصفحة لمنع ظهوره تحت المشغل الجديد
  useEffect(() => {
    lockLandscapeOrientation();
    syncSystemBars(true);

    const hiddenElements: { el: HTMLElement; prevVisibility: string }[] = [];
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const rootNode = document.getElementById('enjoy-player-overlay');
      document.querySelectorAll('iframe, video').forEach((node) => {
        if (rootNode && rootNode.contains(node)) return;
        const htmlEl = node as HTMLElement;
        if (node.tagName === 'VIDEO') {
          try {
            (node as HTMLVideoElement).pause();
          } catch {}
        }
        hiddenElements.push({ el: htmlEl, prevVisibility: htmlEl.style.visibility });
        htmlEl.style.visibility = 'hidden';
      });
    }

    return () => {
      hiddenElements.forEach(({ el, prevVisibility }) => {
        el.style.visibility = prevVisibility;
      });
      restoreDefaultOrientation();
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
      if (unlockHintTimer.current) clearTimeout(unlockHintTimer.current);
      if (badgeTimer.current) clearTimeout(badgeTimer.current);
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    };
  }, [lockLandscapeOrientation, restoreDefaultOrientation, syncSystemBars]);

  const handleExitPlayer = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    restoreDefaultOrientation();
    if (onClose) onClose();
  }, [onClose, restoreDefaultOrientation]);

  // ربط زرار الرجوع في الهاتف بالمشغل لمنع خروج البرنامج نهائياً
  useEffect(() => {
    return registerBackInterceptor(() => {
      if (showChannelsDrawer) {
        setShowChannelsDrawer(false);
        return true;
      }
      if (showQualityMenu) {
        setShowQualityMenu(false);
        return true;
      }
      if (isLocked) {
        setUnlockHintVisible(true);
        if (unlockHintTimer.current) clearTimeout(unlockHintTimer.current);
        unlockHintTimer.current = setTimeout(() => setUnlockHintVisible(false), 2500);
        return true;
      }
      handleExitPlayer();
      return true;
    });
  }, [showChannelsDrawer, showQualityMenu, isLocked, handleExitPlayer]);

  // تحديث البيانات عند تغير الرابط القادم من الخارج
  useEffect(() => {
    const nextInput = embedCode || url || src || '';
    const parsed = analyzeMediaInput(nextInput);
    setActiveTitle(title);

    if (parsed.isM3uList) {
      let cancelled = false;
      (async () => {
        try {
          setIsBuffering(true);
          setErrorMsg(null);
          const rawText = parsed.cleanUrl.startsWith('#EXTM3U')
            ? parsed.cleanUrl
            : await (await fetch(parsed.cleanUrl)).text();
          const list = parseM3UPlaylist(rawText);
          if (!cancelled && list.length > 0) {
            setM3uChannels(list);
            const firstAnalysis = analyzeMediaInput(list[0].url);
            setSourceMode(firstAnalysis.mode);
            setActiveUrl(firstAnalysis.cleanUrl);
            setActiveRawHtml(firstAnalysis.rawHtml);
            setActiveTitle(list[0].name);
          } else if (!cancelled) {
            setErrorMsg('تعذر استخراج قنوات صالحة من رابط M3U');
            setIsBuffering(false);
          }
        } catch {
          if (!cancelled) {
            setErrorMsg('تعذر تحميل قائمة القنوات (تحقق من الاتصال أو الرابط)');
            setIsBuffering(false);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    } else {
      setSourceMode(parsed.mode);
      setActiveUrl(parsed.cleanUrl);
      setActiveRawHtml(parsed.rawHtml);
      if (channels.length > 0) setM3uChannels(channels);
      if (parsed.mode === 'embed') {
        setIsBuffering(false);
        setErrorMsg(null);
      }
    }
  }, [url, src, embedCode, title, channels]);

  // محرك تشغيل الفيديو المباشر وروابط M3U8 وتعدد الجودات
  useEffect(() => {
    if (Platform.OS !== 'web' || sourceMode !== 'video' || !videoRef.current || !activeUrl) {
      return;
    }

    const video = videoRef.current;
    let destroyed = false;

    setIsBuffering(true);
    setErrorMsg(null);
    setCurrentTime(0);
    setDuration(0);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHlsSource =
      activeUrl.toLowerCase().includes('.m3u8') || activeUrl.toLowerCase().includes('m3u8');

    const startPlayback = () => {
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    };

    if (isHlsSource) {
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
                label: 'تلقائي (Auto)',
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
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                hls.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                hls.recoverMediaError();
              } else {
                setErrorMsg('تعذر تشغيل البث المباشر حالياً');
                setIsBuffering(false);
              }
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = activeUrl;
          startPlayback();
        } else {
          setErrorMsg('المتصفح لا يدعم تشغيل بث M3U8');
          setIsBuffering(false);
        }
      });
    } else {
      video.src = activeUrl;
      if (qualities.length > 0) setAvailableQualities(qualities);
      startPlayback();
    }

    return () => {
      destroyed = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [sourceMode, activeUrl, qualities]);

  // إخفاء تلقائي لعناصر التحكم وأشرطة الهاتف بعد 4 ثوانٍ في وضع الفيديو المباشر
  const scheduleAutoHide = useCallback(() => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    if (sourceMode === 'embed') return;
    hideControlsTimer.current = setTimeout(() => {
      if (!showQualityMenu && !showChannelsDrawer) {
        setControlsVisible(false);
        syncSystemBars(false);
      }
    }, 4000);
  }, [sourceMode, showQualityMenu, showChannelsDrawer, syncSystemBars]);

  useEffect(() => {
    if (
      sourceMode === 'video' &&
      controlsVisible &&
      isPlaying &&
      !isLocked &&
      !showQualityMenu &&
      !showChannelsDrawer
    ) {
      scheduleAutoHide();
    } else if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }
  }, [
    sourceMode,
    controlsVisible,
    isPlaying,
    isLocked,
    showQualityMenu,
    showChannelsDrawer,
    scheduleAutoHide,
  ]);

  const seekBySeconds = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    const nextTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
    setSeekRipple(delta > 0 ? 'forward' : 'backward');
    setTimeout(() => setSeekRipple(null), 550);
  }, []);

  // لمسة واحدة تخفي كل شيء (بما فيها شريط الهاتف) ولمسة ثانية تظهرها + لمستين للتقديم/التأخير
  const handleSurfacePress = (evt: any) => {
    lockLandscapeOrientation();

    if (showQualityMenu || showChannelsDrawer) {
      setShowQualityMenu(false);
      setShowChannelsDrawer(false);
      return;
    }

    if (isLocked) {
      setUnlockHintVisible((prev) => !prev);
      if (unlockHintTimer.current) clearTimeout(unlockHintTimer.current);
      unlockHintTimer.current = setTimeout(() => setUnlockHintVisible(false), 3000);
      return;
    }

    const now = Date.now();
    const locationX = evt?.nativeEvent?.locationX ?? 200;
    const screenW = typeof window !== 'undefined' ? window.innerWidth : 800;
    const side: 'left' | 'center' | 'right' =
      locationX < screenW * 0.33 ? 'left' : locationX > screenW * 0.67 ? 'right' : 'center';

    if (
      sourceMode === 'video' &&
      now - lastTapTime.current < 260 &&
      side !== 'center' &&
      side === lastTapSide.current
    ) {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      lastTapTime.current = 0;
      seekBySeconds(side === 'right' ? 10 : -10);
      return;
    }

    lastTapTime.current = now;
    lastTapSide.current = side;

    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    singleTapTimer.current = setTimeout(() => {
      setControlsVisible((prev) => {
        const next = !prev;
        syncSystemBars(next);
        return next;
      });
    }, 230);
  };

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleSelectQuality = (index: number) => {
    const chosen = availableQualities[index];
    if (!chosen) return;
    setSelectedQualityIdx(index);
    setShowQualityMenu(false);
    showTempBadge(`الجودة: ${chosen.label}`);

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

  const cycleAspectRatio = () => {
    const nextIdx = (aspectIndex + 1) % ASPECT_MODES.length;
    setAspectIndex(nextIdx);
    showTempBadge(`الأبعاد: ${ASPECT_MODES[nextIdx].label}`);
  };

  const handleProgressBarPress = (evt: any) => {
    const video = videoRef.current;
    if (!video || !duration || isLiveStream) return;
    const touchX = evt?.nativeEvent?.locationX ?? 0;
    const barWidth =
      progressBarRef.current?.clientWidth ||
      (typeof window !== 'undefined' ? window.innerWidth - 48 : 300);
    const ratio = Math.max(0, Math.min(1, touchX / barWidth));
    const targetTime = ratio * duration;
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const currentAspect = ASPECT_MODES[aspectIndex];
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const bufferedPercent = duration > 0 ? Math.min(100, (bufferedEnd / duration) * 100) : 0;

  const filteredChannels = m3uChannels.filter(
    (ch) =>
      ch.name.toLowerCase().includes(channelSearch.toLowerCase()) ||
      (ch.group && ch.group.toLowerCase().includes(channelSearch.toLowerCase()))
  );

  return (
    <View nativeID="enjoy-player-overlay" style={styles.rootContainer}>
      <StatusBar hidden={!controlsVisible || isLocked} style="light" />

      {/* 1. طبقة العرض: إما فيديو مباشر/M3U8 أو مشغل التضمين Embed */}
      {Platform.OS === 'web' && sourceMode === 'video' && (
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted={isMuted}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => {
            setIsBuffering(false);
            setIsPlaying(true);
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
            // إذا فشل الرابط كفيديو مباشر وكان رابط HTTP، نحوله تلقائياً لوضع التضمين
            if (activeUrl && /^https?:\/\//i.test(activeUrl) && !activeUrl.includes('.m3u8')) {
              setSourceMode('embed');
              setIsBuffering(false);
              setErrorMsg(null);
            } else {
              setIsBuffering(false);
              setErrorMsg('تعذر تشغيل هذا الرابط حالياً');
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#000',
            objectFit: currentAspect.key === 'zoom' ? 'cover' : currentAspect.key,
            transform: currentAspect.key === 'zoom' ? 'scale(1.18)' : 'none',
            transition: 'transform 0.25s ease',
          }}
        />
      )}

      {Platform.OS === 'web' && sourceMode === 'embed' && (
        <View style={styles.embedStage}>
          <iframe
            src={activeRawHtml ? undefined : activeUrl}
            srcDoc={activeRawHtml || undefined}
            allowFullScreen
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            onLoad={() => setIsBuffering(false)}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              backgroundColor: '#000',
              transform:
                currentAspect.zoomScale > 1 ? `scale(${currentAspect.zoomScale})` : 'none',
              transition: 'transform 0.25s ease',
            }}
          />
        </View>
      )}

      {/* 2. طبقة استشعار اللمس (تغطي الفيديو بالكامل، وتُفعّل كدرع حماية فوق التضمين عند القفل) */}
      {(sourceMode === 'video' || isLocked) && (
        <Pressable style={styles.touchLayer} onPress={handleSurfacePress} />
      )}

      {/* 3. زر عائم صغير لإظهار/إخفاء الشريط في وضع التضمين حتى لا يمنع التفاعل مع المشغل المضمّن */}
      {sourceMode === 'embed' && !isLocked && (
        <Pressable
          style={styles.embedTogglePill}
          onPress={() => {
            setControlsVisible((prev) => {
              const next = !prev;
              syncSystemBars(next);
              return next;
            });
          }}
        >
          {controlsVisible ? (
            <EyeOff size={16} color="#FFF" />
          ) : (
            <Eye size={16} color="#FFF" />
          )}
        </Pressable>
      )}

      {/* مؤشر التحميل */}
      {isBuffering && !errorMsg && (
        <View pointerEvents="none" style={styles.centerOverlay}>
          <View style={styles.loaderPill}>
            <ActivityIndicator size="large" color="#E50914" />
            <Text style={styles.loaderText}>جاري التشغيل...</Text>
          </View>
        </View>
      )}

      {/* رسالة الخطأ */}
      {errorMsg && (
        <View style={styles.centerOverlay}>
          <View style={styles.errorCard}>
            <AlertCircle size={32} color="#FF5252" />
            <Text style={styles.errorTitle}>{errorMsg}</Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => {
                setErrorMsg(null);
                setActiveUrl((prev) => prev + '');
              }}
            >
              <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* تأثير التقديم والتأخير السريع */}
      {seekRipple && (
        <View
          pointerEvents="none"
          style={[
            styles.rippleBadge,
            seekRipple === 'forward' ? { right: 48 } : { left: 48 },
          ]}
        >
          {seekRipple === 'forward' ? (
            <RotateCw size={26} color="#FFF" />
          ) : (
            <RotateCcw size={26} color="#FFF" />
          )}
          <Text style={styles.rippleText}>
            {seekRipple === 'forward' ? '+10 ثوانٍ' : '-10 ثوانٍ'}
          </Text>
        </View>
      )}

      {/* شارة الإشعارات السريعة */}
      {badgeText && (
        <View pointerEvents="none" style={styles.topCenterBadge}>
          <Text style={styles.topCenterBadgeText}>{badgeText}</Text>
        </View>
      )}

      {/* زر فك القفل */}
      {isLocked && unlockHintVisible && (
        <View style={styles.unlockFloatingWrapper}>
          <Pressable
            style={styles.unlockButton}
            onPress={() => {
              setIsLocked(false);
              setControlsVisible(true);
              syncSystemBars(true);
              showTempBadge('تم فتح قفل الشاشة');
            }}
          >
            <Unlock size={20} color="#FFF" />
            <Text style={styles.unlockText}>اضغط لفتح القفل</Text>
          </Pressable>
        </View>
      )}

      {/* 4. واجهة التحكم الاحترافية */}
      {controlsVisible && !isLocked && (
        <View
          pointerEvents="box-none"
          style={[
            styles.controlsOverlay,
            sourceMode === 'embed' && { backgroundColor: 'transparent' },
          ]}
        >
          {/* الشريط العلوي (يظهر في وضع الفيديو ووضع التضمين) */}
          <View style={styles.topBar}>
            <View style={styles.topLeftGroup}>
              <Pressable style={styles.iconCircleBtn} onPress={handleExitPlayer}>
                <ArrowRight size={22} color="#FFF" />
              </Pressable>
              <View style={styles.titleBlock}>
                <Text numberOfLines={1} style={styles.videoTitle}>
                  {activeTitle}
                </Text>
                {subtitle ? (
                  <Text numberOfLines={1} style={styles.videoSubtitle}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.topRightGroup}>
              {m3uChannels.length > 0 && (
                <Pressable
                  style={styles.pillBtn}
                  onPress={() => setShowChannelsDrawer(true)}
                >
                  <Tv size={18} color="#FFF" />
                  <Text style={styles.pillBtnText}>القنوات ({m3uChannels.length})</Text>
                </Pressable>
              )}

              <Pressable style={styles.pillBtn} onPress={cycleAspectRatio}>
                <Maximize size={17} color="#FFF" />
                <Text style={styles.pillBtnText}>{currentAspect.label}</Text>
              </Pressable>

              <Pressable
                style={styles.iconCircleBtn}
                onPress={() => {
                  setIsLocked(true);
                  setControlsVisible(false);
                  setUnlockHintVisible(true);
                  syncSystemBars(false);
                  if (unlockHintTimer.current) clearTimeout(unlockHintTimer.current);
                  unlockHintTimer.current = setTimeout(() => setUnlockHintVisible(false), 2500);
                }}
              >
                <Lock size={20} color="#FFF" />
              </Pressable>
            </View>
          </View>

          {/* أزرار المنتصف والشريط السفلي (تظهر في وضع الفيديو المباشر و M3U8) */}
          {sourceMode === 'video' && (
            <>
              <View pointerEvents="box-none" style={styles.centerControlsRow}>
                {!isLiveStream && (
                  <Pressable style={styles.seekCircleBtn} onPress={() => seekBySeconds(-10)}>
                    <RotateCcw size={26} color="#FFF" />
                    <Text style={styles.seekSubLabel}>10</Text>
                  </Pressable>
                )}

                <Pressable style={styles.playPauseMainBtn} onPress={togglePlayPause}>
                  {isPlaying ? (
                    <Pause size={34} color="#FFF" fill="#FFF" />
                  ) : (
                    <Play size={34} color="#FFF" fill="#FFF" />
                  )}
                </Pressable>

                {!isLiveStream && (
                  <Pressable style={styles.seekCircleBtn} onPress={() => seekBySeconds(10)}>
                    <RotateCw size={26} color="#FFF" />
                    <Text style={styles.seekSubLabel}>10</Text>
                  </Pressable>
                )}
              </View>

              <View style={styles.bottomBar}>
                {!isLiveStream ? (
                  <View style={styles.progressSection}>
                    <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                    <Pressable
                      ref={progressBarRef}
                      style={styles.progressTrackHitArea}
                      onPress={handleProgressBarPress}
                    >
                      <View style={styles.progressTrackBg}>
                        <View
                          style={[styles.progressBuffered, { width: `${bufferedPercent}%` }]}
                        />
                        <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                      </View>
                      <View style={[styles.progressThumb, { left: `${progressPercent}%` }]} />
                    </Pressable>
                    <Text style={styles.timeText}>{formatTime(duration)}</Text>
                  </View>
                ) : (
                  <View style={styles.liveIndicatorRow}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveLabel}>بث مباشر LIVE</Text>
                  </View>
                )}

                <View style={styles.bottomActionsRow}>
                  <Pressable
                    style={styles.iconCircleBtn}
                    onPress={() => setIsMuted((m) => !m)}
                  >
                    {isMuted ? (
                      <VolumeX size={20} color="#FF5252" />
                    ) : (
                      <Volume2 size={20} color="#FFF" />
                    )}
                  </Pressable>

                  <View style={styles.bottomRightTools}>
                    {availableQualities.length > 0 && (
                      <Pressable
                        style={styles.pillBtn}
                        onPress={() => setShowQualityMenu((v) => !v)}
                      >
                        <Settings size={17} color="#FFF" />
                        <Text style={styles.pillBtnText}>
                          {availableQualities[selectedQualityIdx]?.label || 'الجودة'}
                        </Text>
                      </Pressable>
                    )}

                    <Pressable style={styles.pillBtn} onPress={cycleAspectRatio}>
                      <Maximize size={17} color="#FFF" />
                      <Text style={styles.pillBtnText}>{currentAspect.label}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </>
          )}
        </View>
      )}

      {/* قائمة اختيار الجودة */}
      {showQualityMenu && (
        <View style={styles.popoverCard}>
          <View style={styles.popoverHeader}>
            <Text style={styles.popoverTitle}>جودة الفيديو</Text>
            <Pressable onPress={() => setShowQualityMenu(false)}>
              <X size={20} color="#AAA" />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 220 }}>
            {availableQualities.map((q, idx) => {
              const active = idx === selectedQualityIdx;
              return (
                <Pressable
                  key={`${q.label}_${idx}`}
                  style={[styles.qualityRow, active && styles.qualityRowActive]}
                  onPress={() => handleSelectQuality(idx)}
                >
                  <Text style={[styles.qualityText, active && styles.qualityTextActive]}>
                    {q.label}
                  </Text>
                  {active && <Check size={18} color="#E50914" />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* درج قنوات M3U الجانبي */}
      {showChannelsDrawer && (
        <View style={styles.drawerOverlay}>
          <View style={styles.drawerPanel}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>القنوات المباشرة ({m3uChannels.length})</Text>
              <Pressable onPress={() => setShowChannelsDrawer(false)}>
                <X size={22} color="#FFF" />
              </Pressable>
            </View>

            <View style={styles.searchBox}>
              <Search size={16} color="#999" />
              <TextInput
                value={channelSearch}
                onChangeText={setChannelSearch}
                placeholder="ابحث عن قناة..."
                placeholderTextColor="#777"
                style={styles.searchInput}
              />
            </View>

            <ScrollView style={{ flex: 1 }}>
              {filteredChannels.map((ch) => {
                const isCurrent = ch.url === activeUrl;
                return (
                  <Pressable
                    key={ch.id}
                    style={[styles.channelItem, isCurrent && styles.channelItemActive]}
                    onPress={() => {
                      const chAnalysis = analyzeMediaInput(ch.url);
                      setSourceMode(chAnalysis.mode);
                      setActiveUrl(chAnalysis.cleanUrl);
                      setActiveRawHtml(chAnalysis.rawHtml);
                      setActiveTitle(ch.name);
                      setShowChannelsDrawer(false);
                      showTempBadge(`تم التشغيل: ${ch.name}`);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={styles.channelName}>
                        {ch.name}
                      </Text>
                      {ch.group ? <Text style={styles.channelGroup}>{ch.group}</Text> : null}
                    </View>
                    {isCurrent && <Play size={16} color="#E50914" fill="#E50914" />}
                  </Pressable>
                );
              })}
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
    backgroundColor: '#000000',
    zIndex: 99999,
  },
  embedStage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    overflow: 'hidden',
    zIndex: 1,
  },
  touchLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  embedTogglePill: {
    position: 'absolute',
    bottom: 18,
    left: 18,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(15, 17, 23, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 35,
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 15,
  },
  loaderPill: {
    backgroundColor: 'rgba(15, 17, 23, 0.88)',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    gap: 8,
  },
  loaderText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  errorCard: {
    backgroundColor: 'rgba(20, 22, 28, 0.96)',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  errorTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#E50914',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  rippleBadge: {
    position: 'absolute',
    top: '44%',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    zIndex: 20,
  },
  rippleText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  topCenterBadge: {
    position: 'absolute',
    top: 74,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 17, 23, 0.92)',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    zIndex: 30,
  },
  topCenterBadgeText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  unlockFloatingWrapper: {
    position: 'absolute',
    top: 24,
    left: 24,
    zIndex: 40,
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(229, 9, 20, 0.94)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  unlockText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.34)',
    zIndex: 12,
  },
  topBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  topLeftGroup: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  topRightGroup: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  titleBlock: {
    flex: 1,
    alignItems: 'flex-end',
  },
  videoTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
  videoSubtitle: {
    color: '#CCC',
    fontSize: 12,
    marginTop: 2,
  },
  iconCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  pillBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  centerControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 44,
  },
  seekCircleBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  seekSubLabel: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
    marginTop: -2,
  },
  playPauseMainBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(229, 9, 20, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    paddingHorizontal: 18,
    paddingBottom: 14,
    paddingTop: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    gap: 10,
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    minWidth: 46,
    textAlign: 'center',
  },
  progressTrackHitArea: {
    flex: 1,
    height: 24,
    justifyContent: 'center',
  },
  progressTrackBg: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    overflow: 'hidden',
  },
  progressBuffered: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  progressFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#E50914',
  },
  progressThumb: {
    position: 'absolute',
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: '#E50914',
    marginLeft: -7,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  liveIndicatorRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#E50914',
  },
  liveLabel: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  bottomActionsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bottomRightTools: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  popoverCard: {
    position: 'absolute',
    bottom: 76,
    left: 24,
    width: 220,
    backgroundColor: 'rgba(18, 20, 28, 0.97)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    zIndex: 45,
  },
  popoverHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  popoverTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  qualityRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  qualityRowActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.18)',
  },
  qualityText: {
    color: '#DDD',
    fontSize: 13,
    fontWeight: '600',
  },
  qualityTextActive: {
    color: '#FFF',
    fontWeight: '800',
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.58)',
    flexDirection: 'row',
    zIndex: 50,
  },
  drawerPanel: {
    width: 300,
    maxWidth: '82%',
    height: '100%',
    backgroundColor: 'rgba(14, 16, 22, 0.98)',
    padding: 16,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.12)',
  },
  drawerHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  drawerTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
  searchBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 13,
    textAlign: 'right',
  },
  channelItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 4,
  },
  channelItemActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.22)',
  },
  channelName: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  channelGroup: {
    color: '#999',
    fontSize: 11,
    textAlign: 'right',
    marginTop: 2,
  },
});

export default EnjoyPlayer;
