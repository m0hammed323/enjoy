import { EnjoyPlayer } from '@/components/EnjoyPlayer';

interface SportsTVPlayerProps {
  embedUrl: string;
  title: string;
  titleId: string;
  onClose: () => void;
  directStreamUrl?: string;
  isLive?: boolean;
}

/** Legacy name retained as a wrapper around the unified player. */
export function SportsTVPlayer({ embedUrl, title, titleId: _titleId, onClose, directStreamUrl, isLive }: SportsTVPlayerProps) {
  return <EnjoyPlayer title={title} url={directStreamUrl || embedUrl} qualities={[]} channels={[]} forceLandscape isLive={isLive} onClose={onClose} />;
}
