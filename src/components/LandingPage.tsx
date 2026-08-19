import React, { useState } from 'react';
import LegalModal, { LegalDoc } from './LegalModal';

interface LandingPageProps {
  onGetStarted: () => void;
}

// The marketing site (have-another-cherry-site repo), on the custom domain.
const SITE = 'https://www.haveanothercherry.com';

// ---------------------------------------------------------------------------
// This page deliberately mirrors the marketing site's index.html - same cool
// grey palette, same section order (hero → why/compare → essentials → how it
// works → CTA band → footer), same type scale - so app.haveanothercherry.com
// and the marketing site read as one product. If the site's design changes,
// change this with it. Palette from the site's styles.css:
const C = {
  bg: '#F4F4F5',        // cool grey (matches the app)
  surface: '#FFFFFF',
  text: '#18181B',
  muted: '#52525B',
  accent: '#71717A',
  border: '#D4D4D8',
  pale: '#E4E4E7',
  paleBorder: '#C4C4CB',
  primary: '#C41200',
  primaryWash: '#FBEAE7',
};

const CheckMark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" className="h-3.5 w-3.5"><path d="M20 6L9 17l-5-5" /></svg>
);
const CrossMark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" className="h-3.5 w-3.5"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
);

export default function LandingPage({ onGetStarted }: LandingPageProps) {
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);

  const btnPrimary =
    'inline-flex items-center justify-center gap-2 font-semibold text-[15px] px-6 py-3 rounded-full text-white shadow-md hover:shadow-lg transition-all cursor-pointer';
  const btnGhost =
    'inline-flex items-center justify-center gap-2 font-semibold text-[15px] px-6 py-3 rounded-full transition-all cursor-pointer';

  return (
    <>
      <div
        className="min-h-screen"
        style={{
          background:
            'radial-gradient(60% 45% at 78% 0%, rgba(196,18,0,.07), transparent 60%), ' +
            'radial-gradient(45% 35% at 2% 22%, rgba(196,18,0,.04), transparent 60%), ' +
            C.bg,
          backgroundRepeat: 'no-repeat',
          color: C.text,
        }}
      >
        {/* ============ HEADER ============ */}
        <header className="sticky top-0 z-40 border-b backdrop-blur" style={{ borderColor: C.border, background: 'rgba(244,244,245,0.9)' }}>
          <div className="max-w-[1120px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
            <a href={SITE} className="flex items-center gap-2.5 font-display font-semibold text-lg">
              <img src="/cherry2transparent.png" alt="Have Another Cherry logo" className="h-8 w-8 object-contain" />
              <span>Have Another Cherry</span>
            </a>
            <nav className="hidden md:flex items-center gap-7 font-mono text-[13px]" style={{ color: C.muted }}>
              <a href={SITE} className="hover:text-[#C41200] transition-colors">Home</a>
              <a href={`${SITE}/features`} className="hover:text-[#C41200] transition-colors">Features</a>
              <a href={`${SITE}/about`} className="hover:text-[#C41200] transition-colors">About</a>
              <a href={`${SITE}/privacy`} className="hover:text-[#C41200] transition-colors">Privacy &amp; Security</a>
            </nav>
            <div className="flex items-center gap-2.5">
              <a href={`${SITE}/features#pricing`} className="hidden sm:inline-flex text-sm font-semibold px-4 py-2 rounded-full border transition-colors hover:border-[#C41200]" style={{ borderColor: C.border, background: C.surface }}>
                Pricing
              </a>
              <button onClick={onGetStarted} className="text-sm font-semibold px-5 py-2 rounded-full text-white transition-opacity hover:opacity-90" style={{ background: C.primary }}>
                Log in
              </button>
            </div>
          </div>
        </header>

        <main>
          {/* ============ HERO ============ */}
          <section className="max-w-[1120px] mx-auto px-6 pt-16 pb-20 text-center">
            <span className="inline-flex items-start gap-2 text-[13px] font-medium border rounded-full px-4 py-1.5 text-left max-w-2xl" style={{ borderColor: C.border, background: C.surface, color: C.muted }}>
              <span className="mt-[7px] h-[7px] w-[7px] rounded-full shrink-0" style={{ background: C.primary }} />
              The sweeter expense sharing application for everybody. Go ahead. Have another cherry.
            </span>

            <h1 className="font-display font-semibold tracking-tight mt-6 mx-auto max-w-3xl text-[clamp(38px,6vw,64px)] leading-[1.08]">
              Share the bills. <span style={{ color: C.primary }}>Skip the awkward math.</span>
            </h1>
            <p className="mt-5 mx-auto max-w-2xl text-[17px] leading-relaxed" style={{ color: C.muted }}>
              Have Another Cherry splits shared expenses the way real life works. Be realistic about
              what you can pay. Log costs, scan receipts, and settle up with the click of a few
              buttons or a couple of taps.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button onClick={onGetStarted} className={btnPrimary} style={{ background: C.primary }}>
                Get started <span aria-hidden>→</span>
              </button>
              <button onClick={onGetStarted} className={btnGhost} style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                Log in
              </button>
              <a href={`${SITE}/features`} className={btnGhost} style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                See how it works
              </a>
            </div>
            <p className="mt-5 text-[13px]" style={{ color: C.accent }}>
              Free forever · No credit card required · No ads, no daily limits · Premium features are optional upgrades, not essentials we block.
            </p>
          </section>

          {/* ============ WHY / COMPARE ============ */}
          <section className="max-w-[1120px] mx-auto px-6 pb-20">
            <div className="text-center max-w-3xl mx-auto">
              <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: C.primary }}>Why Have Another Cherry?</p>
              <h2 className="font-display font-semibold mt-3 text-[clamp(26px,4vw,40px)] leading-tight">
                Other apps split the bill. Have Another Cherry splits it <em className="not-italic" style={{ color: C.primary }}>fairly</em>.
              </h2>
              <p className="mt-4 text-[15.5px] leading-relaxed" style={{ color: C.muted }}>
                Most expense-sharing apps were built for group trips and dinners with friends. But you
                share money every single week, you probably don't earn the same income, and "even" is
                not the same thing as "fair." Have Another Cherry is built for people who want to
                account for differences, be honest about financial boundaries, and keep the little
                details straight - with gentle help for the conversations that can feel impossible.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mt-11">
              {/* THEM */}
              <div className="rounded-[22px] p-7 border" style={{ background: C.pale, borderColor: C.paleBorder }}>
                <div className="text-sm font-bold uppercase tracking-wider mb-5" style={{ color: C.accent }}>Most expense-sharing apps</div>
                <ul className="space-y-4">
                  {[
                    ['Even splits by default', 'Anything other than 50/50 means working out percentages yourself, expense by expense.'],
                    ['Designed around one-off trips', 'Great for a ski weekend. Awkward for rent, utilities and groceries that repeat every month.'],
                    ['Free tiers with strings attached', 'Ads in the ledger, capped scans, daily limits on how much you may log.'],
                    ['Good at bookkeeping, silent on the rest', "They'll tell you who owes what. They won't help with when and why money gets tense."],
                  ].map(([title, body]) => (
                    <li key={title} className="flex gap-3">
                      <span className="mt-0.5 h-6 w-6 rounded-full flex items-center justify-center shrink-0" style={{ background: C.paleBorder, color: C.muted }}><CrossMark /></span>
                      <span className="text-[14.5px] leading-relaxed" style={{ color: C.muted }}>
                        <b className="block" style={{ color: C.text }}>{title}</b>{body}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* US */}
              <div className="rounded-[22px] p-7 border shadow-lg" style={{ background: C.surface, borderColor: C.primary }}>
                <div className="text-sm font-bold uppercase tracking-wider mb-5" style={{ color: C.primary }}>Have Another Cherry</div>
                <ul className="space-y-4">
                  {[
                    ['Fair percentages, set once', "65/35, 72/28, 90/10 - whatever matches your income or shared arrangement. Every expense divides that way automatically. Adjust any time."],
                    ['Built for people who share life', 'A standing household ledger for the rent, the bills and the running balance between you.'],
                    ['Receipt scanning, free for everyone', 'Snap the receipt and it fills in merchant, total, date, category - and the line items. No daily limit, no upgrade prompt.'],
                    ['Made for the relationship, not just the receipts', 'Financial-style profiles, conversation starters, and blind splits for the moments when exact numbers feel loaded.'],
                  ].map(([title, body]) => (
                    <li key={title} className="flex gap-3">
                      <span className="mt-0.5 h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-white" style={{ background: C.primary }}><CheckMark /></span>
                      <span className="text-[14.5px] leading-relaxed" style={{ color: C.muted }}>
                        <b className="block" style={{ color: C.text }}>{title}</b>{body}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2.5 mt-9">
              {['Fair percentage splits', 'Receipt scanning', 'One-tap settle up', 'Private by design', 'No daily limits', 'No ads'].map(b => (
                <span key={b} className="inline-flex items-center gap-1.5 text-[13px] font-medium border rounded-full px-3.5 py-1.5" style={{ borderColor: C.border, background: C.surface, color: C.muted }}>
                  <span style={{ color: C.primary }}><CheckMark /></span> {b}
                </span>
              ))}
            </div>
          </section>

          {/* ============ FEATURE TRIO ============ */}
          <section className="border-t border-b py-20" style={{ borderColor: C.border, background: C.surface }}>
            <div className="max-w-[1120px] mx-auto px-6">
              <div className="text-center max-w-2xl mx-auto">
                <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: C.primary }}>The essentials</p>
                <h2 className="font-display font-semibold mt-3 text-[clamp(26px,4vw,36px)] leading-tight">Built for the way you actually share and exchange money</h2>
                <p className="mt-4 text-[15.5px]" style={{ color: C.muted }}>
                  A split that feels fair, a camera that does the data entry, a balance you can clear
                  in one tap. Focus on the relationship, not the ledger.
                </p>
              </div>
              <div className="grid md:grid-cols-3 gap-5 mt-11">
                {[
                  ['Splits that match income', "Set any percentage between members. 50/50, 65/35, 90/10 - you decide what's fair. Every expense divides automatically, no calculator required.",
                    <path key="p" d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />],
                  ['Snap a receipt, done', 'Point your camera at a receipt and log the merchant, total, category - and every line item, so you can split who-had-what.',
                    <g key="g"><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M3 9h18M8 14h4" /></g>],
                  ['Settle without the spreadsheet', 'See who owes who at any moment. Jump into Venmo or Zelle, record the payment, confirm it, and the balance zeroes out cleanly.',
                    <g key="g2"><path d="M12 1v22M5 8h9a3 3 0 0 1 0 6H8M5 16h11" /></g>],
                ].map(([title, body, icon]) => (
                  <div key={String(title)} className="rounded-[14px] border p-6" style={{ borderColor: C.border, background: C.bg }}>
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center mb-4" style={{ background: C.primaryWash, color: C.primary }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">{icon as React.ReactNode}</svg>
                    </div>
                    <h3 className="font-display font-semibold text-lg">{title}</h3>
                    <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: C.muted }}>{body}</p>
                  </div>
                ))}
              </div>
              <div className="text-center mt-8">
                <a href={`${SITE}/features`} className={btnGhost} style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                  Explore all features <span aria-hidden>→</span>
                </a>
              </div>
            </div>
          </section>

          {/* ============ HOW IT WORKS ============ */}
          <section className="max-w-[1120px] mx-auto px-6 py-20">
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: C.primary }}>How it works</p>
              <h2 className="font-display font-semibold mt-3 text-[clamp(26px,4vw,36px)]">Up and running in four steps</h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-11">
              {[
                ['01', 'Create your group', 'Name your group and invite by email through the website or app.'],
                ['02', 'Set the split', "Start with an agreed percentage or down the middle. Don't know what's fair? Get a recommendation based on incomes."],
                ['03', 'Log expenses', 'Type it in or scan a receipt. Have Another Cherry does the split instantly.'],
                ['04', 'Settle up', 'Pay what you owe to the transaction of your choice, confirm it, and start the next month clean.'],
              ].map(([num, title, body]) => (
                <div key={num} className="rounded-[14px] border p-6" style={{ borderColor: C.border, background: C.surface }}>
                  <div className="font-mono text-sm" style={{ color: C.primary }}>{num}</div>
                  <h3 className="font-display font-semibold text-lg mt-2">{title}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: C.muted }}>{body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ============ CTA BAND ============ */}
          <section className="max-w-[1120px] mx-auto px-6 pb-20">
            <div className="relative overflow-hidden rounded-[22px] border text-center px-6 py-14" style={{ borderColor: C.paleBorder, background: C.pale }}>
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(50% 90% at 50% 0%, rgba(196,18,0,.10), transparent 65%)' }} />
              <div className="relative">
                <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: C.primary }}>It's free to start</p>
                <h2 className="font-display font-semibold mt-3 text-[clamp(26px,4vw,36px)]">Have another cherry today</h2>
                <p className="mt-3 text-[15.5px]" style={{ color: C.muted }}>Set up your household in minutes. It's free to start, and there's nothing to install.</p>
                <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                  <button onClick={onGetStarted} className={btnPrimary} style={{ background: C.primary }}>
                    Get started <span aria-hidden>→</span>
                  </button>
                  <a href={`${SITE}/features#pricing`} className={btnGhost} style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                    Compare plans
                  </a>
                </div>
              </div>
            </div>
          </section>
        </main>

        {/* ============ FOOTER ============ */}
        <footer className="border-t py-12" style={{ borderColor: C.border, background: C.surface }}>
          <div className="max-w-[1120px] mx-auto px-6">
            <div className="grid md:grid-cols-3 gap-10">
              <div>
                <a href={SITE} className="flex items-center gap-2.5 font-display font-semibold">
                  <img src="/cherry2transparent.png" alt="" className="h-7 w-7 object-contain" /> Have Another Cherry
                </a>
                <p className="mt-3 text-[13.5px] leading-relaxed" style={{ color: C.muted }}>
                  The fair-by-default sweeter expense splitter for households. A product of Situated Strategies LLC.
                </p>
              </div>
              <div>
                <h4 className="font-display font-semibold text-sm mb-3">Product</h4>
                <div className="flex flex-col gap-2 text-[13.5px]" style={{ color: C.muted }}>
                  <a href={`${SITE}/features`} className="hover:text-[#C41200] transition-colors">Features</a>
                  <a href={`${SITE}/features#pricing`} className="hover:text-[#C41200] transition-colors">Pricing</a>
                  <button onClick={onGetStarted} className="text-left hover:text-[#C41200] transition-colors cursor-pointer">Log in</button>
                </div>
              </div>
              <div>
                <h4 className="font-display font-semibold text-sm mb-3">Company</h4>
                <div className="flex flex-col gap-2 text-[13.5px]" style={{ color: C.muted }}>
                  <a href={`${SITE}/about`} className="hover:text-[#C41200] transition-colors">About</a>
                  <button onClick={() => setLegalDoc('privacy')} className="text-left hover:text-[#C41200] transition-colors cursor-pointer">Privacy Policy</button>
                  <button onClick={() => setLegalDoc('terms')} className="text-left hover:text-[#C41200] transition-colors cursor-pointer">Terms of Service</button>
                  <a href="mailto:help@haveanothercherry.com" className="hover:text-[#C41200] transition-colors">Support</a>
                </div>
              </div>
            </div>
            <div className="mt-10 pt-6 border-t flex flex-col sm:flex-row justify-between gap-2 text-[12.5px]" style={{ borderColor: C.border, color: C.accent }}>
              <span>© 2026 Situated Strategies LLC. Have Another Cherry is a product of Situated Strategies LLC.</span>
              <span className="font-mono">Split fairly. Settle easily.</span>
            </div>
          </div>
        </footer>
      </div>

      {legalDoc && <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />}
    </>
  );
}
