import { StyleSheet, View } from 'react-native';
import { Colors, Radius, Spacing } from '@/constants/theme';

export function PosterSkeleton({ width = 140, height = 210 }: { width?: number; height?: number }) {
  return <View style={[styles.skeleton, { width, height, borderRadius: Radius.md }]} />;
}

export function ContentRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.rowContainer}>
      <View style={styles.rowLabel} />
      <View style={styles.rowScroll}>
        {Array.from({ length: count }).map((_, i) => (
          <PosterSkeleton key={i} />
        ))}
      </View>
    </View>
  );
}

export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.gridContainer}>
      {Array.from({ length: count }).map((_, i) => (
        <PosterSkeleton key={i} width={160} height={230} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { backgroundColor: Colors.skeletonBase },
  rowContainer: { marginBottom: Spacing.lg, paddingHorizontal: Spacing.lg },
  rowLabel: { width: 120, height: 18, borderRadius: Radius.sm, backgroundColor: Colors.skeletonBase, marginBottom: Spacing.sm },
  rowScroll: { flexDirection: 'row', gap: Spacing.md },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
});
