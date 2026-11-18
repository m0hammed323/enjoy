import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Tv, Play, Search } from 'lucide-react-native';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useConfig } from '@/hooks/useConfig';
import { useI18n } from '@/hooks/useI18n';
import { Channel } from '@/types';
import { openInEnjoyPlayer } from '@/utils/enjoyPlayerLauncher';

export default function ChannelsScreen() {
  const { channels, status } = useConfig();
  const { t } = useI18n();
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  const handlePlay = (channel: Channel) => {
    void openInEnjoyPlayer({
      url: channel.streamUrl,
      title: channel.name,
      subtitle: channel.group,
    });
  };

  const renderChannel = ({ item }: { item: Channel }) => (
    <Pressable
      style={styles.channelCard}
      onPress={() => handlePlay(item)}
    >
      <View style={styles.channelLogoContainer}>
        {item.logo ? (
          <Image source={{ uri: item.logo }} style={styles.channelLogo} resizeMode="contain" />
        ) : (
          <View style={styles.logoPlaceholder}>
            <Tv size={24} color={Colors.textMuted} />
          </View>
        )}
      </View>
      <View style={styles.channelInfo}>
        <Text style={styles.channelName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.channelGroup} numberOfLines={1}>{item.group}</Text>
      </View>
      <View style={styles.playIcon}>
        <Play size={16} color={Colors.primary} fill={Colors.primary} />
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.groupScroll}
        >
          <Pressable
            style={[styles.groupPill, activeGroup === null && styles.groupPillActive]}
            onPress={() => setActiveGroup(null)}
          >
            <Text style={[styles.groupPillText, activeGroup === null && styles.groupPillTextActive]}>
              {t('allChannels')}
            </Text>
          </Pressable>
          {groups.map((g) => (
            <Pressable
              key={g}
              style={[styles.groupPill, activeGroup === g && styles.groupPillActive]}
              onPress={() => setActiveGroup(g)}
            >
              <Text style={[styles.groupPillText, activeGroup === g && styles.groupPillTextActive]}>
                {g}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

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
          renderItem={renderChannel}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  title: { color: Colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '800' },
  subtitle: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 2 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 44,
    marginBottom: Spacing.md,
  },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md },
  groupScroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.sm },
  groupPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  groupPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  groupPillText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
  groupPillTextActive: { color: Colors.textPrimary, fontWeight: '700' },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  channelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  channelLogoContainer: {
    width: 60,
    height: 60,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  channelLogo: { width: '100%', height: '100%' },
  logoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  channelInfo: { flex: 1 },
  channelName: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  channelGroup: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },
  playIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(229,9,20,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 100 },
  loadingText: { color: Colors.textMuted, fontSize: FontSize.md, marginTop: Spacing.md },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.md, marginTop: Spacing.md },
});
