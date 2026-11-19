import { useMemo, useState, useCallback } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Tv, Play, Search, Layers, Copy, Check } from 'lucide-react-native';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useConfig } from '@/hooks/useConfig';
import { useI18n } from '@/hooks/useI18n';
import { Channel, ChannelQuality } from '@/types';
import { openInEnjoyPlayer } from '@/utils/enjoyPlayerLauncher';
import { useCopyLink } from '@/hooks/useCopyLink';

const { width: screenWidth } = Dimensions.get('window');
const NUM_COLUMNS = screenWidth < 480 ? 3 : screenWidth < 768 ? 4 : 6;
const CARD_GAP = Spacing.sm;
const CARD_WIDTH = Math.floor((screenWidth - Spacing.lg * 2 - CARD_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS);
const CARD_HEIGHT = Math.floor(CARD_WIDTH * 1.1);

export default function ChannelsScreen() {
  const { channels, status } = useConfig();
  const { t } = useI18n();
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
    void openInEnjoyPlayer({ url, title: channel.name, subtitle: `${channel.group} - ${qualityLabel}` });
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
    return (
      <Pressable style={styles.card} onPress={() => handleChannelPress(item)}>
        <View style={styles.cardLogoContainer}>
          {item.logo ? (
            <Image source={{ uri: item.logo }} style={styles.cardLogo} resizeMode="contain" />
          ) : (
            <View style={styles.logoPlaceholder}><Tv size={28} color={Colors.textMuted} /></View>
          )}
          {hasMultiQuality && (
            <View style={styles.multiQualityBadge}>
              <Layers size={9} color={Colors.textPrimary} />
              <Text style={styles.multiQualityText}>{item.qualities.length}</Text>
            </View>
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
            {item.qualities.slice(0, 3).map((q) => (
              <View key={q.label} style={styles.qualityTag}>
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
        <View style={styles.header}>
          <Text style={styles.title}>{t('channels')}</Text>
          <Text style={styles.subtitle}>{channels.length} {t('channels')}</Text>
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
                {qualityModalChannel?.logo ? (
                  <Image source={{ uri: qualityModalChannel.logo }} style={styles.sheetLogo} resizeMode="contain" />
                ) : (
                  <Tv size={28} color={Colors.textMuted} />
                )}
              </View>
              <View style={styles.sheetTitleContainer}>
                <Text style={styles.sheetTitle} numberOfLines={1}>{qualityModalChannel?.name}</Text>
                <Text style={styles.sheetSubtitle} numberOfLines={1}>{qualityModalChannel?.group}</Text>
              </View>
            </View>
            <Text style={styles.sheetLabel}>{t('selectStreamQuality')}</Text>
            <ScrollView style={styles.qualityList}>
              {qualityModalChannel?.qualities.map((q, idx) => {
                const copyItemId = `quality-${idx}`;
                const isCopied = copiedId === copyItemId;
                return (
                  <View key={q.label} style={styles.qualityOptionRow}>
                    <Pressable style={styles.qualityOption} onPress={() => qualityModalChannel && handlePlay(qualityModalChannel, q)}>
                      <View style={styles.qualityOptionLeft}>
                        <View style={styles.qualityIconCircle}><Layers size={16} color={Colors.primary} /></View>
                        <Text style={styles.qualityOptionLabel}>{q.label}</Text>
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
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
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
  card: { width: CARD_WIDTH, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.xs + 2, alignItems: 'center' },
  cardLogoContainer: {
    width: '100%', height: CARD_HEIGHT * 0.6, borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceLight, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', position: 'relative',
  },
  cardLogo: { width: '100%', height: '100%' },
  logoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  multiQualityBadge: {
    position: 'absolute', top: 4, right: 4, flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(229,9,20,0.85)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: Radius.sm,
  },
  multiQualityText: { color: Colors.textPrimary, fontSize: 9, fontWeight: '800' },
  liveBadge: {
    position: 'absolute', bottom: 4, left: 4, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: Radius.sm,
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
  sheetLogo: { width: '100%', height: '100%' },
  sheetTitleContainer: { flex: 1 },
  sheetTitle: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '800' },
  sheetSubtitle: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 2 },
  sheetLabel: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },
  qualityList: {},
  qualityOptionRow: { flexDirection: 'row', alignItems: 'center' },
  qualityOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  qualityOptionLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  qualityIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(229,9,20,0.12)', alignItems: 'center', justifyContent: 'center' },
  qualityOptionLabel: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  copyBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  sheetCloseBtn: { marginTop: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.surfaceLight, alignItems: 'center' },
  sheetCloseText: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: '700' },
});
