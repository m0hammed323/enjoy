import { Linking } from 'react-native';

export type ExternalPlayerMode = 'chooser' | 'default';

const PLAYER_MODE_KEY = 'enjoy_external_player_mode';

function readStore(): string | null {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(PLAYER_MODE_KEY);
  }

  const globalStore = globalThis as typeof globalThis & {
    __enjoyExternalPlayerMode?: string;
  };

  return globalStore.__enjoyExternalPlayerMode ?? null;
}

function writeStore(value: string) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(PLAYER_MODE_KEY, value);
    return;
  }

  (globalThis as typeof globalThis & { __enjoyExternalPlayerMode?: string }).__enjoyExternalPlayerMode = value;
}

export function getExternalPlayerMode(): ExternalPlayerMode {
  const saved = readStore();
  return saved === 'default' ? 'default' : 'chooser';
}

export function setExternalPlayerMode(mode: ExternalPlayerMode): void {
  writeStore(mode);
}

export async function openExternalVideo(url: string): Promise<boolean> {
  const cleaned = (url || '').trim();
  if (!cleaned) return false;

  try {
    await Linking.openURL(cleaned);
    return true;
  } catch {
    return false;
  }
}
