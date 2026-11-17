import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, usePathname, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { useFonts } from 'expo-font';
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
  const [exitToastVisible, setExitToastVisible] = useState(false);

  const lastRootBackPress = useRef(0);
  const lastHandledEventTime = useRef(0);
  const guardInstalledRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const showAnnouncementRef = useRef(showAnnouncement);
  showAnnouncementRef.current = showAnnouncement;

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

  // إعادة تفعيل طبقة حماية سجل المتصفح كلما عاد المستخدم للشاشة الرئيسية
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
    const showToastMessage = () => {
      setExitToastVisible(true);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setExitToastVisible(false);
      }, 2000);
    };

    const getCapacitorApp = () =>
      typeof window !== 'undefined' ? (window as any)?.Capacitor?.Plugins?.App : null;

    const exitApplication = () => {
      setExitToastVisible(false);
      const capApp = getCapacitorApp();
      if (capApp?.exitApp) {
        capApp.exitApp();
      } else if (Platform.OS !== 'web') {
        BackHandler.exitApp();
      } else if (typeof window !== 'undefined') {
        window.history.back();
      }
    };

    const handleRootExitCheck = (rePushGuard: boolean) => {
      const now = Date.now();
      if (now - lastRootBackPress.current <= 2000) {
        lastRootBackPress.current = 0;
        exitApplication();
      } else {
        lastRootBackPress.current = now;
        showToastMessage();
        if (rePushGuard && typeof window !== 'undefined') {
          window.history.pushState(
            { ...(window.history.state || {}), enjoyRootGuard: true },
            '',
            window.location.href
          );
          guardInstalledRef.current = true;
        }
      }
    };

    const handleHardwareBack = () => {
      const now = Date.now();
      if (now - lastHandledEventTime.current < 100) return true;
      lastHandledEventTime.current = now;

      // 1. إغلاق نافذة الإعلان إذا كانت مفتوحة
      if (showAnnouncementRef.current) {
        setShowAnnouncement(false);
        return true;
      }

      // 2. الرجوع للخلف إذا لم يكن المستخدم في الشاشة الرئيسية
      const currentPath = pathnameRef.current;
      if (!isRootRoute(currentPath)) {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/');
        }
        return true;
      }

      // 3. في الشاشة الرئيسية: تفعيل "اضغط مرة أخرى للخروج"
      handleRootExitCheck(false);
      return true;
    };

    // مستمع React Native للأندرويد الأصلي
    const nativeBackSub = BackHandler.addEventListener('hardwareBackPress', handleHardwareBack);

    // مستمع Capacitor Android (الأهم لتطبيقات APK المحولة بـ Capacitor)
    let capBackListener: any = null;
    const capApp = getCapacitorApp();
    if (capApp?.addListener) {
      capBackListener = capApp.addListener('backButton', () => {
        handleHardwareBack();
      });
    }

    // مستمع احتياطي لمتصفحات الموبايل العادية
    const onPopState = () => {
      const now = Date.now();
      if (now - lastHandledEventTime.current < 100) return;

      if (showAnnouncementRef.current) {
        lastHandledEventTime.current = now;
        setShowAnnouncement(false);
        window.history.pushState(
          { ...(window.history.state || {}), enjoyRootGuard: true },
          '',
          window.location.href
        );
        return;
      }

      if (guardInstalledRef.current && isRootRoute(pathnameRef.current)) {
        lastHandledEventTime.current = now;
        guardInstalledRef.current = false;
        handleRootExitCheck(true);
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('popstate', onPopState);
      document.addEventListener('backbutton', handleHardwareBack);
    }

    return () => {
      nativeBackSub.remove();
      if (capBackListener?.remove) capBackListener.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('popstate', onPopState);
        document.removeEventListener('backbutton', handleHardwareBack);
      }
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [router]);

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
