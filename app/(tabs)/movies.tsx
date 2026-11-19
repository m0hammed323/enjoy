import { useState, useMemo } from 'react';
import { StyleSheet, View, Text, FlatList, ScrollView, Pressable, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MovieCard } from '@/components/MovieCard';
import { GenrePill } from '@/components/GenrePill';
import { GridSkeleton } from '@/components/Skeletons';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useConfig } from '@/hooks/useConfig';
import { useI18n } from '@/hooks/useI18n';
import { Title, ContentType } from '@/types';

type Filter = 'all' | ContentType;

const { width: screenWidth } = Dimensions.get('window');
const numColumns = screenWidth < 480 ? 2 : screenWidth < 768 ? 3 : 4;
const cardGap = Spacing.sm;
const cardPadding = Spacing.lg;
const cardWidth = Math.floor((screenWidth - cardPadding * 2 - cardGap * (numColumns - 1)) / numColumns);
const cardHeight = Math.floor(cardWidth * 1.5);

export default function MoviesScreen() {
  const { titles, status } = useConfig();
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  const [activeGenre, setActiveGenre] = useState<string | null>(null);

  const allGenres = useMemo(() => {
    const genres = new Set<string>();
    titles.forEach((t2) => t2.genres.forEach((g) => genres.add(g)));
    return Array.from(genres);
  }, [titles]);

  const results = useMemo(() => {
    let list = titles;
    if (filter !== 'all') list = list.filter((t2) => t2.type === filter);
    if (activeGenre) list = list.filter((t2) => t2.genres.includes(activeGenre));
    return list;
  }, [filter, activeGenre, titles]);

  if (status === 'loading' || titles.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}><Text style={styles.title}>{t('browse')}</Text></View>
        <GridSkeleton count={6} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.stickyHeader}>
        <View style={styles.header}><Text style={styles.title}>{t('browse')}</Text></View>
        <View style={styles.tabs}>
          {(['all', 'movie', 'series'] as Filter[]).map((f) => (
            <Pressable key={f} style={[styles.tab, filter === f && styles.tabActive]} onPress={() => setFilter(f)}>
              <Text style={[styles.tabText, filter === f && styles.tabTextActive]}>
                {f === 'all' ? t('all') : f === 'movie' ? t('movies') : t('series')}
              </Text>
            </Pressable>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.genreScroll}>
          <GenrePill label={t('allGenres')} active={activeGenre === null} onPress={() => setActiveGenre(null)} />
          {allGenres.map((g) => (
            <GenrePill key={g} label={g} active={activeGenre === g} onPress={() => setActiveGenre(g)} />
          ))}
        </ScrollView>
      </View>
      {results.length === 0 ? (
        <View style={styles.centerContent}><Text style={styles.emptyText}>{t('noTitlesMatch')}</Text></View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: cardGap }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }: { item: Title }) => (
            <MovieCard title={item} width={cardWidth} height={cardHeight} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  stickyHeader: { zIndex: 50, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  title: { color: Colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '800' },
  tabs: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.md },
  tab: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: 999, backgroundColor: Colors.surfaceLight, borderWidth: 1, borderColor: Colors.border },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
  tabTextActive: { color: Colors.textPrimary, fontWeight: '700' },
  genreScroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.sm },
  grid: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 100 },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.md },
});
