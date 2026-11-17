import { Pressable, StyleSheet, Text, View, Image } from 'react-native';
import { Star, Plus, Check } from 'lucide-react-native';
import { Title } from '@/types';
import { Colors, Radius, FontSize, Spacing } from '@/constants/theme';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useI18n } from '@/hooks/useI18n';
import { openExternalVideo } from '@/utils/externalPlayer';

const CARD_WIDTH = 140;
const CARD_HEIGHT = 200;

interface MovieCardProps { title: Title; width?: number; height?: number; }

export function MovieCard({ title, width = CARD_WIDTH, height = CARD_HEIGHT }: MovieCardProps) {
  const { isInWatchlist, toggleWatchlist } = useWatchlist();
  const { t } = useI18n();
  const inList = isInWatchlist(title.id);
  return (
    <Pressable style={[styles.card, { width, height }]} onPress={() => void openExternalVideo(title.embedUrl)}>
      <Image source={{ uri: title.poster }} style={styles.poster} resizeMode="cover" />
      <View style={styles.overlay} />
      <View style={styles.topRow}><View style={styles.ratingChip}><Star size={10} color={Colors.star} fill={Colors.star} /><Text style={styles.ratingText}>{title.rating.toFixed(1)}</Text></View>{title.isNew && <View style={styles.newChip}><Text style={styles.newText}>NEW</Text></View>}</View>
      <Pressable style={styles.addButton} onPress={(e) => { e.stopPropagation?.(); toggleWatchlist(title.id); }}>
        {inList ? <Check size={16} color={Colors.success} /> : <Plus size={16} color={Colors.textPrimary} />}
      </Pressable>
      <View style={styles.bottomInfo}><Text style={styles.title} numberOfLines={2}>{title.title}</Text><Text style={styles.meta}>{title.year} · {title.type === 'movie' ? t('movies') : t('series')}</Text></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.surface, position: 'relative' }, poster: { width: '100%', height: '100%' }, overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,10,15,0.15)' },
  topRow: { position: 'absolute', top: Spacing.xs, left: Spacing.xs, right: Spacing.xs, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, ratingChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: Radius.sm }, ratingText: { color: Colors.textPrimary, fontSize: 10, fontWeight: '700' }, newChip: { backgroundColor: Colors.primary, paddingHorizontal: 6, paddingVertical: 3, borderRadius: Radius.sm }, newText: { color: Colors.textPrimary, fontSize: 9, fontWeight: '800' },
  addButton: { position: 'absolute', top: Spacing.xs, right: Spacing.xs, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' }, bottomInfo: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.sm, backgroundColor: 'rgba(0,0,0,0.55)' }, title: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '700' }, meta: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2 },
});
