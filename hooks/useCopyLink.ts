import { useState, useCallback } from 'react';
import { Alert, Platform } from 'react-native';

export function useCopyLink() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyLink = useCallback(async (url: string, id: string) => {
    if (!url) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      Alert.alert('Error', 'Failed to copy link');
    }
  }, []);

  return { copiedId, copyLink };
}
