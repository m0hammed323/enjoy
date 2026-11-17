import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { BackHandler } from 'react-native';

export type BackActionSource = 'capacitor' | 'native' | 'popstate' | 'programmatic';
export type BackInterceptor = (source: BackActionSource) => boolean | void;

interface InterceptorEntry {
  id: number;
  priority: number;
  order: number;
  interceptor: BackInterceptor;
}

const interceptors: InterceptorEntry[] = [];
let nextId = 1;
let lastDispatchAt = 0;
const EVENT_DEBOUNCE_MS = 120;

/** Register a back handler. Higher priorities run first; return false to let the next handler try. */
export function registerBackInterceptor(
  interceptor: BackInterceptor,
  priority = 0
): () => void {
  const entry: InterceptorEntry = {
    id: nextId++,
    priority,
    order: nextId,
    interceptor,
  };
  interceptors.push(entry);
  interceptors.sort((a, b) => b.priority - a.priority || b.order - a.order);

  return () => {
    const index = interceptors.findIndex((candidate) => candidate.id === entry.id);
    if (index >= 0) interceptors.splice(index, 1);
  };
}

/** Dispatch one Back event, ignoring duplicate WebView/native events within 120ms. */
export function dispatchBackAction(source: BackActionSource = 'programmatic'): boolean {
  const now = Date.now();
  if (now - lastDispatchAt < EVENT_DEBOUNCE_MS) return true;
  lastDispatchAt = now;

  for (const { interceptor } of [...interceptors]) {
    if (interceptor(source) !== false) return true;
  }
  return false;
}

/** Exit a Capacitor Android app cleanly, with a React Native fallback. */
export async function exitAppCleanly(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await App.exitApp();
      return;
    } catch {
      // Fall through to the native React Native back-stack exit where available.
    }
  }
  if (Capacitor.getPlatform() === 'android') BackHandler.exitApp();
}
