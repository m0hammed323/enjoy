import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  PanResponder,
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
  PanelRightOpen,
  Play,
  RefreshCw,
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
const DRAWER_WIDTH = Math.min(Math.round(SCREEN_WIDTH * 0.85), 360);

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

function DrawerThumb({ uri, name, isChannel }: { uri?: string; name: string; isChannel?: boolean }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const valid = Boolean(uri && /^https?:\/\//i.test(uri.trim()));
  const initials = name.trim().slice(0, 2).toUpperCase() || 'TV';

  if (valid && !failed) {
    return (
      <View style={styles.thumbFrame}>
        <Image
          source={{ uri: uri!.trim() }}
          style={styles.thumbImage}
          resizeMode={isChannel ? 'contain' : 'cover'}
          onError={() => setFailed(true)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.thumbFrame, styles.thumbFallback]}>
      <Text style={styles.thumbInitials}>{initials}</Text>
    </View>
  );
}

export function DrawerTriggerButton({ onPress }: { onPress?: () => void }) {
  const { openDrawer } = useDrawer();
  const { history } = useWatchHistory();
  const { favoriteIds, favoriteChannelIds } = useFavorites();
  const badgeCount = history.length + favoriteIds.length + favoriteChannelIds.length;

  return (
    <Pressable
      style={({ pressed }) => [styles.headerTriggerBtn, pressed && { opacity: 0.75 }]}
      onPress={onPress || (() => openDrawer())}
    >
      <PanelRightOpen size={20} color={Colors.textPrimary} />
      {badgeCount > 0 && <View style={styles.headerTriggerDot} />}
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
  const { config, channels, retry } = useConfig();
  const { isRTL, toggleLang } = useI18n();

  const [favFilter, setFavFilter] = useState<'all' | 'channels' | 'titles'>('all');
  const [confirmClear, setConfirmClear] = useState(false);
  const [rendered, setRendered] = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const totalFavorites = favoriteTitles.length + favoriteChannels.length;

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
      setRendered(true);
      setConfirmClear(false);
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 22,
        stiffness: 240,
        mass: 0.9,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 210,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
  }, [isOpen, slideAnim]);

  const edgePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 10,
        onPanResponderRelease: (_, gesture) => {
          if (isRTL && gesture.dx < -25) openDrawer();
          else if (!isRTL && gesture.dx > 25) openDrawer();
        },
      }),
    [isRTL, openDrawer]
  );

  const drawerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderRelease: (_, gesture) => {
          if (isRTL && gesture.dx > 40) closeDrawer();
          else if (!isRTL && gesture.dx < -40) closeDrawer();
        },
      }),
    [isRTL, closeDrawer]
  );

  const handleHistoryItemPress = (item: HistoryEntry) => {
    closeDrawer();
    const matchedTitle = getTitleById(item.titleId);
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
    outputRange: [isRTL ? DRAWER_WIDTH : -DRAWER_WIDTH, 0],
  });

  const backdropOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <>
      {!isOpen && (
        <View
          {...edgePanResponder.panHandlers}
          style={[
            styles.edgeHandleWrapper,
            isRTL ? styles.edgeHandleRight : styles.edgeHandleLeft,
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.edgeHandleTab,
              isRTL ? styles.edgeHandleTabRight : styles.edgeHandleTabLeft,
              pressed && { opacity: 0.9, transform: [{ scale: 0.96 }] },
            ]}
            onPress={() => openDrawer()}
          >
            <View style={styles.edgeGripBar} />
            <History size={13} color={Colors.primary} />
            {history.length + totalFavorites > 0 && (
              <Text style={styles.edgeHandleCount}>
                {history.length + totalFavorites}
              </Text>
            )}
          </Pressable>
        </View>
      )}

      {rendered && (
        <View style={styles.portalContainer} pointerEvents="box-none">
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
          </Animated.View>

          <Animated.View
            {...drawerPanResponder.panHandlers}
            style={[
              styles.drawerPanel,
              isRTL ? styles.drawerRight : styles.drawerLeft,
              {
                width: DRAWER_WIDTH,
                paddingTop: Math.max(insets.top, Spacing.md),
                paddingBottom: Math.max(insets.bottom, Spacing.md),
                transform: [{ translateX }],
              },
            ]}
          >
            {/* Brand Header */}
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
                      {config?.app_name || 'Enjoy TV'}
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

            {/* Quick Stats Strip */}
            <View style={styles.statsStrip}>
              <Pressable
                style={[styles.statCard, activeTab === 'history' && styles.statCardActive]}
                onPress={() => setActiveTab('history')}
              >
                <Text style={styles.statNumber}>{history.length}</Text>
                <Text style={styles.statLabel}>{isRTL ? 'مشاهدات' : 'Watched'}</Text>
              </Pressable>

              <Pressable
                style={[styles.statCard, activeTab === 'favorites' && styles.statCardActive]}
                onPress={() => setActiveTab('favorites')}
              >
                <Text style={styles.statNumber}>{totalFavorites}</Text>
                <Text style={styles.statLabel}>{isRTL ? 'مفضلة' : 'Favorites'}</Text>
              </Pressable>

              <Pressable
                style={styles.statCard}
                onPress={() => handleNavigate('/(tabs)/channels')}
              >
                <Text style={styles.statNumber}>{channels.length}</Text>
                <Text style={styles.statLabel}>{isRTL ? 'قناة' : 'Channels'}</Text>
              </Pressable>
            </View>

            {/* Primary Segmented Switcher */}
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

            {/* Content Area */}
            {activeTab === 'history' ? (
              <View style={styles.tabBody}>
                {history.length > 0 && (
                  <View style={styles.sectionToolbar}>
                    <Text style={styles.sectionHint}>
                      {isRTL ? `آخر ${history.length} مشاهدة` : `Last ${history.length} watched`}
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
                    history.map((item) => (
                      <View key={item.id} style={styles.mediaCard}>
                        <Pressable
                          style={styles.mediaCardMain}
                          onPress={() => handleHistoryItemPress(item)}
                        >
                          <DrawerThumb
                            uri={item.poster}
                            name={item.label}
                            isChannel={item.mediaType !== 'movie' && item.mediaType !== 'series'}
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
                    ))
                  )}
                </ScrollView>
              </View>
            ) : (
              <View style={styles.tabBody}>
                {/* Sub-filters for Favorites */}
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
                      {isRTL ? `الكل (${totalFavorites})` : `All (${totalFavorites})`}
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
                      {isRTL
                        ? `القنوات (${favoriteChannels.length})`
                        : `Channels (${favoriteChannels.length})`}
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
                      {isRTL
                        ? `الأفلام (${favoriteTitles.length})`
                        : `Movies (${favoriteTitles.length})`}
                    </Text>
                  </Pressable>
                </View>

                <ScrollView
                  style={styles.scrollArea}
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  {totalFavorites === 0 ? (
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
                              <DrawerThumb uri={ch.logo} name={ch.name} isChannel />
                              <View style={styles.mediaMeta}>
                                <Text style={styles.mediaTitle} numberOfLines={1}>
                                  {ch.name}
                                </Text>
                                <Text style={styles.mediaSubtitle} numberOfLines={1}>
                                  {ch.group} • {ch.qualities.length}{' '}
                                  {isRTL ? 'جودة' : 'quality'}
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
                              <DrawerThumb uri={title.poster} name={title.title} />
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

            {/* Quick Navigation & Tools Footer */}
            <View style={styles.drawerFooter}>
              <View style={styles.quickNavRow}>
                <Pressable
                  style={styles.quickNavBtn}
                  onPress={() => handleNavigate('/(tabs)')}
                >
                  <Home size={15} color={Colors.textSecondary} />
                  <Text style={styles.quickNavText}>{isRTL ? 'الرئيسية' : 'Home'}</Text>
                </Pressable>

                <Pressable
                  style={styles.quickNavBtn}
                  onPress={() => handleNavigate('/(tabs)/channels')}
                >
                  <Tv size={15} color={Colors.textSecondary} />
                  <Text style={styles.quickNavText}>{isRTL ? 'القنوات' : 'Live TV'}</Text>
                </Pressable>

                <Pressable
                  style={styles.quickNavBtn}
                  onPress={() => handleNavigate('/(tabs)/movies')}
                >
                  <Film size={15} color={Colors.textSecondary} />
                  <Text style={styles.quickNavText}>{isRTL ? 'الأفلام' : 'Movies'}</Text>
                </Pressable>
              </View>

              <View style={styles.footerActionsRow}>
                <Pressable style={styles.footerActionPill} onPress={toggleLang}>
                  <Globe size={14} color={Colors.primary} />
                  <Text style={styles.footerActionText}>
                    {isRTL ? 'English' : 'العربية'}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.footerActionPill}
                  onPress={() => {
                    closeDrawer();
                    retry();
                  }}
                >
                  <RefreshCw size={14} color={Colors.success} />
                  <Text style={styles.footerActionText}>
                    {isRTL ? 'تحديث القوائم' : 'Reload Lists'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </View>
      )}
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
    position: 'relative',
  },
  headerTriggerDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  edgeHandleWrapper: {
    position: 'absolute',
    top: '44%',
    zIndex: 900,
  },
  edgeHandleRight: { right: 0 },
  edgeHandleLeft: { left: 0 },
  edgeHandleTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(22, 22, 26, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    paddingVertical: 10,
    paddingHorizontal: 7,
  },
  edgeHandleTabRight: {
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    borderRightWidth: 0,
  },
  edgeHandleTabLeft: {
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    borderLeftWidth: 0,
  },
  edgeGripBar: {
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  edgeHandleCount: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '800',
  },
  portalContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.74)',
  },
  drawerPanel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: Colors.background,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: Spacing.md,
    justifyContent: 'space-between',
  },
  drawerRight: {
    right: 0,
    borderLeftWidth: 1,
  },
  drawerLeft: {
    left: 0,
    borderRightWidth: 1,
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
    width: 42,
    height: 42,
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
  statsStrip: {
    flexDirection: 'row',
    gap: Spacing.xs + 2,
    marginTop: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statCardActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(229, 9, 20, 0.08)',
  },
  statNumber: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '900',
  },
  statLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
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
    gap: 6,
    paddingVertical: 9,
    borderRadius: Radius.sm,
  },
  segmentBtnActive: {
    backgroundColor: Colors.primary,
  },
  segmentText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
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
    paddingHorizontal: 10,
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
  thumbFrame: {
    width: 44,
    height: 44,
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
  thumbFallback: {
    backgroundColor: 'rgba(229, 9, 20, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.35)',
  },
  thumbInitials: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '900',
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
    gap: 6,
  },
  quickNavBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 8,
    borderRadius: Radius.sm,
  },
  quickNavText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  footerActionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  footerActionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceLight,
    paddingVertical: 8,
    borderRadius: Radius.sm,
  },
  footerActionText: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
});
