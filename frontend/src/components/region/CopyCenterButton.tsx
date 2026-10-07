import { useEffect, useState } from 'react';
import { fetchIntersectionCenter } from '../../api';
import { useI18n } from '../../i18n/I18nContext';
import { SpeechBubble } from './SpeechBubble';
import { useSpeechBubble } from './useSpeechBubble';
import { formatTpCoords } from './formatTpCoords';

const centerCache = new Map<string, { x: number; y: number; z: number }>();

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

type Props = {
  regionId: string;
  otherRegionId: string;
};

export function CopyCenterButton({ regionId, otherRegionId }: Props) {
  const { t } = useI18n();
  const [display, setDisplay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { bubble, show, anchorRef } = useSpeechBubble();

  useEffect(() => {
    let cancelled = false;
    const key = pairKey(regionId, otherRegionId);
    const cached = centerCache.get(key);
    if (cached) {
      setDisplay(formatTpCoords(String(cached.x), String(cached.y), String(cached.z)));
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    setDisplay(null);
    void fetchIntersectionCenter(regionId, otherRegionId)
      .then((center) => {
        if (cancelled) return;
        centerCache.set(key, center);
        setDisplay(formatTpCoords(String(center.x), String(center.y), String(center.z)));
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [regionId, otherRegionId]);

  const onCopy = () => {
    if (!display) return;
    void navigator.clipboard.writeText(display).then(() => {
      show(`${t('region.copiedFlash')}: ${display}`, 'ok');
    });
  };

  if (loading) return <span className="region-copy-center-loading">…</span>;
  if (error || !display) {
    return <span className="region-copy-center-error" title={t('region.copyIntersectionCenterNoOverlap')}>—</span>;
  }

  return (
    <span className="region-copy-center-wrap">
      <button
        ref={anchorRef}
        type="button"
        className="region-link region-coord-text region-num-col"
        title={t('region.copyIntersectionCenter')}
        onClick={onCopy}
      >
        {display}
      </button>
      <SpeechBubble bubble={bubble} />
    </span>
  );
}
