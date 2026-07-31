import React, { useState } from 'react';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

interface ProfileSetupProps {
  userId: string;
  onComplete: () => void;
}

export default function ProfileSetup({ userId, onComplete }: ProfileSetupProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState({
    income: '',
    partnerIncome: '',
    creditCards: '',
    aprPromos: '',
    lowOnCash: '',
    groceries: '',
    paybackPreference: '',
    appGoal: ''
  });

  const handleNext = () => setStep(s => s + 1);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/generate-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers })
      });
      const result = await res.json();
      
      const financialProfile = result.data || {
        type: 'The Pragmatic Planner',
        description: 'You prefer stable financial boundaries.',
        quote: "\"Do not save what is left after spending, but spend what is left after saving.\" — Warren Buffett"
      };

      await setDoc(doc(db, 'users', userId), {
        income: answers.income,
        partnerIncome: answers.partnerIncome,
        financialProfile
      }, { merge: true });

      onComplete();
    } catch (err) {
      console.error(err);
      try {
        await setDoc(doc(db, 'users', userId), {
          income: answers.income,
          partnerIncome: answers.partnerIncome,
          financialProfile: {
            type: 'The Pragmatic Planner',
            description: 'You prefer stable financial boundaries.',
            quote: "\"Do not save what is left after spending, but spend what is left after saving.\" — Warren Buffett"
          }
        }, { merge: true });
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
          <h2 className="text-xl font-display font-bold text-natural-text">Analyzing your financial style...</h2>
          <p className="text-sm text-natural-muted">Using behavioral economics to craft your profile.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-natural-sidebar flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-lg shadow-sm border border-natural-border w-full max-w-md overflow-hidden relative p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-display font-bold text-natural-text mb-2">Financial Profile Quiz</h1>
          <p className="text-sm text-natural-muted">Let's tailor the app to your financial habits.</p>
        </div>

        <div className="space-y-6">
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <label className="block text-sm font-semibold text-natural-text mb-2">What is your approximate annual income?</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-muted">$</span>
                  <input 
                    type="number"
                    value={answers.income || ''} 
                    onChange={(e) => setAnswers({...answers, income: e.target.value})}
                    placeholder="e.g. 75000"
                    className="w-full pl-7 p-3 bg-natural-sidebar border border-natural-border rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-natural-text mb-2">What is your partner's approximate annual income?</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-muted">$</span>
                  <input 
                    type="number"
                    value={answers.partnerIncome || ''} 
                    onChange={(e) => setAnswers({...answers, partnerIncome: e.target.value})}
                    placeholder="e.g. 75000"
                    className="w-full pl-7 p-3 bg-natural-sidebar border border-natural-border rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-natural-text mb-2">Who uses credit cards more often?</label>
                <select 
                  value={answers.creditCards} 
                  onChange={(e) => setAnswers({...answers, creditCards: e.target.value})}
                  className="w-full p-3 bg-natural-sidebar border border-natural-border rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900 text-sm"
                >
                  <option value="">Select...</option>
                  <option value="me">Me, almost always</option>
                  <option value="partner">My partner/roommate</option>
                  <option value="equal">We both use them equally</option>
                  <option value="neither">We prefer cash/debit</option>
                </select>
              </div>
              <button 
                onClick={handleNext}
                disabled={!answers.income || !answers.partnerIncome || !answers.creditCards}
                className="w-full bg-natural-primary text-white font-medium py-3 px-4 rounded-md hover:bg-natural-primary/90 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <label className="block text-sm font-semibold text-natural-text mb-2">Are your credit cards currently on a 0% APR promo?</label>
                <select 
                  value={answers.aprPromos} 
                  onChange={(e) => setAnswers({...answers, aprPromos: e.target.value})}
                  className="w-full p-3 bg-natural-sidebar border border-natural-border rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900 text-sm"
                >
                  <option value="">Select...</option>
                  <option value="yes_me">Yes, mine are</option>
                  <option value="yes_partner">Yes, my partner's are</option>
                  <option value="no">No</option>
                  <option value="not_sure">Not sure</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-natural-text mb-2">Who is typically lower on liquid cash?</label>
                <select 
                  value={answers.lowOnCash} 
                  onChange={(e) => setAnswers({...answers, lowOnCash: e.target.value})}
                  className="w-full p-3 bg-natural-sidebar border border-natural-border rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900 text-sm"
                >
                  <option value="">Select...</option>
                  <option value="me">Me</option>
                  <option value="partner">My partner/roommate</option>
                  <option value="fluctuates">It fluctuates evenly</option>
                </select>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setStep(1)}
                  className="w-1/3 bg-natural-border text-natural-text font-medium py-3 px-4 rounded-md hover:bg-natural-border/80"
                >
                  Back
                </button>
                <button 
                  onClick={handleNext}
                  disabled={!answers.aprPromos || !answers.lowOnCash}
                  className="w-2/3 bg-natural-primary text-white font-medium py-3 px-4 rounded-md hover:bg-natural-primary/90 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <label className="block text-sm font-semibold text-natural-text mb-2">Who usually pays for groceries or does the food shopping?</label>
                <select 
                  value={answers.groceries} 
                  onChange={(e) => setAnswers({...answers, groceries: e.target.value})}
                  className="w-full p-3 bg-natural-sidebar border border-natural-border rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900 text-sm"
                >
                  <option value="">Select...</option>
                  <option value="me">Mostly me</option>
                  <option value="partner">Mostly my partner/roommate</option>
                  <option value="split">We take turns evenly</option>
                  <option value="together">We shop and pay together</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-natural-text mb-2">How do you prefer to get paid back?</label>
                <select 
                  value={answers.paybackPreference} 
                  onChange={(e) => setAnswers({...answers, paybackPreference: e.target.value})}
                  className="w-full p-3 bg-natural-sidebar border border-natural-border rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900 text-sm"
                >
                  <option value="">Select...</option>
                  <option value="cash">Direct transfer (Cash, Venmo, Zelle)</option>
                  <option value="goods">In goods (they buy dinner next time)</option>
                  <option value="services">In services (they do the chores)</option>
                  <option value="doesnt_matter">Whatever is easiest</option>
                </select>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setStep(2)}
                  className="w-1/3 bg-natural-border text-natural-text font-medium py-3 px-4 rounded-md hover:bg-natural-border/80"
                >
                  Back
                </button>
                <button 
                  onClick={handleNext}
                  disabled={!answers.groceries || !answers.paybackPreference}
                  className="w-2/3 bg-natural-primary text-white font-medium py-3 px-4 rounded-md hover:bg-natural-primary/90 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <label className="block text-sm font-semibold text-natural-text mb-2">What is your primary goal for using this app?</label>
                <select 
                  value={answers.appGoal} 
                  onChange={(e) => setAnswers({...answers, appGoal: e.target.value})}
                  className="w-full p-3 bg-natural-sidebar border border-natural-border rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900 text-sm"
                >
                  <option value="">Select...</option>
                  <option value="conversations">Improving conversations about financial matters</option>
                  <option value="fairness">Creating more fairness in lending and spending</option>
                  <option value="transparency">Being more transparent with each other</option>
                  <option value="detailed">Focusing on detailed spending tracking</option>
                  <option value="accountable">Ensuring all parties are accountable</option>
                </select>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setStep(3)}
                  className="w-1/3 bg-natural-border text-natural-text font-medium py-3 px-4 rounded-md hover:bg-natural-border/80"
                >
                  Back
                </button>
                <button 
                  onClick={handleSubmit}
                  disabled={!answers.appGoal}
                  className="w-2/3 bg-natural-primary text-white font-medium py-3 px-4 rounded-md hover:bg-natural-dark transition-colors disabled:opacity-50"
                >
                  Generate Profile
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
