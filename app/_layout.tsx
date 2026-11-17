import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { useFonts } from 'expo-font';
import { SplashScreen } from 'expo-router';
import { WatchlistProvider } from '@/hooks/useWatchlist';
import { I18nProvider, useI18n } from '@/hooks/useI18n';
import { ConfigProvider, useConfig } from '@/hooks/useConfig';
import { setTitles } from '@/data/titles';
import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_900Black,
} from '@expo-google-fonts/inter';
import {
  Alert,
  BackHandler,
  Platform,
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  Pressable,
  Modal,
  ScrollView,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, FontSize, Spacing, Radius } from '@/constants/theme';
import { Wrench, AlertTriangle, RefreshCw, Download } from 'lucide-react-native';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useFrameworkReady();

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
    'Inter-Black': Inter_900Black,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <I18nProvider>
      <ConfigProvider>
        <WatchlistProvider>
          <AppGate />
          <StatusBar style="light" />
        </WatchlistProvider>
      </ConfigProvider>
    </I18nProvider>
  );
}

function AppGate() {
  const { config, titles, status, retry, announcementShown, setAnnouncementShown } = useConfig();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [showForceUpdate, setShowForceUpdate] = useState(false);
  const lastRootBackPress = useRef(0);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    if (titles.length > 0) setTitles(titles);
  }, [titles]);

  useEffect(() => {
    if (status === 'ready' && config) {
      if (config.announcement?.active && !announcementShown) {
        setShowAnnouncement(true);
        setAnnouncementShown(true);
      }
      if (config.force_update) setShowForceUpdate(true);
    }
  }, [status, config, announcementShown, setAnnouncementShown]);

  useEffect(() => {
    const isRoot = (path: string) => path === '/' || path === '/(tabs)' || path === '/(tabs)/index';
    const showExitHint = () => {
      const now = Date.now();
      if (now - lastRootBackPress.current <= 2000) {
        lastRootBackPress.current = 0;
        if (Platform.OS !== 'web') BackHandler.exitApp();
        else if (typeof window !== 'undefined') window.history.back();
      } else {
        lastRootBackPress.current = now;
        Alert.alert('الخروج', 'اضغط مرة أخرى للخروج');
      }
    };

    const backSubscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const currentPath = pathnameRef.current;
      if (!isRoot(currentPath)) {
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)');
        return true;
      }
      showExitHint();
      return true;
    });

    // Expo Router owns normal web route history. Add only a single root guard and restore
    // it after a root-level popstate, without pushing entries on every route render.
    let rootGuardInstalled = false;
    const installRootGuard = () => {
      if (typeof window === 'undefined' || rootGuardInstalled || !isRoot(pathnameRef.current)) return;
      window.history.pushState({ ...(window.history.state || {}), enjoyRootGuard: true }, '', window.location.href);
      rootGuardInstalled = true;
    };
    const onPopState = () => {
      rootGuardInstalled = false;
      if (isRoot(pathnameRef.current)) {
        showExitHint();
        installRootGuard();
      }
    };
    if (Platform.OS === 'web') {
      installRootGuard();
      window.addEventListener('popstate', onPopState);
    }

    return () => {
      backSubscription.remove();
      if (Platform.OS === 'web') window.removeEventListener('popstate', onPopState);
    };
  }, [router]);

  if (status === 'loading') {
    return <SafeAreaView style={gateStyles.container}><View style={gateStyles.centerContent}><ActivityIndicator size="large" color={Colors.primary} /><Text style={gateStyles.loadingText}>{t('loadingConfig')}</Text></View></SafeAreaView>;
  }
  if (status === 'error') {
    return <SafeAreaView style={gateStyles.container}><View style={gateStyles.centerContent}><Text style={gateStyles.errorText}>{t('configError')}</Text><Pressable style={gateStyles.retryBtn} onPress={retry}><RefreshCw size={20} color={Colors.textPrimary} /><Text style={gateStyles.retryText}>{t('retry')}</Text></Pressable></View></SafeAreaView>;
  }
  if (config?.maintenance_mode) {
    return <SafeAreaView style={gateStyles.container}><View style={gateStyles.centerContent}><Wrench size={56} color={Colors.warning} strokeWidth={1.5} /><Text style={gateStyles.maintenanceTitle}>{t('maintenanceTitle')}</Text><Text style={gateStyles.maintenanceMsg}>{config.maintenance_msg}</Text></View></SafeAreaView>;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}><Stack.Screen name="+not-found" /></Stack>
      <Modal visible={showAnnouncement} transparent animationType="fade" onRequestClose={() => setShowAnnouncement(false)}>
        <View style={gateStyles.modalOverlay}><View style={gateStyles.modalCard}><View style={gateStyles.modalIconRow}><AlertTriangle size={28} color={Colors.warning} /></View><Text style={gateStyles.modalTitle}>{config?.announcement?.title || ''}</Text><ScrollView><Text style={gateStyles.modalMsg}>{config?.announcement?.message || ''}</Text></ScrollView><Pressable style={gateStyles.modalBtn} onPress={() => setShowAnnouncement(false)}><Text style={gateStyles.modalBtnText}>{t('close')}</Text></Pressable></View></View>
      </Modal>
      <Modal visible={showForceUpdate} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={gateStyles.modalOverlay}><View style={gateStyles.modalCard}><View style={gateStyles.modalIconRow}><Download size={28} color={Colors.primary} /></View><Text style={gateStyles.modalTitle}>{t('updateAvailable')}</Text><ScrollView><Text style={gateStyles.modalMsg}>{config?.update_notes || ''}</Text></ScrollView><Pressable style={gateStyles.modalBtn} onPress={() => { if (config?.update_url) Linking.openURL(config.update_url); }}><Text style={gateStyles.modalBtnText}>{t('updateNow')}</Text></Pressable></View></View>
      </Modal>
    </>
  );
}

const gateStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  loadingText: { color: Colors.textSecondary, fontSize: FontSize.md, marginTop: Spacing.md },
  errorText: { color: Colors.textPrimary, fontSize: FontSize.lg, textAlign: 'center', marginBottom: Spacing.lg },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.md },
  retryText: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  maintenanceTitle: { color: Colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '800', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  maintenanceMsg: { color: Colors.textSecondary, fontSize: FontSize.md, textAlign: 'center', lineHeight: 24 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  modalCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, width: '100%', maxWidth: 380 },
  modalIconRow: { alignItems: 'center', marginBottom: Spacing.md },
  modalTitle: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: '800', textAlign: 'center', marginBottom: Spacing.md },
  modalMsg: { color: Colors.textSecondary, fontSize: FontSize.md, lineHeight: 24, marginBottom: Spacing.lg, textAlign: 'center' },
  modalBtn: { backgroundColor: Colors.primary, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center' },
  modalBtnText: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
});
