import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, usePathname, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { App } from '@capacitor/app';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { useFonts } from 'expo-font';
import { WatchlistProvider } from '@/hooks/useWatchlist';
import { WatchHistoryProvider } from '@/hooks/useWatchHistory';
import { FavoritesProvider } from '@/hooks/useFavorites';
import { I18nProvider, useI18n } from '@/hooks/useI18n';
import { ConfigProvider, useConfig } from '@/hooks/useConfig';
import { setTitles } from '@/data/titles';
import { registerBackInterceptor, dispatchBackAction, exitAppCleanly, BackActionSource } from '@/utils/backNavigation';
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
              <AppGate />
              <StatusBar style="light" />
            </WatchlistProvider>
          </FavoritesProvider>
        </WatchHistoryProvider>
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
      if (config.announcement?.active && !announcementShown) {
        setShowAnnouncement(true);
        setAnnouncementShown(true);
      }
      if (config.force_update) setShowForceUpdate(true);
    }
  }, [status, config, announcementShown, setAnnouncementShown]);

  // Keep a root history entry available so browser/WebView Back reaches our dispatcher.
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
      // A force-update dialog cannot be dismissed; consume Back rather than leaving it behind.
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
    }).catch(() => {
      // Capacitor App is unavailable in a regular web/React Native runtime.
    });

    const onPopState = () => {
      // Restore the persistent root guard before route handling, so a second Back is intercepted too.
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
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="+not-found" />
      </Stack>

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

      <Modal visible={showForceUpdate} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={gateStyles.modalOverlay}>
          <View style={gateStyles.modalCard}>
            <View style={gateStyles.modalIconRow}>
              <Download size={28} color={Colors.primary} />
            </View>
            <Text style={gateStyles.modalTitle}>{t('updateAvailable')}</Text>
            <ScrollView>
              <Text style={gateStyles.modalMsg}>{config?.update_notes || ''}</Text>
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
