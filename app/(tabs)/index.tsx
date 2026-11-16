import { ScrollView, StyleSheet, View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Hero } from '@/components/Hero';
import { ContentRow } from '@/components/ContentRow';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { getFeatured, getTrending, getNewReleases, getByGenre, ALL_GENRES } from '@/data/titles';
import { useWatchlistTitles } from '@/hooks/useWatchlist';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const router = useRouter();
  const featured = getFeatured();
  const trending = getTrending();
  const newReleases = getNewReleases();
  const watchlistTitles = useWatchlistTitles();
  const featuredItem = featured[0] || trending[0];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <View style={styles.topBar}>
          <Text style={styles.logo}>CINEVERSE</Text>
        </View>
        {featuredItem && <Hero title={featuredItem} />}
        <View style={styles.content}>
          {watchlistTitles.length > 0 && (
            <ContentRow label="My List" titles={watchlistTitles} />
          )}
          <ContentRow
            label="Trending Now"
            titles={trending}
            onSeeAll={() => router.push('/(tabs)/movies')}
          />
          <ContentRow
            label="New Releases"
            titles={newReleases}
            onSeeAll={() => router.push('/(tabs)/movies')}
          />
          {ALL_GENRES.slice(0, 4).map((g) => (
            <ContentRow key={g} label={g} titles={getByGenre(g)} />
          ))}
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
});
