import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, Image, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Star, Play, Info, Film, Tv } from 'lucide-react-native';
import { Title } from '@/types';
import { Colors, Radius, FontSize, Spacing } from '@/constants/theme';
import { useI18n } from '@/hooks/useI18n';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');

interface HeroProps {
  title: Title;
}

export function Hero({ title }: HeroProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [imgError, setImgError] = useState(false);

  return (
    <View style={styles.container}>
      {!imgError && title.backdrop ? (
        <Image source={{ uri: title.backdrop }} style={styles.backdrop} resizeMode="cover" onError={() => setImgError(true)} />
      ) : (
        <View style={[styles.backdrop, styles.backdropFallback]}>
          {title.type === 'movie' ? <Film size={56} color={Colors.textMuted} /> : <Tv size={56} color={Colors.textMuted} />}
        </View>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(11,15,25,0.25)', 'rgba(11,15,25,0.8)', Colors.background]}
        locations={[0, 0.3, 0.65, 1]}
        style={styles.gradient}
      />
      <View style={styles.content}>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{title.type === 'movie' ? t('movies') : t('series')}</Text>
          </View>
          {title.isNew && (
            <View style={[styles.badge, { backgroundColor: Colors.primary }]}>
              <Text style={styles.badgeText}>NEW</Text>
            </View>
          )}
          <View style={styles.ratingBadge}>
            <Star size={12} color={Colors.star} fill={Colors.star} />
            <Text style={styles.ratingText}>{title.rating.toFixed(1)}</Text>
          </View>
        </View>
        <Text style={styles.title}>{title.title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{title.year}</Text>
          {title.genres.length > 0 && (
            <>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.metaText}>{title.genres.slice(0, 2).join(' · ')}</Text>
            </>
          )}
          {title.duration > 0 && (
            <>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.metaText}>{Math.floor(title.duration / 60)}h {title.duration % 60}m</Text>
            </>
          )}
        </View>
        <Text style={styles.description} numberOfLines={3}>{title.description}</Text>
        <View style={styles.buttonRow}>
          <Pressable style={styles.playButton} onPress={() => router.push(`/detail/${title.id}`)}>
            <Play size={20} color={Colors.background} fill={Colors.background} />
            <Text style={styles.playButtonText}>{t('play')}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => router.push(`/detail/${title.id}`)}>
            <Info size={20} color={Colors.textPrimary} />
            <Text style={styles.secondaryButtonText}>{t('details')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 520, width: width, position: 'relative' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, height: 520 },
  backdropFallback: { backgroundColor: Colors.surfaceLight, alignItems: 'center', justifyContent: 'center' },
  gradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  content: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.lg, paddingBottom: Spacing.xl },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  badge: { backgroundColor: Colors.surfaceLighter, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.sm },
  badgeText: { color: Colors.textPrimary, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  ratingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.sm,
  },
  ratingText: { color: Colors.textPrimary, fontSize: 11, fontWeight: '700' },
  title: { color: Colors.textPrimary, fontSize: FontSize.display, fontWeight: '800', marginBottom: Spacing.xs, letterSpacing: -0.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.sm },
  metaText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  dot: { color: Colors.textMuted, fontSize: FontSize.sm },
  description: { color: Colors.textSecondary, fontSize: FontSize.md, lineHeight: 22, marginBottom: Spacing.lg, maxWidth: '85%' },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  playButton: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: Colors.textPrimary, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2, borderRadius: Radius.md,
  },
  playButtonText: { color: Colors.background, fontSize: FontSize.md, fontWeight: '700' },
  secondaryButton: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2, borderRadius: Radius.md,
  },
  secondaryButtonText: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '600' },
});
