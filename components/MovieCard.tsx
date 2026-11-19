import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, Image } from 'react-native';
import { Star, Eye, Film, Tv } from 'lucide-react-native';
import { Title } from '@/types';
import { Colors, Radius, FontSize, Spacing } from '@/constants/theme';
import { useI18n } from '@/hooks/useI18n';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useRouter } from 'expo-router';

const CARD_WIDTH = 140;
const CARD_HEIGHT = 210;

interface MovieCardProps { title: Title; width?: number; height?: number; }

export function MovieCard({ title, width = CARD_WIDTH, height = CARD_HEIGHT }: MovieCardProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { isWatched } = useWatchHistory();
  const [imgError, setImgError] = useState(false);
  const watched = isWatched(title.id);

  return (
    <Pressable
      style={[styles.card, { width, height }]}
      onPress={() => router.push(`/detail/${title.id}`)}
    >
      {title.poster && !imgError ? (
        <Image
          source={{ uri: title.poster }}
          style={styles.poster}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <View style={styles.posterFallback}>
          {title.type === 'movie' ? <Film size={32} color={Colors.textMuted} /> : <Tv size={32} color={Colors.textMuted} />}
          <Text style={styles.fallbackText} numberOfLines={2}>{title.title}</Text>
        </View>
      )}
      <View style={styles.overlay} />
      <View style={styles.topRow}>
        <View style={styles.ratingColumn}>
          <View style={styles.ratingChip}>
            <Star size={10} color={Colors.star} fill={Colors.star} />
            <Text style={styles.ratingText}>{title.rating.toFixed(1)}</Text>
          </View>
          {watched && (
            <View style={styles.watchedBadge}>
              <Eye size={9} color={Colors.textPrimary} />
              <Text style={styles.watchedText}>{t('watchedBadge')}</Text>
            </View>
          )}
        </View>
        {title.isNew && (
          <View style={styles.newChip}>
            <Text style={styles.newText}>NEW</Text>
          </View>
        )}
      </View>
      <View style={styles.bottomInfo}>
        <Text style={styles.title} numberOfLines={2}>{title.title}</Text>
        <Text style={styles.meta}>{title.year} · {title.type === 'movie' ? t('movies') : t('series')}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.surface, position: 'relative' },
  poster: { width: '100%', height: '100%' },
  posterFallback: {
    width: '100%', height: '100%', backgroundColor: Colors.surfaceLight,
    alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.sm,
  },
  fallbackText: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center', fontWeight: '600' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,15,25,0.12)' },
  topRow: {
    position: 'absolute', top: Spacing.xs, left: Spacing.xs, right: Spacing.xs,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  ratingColumn: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
  },
  ratingChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: Radius.sm,
  },
  ratingText: { color: Colors.textPrimary, fontSize: 10, fontWeight: '700' },
  newChip: { backgroundColor: Colors.primary, paddingHorizontal: 6, paddingVertical: 3, borderRadius: Radius.sm },
  newText: { color: Colors.textPrimary, fontSize: 9, fontWeight: '800' },
  watchedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(34,197,94,0.92)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: Radius.sm,
  },
  watchedText: { color: Colors.textPrimary, fontSize: 8, fontWeight: '800' },
  bottomInfo: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: Spacing.sm, backgroundColor: 'rgba(11,15,25,0.7)',
  },
  title: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '700' },
  meta: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2 },
});
