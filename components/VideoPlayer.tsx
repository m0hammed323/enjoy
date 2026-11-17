import { EnjoyPlayer } from '@/components/EnjoyPlayer';

interface VideoPlayerProps {
  embedUrl: string;
  title: string;
  titleId: string;
  onClose: () => void;
  directStreamUrl?: string;
  isLive?: boolean;
}

/** Backward-compatible wrapper; all playback is handled by EnjoyPlayer. */
export function VideoPlayer({ embedUrl, title, titleId: _titleId, onClose, directStreamUrl, isLive }: VideoPlayerProps) {
  return <EnjoyPlayer title={title} url={directStreamUrl || embedUrl} qualities={[]} channels={[]} forceLandscape isLive={isLive} onClose={onClose} />;
}
