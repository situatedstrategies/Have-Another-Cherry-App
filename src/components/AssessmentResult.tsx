import { useTranslation } from 'react-i18next';
import type { Assessment } from '../types';

interface Props {
  assessment: Assessment;
  /** Full screen after the quiz, or the compact card in Settings. */
  compact?: boolean;
  onContinue?: () => void;
}

// The written assessment: a style name, a short summary, what to lean on,
// what to watch for, the split the model would start from and the openers.
// Advisory copy about shared money, never about investing or credit; shown
// to its owner only.
export default function AssessmentResult({ assessment: a, compact, onContinue }: Props) {
  const { t } = useTranslation();
  const list = (items: string[], title: string) =>
    items.length > 0 && (
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-natural-muted mb-1">
          {title}
        </p>
        <ul className="space-y-1">
          {items.map((s, i) => (
            <li key={i} className="text-xs text-natural-text flex gap-2">
              <span className="text-natural-primary">•</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className={compact ? 'space-y-3' : 'space-y-5'}>
      <div>
        {!compact && (
          <p className="text-[11px] font-bold uppercase tracking-wider text-natural-muted mb-1">
            {t('assessment.yourStyle')}
          </p>
        )}
        <h2
          className={`${compact ? 'text-base' : 'text-2xl'} font-display font-semibold text-natural-text`}
        >
          {a.style}
        </h2>
        <p className="text-sm text-natural-text mt-2 leading-relaxed">{a.summary}</p>
      </div>
      <div className={`grid ${compact ? 'gap-3' : 'sm:grid-cols-2 gap-4'}`}>
        {list(a.strengths, t('assessment.strengths'))}
        {list(a.watchFor, t('assessment.watchFor'))}
      </div>
      {a.suggestedSplit?.why && (
        <div className="bg-natural-sage/20 border border-natural-primary/20 rounded-xl p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-natural-muted mb-1">
            {t('assessment.suggestedSplit')}
          </p>
          <p className="text-xs text-natural-text">
            <strong>{t(`assessment.split.${a.suggestedSplit.kind}`)}.</strong>{' '}
            {a.suggestedSplit.why}
          </p>
        </div>
      )}
      {list(a.conversationOpeners, t('assessment.openers'))}
      {!compact && <p className="text-[11px] text-natural-muted">{t('assessment.disclaimer')}</p>}
      {onContinue && (
        <button
          type="button"
          onClick={onContinue}
          className="w-full bg-natural-primary text-white font-medium py-3 px-4 rounded-md hover:bg-natural-primary-ink transition-colors"
        >
          {t('assessment.continue')}
        </button>
      )}
    </div>
  );
}
