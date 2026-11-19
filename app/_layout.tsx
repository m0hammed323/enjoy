import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, usePathname, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { App } from '@capacitor/app';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { useFonts } from 'expo-font';
import { WatchlistProvider } from '@/hooks/useWatchlist';
import { WatchHistoryProvider } from '@/hooks/useWatchHistory';
import { FavoritesProvider } from '@/hooks/useFavorites';
import { DrawerProvider } from '@/hooks/useDrawer';
import { I18nProvider, useI18n } from '@/hooks/useI18n';
import { ConfigProvider, useConfig } from '@/hooks/useConfig';
import { SideDrawer } from '@/components/SideDrawer';
import { setTitles } from '@/data/titles';
import { APP_VERSION } from '@/constants/appVersion';
import { registerBackInterceptor, dispatchBackAction, exitAppCleanly } from '@/utils/backNavigation';
import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_900Black,
} from '@expo-google-fonts/inter';
import {
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

const isRootRoute = (path: string) =>
  path === '/' || path === '/(tabs)' || path === '/(tabs)/index' || path === '';

function compareVersions(current: string, target: string): number {
  const cParts = current.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const tParts = target.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(cParts.length, tParts.length);
  for (let i = 0; i < len; i++) {
    const c = cParts[i] ?? 0;
    const t = tParts[i] ?? 0;
    if (c < t) return -1;
    if (c > t) return 1;
  }
  return 0;
}

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
        <WatchHistoryProvider>
          <FavoritesProvider>
            <WatchlistProvider>
              <DrawerProvider>
                <AppGate />
                <StatusBar style="light" />
              </DrawerProvider>
            </WatchlistProvider>
          </FavoritesProvider>
        </WatchHistoryProvider>
      </ConfigProvider>
    </I18nProvider>
  );
}

function AppGate() {
  const { config, titles, status, retry, announcementShown, setAnnouncementShown } = useConfig();
  const { t, isRTL } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [showForceUpdate, setShowForceUpdate] = useState(false);
  const [exitToastVisible, setExitToastVisible] = useState(false);

  const lastRootBackPress = useRef(0);
  const guardInstalledRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const routerRef = useRef(router);
  routerRef.current = router;
  const announcementRef = useRef(showAnnouncement);
  announcementRef.current = showAnnouncement;
  const forceUpdateRef = useRef(showForceUpdate);
  forceUpdateRef.current = showForceUpdate;

  useEffect(() => {
    if (titles.length > 0) setTitles(titles);
  }, [titles]);

  useEffect(() => {
    if (status === 'ready' && config) {
      const targetMinVersion = config.min_version || config.app_version || '';
      const isOutdated =
        Boolean(config.force_update) &&
        Boolean(targetMinVersion) &&
        compareVersions(APP_VERSION, targetMinVersion) < 0;
      const isExplicitlyBlocked =
        Array.isArray(config.blocked_versions) && config.blocked_versions.includes(APP_VERSION);

      if (isOutdated || isExplicitlyBlocked) {
        setShowForceUpdate(true);
        return;
      } else {
        setShowForceUpdate(false);
      }

      if (config.announcement?.active && !announcementShown) {
        setShowAnnouncement(true);
        setAnnouncementShown(true);
      }
    }
  }, [status, config, announcementShown, setAnnouncementShown]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (isRootRoute(pathname) && !guardInstalledRef.current) {
      window.history.pushState(
        { ...(window.history.state || {}), enjoyRootGuard: true },
        '',
        window.location.href
      );
      guardInstalledRef.current = true;
    } else if (!isRootRoute(pathname)) {
      guardInstalledRef.current = false;
    }
  }, [pathname]);

  useEffect(() => {
    const showExitToast = () => {
      setExitToastVisible(true);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setExitToastVisible(false), 2000);
    };

    const unregisterModal = registerBackInterceptor(() => {
      if (announcementRef.current) {
        setShowAnnouncement(false);
        return true;
      }
      if (forceUpdateRef.current) return true;
      return false;
    }, 1000);

    const unregisterRoute = registerBackInterceptor(() => {
      const currentPath = pathnameRef.current;
      if (isRootRoute(currentPath)) return false;
      if (routerRef.current.canGoBack()) routerRef.current.back();
      else routerRef.current.replace('/');
      return true;
    }, 100);

    const unregisterRoot = registerBackInterceptor(() => {
      const now = Date.now();
      if (now - lastRootBackPress.current <= 2000) {
        lastRootBackPress.current = 0;
        setExitToastVisible(false);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        void exitAppCleanly();
      } else {
        lastRootBackPress.current = now;
        showExitToast();
      }
      return true;
    }, 0);

    const onNativeBack = () => {
      dispatchBackAction('native');
      return true;
    };
    const nativeBackSubscription = BackHandler.addEventListener('hardwareBackPress', onNativeBack);

    let disposed = false;
    let removeCapacitorListener: (() => void) | undefined;
    void App.addListener('backButton', () => {
      dispatchBackAction('capacitor');
    }).then((listener) => {
      if (disposed) void listener.remove();
      else removeCapacitorListener = () => { void listener.remove(); };
    }).catch(() => {});

    const onPopState = () => {
      if (isRootRoute(pathnameRef.current) && typeof window !== 'undefined') {
        window.history.pushState(
          { ...(window.history.state || {}), enjoyRootGuard: true },
          '',
          window.location.href
        );
        guardInstalledRef.current = true;
      }
      dispatchBackAction('popstate');
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('popstate', onPopState);
    }

    return () => {
      disposed = true;
      removeCapacitorListener?.();
      nativeBackSubscription.remove();
      unregisterModal();
      unregisterRoute();
      unregisterRoot();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('popstate', onPopState);
      }
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  if (status === 'loading') {
    return (
      <SafeAreaView style={gateStyles.container}>
        <View style={gateStyles.centerContent}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={gateStyles.loadingText}>{t('loadingConfig')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (status === 'error') {
    return (
      <SafeAreaView style={gateStyles.container}>
        <View style={gateStyles.centerContent}>
          <Text style={gateStyles.errorText}>{t('configError')}</Text>
          <Pressable style={gateStyles.retryBtn} onPress={retry}>
            <RefreshCw size={20} color={Colors.textPrimary} />
            <Text style={gateStyles.retryText}>{t('retry')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (config?.maintenance_mode) {
    return (
      <SafeAreaView style={gateStyles.container}>
        <View style={gateStyles.centerContent}>
          <Wrench size={56} color={Colors.warning} strokeWidth={1.5} />
          <Text style={gateStyles.maintenanceTitle}>{t('maintenanceTitle')}</Text>
          <Text style={gateStyles.maintenanceMsg}>{config.maintenance_msg}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="+not-found" />
      </Stack>

      {!showForceUpdate && <SideDrawer />}

      <Modal
        visible={showAnnouncement}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAnnouncement(false)}
      >
        <View style={gateStyles.modalOverlay}>
          <View style={gateStyles.modalCard}>
            <View style={gateStyles.modalIconRow}>
              <AlertTriangle size={28} color={Colors.warning} />
            </View>
            <Text style={gateStyles.modalTitle}>{config?.announcement?.title || ''}</Text>
            <ScrollView>
              <Text style={gateStyles.modalMsg}>{config?.announcement?.message || ''}</Text>
            </ScrollView>
            <Pressable style={gateStyles.modalBtn} onPress={() => setShowAnnouncement(false)}>
              <Text style={gateStyles.modalBtnText}>{t('close')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showForceUpdate} transparent={false} animationType="fade" onRequestClose={() => {}}>
        <View style={gateStyles.lockScreenOverlay}>
          <View style={gateStyles.modalCard}>
            <View style={gateStyles.modalIconRow}>
              <Download size={34} color={Colors.primary} />
            </View>
            <Text style={gateStyles.modalTitle}>{t('updateAvailable')}</Text>
            <View style={gateStyles.versionComparePill}>
              <Text style={gateStyles.versionCompareText}>
                {isRTL
                  ? `نسختك: v${APP_VERSION}  ←  المطلوبة: v${config?.min_version || config?.app_version || ''}`
                  : `Your version: v${APP_VERSION}  →  Required: v${config?.min_version || config?.app_version || ''}`}
              </Text>
            </View>
            <ScrollView style={{ maxHeight: 180 }}>
              <Text style={gateStyles.modalMsg}>
                {config?.update_notes ||
                  (isRTL
                    ? 'تم إيقاف هذا الإصدار القديم. يرجى تحميل أحدث إصدار للاستمرار في المشاهدة.'
                    : 'This older version is no longer supported. Please download the latest version to continue.')}
              </Text>
            </ScrollView>
            <Pressable
              style={gateStyles.modalBtn}
              onPress={() => {
                if (config?.update_url) Linking.openURL(config.update_url);
              }}
            >
              <Text style={gateStyles.modalBtnText}>{t('updateNow')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {exitToastVisible && (
        <View pointerEvents="none" style={gateStyles.exitToastContainer}>
          <View style={gateStyles.exitToastPill}>
            <Text style={gateStyles.exitToastText}>اضغط مرة أخرى للخروج</Text>
          </View>
        </View>
      )}
    </View>
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  lockScreenOverlay: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  modalCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, width: '100%', maxWidth: 380, borderWidth: 1, borderColor: Colors.border },
  modalIconRow: { alignItems: 'center', marginBottom: Spacing.md },
  modalTitle: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: '800', textAlign: 'center', marginBottom: Spacing.sm },
  versionComparePill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(229, 9, 20, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.35)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    marginBottom: Spacing.md,
  },
  versionCompareText: { color: Colors.primary, fontSize: 11, fontWeight: '800' },
  modalMsg: { color: Colors.textSecondary, fontSize: FontSize.md, lineHeight: 24, marginBottom: Spacing.lg, textAlign: 'center' },
  modalBtn: { backgroundColor: Colors.primary, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center' },
  modalBtnText: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  exitToastContainer: {
    position: 'absolute',
    bottom: 42,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 99999,
  },
  exitToastPill: {
    backgroundColor: 'rgba(20, 20, 20, 0.92)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  exitToastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
