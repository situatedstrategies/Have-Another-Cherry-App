import { useTranslation, Trans } from 'react-i18next';
import { Tag } from 'lucide-react';
import { RuleSuggestion } from '../lib/rules';
import CategoryChip from './CategoryChip';

interface Props {
  suggestion: RuleSuggestion;
  /** The title as it was logged, for the question. */
  title: string;
  onYes: () => void;
  onNotNow: () => void;
}

/**
 * The one-line nudge after a save: "Always use <Category> for '<title>'?"
 * with Yes and Not now. Yes writes a category rule (lib/rules) to the
 * household plan; Not now just closes it. Sits at the bottom of the window
 * where the saved form was, so it reads as a follow-up to the save.
 */
export default function RuleNudge({ suggestion, title, onYes, onNotNow }: Props) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-40 bg-white border border-natural-border rounded-2xl shadow-lg px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2 animate-in fade-in slide-in-from-bottom-2"
      role="status"
      id="rule-nudge"
    >
      <Tag className="h-4 w-4 text-natural-primary shrink-0" />
      <span className="text-sm text-natural-text flex-1 min-w-[12rem] leading-6">
        <Trans
          i18nKey="rules.nudge"
          values={{ title }}
          components={{
            c: <CategoryChip name={suggestion.category} className="mx-1" />,
            q: <span className="font-medium" />,
          }}
        />
      </span>
      <span className="flex items-center gap-2 ml-auto">
        <button
          type="button"
          onClick={onNotNow}
          className="h-8 px-3 rounded-full text-[13px] font-semibold text-natural-muted hover:text-natural-text cursor-pointer"
          id="rule-nudge-no"
        >
          {t('rules.notNow')}
        </button>
        <button
          type="button"
          onClick={onYes}
          className="h-8 px-3.5 rounded-full bg-natural-dark hover:bg-black text-white text-[13px] font-semibold cursor-pointer"
          id="rule-nudge-yes"
        >
          {t('rules.yes')}
        </button>
      </span>
    </div>
  );
}
