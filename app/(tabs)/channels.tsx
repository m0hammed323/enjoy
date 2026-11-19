import { useMemo, useState, useCallback, useEffect } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Tv, Play, Search, Layers, Copy, Check, Heart } from 'lucide-react-native';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useConfig } from '@/hooks/useConfig';
import { useI18n } from '@/hooks/useI18n';
import { useFavorites } from '@/hooks/useFavorites';
import { Channel, ChannelQuality } from '@/types';
import { openInEnjoyPlayer } from '@/utils/enjoyPlayerLauncher';
import { useCopyLink } from '@/hooks/useCopyLink';
import { DrawerTriggerButton } from '@/components/SideDrawer';

const { width: screenWidth } = Dimensions.get('window');
const NUM_COLUMNS = screenWidth < 480 ? 3 : screenWidth < 768 ? 4 : 6;
const CARD_GAP = Spacing.sm;
const CARD_WIDTH = Math.floor((screenWidth - Spacing.lg * 2 - CARD_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS);
const CARD_HEIGHT = Math.floor(CARD_WIDTH * 1.15);

const AVATAR_PALETTE = [
  { bg: 'rgba(229, 9, 20, 0.18)', border: 'rgba(229, 9, 20, 0.45)', text: '#FF4D5A' },
  { bg: 'rgba(59, 130, 246, 0.18)', border: 'rgba(59, 130, 246, 0.45)', text: '#60A5FA' },
  { bg: 'rgba(16, 185, 129, 0.18)', border: 'rgba(16, 185, 129, 0.45)', text: '#34D399' },
  { bg: 'rgba(168, 85, 247, 0.18)', border: 'rgba(168, 85, 247, 0.45)', text: '#C084FC' },
  { bg: 'rgba(245, 158, 11, 0.18)', border: 'rgba(245, 158, 11, 0.45)', text: '#FBBF24' },
  { bg: 'rgba(6, 182, 212, 0.18)', border: 'rgba(6, 182, 212, 0.45)', text: '#22D3EE' },
];

function getChannelMonogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || 'TV';
}

function getAvatarTheme(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function getQualityDescription(label: string): string {
  const base = label.split(' ')[0];
  switch (base) {
    case '4K': return 'Ultra HD 2160p • أعلى دقة';
    case 'FHD': return 'Full HD 1080p • دقة عالية جدًا';
    case 'HD': return 'HD 720p • دقة عالية';
    case '720p': return 'HD 720p • بث مستقر';
    case 'SD': return 'SD 480p • دقة متوسطة';
    case '480p': return '480p • استهلاك متوسط';
    case 'LOW': return 'توفير البيانات • للإنترنت الضعيف';
    default: return 'بث مباشر تلقائي';
  }
}

function ChannelLogo({ logo, name, size = 'card' }: { logo?: string; name: string; size?: 'card' | 'sheet' }) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [logo]);

  const isValidUri = Boolean(logo && /^https?:\/\//i.test(logo.trim()));
  const avatarTheme = useMemo(() => getAvatarTheme(name), [name]);
  const monogram = useMemo(() => getChannelMonogram(name), [name]);

  if (isValidUri && !imgError) {
    return (
      <View style={size === 'card' ? styles.logoInnerPlate : styles.sheetLogoInnerPlate}>
        <Image
          source={{ uri: logo!.trim() }}
          style={styles.cardLogo}
          resizeMode="contain"
          onError={() => setImgError(true)}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.monogramBox,
        { backgroundColor: avatarTheme.bg, borderColor: avatarTheme.border },
      ]}
    >
      <Text
        style={[
          size === 'card' ? styles.monogramText : styles.sheetMonogramText,
          { color: avatarTheme.text },
        ]}
        numberOfLines={1}
      >
        {monogram}
      </Text>
      <View style={styles.monogramTvTag}>
        <Tv size={size === 'card' ? 10 : 12} color={avatarTheme.text} />
      </View>
    </View>
  );
}

export default function ChannelsScreen() {
  const { channels, status } = useConfig();
  const { t } = useI18n();
  const { isChannelFavorite, toggleChannelFavorite } = useFavorites();
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [qualityModalChannel, setQualityModalChannel] = useState<Channel | null>(null);
  const { copiedId, copyLink } = useCopyLink();

  const groups = useMemo(
    () => Array.from(new Set(channels.map((c) => c.group).filter(Boolean))),
    [channels]
  );

  const filtered = useMemo(() => {
    let list = channels;
    if (activeGroup) list = list.filter((c) => c.group === activeGroup);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [channels, activeGroup, searchQuery]);

  const handlePlay = useCallback((channel: Channel, quality?: ChannelQuality) => {
    const url = quality?.url || channel.streamUrl;
    const qualityLabel = quality?.label || (channel.qualities.length > 1 ? 'AUTO' : channel.qualities[0]?.label || '');
    void openInEnjoyPlayer({
      url,
      title: channel.name,
      subtitle: `${channel.group} - ${qualityLabel}`,
      titleId: channel.id,
      poster: channel.logo,
      mediaType: 'channel',
    });
    setQualityModalChannel(null);
  }, []);

  const handleChannelPress = useCallback((channel: Channel) => {
    if (channel.qualities.length > 1) {
      setQualityModalChannel(channel);
    } else {
      handlePlay(channel);
    }
  }, [handlePlay]);

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>{t('channelsLoading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderChannelCard = ({ item }: { item: Channel }) => {
    const hasMultiQuality = item.qualities.length > 1;
    const primaryQuality = item.qualities[0]?.label;
    const fav = isChannelFavorite(item.id);

    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => handleChannelPress(item)}
      >
        <View style={styles.cardLogoContainer}>
          <ChannelLogo logo={item.logo} name={item.name} size="card" />

          <Pressable
            style={styles.favHeartBtn}
            onPress={(e) => {
              e.stopPropagation();
              toggleChannelFavorite(item.id);
            }}
          >
            <Heart
              size={12}
              color={fav ? Colors.primary : Colors.textSecondary}
              fill={fav ? Colors.primary : 'transparent'}
            />
          </Pressable>

          {hasMultiQuality ? (
            <View style={styles.multiQualityBadge}>
              <Layers size={9} color={Colors.textPrimary} />
              <Text style={styles.multiQualityText}>{item.qualities.length}</Text>
            </View>
          ) : (
            primaryQuality && primaryQuality !== 'AUTO' && (
              <View style={styles.singleQualityBadge}>
                <Text style={styles.singleQualityText}>{primaryQuality}</Text>
              </View>
            )
          )}

          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{t('live')}</Text>
          </View>
        </View>

        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.cardGroup} numberOfLines={1}>{item.group}</Text>
        </View>

        {hasMultiQuality && (
          <View style={styles.qualityRow}>
            {item.qualities.slice(0, 3).map((q, idx) => (
              <View key={`${q.label}-${idx}`} style={styles.qualityTag}>
                <Text style={styles.qualityTagText}>{q.label}</Text>
              </View>
            ))}
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.stickyHeader}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextCol}>
            <Text style={styles.title}>{t('channels')}</Text>
            <Text style={styles.subtitle}>
              {filtered.length !== channels.length
                ? `${filtered.length} / ${channels.length} ${t('channels')}`
                : `${channels.length} ${t('channels')}`}
            </Text>
          </View>
          <DrawerTriggerButton />
        </View>

        <View style={styles.searchBar}>
          <Search size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('searchPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {groups.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupScroll}>
            <Pressable style={[styles.groupPill, activeGroup === null && styles.groupPillActive]} onPress={() => setActiveGroup(null)}>
              <Text style={[styles.groupPillText, activeGroup === null && styles.groupPillTextActive]}>{t('allChannels')}</Text>
            </Pressable>
            {groups.map((g) => (
              <Pressable key={g} style={[styles.groupPill, activeGroup === g && styles.groupPillActive]} onPress={() => setActiveGroup(g)}>
                <Text style={[styles.groupPillText, activeGroup === g && styles.groupPillTextActive]}>{g}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {channels.length === 0 ? (
        <View style={styles.centerContent}>
          <Tv size={56} color={Colors.textMuted} strokeWidth={1.5} />
          <Text style={styles.emptyText}>{t('noChannels')}</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>{t('noResults')}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderChannelCard}
          numColumns={NUM_COLUMNS}
          columnWrapperStyle={{ gap: CARD_GAP }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: CARD_GAP }} />}
        />
      )}

      <Modal visible={qualityModalChannel !== null} transparent animationType="slide" onRequestClose={() => setQualityModalChannel(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setQualityModalChannel(null)}>
          <Pressable style={styles.qualitySheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetLogoContainer}>
                {qualityModalChannel && (
                  <ChannelLogo logo={qualityModalChannel.logo} name={qualityModalChannel.name} size="sheet" />
                )}
              </View>
              <View style={styles.sheetTitleContainer}>
                <Text style={styles.sheetTitle} numberOfLines={1}>{qualityModalChannel?.name}</Text>
                <Text style={styles.sheetSubtitle} numberOfLines={1}>
                  {qualityModalChannel?.group} • {qualityModalChannel?.qualities.length} جودات متاحة
                </Text>
              </View>
              {qualityModalChannel && (
                <Pressable
                  style={styles.sheetFavBtn}
                  onPress={() => toggleChannelFavorite(qualityModalChannel.id)}
                >
                  <Heart
                    size={20}
                    color={isChannelFavorite(qualityModalChannel.id) ? Colors.primary : Colors.textSecondary}
                    fill={isChannelFavorite(qualityModalChannel.id) ? Colors.primary : 'transparent'}
                  />
                </Pressable>
              )}
            </View>
            <Text style={styles.sheetLabel}>{t('selectStreamQuality')}</Text>
            <ScrollView style={styles.qualityList}>
              {qualityModalChannel?.qualities.map((q, idx) => {
                const copyItemId = `quality-${idx}`;
                const isCopied = copiedId === copyItemId;
                return (
                  <View key={`${q.label}-${idx}`} style={styles.qualityOptionRow}>
                    <Pressable style={styles.qualityOption} onPress={() => qualityModalChannel && handlePlay(qualityModalChannel, q)}>
                      <View style={styles.qualityOptionLeft}>
                        <View style={styles.qualityIconCircle}><Layers size={16} color={Colors.primary} /></View>
                        <View>
                          <Text style={styles.qualityOptionLabel}>{q.label}</Text>
                          <Text style={styles.qualityOptionDesc}>{getQualityDescription(q.label)}</Text>
                        </View>
                      </View>
                      <Play size={18} color={Colors.primary} fill={Colors.primary} />
                    </Pressable>
                    <Pressable style={styles.copyBtn} onPress={() => copyLink(q.url, copyItemId)}>
                      {isCopied ? <Check size={16} color={Colors.success} /> : <Copy size={16} color={Colors.textMuted} />}
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
            <Pressable style={styles.sheetCloseBtn} onPress={() => setQualityModalChannel(null)}>
              <Text style={styles.sheetCloseText}>{t('close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  stickyHeader: { zIndex: 50, backgroundColor: Colors.background },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerTextCol: { flex: 1 },
  title: { color: Colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '800' },
  subtitle: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 2 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.lg, paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceLight, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, height: 44, marginBottom: Spacing.md,
  },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md },
  groupScroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.sm },
  groupPill: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.pill, backgroundColor: Colors.surfaceLight, borderWidth: 1, borderColor: Colors.border },
  groupPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  groupPillText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
  groupPillTextActive: { color: Colors.textPrimary, fontWeight: '700' },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  card: {
    width: CARD_WIDTH, backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.xs + 2, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  cardLogoContainer: {
    width: '100%', height: CARD_HEIGHT * 0.62, borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceLight, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', position: 'relative',
  },
  logoInnerPlate: {
    width: '86%', height: '82%', borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.07)',
    padding: 6, alignItems: 'center', justifyContent: 'center',
  },
  sheetLogoInnerPlate: {
    width: '100%', height: '100%',
    backgroundColor: 'rgba(255,255,255,0.07)',
    padding: 6, alignItems: 'center', justifyContent: 'center',
  },
  cardLogo: { width: '100%', height: '100%' },
  monogramBox: {
    width: '82%', height: '78%', borderRadius: Radius.sm,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  monogramText: { fontSize: FontSize.md, fontWeight: '900', letterSpacing: 0.5 },
  sheetMonogramText: { fontSize: FontSize.lg, fontWeight: '900', letterSpacing: 0.5 },
  monogramTvTag: { position: 'absolute', bottom: 3, right: 4, opacity: 0.75 },
  favHeartBtn: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  multiQualityBadge: {
    position: 'absolute', top: 4, right: 4, flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: Colors.primary, paddingHorizontal: 5, paddingVertical: 2, borderRadius: Radius.sm,
  },
  multiQualityText: { color: Colors.textPrimary, fontSize: 9, fontWeight: '800' },
  singleQualityBadge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.72)', paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: Radius.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  singleQualityText: { color: Colors.textSecondary, fontSize: 8, fontWeight: '800' },
  liveBadge: {
    position: 'absolute', bottom: 4, left: 4, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: Radius.sm,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.error },
  liveText: { color: Colors.textPrimary, fontSize: 8, fontWeight: '800' },
  cardInfo: { width: '100%', paddingHorizontal: Spacing.xs, paddingTop: Spacing.xs + 2, alignItems: 'center' },
  cardName: { color: Colors.textPrimary, fontSize: FontSize.xs, fontWeight: '700', textAlign: 'center' },
  cardGroup: { color: Colors.textMuted, fontSize: 9, marginTop: 1, textAlign: 'center' },
  qualityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, paddingTop: Spacing.xs, justifyContent: 'center' },
  qualityTag: { backgroundColor: Colors.surfaceLighter, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  qualityTagText: { color: Colors.textSecondary, fontSize: 8, fontWeight: '700' },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 100 },
  loadingText: { color: Colors.textMuted, fontSize: FontSize.md, marginTop: Spacing.md },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.md, marginTop: Spacing.md },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  qualitySheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.sm, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl, maxHeight: '70%',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.md },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.lg },
  sheetLogoContainer: { width: 56, height: 56, borderRadius: Radius.sm, backgroundColor: Colors.surfaceLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sheetTitleContainer: { flex: 1 },
  sheetTitle: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '800' },
  sheetSubtitle: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 2 },
  sheetFavBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetLabel: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },
  qualityList: {},
  qualityOptionRow: { flexDirection: 'row', alignItems: 'center' },
  qualityOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  qualityOptionLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  qualityIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(229,9,20,0.12)', alignItems: 'center', justifyContent: 'center' },
  qualityOptionLabel: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  qualityOptionDesc: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },
  copyBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  sheetCloseBtn: { marginTop: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.surfaceLight, alignItems: 'center' },
  sheetCloseText: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: '700' },
});
