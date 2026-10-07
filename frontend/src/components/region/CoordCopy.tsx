import { useI18n } from '../../i18n/I18nContext';
import { IconCopy } from '../GraphControlIcons';
import { SpeechBubble } from './SpeechBubble';
import { useSpeechBubble } from './useSpeechBubble';
import { formatTpCoords } from './formatTpCoords';

type Props = {
  x: string;
  y: string;
  z: string;
  className?: string;
};

export function CoordCopy({ x, y, z }: Props) {
  const { t } = useI18n();
  const { bubble, show, anchorRef } = useSpeechBubble();
  const text = formatTpCoords(x, y, z);

  const onCopy = () => {
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => {
      show(`${t('region.copiedFlash')}: ${text}`, 'ok');
    });
  };

  if (!text) {
    return <span>{`${x || '—'} ${y || '—'} ${z || '—'}`}</span>;
  }

  return (
    <>
      <span className="region-coord-text">{text}</span>
      <button
        ref={anchorRef}
        type="button"
        className="icon-btn region-coord-copy-btn"
        title={t('region.copyCoords')}
        aria-label={t('region.copyCoords')}
        onClick={onCopy}
      >
        <IconCopy size={20} />
      </button>
      <SpeechBubble bubble={bubble} />
    </>
  );
}
