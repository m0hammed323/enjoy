import * as Linking from 'expo-linking';
import { Alert, Platform } from 'react-native';

export interface EnjoyPlayerOptions {
  url: string;
  title?: string;
  subtitle?: string;
  referer?: string;
  userAgent?: string;
}

/**
 * فتح الفيديو أو القناة في مشغل Enjoy Player الخارجي
 */
export async function openInEnjoyPlayer({
  url,
  title = 'فيديو',
  subtitle = '',
  referer = '',
  userAgent = '',
}: EnjoyPlayerOptions): Promise<void> {
  if (!url || !url.trim()) {
    Alert.alert('خطأ', 'رابط التشغيل غير متوفر');
    return;
  }

  const cleanUrl = url.trim();

  const queryParams = new URLSearchParams();
  queryParams.append('url', cleanUrl);
  if (title) queryParams.append('title', title);
  if (subtitle) queryParams.append('subtitle', subtitle);
  if (referer) queryParams.append('referer', referer);
  if (userAgent) queryParams.append('userAgent', userAgent);

  const deepLink = `enjoyplayer://play?${queryParams.toString()}`;

  const androidIntentUrl = `intent:${cleanUrl}#Intent;action=android.intent.action.VIEW;package=com.aistudio.enjoyplayer.xkpqwm;type=video/*;S.title=${encodeURIComponent(
    title
  )};S.subtitle=${encodeURIComponent(subtitle)};end`;

  try {
    if (Platform.OS === 'android') {
      const canOpen = await Linking.canOpenURL(deepLink);
      if (canOpen) {
        await Linking.openURL(deepLink);
        return;
      }
      await Linking.openURL(androidIntentUrl);
    } else {
      await Linking.openURL(deepLink);
    }
  } catch {
    Alert.alert(
      'تطبيق المشغل غير موجود',
      'يرجى تثبيت تطبيق Enjoy Player على جهازك أولاً ليتمكن من تشغيل الفيديو تلقائياً.'
    );
  }
}
