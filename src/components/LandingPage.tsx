import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  HandCoins,
  ReceiptText,
  ShieldCheck,
  Users,
} from 'lucide-react';
import LegalModal, { LegalDoc } from './LegalModal';

interface LandingPageProps {
  onGetStarted: () => void;
}

export default function LandingPage({ onGetStarted }: LandingPageProps) {
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);

  return (
    <>
    <div className="min-h-screen bg-natural-bg text-natural-text">
      <header className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/cherry2transparent.png"
            alt="Have Another Cherry"
            className="h-10 w-10 object-contain"
          />
          <div>
            <div className="font-display font-bold text-lg leading-tight">
              Have Another Cherry
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-natural-muted">
              Shared expenses, without the sour part
            </div>
          </div>
        </div>

        <button
          onClick={onGetStarted}
          className="text-sm font-semibold px-5 py-2.5 rounded-full border border-natural-border hover:border-natural-primary transition-colors"
        >
          Log In
        </button>
      </header>

      <main>
        <section className="max-w-7xl mx-auto px-6 pt-16 pb-24 grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-natural-sage/40 border border-natural-primary/20 rounded-full px-3 py-1.5 text-xs font-semibold text-natural-primary mb-6">
              🍒 Better money conversations start with better details
            </div>

            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.02] tracking-tight">
              Track what people actually owe.
              <span className="block text-natural-primary mt-2">
                Not just the final balance.
              </span>
            </h1>

            <p className="text-lg text-natural-muted leading-relaxed mt-7 max-w-xl">
              Keep every shared expense itemized, see exactly who owes what, and track
              partial payments and confirmations without losing the context behind
              the transaction.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mt-8">
              <button
                onClick={onGetStarted}
                className="inline-flex items-center justify-center gap-2 bg-natural-primary hover:bg-natural-dark text-white font-semibold px-7 py-3.5 rounded-full shadow-sm transition-colors"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </button>

              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center px-7 py-3.5 rounded-full border border-natural-border font-semibold hover:border-natural-primary transition-colors"
              >
                See How It Works
              </a>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-8 text-xs text-natural-muted">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-natural-primary" />
                Itemized expenses
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-natural-primary" />
                Partial payments
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-natural-primary" />
                Payment confirmation
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-natural-sage/30 rounded-[3rem] rotate-3" />
            <div className="relative bg-white border border-natural-border rounded-[2.5rem] shadow-xl p-7 md:p-9">
              <div className="flex items-center justify-between mb-7">
                <div>
                  <p className="text-xs uppercase tracking-wider font-bold text-natural-muted">
                    Shared transaction
                  </p>
                  <h3 className="font-display font-bold text-2xl mt-1">
                    Weekend Groceries
                  </h3>
                </div>
                <span className="text-3xl">🍒</span>
              </div>

              <div className="text-4xl font-display font-bold">$86.42</div>

              <div className="mt-7 space-y-3">
                <div className="flex justify-between items-center bg-natural-bg rounded-xl p-4">
                  <div>
                    <p className="font-semibold text-sm">Alex</p>
                    <p className="text-xs text-natural-muted">Paid at checkout</p>
                  </div>
                  <span className="font-mono font-bold">$86.42</span>
                </div>

                <div className="flex justify-between items-center bg-natural-bg rounded-xl p-4">
                  <div>
                    <p className="font-semibold text-sm">Jordan</p>
                    <p className="text-xs text-natural-muted">Share remaining</p>
                  </div>
                  <span className="font-mono font-bold text-natural-primary">$43.21</span>
                </div>

                <div className="flex justify-between items-center border border-natural-primary/20 bg-natural-sage/20 rounded-xl p-4">
                  <div>
                    <p className="font-semibold text-sm">Payment status</p>
                    <p className="text-xs text-natural-muted">
                      Waiting for confirmation
                    </p>
                  </div>
                  <span className="text-xs font-bold text-natural-primary">
                    Pending
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="border-y border-natural-border bg-white"
        >
          <div className="max-w-7xl mx-auto px-6 py-24">
            <div className="max-w-2xl mb-12">
              <p className="text-xs uppercase tracking-[0.2em] font-bold text-natural-primary">
                Why Cherry?
              </p>
              <h2 className="font-display text-4xl font-bold mt-3">
                Money is easier when the details stay attached.
              </h2>
              <p className="text-natural-muted mt-4 leading-relaxed">
                Most expense apps eventually collapse everything into one net balance.
                Cherry keeps the individual transactions attached, so you can always
                see what created the balance in the first place.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                {
                  icon: ReceiptText,
                  title: 'Itemized',
                  text: 'See the actual transactions behind every balance.',
                },
                {
                  icon: HandCoins,
                  title: 'Flexible settlements',
                  text: 'Log partial payments and track exactly what remains.',
                },
                {
                  icon: Users,
                  title: 'Built for relationships',
                  text: 'Useful for couples, roommates, families, and groups.',
                },
                {
                  icon: ShieldCheck,
                  title: 'Clear history',
                  text: 'Keep a record of payments and confirmations over time.',
                },
              ].map(({ icon: Icon, title, text }) => (
                <div
                  key={title}
                  className="border border-natural-border rounded-2xl p-6"
                >
                  <div className="h-10 w-10 rounded-xl bg-natural-sage/40 flex items-center justify-center mb-5">
                    <Icon className="h-5 w-5 text-natural-primary" />
                  </div>
                  <h3 className="font-display font-bold text-lg">{title}</h3>
                  <p className="text-sm text-natural-muted leading-relaxed mt-2">
                    {text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-6 py-24 text-center">
          <span className="text-5xl">🍒</span>
          <h2 className="font-display text-4xl md:text-5xl font-bold mt-5">
            Keep sharing. Keep it clear.
          </h2>
          <p className="text-natural-muted max-w-xl mx-auto mt-4">
            Start tracking shared expenses without losing the details that
            matter.
          </p>
          <button
            onClick={onGetStarted}
            className="mt-8 inline-flex items-center gap-2 bg-natural-primary hover:bg-natural-dark text-white font-semibold px-8 py-3.5 rounded-full transition-colors"
          >
            Start Using Cherry
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>
      </main>

      <footer className="border-t border-natural-border">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row gap-4 items-center justify-between text-xs text-natural-muted">
          <div>© 2026 Have Another Cherry</div>
          <div className="flex gap-5">
            <button
              onClick={onGetStarted}
              className="hover:text-natural-text transition-colors"
            >
              Log In
            </button>

            <button
              onClick={() => setLegalDoc('privacy')}
              className="hover:text-natural-text transition-colors"
            >
              Privacy
            </button>

            <button
              onClick={() => setLegalDoc('terms')}
              className="hover:text-natural-text transition-colors"
            >
              Terms
            </button>

            <a
              href="mailto:support@haveanothercherry.com"
              className="hover:text-natural-text transition-colors"
            >
              Support
            </a>
          </div>
        </div>
      </footer>
    </div>

    {legalDoc && (
      <LegalModal
        doc={legalDoc}
        onClose={() => setLegalDoc(null)}
      />
    )}
    </>
  );
}
