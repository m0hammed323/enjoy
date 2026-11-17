import { StyleSheet, View, Text, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MovieCard } from '@/components/MovieCard';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useWatchlistTitles } from '@/hooks/useWatchlist';
import { useI18n } from '@/hooks/useI18n';
import { Title } from '@/types';
import { Bookmark } from 'lucide-react-native';

export default function MyListScreen() {
  const titles = useWatchlistTitles();
  const { t } = useI18n();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('myList')}</Text>
        <Text style={styles.subtitle}>
          {titles.length} {titles.length === 1 ? t('titlesSaved') : t('titlesSavedPlural')}
        </Text>
      </View>
      {titles.length === 0 ? (
        <View style={styles.centerContent}>
          <Bookmark size={56} color={Colors.textMuted} strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>{t('yourListEmpty')}</Text>
          <Text style={styles.emptyText}>{t('tapToAdd')}</Text>
        </View>
      ) : (
        <FlatList
          data={titles}
          keyExtractor={(item) => item.id}
          numColumns={2}
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
    paddingBottom: Spacing.lg,
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
    paddingHorizontal: Spacing.xl,
    paddingBottom: 100,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 22,
  },
});
