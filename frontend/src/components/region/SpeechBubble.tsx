import { createPortal } from 'react-dom';
import type { SpeechBubbleState } from './useSpeechBubble';

type Props = {
  bubble: SpeechBubbleState | null;
};

export function SpeechBubble({ bubble }: Props) {
  if (!bubble) return null;
  return createPortal(
    <div
      className={`speech-bubble speech-bubble--${bubble.placement} speech-bubble--${bubble.kind}`}
      style={{ left: bubble.left, top: bubble.top }}
      role="status"
    >
      {bubble.text}
    </div>,
    document.body,
  );
}
