import { useTranslation } from 'react-i18next';
import { ArrowRight, Receipt, Sparkles, UserPlus, Wallet } from 'lucide-react';
import type { NextAction } from '../lib/nextAction';

interface Props {
  action: NonNullable<NextAction>;
  groupName: string;
  onInvite: () => void;
  onSetup: () => void;
  onSettle: () => void;
  onFirstExpense: () => void;
}

// The one thing to do next in this group. One card, one button.
export default function NextActionCard({
  action,
  groupName,
  onInvite,
  onSetup,
  onSettle,
  onFirstExpense,
}: Props) {
  const { t } = useTranslation();
  const spec = (() => {
    switch (action.kind) {
      case 'invite':
        return {
          icon: <UserPlus className="h-5 w-5" />,
          title: t('next.invite.title'),
          body: t('next.invite.body', { group: groupName }),
          cta: t('next.invite.cta'),
          go: onInvite,
        };
      case 'setup':
        return {
          icon: <Sparkles className="h-5 w-5" />,
          title: t('next.setup.title'),
          body: t('next.setup.body'),
          cta: t('next.setup.cta'),
          go: onSetup,
        };
      case 'settle':
        return {
          icon: <Wallet className="h-5 w-5" />,
          title: t('next.settle.title'),
          body: t('next.settle.body', { count: action.count }),
          cta: t('next.settle.cta'),
          go: onSettle,
        };
      case 'first_expense':
        return {
          icon: <Receipt className="h-5 w-5" />,
          title: t('next.first.title'),
          body: t('next.first.body'),
          cta: t('next.first.cta'),
          go: onFirstExpense,
        };
    }
  })();

  return (
    <div className="bg-white border border-natural-primary/30 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3 animate-in fade-in slide-in-from-top-2">
      <div className="p-2 bg-natural-sage text-natural-primary rounded-xl shrink-0 self-start sm:self-center">
        {spec.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">
          {t('next.label')}
        </p>
        <h3 className="text-sm font-bold text-natural-text">{spec.title}</h3>
        <p className="text-xs text-natural-muted mt-0.5">{spec.body}</p>
      </div>
      <button
        type="button"
        onClick={spec.go}
        className="shrink-0 bg-natural-primary hover:bg-natural-primary-ink text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-sm flex items-center justify-center gap-1.5 transition-colors"
      >
        {spec.cta} <ArrowRight size={14} />
      </button>
    </div>
  );
}
