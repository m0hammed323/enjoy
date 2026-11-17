import { Linking, Platform } from 'react-native';
import { extractStreamUrl } from '@/utils/streamExtractor';

export type ExternalPlayerMode = 'chooser' | 'default';

const PLAYER_MODE_KEY = 'enjoy_external_player_mode';

function readStore(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(PLAYER_MODE_KEY) : null;
  } catch {
    return null;
  }
}

export function getExternalPlayerMode(): ExternalPlayerMode {
  return readStore() === 'default' ? 'default' : 'chooser';
}

export function setExternalPlayerMode(mode: ExternalPlayerMode): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(PLAYER_MODE_KEY, mode);
  } catch {
    // Keep playback available when storage is disabled.
  }
}

async function getPlayableUrl(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) return url;
  try {
    const { sources } = await extractStreamUrl(url);
    return sources[0]?.url || url;
  } catch {
    return url;
  }
}

export async function openExternalVideo(url: string): Promise<boolean> {
  const cleaned = (url || '').trim();
  if (!cleaned) return false;

  const playableUrl = await getPlayableUrl(cleaned);
  try {
    if (Platform.OS === 'android' && /^https?:\/\//i.test(playableUrl)) {
      const intentUrl = playableUrl.replace(/^https?:\/\//i, 'intent://');
      const mode = getExternalPlayerMode();
      const mimeType = /\.m3u8?(?:$|\?)/i.test(playableUrl) ? 'video/*' : 'video/*';
      const intent = `${intentUrl}#Intent;scheme=https;action=android.intent.action.VIEW;type=${mimeType};${mode === 'chooser' ? 'launchFlags=0x10000000;' : ''}end`;
      await Linking.openURL(intent);
      return true;
    }

    await Linking.openURL(playableUrl);
    return true;
  } catch {
    try {
      await Linking.openURL(playableUrl);
      return true;
    } catch {
      return false;
    }
  }
}

export function getExternalPlayerModeLabel(mode: ExternalPlayerMode): string {
  return mode === 'chooser' ? 'اختر مشغلاً عند التشغيل' : 'استخدم المشغل الافتراضي للجهاز';
}

export function setExternalPlayerPreference(mode: ExternalPlayerMode): void {
  setExternalPlayerMode(mode);
}
