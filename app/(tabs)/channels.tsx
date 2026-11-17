import { useState, useMemo } from 'react';
import { StyleSheet, View, Text, FlatList, Pressable, Image, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, FontSize, Spacing, Radius } from '@/constants/theme';
import { useConfig } from '@/hooks/useConfig';
import { useI18n } from '@/hooks/useI18n';
import { Channel } from '@/types';
import { Tv, Play } from 'lucide-react-native';
import { VideoPlayer } from '@/components/VideoPlayer';

export default function ChannelsScreen() {
  const { channels, status } = useConfig();
  const { t } = useI18n();
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [playingChannel, setPlayingChannel] = useState<Channel | null>(null);

  const groups = useMemo(() => {
    const set = new Set<string>();
    channels.forEach((c) => { if (c.group) set.add(c.group); });
    return Array.from(set);
  }, [channels]);

  const filtered = useMemo(() => {
    if (!activeGroup) return channels;
    return channels.filter((c) => c.group === activeGroup);
  }, [channels, activeGroup]);

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

  const renderChannel = ({ item }: { item: Channel }) => (
    <Pressable
      style={styles.channelCard}
      onPress={() => setPlayingChannel(item)}
    >
      <View style={styles.channelLogoContainer}>
        {item.logo ? (
          <Image source={{ uri: item.logo }} style={styles.channelLogo} resizeMode="contain" />
        ) : (
          <View style={styles.channelLogoPlaceholder}>
            <Tv size={28} color={Colors.textMuted} />
          </View>
        )}
      </View>
      <View style={styles.channelInfo}>
        <Text style={styles.channelName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.channelGroup} numberOfLines={1}>{item.group}</Text>
      </View>
      <View style={styles.playIcon}>
        <Play size={18} color={Colors.primary} fill={Colors.primary} />
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('channels')}</Text>
        <Text style={styles.subtitle}>{channels.length} {t('channels')}</Text>
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
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxl,
    fontWeight: '800',
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  groupScroll: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  groupPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  groupPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  groupPillText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  groupPillTextActive: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  list: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  channelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  channelLogoContainer: {
    width: 56,
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  channelLogo: {
    width: '100%',
    height: '100%',
  },
  channelLogoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelInfo: {
    flex: 1,
  },
  channelName: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  channelGroup: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  playIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(229,9,20,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    marginTop: Spacing.md,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    marginTop: Spacing.lg,
  },
});
