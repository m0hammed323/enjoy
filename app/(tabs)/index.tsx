import { ScrollView, StyleSheet, View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Hero } from '@/components/Hero';
import { ContentRow } from '@/components/ContentRow';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useConfig } from '@/hooks/useConfig';
import { useI18n } from '@/hooks/useI18n';
import { useWatchlistTitles } from '@/hooks/useWatchlist';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator } from 'react-native';

export default function HomeScreen() {
  const router = useRouter();
  const { titles, status } = useConfig();
  const { t } = useI18n();
  const watchlistTitles = useWatchlistTitles();

  const featured = titles.filter((t) => t.featured).slice(0, 5);
  const trending = titles.filter((t) => t.trending).slice(0, 20);
  const newReleases = titles.filter((t) => t.isNew).slice(0, 20);
  const movies = titles.filter((t) => t.type === 'movie');
  const series = titles.filter((t) => t.type === 'series');
  const featuredItem = featured[0] || trending[0] || movies[0] || titles[0];

  if (status === 'loading' || titles.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <View style={styles.topBar}>
          <Text style={styles.logo}>enjoy</Text>
        </View>
        {featuredItem && <Hero title={featuredItem} />}
        <View style={styles.content}>
          {watchlistTitles.length > 0 && (
            <ContentRow label={t('myList')} titles={watchlistTitles} />
          )}
          <ContentRow
            label={t('trendingNow')}
            titles={trending}
            onSeeAll={() => router.push('/(tabs)/movies')}
          />
          <ContentRow
            label={t('newReleases')}
            titles={newReleases}
            onSeeAll={() => router.push('/(tabs)/movies')}
          />
          {movies.length > 0 && (
            <ContentRow label={t('movies')} titles={movies} />
          )}
          {series.length > 0 && (
            <ContentRow label={t('series')} titles={series} />
          )}
        </View>
        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    color: Colors.primary,
    fontSize: FontSize.xl,
    fontWeight: '900',
    letterSpacing: 2,
  },
  content: {
    paddingTop: Spacing.lg,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
