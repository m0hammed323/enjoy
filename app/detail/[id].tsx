import { useMemo, useState, useRef } from 'react';
import { ScrollView, StyleSheet, View, Text, Image, Pressable, Alert, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Play, Plus, Check, Share2, Star, Clock, Calendar, Globe, Film, Tv, ChevronLeft, ChevronDown, ChevronUp, Heart, Eye } from 'lucide-react-native';
import { getTitleById } from '@/data/titles';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useI18n } from '@/hooks/useI18n';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useFavorites } from '@/hooks/useFavorites';
import { Colors, FontSize, Spacing, Radius } from '@/constants/theme';
import { Episode } from '@/types';
import { openInEnjoyPlayer } from '@/utils/enjoyPlayerLauncher';

export default function DetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const title = id ? getTitleById(id) : undefined;
  const { isInWatchlist, toggleWatchlist } = useWatchlist();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { addToHistory, isWatched } = useWatchHistory();
  const { t } = useI18n();
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set([1]));
  const scrollRef = useRef<ScrollView>(null);
  const bodyY = useRef(0);
  const episodeSectionY = useRef(0);

  const seasons = useMemo(() => {
    if (!title?.episodes) return [];
    const map: Record<number, Episode[]> = {};
    title.episodes.forEach((ep) => {
      if (!map[ep.season]) map[ep.season] = [];
      map[ep.season].push(ep);
    });
    return Object.entries(map)
      .map(([season, eps]) => ({ season: parseInt(season, 10), episodes: eps }))
      .sort((a, b) => a.season - b.season);
  }, [title]);

  if (!title) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t('titleNotFound')}</Text>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>{t('goBack')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const inList = isInWatchlist(title.id);
  const fav = isFavorite(title.id);

  const handlePlay = () => {
    const sub = title.type === 'series' ? 'مسلسل' : 'فيلم';
    const posterUri = title.poster || title.backdrop;
    addToHistory({
      titleId: title.id,
      label: title.title,
      subtitle: sub,
      poster: posterUri,
      mediaType: title.type,
      url: title.embedUrl,
    });
    void openInEnjoyPlayer({
      url: title.embedUrl,
      title: title.title,
      subtitle: sub,
      titleId: title.id,
      poster: posterUri,
      mediaType: title.type,
    });
  };

  const handleShare = () => {
    if (title.embedUrl && Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(title.embedUrl).then(() => {
        Alert.alert('', t('copiedToClipboard'));
      }).catch(() => {});
    }
  };

  const toggleSeason = (season: number) => {
    setExpandedSeasons((prev) => {
      const next = new Set(prev);
      if (next.has(season)) next.delete(season);
      else next.add(season);
      return next;
    });
  };

  const scrollToEpisodes = () => {
    const targetY = bodyY.current + episodeSectionY.current;
    if (scrollRef.current && targetY > 0) {
      scrollRef.current.scrollTo({ y: Math.max(0, targetY - 16), animated: true });
    }
  };

  const handleSeasonPress = (season: number) => {
    setExpandedSeasons(new Set([season]));
    setTimeout(scrollToEpisodes, 120);
  };

  const handleEpisodePlay = (ep: Episode) => {
    const epLabel = `${title.title} - ${ep.title}`;
    const epSub = `${t('season')} ${ep.season} · E${ep.episode}`;
    const posterUri = ep.thumbnail || title.poster || title.backdrop;
    addToHistory({
      titleId: title.id,
      episodeId: ep.id,
      label: epLabel,
      subtitle: epSub,
      poster: posterUri,
      mediaType: 'series',
      url: ep.embedUrl,
    });
    void openInEnjoyPlayer({
      url: ep.embedUrl,
      title: epLabel,
      subtitle: epSub,
      titleId: title.id,
      episodeId: ep.id,
      poster: posterUri,
      mediaType: 'series',
    });
  };

  const renderEpisode = (item: Episode) => {
    const watched = isWatched(title.id, item.id);
    return (
      <View key={item.id} style={styles.episodeRow}>
        <Pressable style={styles.episodeMain} onPress={() => handleEpisodePlay(item)}>
          <View style={styles.episodeThumbContainer}>
            {item.thumbnail ? (
              <Image source={{ uri: item.thumbnail }} style={styles.episodeThumb} resizeMode="cover" />
            ) : (
              <View style={[styles.episodeThumb, styles.episodeThumbFallback]}>
                <Tv size={20} color={Colors.textMuted} />
              </View>
            )}
            {watched && (
              <View pointerEvents="none" style={styles.epWatchedBadge}>
                <Eye size={8} color={Colors.textPrimary} />
              </View>
            )}
            <View pointerEvents="none" style={styles.epPlayOverlay}>
              <Play size={14} color={Colors.textPrimary} fill={Colors.textPrimary} />
            </View>
          </View>
          <View style={styles.episodeInfo}>
            <Text style={styles.episodeNum}>E{item.episode}</Text>
            <Text style={styles.episodeTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.episodeDesc} numberOfLines={2}>{item.description}</Text>
            {item.duration > 0 && <Text style={styles.episodeDuration}>{item.duration} min</Text>}
          </View>
        </Pressable>
      </View>
    );
  };

  const renderSeason = (item: { season: number; episodes: Episode[] }) => {
    const expanded = expandedSeasons.has(item.season);
    return (
      <View key={item.season} style={styles.seasonContainer}>
        <Pressable style={styles.seasonHeader} onPress={() => toggleSeason(item.season)}>
          <View style={styles.seasonHeaderLeft}>
            <View style={styles.seasonIconCircle}><Tv size={16} color={Colors.primary} /></View>
            <Text style={styles.seasonTitle}>{t('season')} {item.season}</Text>
            <View style={styles.seasonCountBadge}><Text style={styles.seasonCountText}>{item.episodes.length}</Text></View>
          </View>
          {expanded ? <ChevronUp size={20} color={Colors.textMuted} /> : <ChevronDown size={20} color={Colors.textMuted} />}
        </Pressable>
        {expanded && (
          <View style={styles.episodeList}>
            {item.episodes.map((ep) => renderEpisode(ep))}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroSection}>
          {title.backdrop ? (
            <Image source={{ uri: title.backdrop }} style={styles.backdrop} resizeMode="cover" />
          ) : (
            <View style={[styles.backdrop, styles.backdropFallback]}>
              {title.type === 'movie' ? <Film size={56} color={Colors.textMuted} /> : <Tv size={56} color={Colors.textMuted} />}
            </View>
          )}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(11,15,25,0.4)', 'transparent', 'rgba(11,15,25,0.6)', Colors.background]}
            locations={[0, 0.2, 0.6, 1]}
            style={styles.gradient}
          />
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <ChevronLeft size={26} color={Colors.textPrimary} />
          </Pressable>
          <View pointerEvents="none" style={styles.heroContent}>
            <View style={styles.typeRow}>
              <View style={styles.typeBadge}>
                {title.type === 'movie' ? <Film size={12} color={Colors.textPrimary} /> : <Tv size={12} color={Colors.textPrimary} />}
                <Text style={styles.typeText}>{title.type === 'movie' ? t('movies') : t('series')}</Text>
              </View>
              <View style={styles.qualityBadge}><Text style={styles.qualityText}>{title.quality}</Text></View>
            </View>
            <Text style={styles.title}>{title.title}</Text>
          </View>
        </View>

        <View onLayout={(e) => { bodyY.current = e.nativeEvent.layout.y; }} style={styles.body}>
          <View style={styles.actionsRow}>
            <Pressable style={styles.playButton} onPress={handlePlay}>
              <Play size={20} color={Colors.background} fill={Colors.background} />
              <Text style={styles.playText}>{t('play')}</Text>
            </Pressable>
            <Pressable style={[styles.iconBtn, inList && styles.iconBtnActive]} onPress={() => toggleWatchlist(title.id)}>
              {inList ? <Check size={20} color={Colors.success} /> : <Plus size={20} color={Colors.textPrimary} />}
            </Pressable>
            <Pressable style={[styles.iconBtn, fav && styles.iconBtnFav]} onPress={() => toggleFavorite(title.id)}>
              <Heart size={20} color={fav ? Colors.primary : Colors.textPrimary} fill={fav ? Colors.primary : 'transparent'} />
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={handleShare}>
              <Share2 size={18} color={Colors.textPrimary} />
            </Pressable>
          </View>

          <View style={styles.metaGrid}>
            <MetaItem icon={<Star size={14} color={Colors.star} fill={Colors.star} />} value={title.rating.toFixed(1)} label={t('rating')} />
            {title.duration > 0 && <MetaItem icon={<Clock size={14} color={Colors.textSecondary} />} value={`${Math.floor(title.duration / 60)}h ${title.duration % 60}m`} label={t('length')} />}
            <MetaItem icon={<Calendar size={14} color={Colors.textSecondary} />} value={String(title.year)} label={t('year')} />
            {title.language ? <MetaItem icon={<Globe size={14} color={Colors.textSecondary} />} value={title.language} label={t('language')} /> : null}
          </View>

          {title.genres.length > 0 && (
            <View style={styles.genreRow}>
              {title.genres.map((g) => (
                <View key={g} style={styles.genreTag}><Text style={styles.genreTagText}>{g}</Text></View>
              ))}
            </View>
          )}

          <Text style={styles.sectionLabel}>{t('overview')}</Text>
          <Text style={styles.description}>{title.description}</Text>

          {(title.director || title.cast.length > 0 || title.country) && (
            <View style={styles.infoList}>
              {title.director ? <InfoLine label={t('director')} value={title.director} /> : null}
              {title.cast.length > 0 ? <InfoLine label={t('cast')} value={title.cast.join(', ')} /> : null}
              {title.country ? <InfoLine label={t('country')} value={title.country} /> : null}
            </View>
          )}

          {seasons.length > 0 && (
            <View onLayout={(e) => { episodeSectionY.current = e.nativeEvent.layout.y; }} style={styles.episodesSection}>
              <Text style={styles.sectionLabel}>{t('episodes')}</Text>
              <View style={styles.seasonTabsRow}>
                {seasons.map((s) => (
                  <Pressable
                    key={s.season}
                    style={[styles.seasonTab, expandedSeasons.has(s.season) && styles.seasonTabActive]}
                    onPress={() => handleSeasonPress(s.season)}
                  >
                    <Text style={[styles.seasonTabText, expandedSeasons.has(s.season) && styles.seasonTabTextActive]}>
                      {t('season')} {s.season}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {seasons.map((seasonItem) => renderSeason(seasonItem))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MetaItem({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <View style={styles.metaItem}>
      <View style={styles.metaIconRow}>{icon}</View>
      <Text style={styles.metaValue}>{value}</Text>
      <Text style={styles.metaLabel}>{label}</Text>
    </View>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 120 },
  heroSection: { height: 420, position: 'relative' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, height: 420 },
  backdropFallback: { backgroundColor: Colors.surfaceLight, alignItems: 'center', justifyContent: 'center' },
  gradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  backButton: {
    position: 'absolute', top: Spacing.md, left: Spacing.md,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  heroContent: { position: 'absolute', bottom: Spacing.lg, left: Spacing.lg, right: Spacing.lg },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  typeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.sm,
  },
  typeText: { color: Colors.textPrimary, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  qualityBadge: { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.sm },
  qualityText: { color: Colors.accent, fontSize: 10, fontWeight: '700' },
  title: { color: Colors.textPrimary, fontSize: FontSize.display, fontWeight: '800', letterSpacing: -0.5 },
  body: { padding: Spacing.lg },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.lg },
  playButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.textPrimary, paddingVertical: Spacing.md, borderRadius: Radius.md,
  },
  playText: { color: Colors.background, fontSize: FontSize.lg, fontWeight: '700' },
  iconBtn: {
    width: 48, height: 48, borderRadius: Radius.md, backgroundColor: Colors.surfaceLight,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  iconBtnActive: { borderColor: Colors.success },
  iconBtnFav: { borderColor: Colors.primary, backgroundColor: 'rgba(229,9,20,0.12)' },
  metaGrid: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.lg,
    backgroundColor: Colors.surface, borderRadius: Radius.md, paddingVertical: Spacing.md,
  },
  metaItem: { flex: 1, alignItems: 'center' },
  metaIconRow: { marginBottom: 4 },
  metaValue: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  metaLabel: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },
  genreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  genreTag: {
    backgroundColor: Colors.surfaceLight, paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border,
  },
  genreTagText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
  sectionLabel: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700', marginBottom: Spacing.md },
  description: { color: Colors.textSecondary, fontSize: FontSize.md, lineHeight: 24, marginBottom: Spacing.lg },
  infoList: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.lg, gap: Spacing.sm },
  infoLine: { flexDirection: 'row', justifyContent: 'space-between' },
  infoLabel: { color: Colors.textMuted, fontSize: FontSize.sm },
  infoValue: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600', flex: 1, textAlign: 'right' },
  episodesSection: { marginBottom: Spacing.lg },
  seasonTabsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  seasonTab: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.pill, backgroundColor: Colors.surfaceLight, borderWidth: 1, borderColor: Colors.border,
  },
  seasonTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  seasonTabText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
  seasonTabTextActive: { color: Colors.textPrimary, fontWeight: '700' },
  seasonContainer: { marginBottom: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.md },
  seasonHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, backgroundColor: Colors.surfaceLight,
  },
  seasonHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  seasonIconCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(229,9,20,0.12)', alignItems: 'center', justifyContent: 'center' },
  seasonTitle: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '800' },
  seasonCountBadge: { backgroundColor: Colors.surfaceLighter, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.sm },
  seasonCountText: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '700' },
  episodeList: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  episodeRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceLight, borderRadius: Radius.sm, padding: Spacing.sm, marginTop: Spacing.sm },
  episodeMain: { flex: 1, flexDirection: 'row', gap: Spacing.md },
  episodeThumbContainer: { width: 100, height: 60, borderRadius: Radius.sm, position: 'relative', overflow: 'hidden' },
  episodeThumb: { width: '100%', height: '100%' },
  episodeThumbFallback: { backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  epWatchedBadge: {
    position: 'absolute', top: 3, right: 3,
    backgroundColor: 'rgba(34,197,94,0.9)', width: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  epPlayOverlay: {
    position: 'absolute', bottom: 3, right: 3,
    backgroundColor: 'rgba(0,0,0,0.6)', width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  episodeInfo: { flex: 1, justifyContent: 'center' },
  episodeNum: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '700', marginBottom: 2 },
  episodeTitle: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '700', marginBottom: 2 },
  episodeDesc: { color: Colors.textSecondary, fontSize: FontSize.xs, lineHeight: 16, marginBottom: 4 },
  episodeDuration: { color: Colors.textMuted, fontSize: FontSize.xs },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: Colors.textPrimary, fontSize: FontSize.lg, marginBottom: Spacing.lg },
  backBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.md },
  backBtnText: { color: Colors.textPrimary, fontWeight: '700' },
});
