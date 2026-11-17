import { useState, useMemo, useCallback } from 'react';
import { ScrollView, StyleSheet, View, Text, TextInput, FlatList, ActivityIndicator, Pressable } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MovieCard } from '@/components/MovieCard';
import { GenrePill } from '@/components/GenrePill';
import { Colors, FontSize, Spacing, Radius } from '@/constants/theme';
import { useConfig } from '@/hooks/useConfig';
import { useI18n } from '@/hooks/useI18n';
import { Title } from '@/types';

export default function SearchScreen() {
  const { titles } = useConfig();
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const allGenres = useMemo(() => {
    const genres = new Set<string>();
    titles.forEach((t2) => t2.genres.forEach((g) => genres.add(g)));
    return Array.from(genres);
  }, [titles]);

  const results = useMemo(() => {
    let list = titles;
    if (activeGenre) {
      list = list.filter((t2) => t2.genres.includes(activeGenre));
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (t2) =>
          t2.title.toLowerCase().includes(q) ||
          t2.genres.some((g) => g.toLowerCase().includes(q)) ||
          (t2.cast || []).some((c) => c.toLowerCase().includes(q)) ||
          (t2.director || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [query, activeGenre, titles]);

  const handleChange = useCallback((text: string) => {
    setLoading(true);
    setQuery(text);
    setTimeout(() => setLoading(false), 300);
  }, []);

  const numColumns = 2;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('search')}</Text>
      </View>
      <View style={styles.searchBar}>
        <Search size={20} color={Colors.textMuted} />
        <TextInput
          style={styles.input}
          placeholder={t('searchPlaceholder')}
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={handleChange}
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')}>
            <X size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.genreScroll}
      >
        <GenrePill label={t('all')} active={activeGenre === null} onPress={() => setActiveGenre(null)} />
        {allGenres.map((g) => (
          <GenrePill key={g} label={g} active={activeGenre === g} onPress={() => setActiveGenre(g)} />
        ))}
      </ScrollView>
      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centerContent}>
          <Text style={styles.emptyTitle}>{t('noResults')}</Text>
          <Text style={styles.emptyText}>{t('tryDifferent')}</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }: { item: Title }) => (
            <MovieCard title={item} width={160} height={230} />
          )}
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
    height: 48,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
  },
  genreScroll: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  grid: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  row: {
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
  },
});
