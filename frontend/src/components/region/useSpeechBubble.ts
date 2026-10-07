import { useCallback, useEffect, useRef, useState } from 'react';

export type SpeechBubbleKind = 'ok' | 'error';

export type SpeechBubbleState = {
  text: string;
  kind: SpeechBubbleKind;
  left: number;
  top: number;
  placement: 'above' | 'below';
};

export function useSpeechBubble() {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const timerRef = useRef(0);
  const [bubble, setBubble] = useState<SpeechBubbleState | null>(null);

  const show = useCallback((text: string, kind: SpeechBubbleKind, ms?: number) => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const placement = rect.top > 56 ? 'above' : 'below';
    const left = Math.min(Math.max(rect.left + rect.width / 2, 90), window.innerWidth - 90);
    const top = placement === 'above' ? rect.top - 10 : rect.bottom + 10;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setBubble({ text, kind, left, top, placement });
    const duration = ms ?? (kind === 'ok' ? 2000 : 3000);
    timerRef.current = window.setTimeout(() => setBubble(null), duration);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (!bubble) return;
    const onScroll = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      setBubble(null);
    };
    window.addEventListener('scroll', onScroll, { capture: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, [bubble]);

  return { bubble, show, anchorRef };
}
