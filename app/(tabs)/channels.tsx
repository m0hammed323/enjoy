import { useMemo, useState, useCallback } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Tv, Play, Search, Layers, Heart } from 'lucide-react-native';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useConfig } from '@/hooks/useConfig';
import { useI18n } from '@/hooks/useI18n';
import { useFavorites } from '@/hooks/useFavorites';
import { Channel, ChannelQuality } from '@/types';
import { openInEnjoyPlayer } from '@/utils/enjoyPlayerLauncher';

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

export default function ChannelsScreen() {
  const { channels, status } = useConfig();
  const { t, isRTL } = useI18n();
  const { isChannelFavorite, toggleChannelFavorite } = useFavorites();
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [qualityModalChannel, setQualityModalChannel] = useState<Channel | null>(null);

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

  const renderChannelRow = ({ item }: { item: Channel }) => {
    const hasMultiQuality = item.qualities.length > 1;
    const singleQuality = !hasMultiQuality ? item.qualities[0]?.label : null;
    const fav = isChannelFavorite(item.id);

    return (
      <Pressable
        style={({ pressed }) => [styles.channelRow, pressed && styles.channelRowPressed]}
        onPress={() => handleChannelPress(item)}
      >
        <View style={styles.channelMainInfo}>
          <View style={styles.nameRow}>
            <View style={styles.liveDot} />
            <Text style={styles.channelName} numberOfLines={1}>
              {item.name}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.channelGroup} numberOfLines={1}>
              {item.group}
            </Text>

            {hasMultiQuality ? (
              <View style={styles.qualityTagsInline}>
                {item.qualities.slice(0, 4).map((q, idx) => (
                  <Pressable
                    key={`${q.label}-${idx}`}
                    style={styles.qualityChip}
                    onPress={(e) => {
                      e.stopPropagation();
                      handlePlay(item, q);
                    }}
                  >
                    <Text style={styles.qualityChipText}>{q.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              singleQuality &&
              singleQuality !== 'AUTO' && (
                <View style={styles.singleQualityChip}>
                  <Text style={styles.singleQualityChipText}>{singleQuality}</Text>
                </View>
              )
            )}
          </View>
        </View>

        <View style={styles.rowActions}>
          <Pressable
            style={styles.favBtn}
            onPress={(e) => {
              e.stopPropagation();
              toggleChannelFavorite(item.id);
            }}
          >
            <Heart
              size={17}
              color={fav ? Colors.primary : Colors.textMuted}
              fill={fav ? Colors.primary : 'transparent'}
            />
          </Pressable>

          {hasMultiQuality ? (
            <View style={styles.multiPlayBadge}>
              <Layers size={13} color="#FFFFFF" />
              <Text style={styles.multiPlayText}>{item.qualities.length}</Text>
            </View>
          ) : (
            <View style={styles.directPlayCircle}>
              <Play size={14} color={Colors.primary} fill={Colors.primary} />
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.stickyHeader}>
        <View style={[styles.headerRow, !isRTL && { paddingLeft: 68 }]}>
          <View style={styles.headerTextCol}>
            <Text style={styles.title}>{t('channels')}</Text>
            <Text style={styles.subtitle}>
              {filtered.length !== channels.length
                ? `${filtered.length} / ${channels.length} ${t('channels')}`
                : `${channels.length} ${t('channels')}`}
            </Text>
          </View>
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
          renderItem={renderChannelRow}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.xs + 2 }} />}
        />
      )}

      <Modal visible={qualityModalChannel !== null} transparent animationType="slide" onRequestClose={() => setQualityModalChannel(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setQualityModalChannel(null)}>
          <Pressable style={styles.qualitySheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
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
              {qualityModalChannel?.qualities.map((q, idx) => (
                <Pressable
                  key={`${q.label}-${idx}`}
                  style={({ pressed }) => [styles.qualityOption, pressed && { opacity: 0.75 }]}
                  onPress={() => qualityModalChannel && handlePlay(qualityModalChannel, q)}
                >
                  <View style={styles.qualityOptionLeft}>
                    <View style={styles.qualityIconCircle}>
                      <Layers size={16} color={Colors.primary} />
                    </View>
                    <View>
                      <Text style={styles.qualityOptionLabel}>{q.label}</Text>
                      <Text style={styles.qualityOptionDesc}>{getQualityDescription(q.label)}</Text>
                    </View>
                  </View>
                  <View style={styles.modalPlayPill}>
                    <Play size={15} color="#FFFFFF" fill="#FFFFFF" />
                  </View>
                </Pressable>
              ))}
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
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  channelRowPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  channelMainInfo: { flex: 1, paddingRight: Spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.error },
  channelName: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '800' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: 5,
    paddingLeft: 15,
  },
  channelGroup: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '600' },
  qualityTagsInline: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  qualityChip: {
    backgroundColor: 'rgba(229,9,20,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.35)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  qualityChipText: { color: Colors.primary, fontSize: 10, fontWeight: '800' },
  singleQualityChip: {
    backgroundColor: Colors.surfaceLighter,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  singleQualityChipText: { color: Colors.textSecondary, fontSize: 10, fontWeight: '700' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  favBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  multiPlayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 17,
  },
  multiPlayText: { color: '#FFFFFF', fontSize: FontSize.xs, fontWeight: '800' },
  directPlayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(229,9,20,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  qualityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  qualityOptionLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  qualityIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(229,9,20,0.12)', alignItems: 'center', justifyContent: 'center' },
  qualityOptionLabel: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  qualityOptionDesc: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },
  modalPlayPill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseBtn: { marginTop: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.surfaceLight, alignItems: 'center' },
  sheetCloseText: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: '700' },
});
