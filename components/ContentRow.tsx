import { ScrollView, StyleSheet, Text, View, Dimensions } from 'react-native';
import { Title } from '@/types';
import { MovieCard } from './MovieCard';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable } from 'react-native';

interface RowProps {
  label: string;
  titles: Title[];
  onSeeAll?: () => void;
}

export function ContentRow({ label, titles, onSeeAll }: RowProps) {
  if (titles.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {onSeeAll && (
          <Pressable style={styles.seeAll} onPress={onSeeAll}>
            <Text style={styles.seeAllText}>See All</Text>
            <ChevronRight size={16} color={Colors.primary} />
          </Pressable>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {titles.map((t) => (
          <MovieCard key={t.id} title={t} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  label: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
});
