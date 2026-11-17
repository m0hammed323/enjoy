import { StyleSheet, View, Text, ScrollView, Pressable, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, FontSize, Spacing, Radius } from '@/constants/theme';
import { Settings, Bell, Download, Shield, CircleHelp, LogOut, ChevronRight, Star, Crown, Languages } from 'lucide-react-native';
import { useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useConfig } from '@/hooks/useConfig';

export default function ProfileScreen() {
  const { t, lang, setLanguage } = useI18n();
  const { config } = useConfig();
  const [notifications, setNotifications] = useState(true);
  const [autoplay, setAutoplay] = useState(false);
  const [hdStreaming, setHdStreaming] = useState(true);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('profile')}</Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>E</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>enjoy</Text>
            <View style={styles.premiumBadge}>
              <Crown size={12} color={Colors.accent} fill={Colors.accent} />
              <Text style={styles.premiumText}>{t('premiumMember')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatCard icon={<Star size={20} color={Colors.star} fill={Colors.star} />} value="0" label={t('watched')} />
          <StatCard icon={<Download size={20} color={Colors.secondary} />} value="0" label={t('downloaded')} />
          <StatCard icon={<Crown size={20} color={Colors.accent} fill={Colors.accent} />} value="Pro" label={t('plan')} />
        </View>

        <Text style={styles.sectionLabel}>{t('languageLabel')}</Text>
        <View style={styles.section}>
          <Pressable
            style={[styles.row, lang === 'ar' && styles.rowSelected]}
            onPress={() => setLanguage('ar')}
          >
            <View style={styles.rowLeft}>
              <Languages size={20} color={Colors.textSecondary} />
              <Text style={styles.rowLabel}>{t('arabic')}</Text>
            </View>
            {lang === 'ar' && <View style={styles.selectedDot} />}
          </Pressable>
          <Divider />
          <Pressable
            style={[styles.row, lang === 'en' && styles.rowSelected]}
            onPress={() => setLanguage('en')}
          >
            <View style={styles.rowLeft}>
              <Languages size={20} color={Colors.textSecondary} />
              <Text style={styles.rowLabel}>{t('english')}</Text>
            </View>
            {lang === 'en' && <View style={styles.selectedDot} />}
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>{t('preferences')}</Text>
        <View style={styles.section}>
          <ToggleRow
            icon={<Bell size={20} color={Colors.textSecondary} />}
            label={t('pushNotifications')}
            value={notifications}
            onValueChange={setNotifications}
          />
          <Divider />
          <ToggleRow
            icon={<Settings size={20} color={Colors.textSecondary} />}
            label={t('autoplayNext')}
            value={autoplay}
            onValueChange={setAutoplay}
          />
          <Divider />
          <ToggleRow
            icon={<Download size={20} color={Colors.textSecondary} />}
            label={t('hdStreaming')}
            value={hdStreaming}
            onValueChange={setHdStreaming}
          />
        </View>

        <Text style={styles.sectionLabel}>{t('account')}</Text>
        <View style={styles.section}>
          <LinkRow icon={<Shield size={20} color={Colors.textSecondary} />} label={t('privacySecurity')} />
          <Divider />
          <LinkRow icon={<CircleHelp size={20} color={Colors.textSecondary} />} label={t('helpSupport')} />
          <Divider />
          <LinkRow icon={<Settings size={20} color={Colors.textSecondary} />} label={t('appSettings')} />
        </View>

        <Pressable style={styles.logoutButton}>
          <LogOut size={20} color={Colors.error} />
          <Text style={styles.logoutText}>{t('signOut')}</Text>
        </Pressable>

        <Text style={styles.version}>enjoy v{config?.app_version || '1.0.0'}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <View style={styles.statCard}>
      {icon}
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ToggleRow({ icon, label, value, onValueChange }: { icon: React.ReactNode; label: string; value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        {icon}
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: Colors.surfaceLighter, true: Colors.primary }}
        thumbColor={Colors.textPrimary}
      />
    </View>
  );
}

function LinkRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Pressable style={styles.row}>
      <View style={styles.rowLeft}>
        {icon}
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <ChevronRight size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxl,
    fontWeight: '800',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxl,
    fontWeight: '800',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: 4,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(233,196,106,0.15)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
  },
  premiumText: {
    color: Colors.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: '800',
  },
  statLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
  },
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  section: {
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  rowSelected: {
    backgroundColor: 'rgba(229,9,20,0.08)',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  rowLabel: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  selectedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(244,67,54,0.3)',
    marginBottom: Spacing.md,
  },
  logoutText: {
    color: Colors.error,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  version: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textAlign: 'center',
  },
});
