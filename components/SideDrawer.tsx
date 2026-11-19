import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Clock,
  Film,
  Globe,
  Heart,
  History,
  Home,
  Menu,
  Play,
  Trash2,
  Tv,
  X,
} from 'lucide-react-native';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useDrawer } from '@/hooks/useDrawer';
import { useWatchHistory, HistoryEntry } from '@/hooks/useWatchHistory';
import { useFavorites, useFavoriteTitles, useFavoriteChannels } from '@/hooks/useFavorites';
import { useConfig } from '@/hooks/useConfig';
import { useI18n } from '@/hooks/useI18n';
import { openInEnjoyPlayer } from '@/utils/enjoyPlayerLauncher';
import { registerBackInterceptor } from '@/utils/backNavigation';
import { getTitleById } from '@/data/titles';
import { Channel, Title } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(Math.round(SCREEN_WIDTH * 0.84), 350);

function formatRelativeTime(timestamp: number, isRTL: boolean): string {
  const diffSec = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return isRTL ? 'الآن' : 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return isRTL ? `منذ ${diffMin} د` : `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return isRTL ? `منذ ${diffHr} س` : `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return isRTL ? 'أمس' : 'Yesterday';
  return isRTL ? `منذ ${diffDays} يوم` : `${diffDays}d ago`;
}

function DrawerThumb({
  uri,
  name,
  isChannel,
}: {
  uri?: string;
  name: string;
  isChannel?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (isChannel) {
    return (
      <View style={styles.channelThumbTile}>
        <Tv size={16} color={Colors.primary} />
        <Text style={styles.channelThumbName} numberOfLines={2}>
          {name}
        </Text>
      </View>
    );
  }

  const valid = Boolean(uri && /^https?:\/\//i.test(uri.trim()));

  if (valid && !failed) {
    return (
      <View style={styles.posterThumbFrame}>
        <Image
          source={{ uri: uri!.trim() }}
          style={styles.thumbImage}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.posterThumbFrame, styles.posterThumbFallback]}>
      <Film size={18} color={Colors.primary} />
    </View>
  );
}

export function DrawerTriggerButton({ onPress }: { onPress?: () => void }) {
  const { openDrawer } = useDrawer();

  return (
    <Pressable
      style={({ pressed }) => [styles.headerTriggerBtn, pressed && { opacity: 0.75 }]}
      onPress={onPress || (() => openDrawer())}
    >
      <Menu size={20} color={Colors.textPrimary} strokeWidth={2.4} />
    </Pressable>
  );
}

export function SideDrawer() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isOpen, activeTab, openDrawer, closeDrawer, setActiveTab } = useDrawer();
  const { history, removeFromHistory, clearHistory } = useWatchHistory();
  const { toggleFavorite, toggleChannelFavorite } = useFavorites();
  const favoriteTitles = useFavoriteTitles();
  const favoriteChannels = useFavoriteChannels();
  const { config, titles } = useConfig();
  const { isRTL, toggleLang } = useI18n();

  const [favFilter, setFavFilter] = useState<'all' | 'channels' | 'titles'>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const hasFavorites = favoriteTitles.length > 0 || favoriteChannels.length > 0;

  const titleLookup = useMemo(() => {
    const byId = new Map<string, Title>();
    const byName = new Map<string, Title>();
    titles.forEach((item) => {
      byId.set(item.id, item);
      byName.set(item.title.trim().toLowerCase(), item);
    });
    return { byId, byName };
  }, [titles]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const styleId = 'enjoy-viewport-lock-style';
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.textContent = `
        html, body, #root {
          background-color: #0B0F19 !important;
          overscroll-behavior: none !important;
          overflow-x: hidden !important;
        }
      `;
      document.head.appendChild(styleEl);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (isOpen) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const unregister = registerBackInterceptor(() => {
      if (isOpenRef.current) {
        closeDrawer();
        return true;
      }
      return false;
    }, 900);
    return unregister;
  }, [closeDrawer]);

  useEffect(() => {
    if (isOpen) {
      setConfirmClear(false);
    }
    Animated.timing(slideAnim, {
      toValue: isOpen ? 1 : 0,
      duration: isOpen ? 220 : 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [isOpen, slideAnim]);

  const drawerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < -45) closeDrawer();
        },
      }),
    [closeDrawer]
  );

  const handleHistoryItemPress = (item: HistoryEntry) => {
    closeDrawer();
    const matchedTitle =
      getTitleById(item.titleId) ||
      titleLookup.byId.get(item.titleId) ||
      titleLookup.byName.get(item.label.trim().toLowerCase());
    if (matchedTitle) {
      router.push(`/detail/${matchedTitle.id}` as never);
      return;
    }
    void openInEnjoyPlayer({
      url: item.url,
      title: item.label,
      subtitle: item.subtitle || '',
      titleId: item.titleId,
      episodeId: item.episodeId,
      poster: item.poster,
      mediaType: item.mediaType || 'channel',
    });
  };

  const handlePlayChannel = (channel: Channel) => {
    closeDrawer();
    const qualityLabel = channel.qualities[0]?.label || 'AUTO';
    void openInEnjoyPlayer({
      url: channel.streamUrl,
      title: channel.name,
      subtitle: `${channel.group} - ${qualityLabel}`,
      titleId: channel.id,
      poster: channel.logo,
      mediaType: 'channel',
    });
  };

  const handleOpenTitle = (title: Title) => {
    closeDrawer();
    router.push(`/detail/${title.id}` as never);
  };

  const handleNavigate = (path: string) => {
    closeDrawer();
    router.push(path as never);
  };

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-DRAWER_WIDTH - 12, 0],
  });

  const backdropOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const webFixedFull =
    Platform.OS === 'web'
      ? ({
          

cat << 'EOF' > components/SideDrawer.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Clock,
  Film,
  Globe,
  Heart,
  History,
  Home,
  Menu,
  Play,
  Trash2,
  Tv,
  X,
} from 'lucide-react-native';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useDrawer } from '@/hooks/useDrawer';
import { useWatchHistory, HistoryEntry } from '@/hooks/useWatchHistory';
import { useFavorites, useFavoriteTitles, useFavoriteChannels } from '@/hooks/useFavorites';
import { useConfig } from '@/hooks/useConfig';
import { useI18n } from '@/hooks/useI18n';
import { openInEnjoyPlayer } from '@/utils/enjoyPlayerLauncher';
import { registerBackInterceptor } from '@/utils/backNavigation';
import { getTitleById } from '@/data/titles';
import { Channel, Title } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(Math.round(SCREEN_WIDTH * 0.84), 350);

function formatRelativeTime(timestamp: number, isRTL: boolean): string {
  const diffSec = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return isRTL ? 'الآن' : 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return isRTL ? `منذ ${diffMin} د` : `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return isRTL ? `منذ ${diffHr} س` : `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return isRTL ? 'أمس' : 'Yesterday';
  return isRTL ? `منذ ${diffDays} يوم` : `${diffDays}d ago`;
}

function DrawerThumb({
  uri,
  name,
  isChannel,
}: {
  uri?: string;
  name: string;
  isChannel?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (isChannel) {
    return (
      <View style={styles.channelThumbTile}>
        <Tv size={16} color={Colors.primary} />
        <Text style={styles.channelThumbName} numberOfLines={2}>
          {name}
        </Text>
      </View>
    );
  }

  const valid = Boolean(uri && /^https?:\/\//i.test(uri.trim()));

  if (valid && !failed) {
    return (
      <View style={styles.posterThumbFrame}>
        <Image
          source={{ uri: uri!.trim() }}
          style={styles.thumbImage}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.posterThumbFrame, styles.posterThumbFallback]}>
      <Film size={18} color={Colors.primary} />
    </View>
  );
}

export function DrawerTriggerButton({ onPress }: { onPress?: () => void }) {
  const { openDrawer } = useDrawer();

  return (
    <Pressable
      style={({ pressed }) => [styles.headerTriggerBtn, pressed && { opacity: 0.75 }]}
      onPress={onPress || (() => openDrawer())}
    >
      <Menu size={20} color={Colors.textPrimary} strokeWidth={2.4} />
    </Pressable>
  );
}

export function SideDrawer() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isOpen, activeTab, openDrawer, closeDrawer, setActiveTab } = useDrawer();
  const { history, removeFromHistory, clearHistory } = useWatchHistory();
  const { toggleFavorite, toggleChannelFavorite } = useFavorites();
  const favoriteTitles = useFavoriteTitles();
  const favoriteChannels = useFavoriteChannels();
  const { config, titles } = useConfig();
  const { isRTL, toggleLang } = useI18n();

  const [favFilter, setFavFilter] = useState<'all' | 'channels' | 'titles'>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const hasFavorites = favoriteTitles.length > 0 || favoriteChannels.length > 0;

  const titleLookup = useMemo(() => {
    const byId = new Map<string, Title>();
    const byName = new Map<string, Title>();
    titles.forEach((item) => {
      byId.set(item.id, item);
      byName.set(item.title.trim().toLowerCase(), item);
    });
    return { byId, byName };
  }, [titles]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const styleId = 'enjoy-viewport-lock-style';
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.textContent = `
        html, body, #root {
          background-color: #0B0F19 !important;
          overscroll-behavior: none !important;
          overflow-x: hidden !important;
        }
      `;
      document.head.appendChild(styleEl);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (isOpen) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const unregister = registerBackInterceptor(() => {
      if (isOpenRef.current) {
        closeDrawer();
        return true;
      }
      return false;
    }, 900);
    return unregister;
  }, [closeDrawer]);

  useEffect(() => {
    if (isOpen) {
      setConfirmClear(false);
    }
    Animated.timing(slideAnim, {
      toValue: isOpen ? 1 : 0,
      duration: isOpen ? 220 : 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [isOpen, slideAnim]);

  const drawerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < -45) closeDrawer();
        },
      }),
    [closeDrawer]
  );

  const handleHistoryItemPress = (item: HistoryEntry) => {
    closeDrawer();
    const matchedTitle =
      getTitleById(item.titleId) ||
      titleLookup.byId.get(item.titleId) ||
      titleLookup.byName.get(item.label.trim().toLowerCase());
    if (matchedTitle) {
      router.push(`/detail/${matchedTitle.id}` as never);
      return;
    }
    void openInEnjoyPlayer({
      url: item.url,
      title: item.label,
      subtitle: item.subtitle || '',
      titleId: item.titleId,
      episodeId: item.episodeId,
      poster: item.poster,
      mediaType: item.mediaType || 'channel',
    });
  };

  const handlePlayChannel = (channel: Channel) => {
    closeDrawer();
    const qualityLabel = channel.qualities[0]?.label || 'AUTO';
    void openInEnjoyPlayer({
      url: channel.streamUrl,
      title: channel.name,
      subtitle: `${channel.group} - ${qualityLabel}`,
      titleId: channel.id,
      poster: channel.logo,
      mediaType: 'channel',
    });
  };

  const handleOpenTitle = (title: Title) => {
    closeDrawer();
    router.push(`/detail/${title.id}` as never);
  };

  const handleNavigate = (path: string) => {
    closeDrawer();
    router.push(path as never);
  };

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-DRAWER_WIDTH - 12, 0],
  });

  const backdropOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const webFixedFull =
    Platform.OS === 'web'
      ? ({
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          direction: 'ltr',
        } as unknown as object)
      : {};

  const webFixedBtn =
    Platform.OS === 'web'
      ? ({
          position: 'fixed',
          left: 16,
          direction: 'ltr',
        } as unknown as object)
      : {};

  return (
    <>
      <View
        pointerEvents={isOpen ? 'none' : 'auto'}
        style={[
          styles.topLeftBtnWrapper,
          webFixedBtn,
          { top: Math.max(insets.top, 10) + 6, opacity: isOpen ? 0 : 1 },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.topLeftMenuBtn,
            pressed && { opacity: 0.8 },
          ]}
          onPress={() => openDrawer()}
        >
          <Menu size={21} color="#FFFFFF" strokeWidth={2.4} />
        </Pressable>
      </View>

      <View
        style={[styles.portalContainer, webFixedFull]}
        pointerEvents={isOpen ? 'auto' : 'none'}
      >
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
        </Animated.View>

        <Animated.View
          {...drawerPanResponder.panHandlers}
          style={[
            styles.drawerPanel,
            {
              width: DRAWER_WIDTH,
              paddingTop: Math.max(insets.top, Spacing.md),
              paddingBottom: Math.max(insets.bottom, Spacing.md),
              transform: [{ translateX }],
            },
          ]}
        >
          <View style={styles.drawerHeader}>
            <View style={styles.brandRow}>
              <View style={styles.brandLogoBox}>
                {config?.app_icon ? (
                  <Image source={{ uri: config.app_icon }} style={styles.brandLogoImg} resizeMode="cover" />
                ) : (
                  <Tv size={20} color="#FFFFFF" />
                )}
              </View>
              <View style={styles.brandTextCol}>
                <View style={styles.brandTitleRow}>
                  <Text style={styles.brandName} numberOfLines={1}>
                    {config?.app_name || 'Enjoy'}
                  </Text>
                  <View style={styles.versionBadge}>
                    <Text style={styles.versionText}>v{config?.app_version || '1.0'}</Text>
                  </View>
                </View>
                <Text style={styles.brandTagline}>
                  {isRTL ? 'مركز المشاهدة السريع' : 'Quick Watch Hub'}
                </Text>
              </View>
            </View>

            <Pressable style={styles.closeBtn} onPress={closeDrawer}>
              <X size={18} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.segmentContainer}>
            <Pressable
              style={[styles.segmentBtn, activeTab === 'history' && styles.segmentBtnActive]}
              onPress={() => setActiveTab('history')}
            >
              <History
                size={15}
                color={activeTab === 'history' ? '#FFFFFF' : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.segmentText,
                  activeTab === 'history' && styles.segmentTextActive,
                ]}
              >
                {isRTL ? 'المشاهدات السابقة' : 'Watch History'}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.segmentBtn, activeTab === 'favorites' && styles.segmentBtnActive]}
              onPress={() => setActiveTab('favorites')}
            >
              <Heart
                size={15}
                color={activeTab === 'favorites' ? '#FFFFFF' : Colors.textSecondary}
                fill={activeTab === 'favorites' ? '#FFFFFF' : 'transparent'}
              />
              <Text
                style={[
                  styles.segmentText,
                  activeTab === 'favorites' && styles.segmentTextActive,
                ]}
              >
                {isRTL ? 'المفضلة' : 'Favorites'}
              </Text>
            </Pressable>
          </View>

          {activeTab === 'history' ? (
            <View style={styles.tabBody}>
              {history.length > 0 && (
                <View style={styles.sectionToolbar}>
                  <Text style={styles.sectionHint}>
                    {isRTL ? 'سجل المشاهدة' : 'Recent History'}
                  </Text>
                  {confirmClear ? (
                    <View style={styles.confirmRow}>
                      <Pressable
                        style={styles.confirmYesBtn}
                        onPress={() => {
                          clearHistory();
                          setConfirmClear(false);
                        }}
                      >
                        <Text style={styles.confirmYesText}>
                          {isRTL ? 'تأكيد المسح' : 'Confirm'}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={styles.confirmNoBtn}
                        onPress={() => setConfirmClear(false)}
                      >
                        <Text style={styles.confirmNoText}>
                          {isRTL ? 'إلغاء' : 'Cancel'}
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      style={styles.clearBtn}
                      onPress={() => setConfirmClear(true)}
                    >
                      <Trash2 size={13} color={Colors.error} />
                      <Text style={styles.clearBtnText}>
                        {isRTL ? 'مسح السجل' : 'Clear'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}

              <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
              >
                {history.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <View style={styles.emptyIconCircle}>
                      <Clock size={28} color={Colors.textMuted} />
                    </View>
                    <Text style={styles.emptyTitle}>
                      {isRTL ? 'لا توجد مشاهدات سابقة بعد' : 'No watch history yet'}
                    </Text>
                    <Text style={styles.emptySub}>
                      {isRTL
                        ? 'أي قناة أو فيلم تقوم بتشغيله سيظهر هنا تلقائيًا للوصول السريع'
                        : 'Any channel or movie you play will appear here automatically'}
                    </Text>
                  </View>
                ) : (
                  history.map((item) => {
                    const matchedTitle =
                      getTitleById(item.titleId) ||
                      titleLookup.byId.get(item.titleId) ||
                      titleLookup.byName.get(item.label.trim().toLowerCase());
                    const isChannel =
                      item.mediaType === 'channel' ||
                      (!matchedTitle && item.mediaType !== 'movie' && item.mediaType !== 'series');
                    const resolvedPoster =
                      item.poster || matchedTitle?.poster || matchedTitle?.backdrop;

                    return (
                      <View key={item.id} style={styles.mediaCard}>
                        <Pressable
                          style={styles.mediaCardMain}
                          onPress={() => handleHistoryItemPress(item)}
                        >
                          <DrawerThumb
                            uri={resolvedPoster}
                            name={item.label}
                            isChannel={isChannel}
                          />
                          <View style={styles.mediaMeta}>
                            <Text style={styles.mediaTitle} numberOfLines={1}>
                              {item.label}
                            </Text>
                            {Boolean(item.subtitle) && (
                              <Text style={styles.mediaSubtitle} numberOfLines={1}>
                                {item.subtitle}
                              </Text>
                            )}
                            <View style={styles.mediaTimeRow}>
                              <Clock size={10} color={Colors.textMuted} />
                              <Text style={styles.mediaTimeText}>
                                {formatRelativeTime(item.timestamp, isRTL)}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.playMiniBtn}>
                            <Play size={13} color={Colors.primary} fill={Colors.primary} />
                          </View>
                        </Pressable>

                        <Pressable
                          style={styles.removeMiniBtn}
                          onPress={() => removeFromHistory(item.id)}
                        >
                          <X size={14} color={Colors.textMuted} />
                        </Pressable>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          ) : (
            <View style={styles.tabBody}>
              <View style={styles.favFilterRow}>
                <Pressable
                  style={[styles.filterChip, favFilter === 'all' && styles.filterChipActive]}
                  onPress={() => setFavFilter('all')}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      favFilter === 'all' && styles.filterChipTextActive,
                    ]}
                  >
                    {isRTL ? 'الكل' : 'All'}
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.filterChip, favFilter === 'channels' && styles.filterChipActive]}
                  onPress={() => setFavFilter('channels')}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      favFilter === 'channels' && styles.filterChipTextActive,
                    ]}
                  >
                    {isRTL ? 'القنوات' : 'Channels'}
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.filterChip, favFilter === 'titles' && styles.filterChipActive]}
                  onPress={() => setFavFilter('titles')}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      favFilter === 'titles' && styles.filterChipTextActive,
                    ]}
                  >
                    {isRTL ? 'الأفلام' : 'Movies'}
                  </Text>
                </Pressable>
              </View>

              <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
              >
                {!hasFavorites ? (
                  <View style={styles.emptyBox}>
                    <View style={styles.emptyIconCircle}>
                      <Heart size={28} color={Colors.textMuted} />
                    </View>
                    <Text style={styles.emptyTitle}>
                      {isRTL ? 'قائمة المفضلة فارغة' : 'No favorites yet'}
                    </Text>
                    <Text style={styles.emptySub}>
                      {isRTL
                        ? 'اضغط على أيقونة القلب بجانب أي قناة أو فيلم لحفظه هنا'
                        : 'Tap the heart icon on any channel or movie to save it here'}
                    </Text>
                  </View>
                ) : (
                  <>
                    {(favFilter === 'all' || favFilter === 'channels') &&
                      favoriteChannels.map((ch) => (
                        <View key={ch.id} style={styles.mediaCard}>
                          <Pressable
                            style={styles.mediaCardMain}
                            onPress={() => handlePlayChannel(ch)}
                          >
                            <DrawerThumb name={ch.name} isChannel />
                            <View style={styles.mediaMeta}>
                              <Text style={styles.mediaTitle} numberOfLines={1}>
                                {ch.name}
                              </Text>
                              <Text style={styles.mediaSubtitle} numberOfLines={1}>
                                {ch.group}
                              </Text>
                            </View>
                            <View style={styles.playMiniBtn}>
                              <Play size={13} color={Colors.primary} fill={Colors.primary} />
                            </View>
                          </Pressable>

                          <Pressable
                            style={styles.removeMiniBtn}
                            onPress={() => toggleChannelFavorite(ch.id)}
                          >
                            <Heart size={14} color={Colors.primary} fill={Colors.primary} />
                          </Pressable>
                        </View>
                      ))}

                    {(favFilter === 'all' || favFilter === 'titles') &&
                      favoriteTitles.map((title) => (
                        <View key={title.id} style={styles.mediaCard}>
                          <Pressable
                            style={styles.mediaCardMain}
                            onPress={() => handleOpenTitle(title)}
                          >
                            <DrawerThumb uri={title.poster || title.backdrop} name={title.title} />
                            <View style={styles.mediaMeta}>
                              <Text style={styles.mediaTitle} numberOfLines={1}>
                                {title.title}
                              </Text>
                              <Text style={styles.mediaSubtitle} numberOfLines={1}>
                                {title.type === 'series'
                                  ? isRTL
                                    ? 'مسلسل'
                                    : 'Series'
                                  : isRTL
                                  ? 'فيلم'
                                  : 'Movie'}{' '}
                                • {title.year}
                              </Text>
                            </View>
                            <View style={styles.playMiniBtn}>
                              <Film size={13} color={Colors.primary} />
                            </View>
                          </Pressable>

                          <Pressable
                            style={styles.removeMiniBtn}
                            onPress={() => toggleFavorite(title.id)}
                          >
                            <Heart size={14} color={Colors.primary} fill={Colors.primary} />
                          </Pressable>
                        </View>
                      ))}
                  </>
                )}
              </ScrollView>
            </View>
          )}

          <View style={styles.drawerFooter}>
            <View style={styles.quickNavRow}>
              <Pressable
                style={styles.quickNavBtn}
                onPress={() => handleNavigate('/(tabs)')}
              >
                <Home size={14} color={Colors.textSecondary} />
                <Text style={styles.quickNavText}>{isRTL ? 'الرئيسية' : 'Home'}</Text>
              </Pressable>

              <Pressable
                style={styles.quickNavBtn}
                onPress={() => handleNavigate('/(tabs)/channels')}
              >
                <Tv size={14} color={Colors.textSecondary} />
                <Text style={styles.quickNavText}>{isRTL ? 'القنوات' : 'Live TV'}</Text>
              </Pressable>

              <Pressable
                style={styles.quickNavBtn}
                onPress={() => handleNavigate('/(tabs)/movies')}
              >
                <Film size={14} color={Colors.textSecondary} />
                <Text style={styles.quickNavText}>{isRTL ? 'الأفلام' : 'Movies'}</Text>
              </Pressable>
            </View>

            <Pressable style={styles.langSwitchBtn} onPress={toggleLang}>
              <Globe size={15} color={Colors.primary} />
              <Text style={styles.langSwitchText}>
                {isRTL ? 'تغيير اللغة إلى English' : 'Switch to العربية'}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  headerTriggerBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topLeftBtnWrapper: {
    position: 'absolute',
    left: 16,
    zIndex: 950,
  },
  topLeftMenuBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(20, 20, 24, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    overflow: 'hidden',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.76)',
  },
  drawerPanel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: Colors.background,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: Spacing.md,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  brandLogoBox: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandLogoImg: {
    width: '100%',
    height: '100%',
  },
  brandTextCol: {
    flex: 1,
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandName: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '900',
  },
  versionBadge: {
    backgroundColor: 'rgba(229, 9, 20, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.4)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.pill,
  },
  versionText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '800',
  },
  brandTagline: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.md,
    padding: 4,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: Radius.sm,
  },
  segmentBtnActive: {
    backgroundColor: Colors.primary,
  },
  segmentText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  tabBody: {
    flex: 1,
    marginTop: Spacing.sm,
  },
  sectionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
    marginBottom: 4,
  },
  sectionHint: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  clearBtnText: {
    color: Colors.error,
    fontSize: 11,
    fontWeight: '700',
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  confirmYesBtn: {
    backgroundColor: Colors.error,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  confirmYesText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  confirmNoBtn: {
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  confirmNoText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  favFilterRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: Spacing.xs,
    marginBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.16)',
    borderColor: Colors.primary,
  },
  filterChipText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: Spacing.xs,
    gap: Spacing.xs + 2,
  },
  mediaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 7,
  },
  mediaCardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  posterThumbFrame: {
    width: 44,
    height: 60,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceLight,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  posterThumbFallback: {
    backgroundColor: 'rgba(229, 9, 20, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.32)',
  },
  channelThumbTile: {
    width: 56,
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.3)',
    paddingHorizontal: 4,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  channelThumbName: {
    color: Colors.textPrimary,
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 11,
  },
  mediaMeta: {
    flex: 1,
  },
  mediaTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  mediaSubtitle: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  mediaTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  mediaTimeText: {
    color: Colors.textMuted,
    fontSize: 10,
  },
  playMiniBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(229, 9, 20, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeMiniBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.md,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySub: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
  },
  drawerFooter: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
    gap: Spacing.xs + 2,
  },
  quickNavRow: {
    flexDirection: 'row',
    gap: 5,
  },
  quickNavBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: Radius.sm,
  },
  quickNavText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  langSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceLight,
    paddingVertical: 9,
    borderRadius: Radius.sm,
  },
  langSwitchText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
});
