import { useState } from 'react';
import { db, authHeader } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';

interface ProfileSetupProps {
  userId: string;
  onComplete: () => void;
}

type Question = {
  key: string;
  type: 'number' | 'select';
  /** Option values, in display order. Labels come from quiz.q.<key>.opt.<value>. */
  options?: string[];
  /** The question has a quiz.q.<key>.help text. */
  hasHelp?: boolean;
  /** The question has a quiz.q.<key>.placeholder text. */
  hasPlaceholder?: boolean;
  /** May be left blank. Someone keeping a ledger alone has no second income to report. */
  optional?: boolean;
};
type Step = { questions: Question[] };

// Detailed, interconnected quiz. Answers are analyzed together by the AI to
// craft a unique profile (see /api/generate-profile). The texts live in
// src/locales under quiz.steps.<index> and quiz.q.<key>, so the structure
// here is only keys, types and option values; the values are what the
// server receives and must not change with the language.
const STEPS: Step[] = [
  {
    questions: [
      { key: 'income', type: 'number', hasPlaceholder: true },
      { key: 'partnerIncome', type: 'number', hasPlaceholder: true, optional: true, hasHelp: true },
      { key: 'spendingStyle', type: 'select', options: ['saver', 'spender', 'balanced', 'depends'] },
    ],
  },
  {
    questions: [
      { key: 'creditCardUsage', type: 'select', options: ['me', 'partner', 'equal', 'neither'] },
      {
        key: 'aprPromo',
        type: 'select',
        hasHelp: true,
        options: ['none', 'mine', 'partners', 'some_not_all', 'not_sure'],
      },
      {
        key: 'creditComfort',
        type: 'select',
        options: ['pay_in_full', 'carry_sometimes', 'carry_often', 'avoid_credit'],
      },
      { key: 'cashVsCredit', type: 'select', options: ['credit_points', 'debit', 'cash', 'whatever'] },
    ],
  },
  {
    questions: [
      { key: 'lowOnCash', type: 'select', options: ['me', 'partner', 'fluctuates'] },
      { key: 'groceries', type: 'select', options: ['me', 'partner', 'split', 'together'] },
      { key: 'paybackPreference', type: 'select', options: ['cash', 'goods', 'services', 'doesnt_matter'] },
    ],
  },
  {
    questions: [
      { key: 'moneyFeeling', type: 'select', options: ['security', 'freedom', 'stress', 'status', 'tool'] },
      { key: 'moneyTalkComfort', type: 'select', options: ['love', 'comfortable', 'awkward', 'avoid'] },
    ],
  },
  {
    questions: [
      {
        key: 'conversationStyle',
        type: 'select',
        options: ['direct', 'scheduled', 'casual', 'written', 'avoid'],
      },
      { key: 'conflictStyle', type: 'select', options: ['compromise', 'data', 'defer', 'pause', 'avoid'] },
      {
        key: 'appGoal',
        type: 'select',
        options: ['conversations', 'fairness', 'transparency', 'detailed', 'accountable'],
      },
    ],
  },
];

const INITIAL_ANSWERS: Record<string, string> = STEPS.flatMap((s) => s.questions).reduce(
  (acc, q) => ({ ...acc, [q.key]: '' }),
  {}
);

export default function ProfileSetup({ userId, onComplete }: ProfileSetupProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>(INITIAL_ANSWERS);

  const setAnswer = (key: string, value: string) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  const currentStep = STEPS[step];
  const isStepComplete = currentStep.questions.every((q) => {
    const raw = (answers[q.key] ?? '').toString().trim();
    if (raw === '') return !!q.optional;
    // Numeric answers (income) must be a sane, non-negative number.
    if (q.type === 'number') {
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 && n < 1_000_000_000;
    }
    return true;
  });
  const isLastStep = step === STEPS.length - 1;

  const handleSubmit = async () => {
    setLoading(true);
    setSubmitError('');
    const fallbackProfile = {
      type: t('quiz.fallback.type'),
      description: t('quiz.fallback.description'),
      quote: t('quiz.fallback.quote'),
      greetingTone: 'harmonious',
    };
    try {
      const res = await fetch('/api/generate-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ answers }),
      });
      const result = await res.json();
      const financialProfile = result.data || fallbackProfile;

      await setDoc(
        doc(db, 'users', userId),
        {
          income: answers.income,
          partnerIncome: answers.partnerIncome,
          quizAnswers: answers,
          financialProfile,
          // The retake cooldown counts from here. Not stamped on the
          // fallback below: a placeholder profile should not lock the
          // person out of a real reading for three months.
          financialProfileAt: new Date().toISOString(),
        },
        { merge: true }
      );
      onComplete();
    } catch (err) {
      console.error(err);
      try {
        await setDoc(
          doc(db, 'users', userId),
          {
            income: answers.income,
            partnerIncome: answers.partnerIncome,
            quizAnswers: answers,
            financialProfile: fallbackProfile,
          },
          { merge: true }
        );
        onComplete();
      } catch (innerErr) {
        // Both the profile generation and the plain save failed, so the
        // answers never reached the account. Say so rather than dropping
        // back to the quiz as if nothing happened.
        console.error('Profile save failed', innerErr);
        setSubmitError(t('quiz.saveFailed'));
        setLoading(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-natural-sidebar flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-natural-border border-t-natural-text rounded-full animate-spin mx-auto"></div>
          <h2 className="text-xl font-display font-semibold text-natural-text">
            {t('quiz.crafting')}
          </h2>
          <p className="text-sm text-natural-muted">{t('quiz.reading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-natural-sidebar flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-lg shadow-sm border border-natural-border w-full max-w-md overflow-hidden relative p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-display font-semibold text-natural-text mb-1">
            {t('quiz.title')}
          </h1>
          <p className="text-sm text-natural-muted">
            {t(`quiz.steps.${step}.subtitle`, { defaultValue: t('quiz.defaultSubtitle') })}
          </p>
          {/* Progress */}
          <div className="flex gap-1.5 mt-4">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-natural-primary' : 'bg-natural-border'}`}
              />
            ))}
          </div>
          <p className="text-[11px] font-bold text-natural-muted uppercase tracking-wider mt-3">
            {t('quiz.stepOf', { step: step + 1, total: STEPS.length, title: t(`quiz.steps.${step}.title`) })}
          </p>
        </div>

        {submitError && (
          <div className="mb-4 bg-natural-primary/5 text-natural-primary p-3 rounded-md text-sm font-medium border border-natural-primary/15 flex items-start gap-2">
            <span className="shrink-0">⚠️</span>
            <span>{submitError}</span>
          </div>
        )}

        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
          {currentStep.questions.map((q) => (
            <div key={q.key}>
              <label className="block text-sm font-semibold text-natural-text mb-2">
                {t(`quiz.q.${q.key}.label`)}
              </label>
              {q.type === 'number' ? (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-muted">
                    $
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="100000000"
                    step="1000"
                    value={answers[q.key] || ''}
                    onChange={(e) => setAnswer(q.key, e.target.value)}
                    placeholder={q.hasPlaceholder ? t('group.amount') : undefined}
                    className="w-full pl-7 p-3 bg-natural-sidebar border border-natural-border rounded-md focus:outline-none focus:ring-1 focus:ring-natural-text text-sm"
                  />
                </div>
              ) : (
                <select
                  value={answers[q.key] || ''}
                  onChange={(e) => setAnswer(q.key, e.target.value)}
                  className="w-full p-3 bg-natural-sidebar border border-natural-border rounded-md focus:outline-none focus:ring-1 focus:ring-natural-text text-sm"
                >
                  <option value="">{t('quiz.select')}</option>
                  {q.options?.map((value) => (
                    <option key={value} value={value}>
                      {t(`quiz.q.${q.key}.opt.${value}`)}
                    </option>
                  ))}
                </select>
              )}
              {q.hasHelp && (
                <p className="text-xs text-natural-muted mt-1">{t(`quiz.q.${q.key}.help`)}</p>
              )}
            </div>
          ))}

          <div className="flex gap-3 pt-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="w-1/3 bg-natural-border text-natural-text font-medium py-3 px-4 rounded-md hover:bg-natural-border/80"
              >
                {t('common.back')}
              </button>
            )}
            {!isLastStep ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={!isStepComplete}
                className={`${step > 0 ? 'w-2/3' : 'w-full'} bg-natural-primary text-white font-medium py-3 px-4 rounded-md hover:bg-natural-primary/90 disabled:opacity-50`}
              >
                {t('common.next')}
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!isStepComplete}
                className={`${step > 0 ? 'w-2/3' : 'w-full'} bg-natural-primary text-white font-medium py-3 px-4 rounded-md hover:bg-natural-primary-ink transition-colors disabled:opacity-50`}
              >
                {t('quiz.generateProfile')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
