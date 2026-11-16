import { Pressable, StyleSheet, Text } from 'react-native';
import { Colors, Radius, FontSize, Spacing } from '@/constants/theme';

interface GenrePillProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

export function GenrePill({ label, active, onPress }: GenrePillProps) {
  return (
    <Pressable
      style={[styles.pill, active && styles.pillActive]}
      onPress={onPress}
    >
      <Text style={[styles.text, active && styles.textActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  text: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  textActive: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
});
