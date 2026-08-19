import React, { useState } from 'react';
import { db, authHeader } from '../firebase';
import { doc, setDoc, collection, addDoc } from 'firebase/firestore';

interface ProfileSetupProps {
  userId: string;
  onComplete: () => void;
}

type Option = { value: string; label: string };
type Question = {
  key: string;
  label: string;
  type: 'number' | 'select';
  placeholder?: string;
  help?: string;
  options?: Option[];
};
type Step = { title: string; subtitle?: string; questions: Question[] };

// Detailed, interconnected quiz. Answers are analyzed together by the AI to
// craft a unique profile (see /api/generate-profile).
const STEPS: Step[] = [
  {
    title: 'Income & instincts',
    subtitle: "Let's start with the big picture.",
    questions: [
      { key: 'income', type: 'number', label: 'Your approximate annual income', placeholder: 'e.g. 75000' },
      { key: 'partnerIncome', type: 'number', label: "Your partner's / housemate's approximate annual income", placeholder: 'e.g. 60000' },
      {
        key: 'spendingStyle',
        type: 'select',
        label: 'Which sounds most like you?',
        options: [
          { value: 'saver', label: 'A saver - I hold on tight' },
          { value: 'spender', label: 'A spender - I enjoy today' },
          { value: 'balanced', label: 'Balanced - a bit of both' },
          { value: 'depends', label: 'It depends on the month' },
        ],
      },
    ],
  },
  {
    title: 'Credit & cash habits',
    subtitle: 'How money actually moves between you.',
    questions: [
      {
        key: 'creditCardUsage',
        type: 'select',
        label: 'Who reaches for a credit card more often?',
        options: [
          { value: 'me', label: 'Me, almost always' },
          { value: 'partner', label: 'My partner / housemate' },
          { value: 'equal', label: 'We use them about equally' },
          { value: 'neither', label: 'We mostly use cash / debit' },
        ],
      },
      {
        key: 'aprPromo',
        type: 'select',
        label: 'Are any credit cards on a 0% APR promo right now?',
        help: 'This helps us understand how you carry balances.',
        options: [
          { value: 'none', label: 'No, none are' },
          { value: 'mine', label: 'Yes, mine are' },
          { value: 'partners', label: "Yes, my partner's are" },
          { value: 'some_not_all', label: 'Some cards are, but not all' },
          { value: 'not_sure', label: 'Not sure' },
        ],
      },
      {
        key: 'creditComfort',
        type: 'select',
        label: 'When a credit card statement arrives, you usually…',
        options: [
          { value: 'pay_in_full', label: 'Pay it in full, always' },
          { value: 'carry_sometimes', label: 'Carry a balance sometimes' },
          { value: 'carry_often', label: 'Carry a balance often' },
          { value: 'avoid_credit', label: "Avoid credit so there's nothing to pay" },
        ],
      },
      {
        key: 'cashVsCredit',
        type: 'select',
        label: 'For shared purchases, what do you prefer?',
        options: [
          { value: 'credit_points', label: 'Credit - I like the points/rewards' },
          { value: 'debit', label: 'Debit - straight from the account' },
          { value: 'cash', label: 'Cash - it feels more real' },
          { value: 'whatever', label: "Whatever's easiest in the moment" },
        ],
      },
    ],
  },
  {
    title: 'Household flow',
    subtitle: 'The day-to-day of sharing a home.',
    questions: [
      {
        key: 'lowOnCash',
        type: 'select',
        label: 'Who tends to be lower on liquid cash?',
        options: [
          { value: 'me', label: 'Me' },
          { value: 'partner', label: 'My partner / housemate' },
          { value: 'fluctuates', label: 'It fluctuates evenly' },
        ],
      },
      {
        key: 'groceries',
        type: 'select',
        label: 'Who usually pays for groceries or does the shopping?',
        options: [
          { value: 'me', label: 'Mostly me' },
          { value: 'partner', label: 'Mostly my partner / housemate' },
          { value: 'split', label: 'We take turns evenly' },
          { value: 'together', label: 'We shop and pay together' },
        ],
      },
      {
        key: 'paybackPreference',
        type: 'select',
        label: 'How do you prefer to get paid back?',
        options: [
          { value: 'cash', label: 'Direct transfer (Cash, Venmo, Zelle)' },
          { value: 'goods', label: 'In goods (they buy dinner next time)' },
          { value: 'services', label: 'In services (they handle a chore)' },
          { value: 'doesnt_matter', label: "Whatever's easiest" },
        ],
      },
    ],
  },
  {
    title: 'How money feels',
    subtitle: 'There are no wrong answers here.',
    questions: [
      {
        key: 'moneyFeeling',
        type: 'select',
        label: 'When you think about money, it mostly represents…',
        options: [
          { value: 'security', label: 'Security & peace of mind' },
          { value: 'freedom', label: 'Freedom & options' },
          { value: 'stress', label: 'Stress & pressure' },
          { value: 'status', label: 'Achievement & status' },
          { value: 'tool', label: 'Just a tool - nothing emotional' },
        ],
      },
      {
        key: 'moneyTalkComfort',
        type: 'select',
        label: 'How do you feel about talking about money?',
        options: [
          { value: 'love', label: 'I love it - bring it on' },
          { value: 'comfortable', label: "I'm comfortable when it comes up" },
          { value: 'awkward', label: 'It feels a little awkward' },
          { value: 'avoid', label: 'I tend to avoid it' },
        ],
      },
    ],
  },
  {
    title: 'Talking it through',
    subtitle: 'How you like to handle the conversations.',
    questions: [
      {
        key: 'conversationStyle',
        type: 'select',
        label: 'How do you like to start a money conversation?',
        options: [
          { value: 'direct', label: 'Directly and in the moment' },
          { value: 'scheduled', label: 'A planned check-in / money date' },
          { value: 'casual', label: 'Casually, woven into everyday chat' },
          { value: 'written', label: 'In writing (text/notes) first' },
          { value: 'avoid', label: "I'd rather not start it at all" },
        ],
      },
      {
        key: 'conflictStyle',
        type: 'select',
        label: 'When you and a partner disagree about money, you tend to…',
        options: [
          { value: 'compromise', label: 'Look for a middle-ground compromise' },
          { value: 'data', label: 'Pull up the numbers and get specific' },
          { value: 'defer', label: 'Defer to whoever cares more' },
          { value: 'pause', label: 'Take a pause and revisit later' },
          { value: 'avoid', label: 'Let it go to keep the peace' },
        ],
      },
      {
        key: 'appGoal',
        type: 'select',
        label: 'What is your primary goal for using this app?',
        options: [
          { value: 'conversations', label: 'Improving conversations about money' },
          { value: 'fairness', label: 'Creating more fairness in spending' },
          { value: 'transparency', label: 'Being more transparent with each other' },
          { value: 'detailed', label: 'Detailed spending tracking' },
          { value: 'accountable', label: 'Keeping everyone accountable' },
        ],
      },
    ],
  },
];

const INITIAL_ANSWERS: Record<string, string> = STEPS.flatMap(s => s.questions).reduce(
  (acc, q) => ({ ...acc, [q.key]: '' }),
  {}
);

export default function ProfileSetup({ userId, onComplete }: ProfileSetupProps) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>(INITIAL_ANSWERS);

  const setAnswer = (key: string, value: string) => setAnswers(prev => ({ ...prev, [key]: value }));

  const currentStep = STEPS[step];
  const isStepComplete = currentStep.questions.every(q => {
    const raw = (answers[q.key] ?? '').toString().trim();
    if (raw === '') return false;
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
    const fallbackProfile = {
      type: 'The Pragmatic Planner',
      description: 'You prefer stable financial boundaries and clear, kind communication.',
      quote: '"Do not save what is left after spending, but spend what is left after saving." - Warren Buffett',
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

      // Append genuinely AI-generated profiles to the standalone profile_log
      // collection (record + fallback catalog). Anonymous - timestamp only, no
      // user or group reference.
      if (result.source === 'ai' && result.data) {
        addDoc(collection(db, 'profile_log'), {
          ...result.data,
          createdAt: new Date().toISOString(),
        }).catch(e => console.error('profile_log write failed', e));
      }

      await setDoc(
        doc(db, 'users', userId),
        {
          income: answers.income,
          partnerIncome: answers.partnerIncome,
          quizAnswers: answers,
          financialProfile,
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
        setLoading(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-natural-sidebar flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-slate-300 border-t-slate-900 rounded-full animate-spin mx-auto"></div>
          <h2 className="text-xl font-display font-bold text-natural-text">Crafting your financial style…</h2>
          <p className="text-sm text-natural-muted">Reading between the lines of your answers.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-natural-sidebar flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-lg shadow-sm border border-natural-border w-full max-w-md overflow-hidden relative p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-display font-bold text-natural-text mb-1">Financial Profile Quiz</h1>
          <p className="text-sm text-natural-muted">{currentStep.subtitle || "Let's tailor the app to your habits."}</p>
          {/* Progress */}
          <div className="flex gap-1.5 mt-4">
            {STEPS.map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-natural-primary' : 'bg-natural-border'}`} />
            ))}
          </div>
          <p className="text-[11px] font-bold text-natural-muted uppercase tracking-wider mt-3">
            Step {step + 1} of {STEPS.length} · {currentStep.title}
          </p>
        </div>

        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
          {currentStep.questions.map(q => (
            <div key={q.key}>
              <label className="block text-sm font-semibold text-natural-text mb-2">{q.label}</label>
              {q.type === 'number' ? (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-muted">$</span>
                  <input
                    type="number"
                    min="0"
                    max="100000000"
                    step="1000"
                    value={answers[q.key] || ''}
                    onChange={e => setAnswer(q.key, e.target.value)}
                    placeholder={q.placeholder}
                    className="w-full pl-7 p-3 bg-natural-sidebar border border-natural-border rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900 text-sm"
                  />
                </div>
              ) : (
                <select
                  value={answers[q.key] || ''}
                  onChange={e => setAnswer(q.key, e.target.value)}
                  className="w-full p-3 bg-natural-sidebar border border-natural-border rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900 text-sm"
                >
                  <option value="">Select…</option>
                  {q.options?.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              )}
              {q.help && <p className="text-xs text-natural-muted mt-1">{q.help}</p>}
            </div>
          ))}

          <div className="flex gap-3 pt-2">
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="w-1/3 bg-natural-border text-natural-text font-medium py-3 px-4 rounded-md hover:bg-natural-border/80"
              >
                Back
              </button>
            )}
            {!isLastStep ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!isStepComplete}
                className={`${step > 0 ? 'w-2/3' : 'w-full'} bg-natural-primary text-white font-medium py-3 px-4 rounded-md hover:bg-natural-primary/90 disabled:opacity-50`}
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!isStepComplete}
                className={`${step > 0 ? 'w-2/3' : 'w-full'} bg-natural-primary text-white font-medium py-3 px-4 rounded-md hover:bg-natural-dark transition-colors disabled:opacity-50`}
              >
                Generate Profile
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
