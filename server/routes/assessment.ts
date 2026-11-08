import express from 'express';
import { rateLimit, requireAuth } from '../middleware';
import { ensureAdminApp, getVertexClient, stripEmDashes } from '../shared';
import { analytics } from '../heycatch';

// The Gemini financial assessment, the account level step of setup
// (docs/REBUILD_PLAN.md sections 3 and 11 in the mobile repo). One call per
// person, repeatable from Settings. The model only ever sees the quiz
// answers and the three optional extras below: never a ledger amount, never
// another member, never the email. The result is advisory copy about how the
// person handles shared money, not advice about investments or credit, and
// it is written to users/{uid}.assessment here so both clients read the same
// object.

const router = express.Router();

export const ASSESSMENT_VERSION = 1;
const LANGUAGES = ['en', 'ru', 'es'] as const;
const SPLIT_KINDS = ['even', 'income', 'custom'] as const;
const CADENCES = ['weekly', 'biweekly', 'monthly'] as const;
const INCOME_BANDS = ['lower', 'middle', 'upper', 'prefer_not'] as const;

const LANGUAGE_NAMES: Record<(typeof LANGUAGES)[number], string> = {
  en: 'English',
  ru: 'Russian, formal (vy)',
  es: 'neutral Spanish that reads naturally in Spain and Latin America',
};

export interface Assessment {
  version: number;
  createdAt: string;
  language: string;
  style: string;
  summary: string;
  strengths: string[];
  watchFor: string[];
  suggestedSplit: { kind: (typeof SPLIT_KINDS)[number]; why: string };
  thresholds: { category: string; monthly: number }[];
  reminderCadence: (typeof CADENCES)[number];
  conversationOpeners: string[];
}

const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? stripEmDashes(v).trim().slice(0, max) : '';

const strList = (v: unknown, max: number, each: number): string[] =>
  (Array.isArray(v) ? v : [])
    .map((x) => str(x, each))
    .filter(Boolean)
    .slice(0, max);

const oneOf = <T extends readonly string[]>(v: unknown, allowed: T, fallback: T[number]) =>
  (allowed as readonly string[]).includes(v as string) ? (v as T[number]) : fallback;

/** Turns the model's JSON into the stored shape, dropping anything off the contract. */
export function normalizeAssessment(parsed: any, language: string): Omit<Assessment, 'createdAt'> {
  const thresholds = (Array.isArray(parsed?.thresholds) ? parsed.thresholds : [])
    .map((t: any) => ({
      category: str(t?.category, 40),
      monthly: Math.round(Math.max(0, Number(t?.monthly) || 0)),
    }))
    .filter((t: { category: string; monthly: number }) => t.category && t.monthly > 0)
    .slice(0, 6);
  return {
    version: ASSESSMENT_VERSION,
    language,
    style: str(parsed?.style, 60) || 'Balanced Partner',
    summary: str(parsed?.summary, 900),
    strengths: strList(parsed?.strengths, 4, 160),
    watchFor: strList(parsed?.watchFor, 4, 160),
    suggestedSplit: {
      kind: oneOf(parsed?.suggestedSplit?.kind, SPLIT_KINDS, 'even'),
      why: str(parsed?.suggestedSplit?.why, 240),
    },
    thresholds,
    reminderCadence: oneOf(parsed?.reminderCadence, CADENCES, 'monthly'),
    conversationOpeners: strList(parsed?.conversationOpeners, 4, 200),
  };
}

router.post('/api/assessment', requireAuth, rateLimit('assessment', 10), async (req, res) => {
  const uid: string = (req as any).uid;
  const body = req.body || {};

  const answers = body.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return res.status(400).json({ error: 'Quiz answers are required.' });
  }
  if (JSON.stringify(answers).length > 4000) {
    return res.status(400).json({ error: 'Quiz answers are too large.' });
  }
  const language = oneOf(body.language, LANGUAGES, 'en');
  const incomeBand = INCOME_BANDS.includes(body.incomeBand) ? body.incomeBand : undefined;
  const groupsExpected =
    Number.isInteger(body.groupsExpected) && body.groupsExpected >= 1 && body.groupsExpected <= 20
      ? body.groupsExpected
      : undefined;
  const troubles = str(body.troubles, 600) || undefined;

  // Exact incomes are a ledger-adjacent number; the band is enough for the
  // model and the amounts never leave the account.
  const { income, partnerIncome, ...answersForModel } = answers as Record<string, unknown>;
  void income;
  void partnerIncome;

  try {
    const { ai, Type } = await getVertexClient();
    const prompt =
      'You are a warm, non-judgmental analyst for "Have Another Cherry", an app for people who ' +
      'share expenses without sharing money. Read these setup quiz answers as a whole and write a ' +
      `short assessment in ${LANGUAGE_NAMES[language]}, in the second person.\n\n` +
      'Quiz answers (JSON, option values):\n' +
      JSON.stringify(answersForModel, null, 2) +
      (incomeBand ? `\nIncome band: ${incomeBand}` : '') +
      (groupsExpected ? `\nGroups they expect to share money with: ${groupsExpected}` : '') +
      (troubles ? `\nWhat usually goes wrong for them, in their words: ${troubles}` : '') +
      '\n\nRules: never give investment, credit, tax or legal advice; never mention amounts of ' +
      'money; keep the brand names Have Another Cherry, Cherry +, Dark Cherry and Household Vault ' +
      'in English; use no em dashes or en dashes anywhere. Return ONLY valid JSON with: ' +
      'style (a 2 to 4 word name for how this person handles shared money), ' +
      'summary (three or four sentences), strengths (2 to 4 short phrases), ' +
      'watchFor (2 to 4 short, kind phrases), ' +
      'suggestedSplit {kind: one of even, income, custom; why: one sentence}, ' +
      'thresholds (0 to 4 entries of {category, monthly} where monthly is a round number of ' +
      'units of their currency that would be worth a heads-up on a single shared expense), ' +
      'reminderCadence (one of weekly, biweekly, monthly), ' +
      'conversationOpeners (2 to 4 gentle opening lines they could say out loud).';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            style: { type: Type.STRING },
            summary: { type: Type.STRING },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            watchFor: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestedSplit: {
              type: Type.OBJECT,
              properties: { kind: { type: Type.STRING }, why: { type: Type.STRING } },
              required: ['kind', 'why'],
            },
            thresholds: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { category: { type: Type.STRING }, monthly: { type: Type.NUMBER } },
                required: ['category', 'monthly'],
              },
            },
            reminderCadence: { type: Type.STRING },
            conversationOpeners: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['style', 'summary', 'strengths', 'watchFor', 'suggestedSplit', 'reminderCadence'],
        },
      },
    });

    if (!response.text) {
      return res.status(422).json({ error: 'The assessment could not be written. Try again.' });
    }
    const normalized = normalizeAssessment(JSON.parse(response.text.trim()), language);
    if (!normalized.summary) {
      return res.status(422).json({ error: 'The assessment could not be written. Try again.' });
    }
    const assessment: Assessment = { ...normalized, createdAt: new Date().toISOString() };

    await ensureAdminApp();
    const { getFirestore } = await import('firebase-admin/firestore');
    await getFirestore().collection('users').doc(uid).set({ assessment }, { merge: true });

    // The server is the side that knows the assessment exists; no answers
    // and nothing from the result go into the event.
    await analytics.trackEvent('assessment_completed', {}, { userId: uid });

    return res.status(200).json({ success: true, data: assessment });
  } catch (err: any) {
    // Deliberately logs no answers.
    console.error('Assessment error:', err?.message || err);
    return res.status(500).json({ error: 'The assessment could not be written. Try again.' });
  }
});

export default router;
