import express from 'express';
import { rateLimit, requireAuth } from '../middleware';
import { cleanImageMime, ensureAdminApp, getVertexClient, stripEmDashes } from '../shared';
import { FINANCIAL_PROFILES } from '../profiles';

const router = express.Router();

// Once profile_log holds CATALOG_TARGET entries the catalog is frozen and
// profiles are served from it instead of generated. Before then, an AI
// failure falls back to a logged profile once the log has MIN_LOG_FALLBACK
// entries, else to the curated list.
const CATALOG_TARGET = 250;
const MIN_LOG_FALLBACK = 20;

const getLogCount = async (): Promise<number> => {
  try {
    await ensureAdminApp();
    const { getFirestore } = await import('firebase-admin/firestore');
    const snap = await getFirestore().collection('profile_log').count().get();
    return snap.data().count;
  } catch (e: any) {
    console.error('profile_log count failed:', e?.message || e);
    return -1; // unknown -> behave as if not yet full
  }
};

const getRandomFromLog = async (): Promise<any | null> => {
  try {
    await ensureAdminApp();
    const { getFirestore } = await import('firebase-admin/firestore');
    const snap = await getFirestore()
      .collection('profile_log')
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();
    if (snap.empty) return null;
    const pick: any = snap.docs[Math.floor(Math.random() * snap.size)].data();
    const { createdAt, source, uid, ...profile } = pick;
    return { ...profile, greetingTone: profile.greetingTone || 'harmonious' };
  } catch (e: any) {
    console.error('profile_log read failed:', e?.message || e);
    return null;
  }
};

const getCuratedProfile = async () => {
  const f = FINANCIAL_PROFILES[Math.floor(Math.random() * FINANCIAL_PROFILES.length)];
  return { ...f, greetingTone: 'harmonious' };
};

// ---- AI: receipt scan and vault extract ----
router.post('/api/scan-receipt', requireAuth, rateLimit('scan', 60), async (req, res) => {
  try {
    const { ai, Type } = await getVertexClient();

    const base64Image = req.body?.image;
    if (!base64Image || typeof base64Image !== 'string') {
      return res.status(400).json({ error: 'No receipt image was provided.' });
    }
    {
      const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
      const mimeType = cleanImageMime(req.body?.mimeType);

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { inlineData: { data: base64Data, mimeType } },
          'Extract the total amount, date, description, and the individual line items from this receipt. ' +
            'Line items are the purchased products/services with their prices (exclude tax, tip, subtotal, and total rows). ' +
            'Return ONLY valid JSON.',
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              amount: { type: Type.NUMBER, description: 'Total amount on the receipt' },
              description: {
                type: Type.STRING,
                description: 'Short descriptive name of the merchant/store',
              },
              date: { type: Type.STRING, description: 'Date in YYYY-MM-DD format if available' },
              items: {
                type: Type.ARRAY,
                description: 'Individual purchased line items (no tax/tip/subtotal/total rows)',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    price: { type: Type.NUMBER },
                  },
                  required: ['name', 'price'],
                },
              },
            },
            required: ['amount', 'description'],
          },
        },
      });

      if (response.text) {
        const parsed = JSON.parse(stripEmDashes(response.text.trim()));
        const items = (Array.isArray(parsed.items) ? parsed.items : [])
          .map((it: any) => ({
            name: String(it?.name || 'Item').slice(0, 80),
            price: Math.max(0, Number(it?.price) || 0),
          }))
          .filter((it: any) => it.price > 0)
          .slice(0, 60);
        return res.status(200).json({
          success: true,
          data: {
            amount: Math.max(0, Number(parsed.amount) || 0),
            description: parsed.description || 'Receipt Scan',
            date: parsed.date || new Date().toISOString().split('T')[0],
            items,
          },
        });
      }
    }

    return res
      .status(422)
      .json({ error: 'Could not read the receipt. Please enter the details manually.' });
  } catch (err: any) {
    console.error('Receipt Scan Error:', err);
    res.status(500).json({ error: 'Could not scan the receipt. Please try again.' });
  }
});

// Stateless by contract (privacy policy, section 7): the submitted text or
// image is never stored, never logged as content and never used for
// training. The client encrypts the result before saving it.
router.post('/api/vault-extract', requireAuth, rateLimit('vault', 30), async (req, res) => {
  try {
    const { ai, Type } = await getVertexClient();

    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const image = typeof req.body?.image === 'string' ? req.body.image : '';
    const intent = typeof req.body?.intent === 'string' ? req.body.intent.trim().slice(0, 400) : '';
    const categories: string[] = Array.isArray(req.body?.categories)
      ? req.body.categories.filter((c: any) => typeof c === 'string').slice(0, 40)
      : [];

    if (!text && !image) {
      return res.status(400).json({ error: 'Nothing to organise. Add a note or a photo.' });
    }

    const parts: any[] = [];
    if (image) {
      parts.push({
        inlineData: {
          data: image.includes(',') ? image.split(',')[1] : image,
          mimeType: cleanImageMime(req.body?.mimeType),
        },
      });
    }
    if (text) parts.push(`Here is what the user wrote:\n${text.slice(0, 8000)}`);
    if (intent) parts.push(`The user asked specifically for: ${intent}`);
    if (categories.length) {
      parts.push(
        `Prefer one of the household's existing categories when it fits: ${categories.join(', ')}.`
      );
    }
    parts.push(
      'Turn this into one structured household record. Write `body` as clean, readable prose ' +
        'Keep every fact, drop filler, do not invent anything. ' +
        'Only fill a field if the source actually supports it; leave it out otherwise. ' +
        'Set confidence to `high` only when the value is stated outright, `medium` when it is ' +
        'strongly implied, and `low` when you are guessing. Dates must be YYYY-MM-DD. ' +
        'Return ONLY valid JSON.'
    );

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: parts,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Short title, e.g. 'Con Ed, August'" },
            body: {
              type: Type.STRING,
              description: 'The note itself, cleaned up. Never invent facts.',
            },
            vendor: { type: Type.STRING, description: "Who it is with, e.g. 'Con Edison'" },
            amount: { type: Type.NUMBER, description: 'Amount due, if stated' },
            dueDate: {
              type: Type.STRING,
              description: 'YYYY-MM-DD, if stated or clearly implied',
            },
            recurrence: {
              type: Type.STRING,
              description: 'one of: none, weekly, biweekly, monthly, quarterly, yearly',
            },
            accountHint: {
              type: Type.STRING,
              description:
                "Which account pays it, e.g. 'joint Chase'. Never a full account number.",
            },
            category: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            confidence: {
              type: Type.OBJECT,
              description: 'high | medium | low per field that was filled',
              properties: {
                amount: { type: Type.STRING },
                dueDate: { type: Type.STRING },
                vendor: { type: Type.STRING },
                recurrence: { type: Type.STRING },
                accountHint: { type: Type.STRING },
                category: { type: Type.STRING },
              },
            },
          },
          required: ['title', 'body'],
        },
      },
    });

    if (!response.text) {
      return res
        .status(422)
        .json({ error: 'Could not make sense of that. Try adding a little more detail.' });
    }

    const parsed = JSON.parse(stripEmDashes(response.text.trim()));
    const allowedRecurrence = ['none', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'];
    const isoDate = (v: any) =>
      typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
    const conf = (v: any) => (['high', 'medium', 'low'].includes(v) ? v : undefined);

    return res.status(200).json({
      success: true,
      data: {
        title: String(parsed.title || 'Untitled').slice(0, 120),
        body: String(parsed.body || '').slice(0, 8000),
        vendor: parsed.vendor ? String(parsed.vendor).slice(0, 120) : undefined,
        amount:
          Number.isFinite(Number(parsed.amount)) && Number(parsed.amount) > 0
            ? Math.round(Number(parsed.amount) * 100) / 100
            : undefined,
        dueDate: isoDate(parsed.dueDate),
        recurrence:
          allowedRecurrence.includes(parsed.recurrence) && parsed.recurrence !== 'none'
            ? parsed.recurrence
            : undefined,
        accountHint: parsed.accountHint ? String(parsed.accountHint).slice(0, 80) : undefined,
        category: parsed.category ? String(parsed.category).slice(0, 60) : undefined,
        tags: (Array.isArray(parsed.tags) ? parsed.tags : [])
          .map((t: any) => String(t).slice(0, 40))
          .filter(Boolean)
          .slice(0, 8),
        confidence: {
          amount: conf(parsed.confidence?.amount),
          dueDate: conf(parsed.confidence?.dueDate),
          vendor: conf(parsed.confidence?.vendor),
          recurrence: conf(parsed.confidence?.recurrence),
          accountHint: conf(parsed.confidence?.accountHint),
          category: conf(parsed.confidence?.category),
        },
      },
    });
  } catch (err: any) {
    // Deliberately does not log the submitted content.
    console.error('Vault extract error:', err?.message || err);
    res.status(500).json({ error: 'Could not organise that right now. Please try again.' });
  }
});

// ---- AI: profile, greeting, conversation starter ----
router.post('/api/generate-profile', requireAuth, rateLimit('profile', 30), async (req, res) => {
  const { answers } = req.body || {};
  // Bounds token usage and the prompt-injection surface.
  if (answers && JSON.stringify(answers).length > 4000) {
    return res.status(400).json({ error: 'Quiz answers are too large.' });
  }
  const logCount = await getLogCount();

  if (logCount >= CATALOG_TARGET) {
    const catalogProfile = await getRandomFromLog();
    if (catalogProfile) {
      return res.status(200).json({ success: true, source: 'catalog', data: catalogProfile });
    }
    // If the read unexpectedly failed, fall through to generation below.
  }

  try {
    const { ai, Type } = await getVertexClient();

    const prompt =
      'You are a behavioral-economics-informed relationship finance analyst for "Have Another Cherry", ' +
      'a warm, non-judgmental household expense-splitting app.\n\n' +
      "Analyze these quiz answers HOLISTICALLY and as an INTERCONNECTED whole - for example, how the person's " +
      'credit-card and cash habits relate to how they feel about money, and to how they prefer to talk about it. ' +
      'Look for tension or harmony between answers (e.g., a spender who avoids money talk, or a saver who loves it).\n\n' +
      'Quiz answers (JSON):\n' +
      JSON.stringify(answers, null, 2) +
      '\n\n' +
      'Generate ONE unique, bespoke financial-personality profile that feels tailor-made for THIS combination of answers. ' +
      "Invent a distinctive, evocative 'type' name of 2-4 words (do not reuse generic textbook labels). " +
      'Write in warm, encouraging second person. Be specific to their answers, insightful, and never judgmental.\n\n' +
      'Return JSON with fields: ' +
      'type (2-4 word name), ' +
      'description (2-3 sentences, second person), ' +
      'quote (a real, correctly-attributed quote about money, sharing, or relationships, formatted as: "<quote>" - <Author>), ' +
      'traits (an array of 3-5 short descriptive phrases), ' +
      'strengths (one encouraging sentence), ' +
      'watchouts (one gentle, constructive sentence), ' +
      'communicationStyle (one sentence about how this person likely prefers to discuss money with the people they share a home with), ' +
      'greetingTone (exactly ONE lowercase word chosen from: playful, pragmatic, nurturing, analytical, adventurous, harmonious, thrifty, generous). ' +
      'Never use em dashes in any field; use commas, periods, or hyphens instead.';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 1.0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING },
            description: { type: Type.STRING },
            quote: { type: Type.STRING },
            traits: { type: Type.ARRAY, items: { type: Type.STRING } },
            strengths: { type: Type.STRING },
            watchouts: { type: Type.STRING },
            communicationStyle: { type: Type.STRING },
            greetingTone: { type: Type.STRING },
          },
          required: ['type', 'description', 'quote', 'greetingTone'],
        },
      },
    });

    if (response.text) {
      const parsed = JSON.parse(stripEmDashes(response.text.trim()));
      return res.status(200).json({ success: true, source: 'ai', data: parsed });
    }

    throw new Error('Failed to generate profile');
  } catch (err: any) {
    console.error('Profile Gen Error:', err);
    const data =
      (logCount >= MIN_LOG_FALLBACK ? await getRandomFromLog() : null) ||
      (await getCuratedProfile());
    return res.status(200).json({ success: true, source: 'fallback', data });
  }
});

router.post('/api/generate-greeting', requireAuth, rateLimit('greeting', 60), async (req, res) => {
  const { memberCount, profileType: rawProfileType, greetingTone: rawTone } = req.body || {};
  const count = Number(memberCount) || 1;
  const ALLOWED_TONES = [
    'playful',
    'pragmatic',
    'nurturing',
    'analytical',
    'adventurous',
    'harmonious',
    'thrifty',
    'generous',
  ];
  const greetingTone = ALLOWED_TONES.includes(rawTone) ? rawTone : 'harmonious';
  const profileType = typeof rawProfileType === 'string' ? rawProfileType.slice(0, 60) : '';

  // Used when the AI call fails.
  const fallbackBySize: Record<string, string> = {
    solo: "A cherry's sweeter shared - but savoring your own bowl today is just as ripe. 🍒",
    pair: 'Two cherries on one stem: share the sweet, split the pits, and keep it fair. 🍒',
    group:
      "A bowl of cherries is best passed around - here's to sharing every sweet bite together. 🍒",
  };
  const sizeKey = count <= 1 ? 'solo' : count === 2 ? 'pair' : 'group';

  try {
    const { ai, Type } = await getVertexClient();

    const audience =
      count <= 1
        ? 'one person managing their own bowl'
        : count === 2
          ? 'a pair sharing everything'
          : `a household of ${count} people sharing together`;

    const prompt =
      'Write a VERY short greeting for the home screen of "Have Another Cherry", a warm household ' +
      'expense-sharing app. Requirements:\n' +
      '- 1 to 2 lines, roughly 20 words maximum.\n' +
      '- Positive and relationship-focused, about sharing/fairness/togetherness.\n' +
      '- Must charmingly reference cherries (sharing cherries). A tiny rhyme or limerick feel is welcome.\n' +
      `- Written for ${audience}.\n` +
      `- Match this tone: ${greetingTone || 'harmonious'}.\n` +
      (profileType ? `- Subtly fit someone whose money style is "${profileType}".\n` : '') +
      '- At most one 🍒 emoji. No hashtags, no surrounding quotes.\n' +
      '- Never use an em dash; use commas, periods, or hyphens instead.\n' +
      'Output ONLY the greeting text.';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 1.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: { greeting: { type: Type.STRING } },
          required: ['greeting'],
        },
      },
    });

    if (response.text) {
      const parsed = JSON.parse(stripEmDashes(response.text.trim()));
      const greeting = (parsed.greeting || '').trim();
      if (greeting) return res.status(200).json({ success: true, greeting });
    }
    throw new Error('Empty greeting');
  } catch (err: any) {
    console.error('Greeting Gen Error:', err?.message || err);
    return res.status(200).json({ success: true, greeting: fallbackBySize[sizeKey] });
  }
});

router.post(
  '/api/generate-conversation-starter',
  requireAuth,
  rateLimit('starter', 30),
  async (req, res) => {
    const { severityPct: rawSeverity, styles: rawStyles } = req.body || {};

    const severityPct = Math.min(500, Math.max(0, Math.round(Number(rawSeverity) || 0)));
    const styles = (Array.isArray(rawStyles) ? rawStyles : []).slice(0, 5).map((s: any) => ({
      name: typeof s?.name === 'string' ? s.name.slice(0, 40) : 'A member',
      type: typeof s?.type === 'string' ? s.type.slice(0, 60) : '',
      communicationStyle:
        typeof s?.communicationStyle === 'string' ? s.communicationStyle.slice(0, 200) : '',
    }));

    // Used when the AI call fails.
    const fallback =
      severityPct >= 50
        ? 'It looks like the numbers you each had in mind are pretty far apart - that usually just means you haven\'t had the full conversation yet. Maybe start with: "What does a fair split feel like to you, and what would you want me to know about your situation?"'
        : severityPct >= 25
          ? 'The income estimates don\'t quite line up. A gentle way in: "I think I have been guessing at your numbers. Can we compare notes so the split feels fair to everyone?"'
          : 'You\'re close, but not quite in sync on the numbers. Try: "Quick money check-in - want to make sure our split still matches reality?"';

    try {
      const { ai, Type } = await getVertexClient();

      const severityBand =
        severityPct >= 50
          ? 'large (over 50% apart) - be extra gentle, acknowledge it may feel loaded, suggest a structured, unhurried conversation'
          : severityPct >= 25
            ? 'moderate (25-50% apart) - warm and direct, normalize the mismatch, invite swapping real numbers'
            : 'small (10-25% apart) - light and easy, frame it as a quick sync-up';

      const styleLines = styles
        .map(
          (s) =>
            `- ${s.name}: money style "${s.type || 'unknown'}"${s.communicationStyle ? `; prefers to talk about money like this: ${s.communicationStyle}` : ''}`
        )
        .join('\n');

      const prompt =
        'You write conversation starters for "Have Another Cherry", a warm, non-judgmental household ' +
        "expense-splitting app. A household's members reported their own incomes and estimated each " +
        "other's, and the numbers disagree.\n\n" +
        `Gap severity: ${severityPct}% - ${severityBand}.\n\n` +
        'The people, and how they each prefer to talk about money:\n' +
        (styleLines || '- (no profiles available)') +
        '\n\n' +
        'Write ONE conversation starter (2-4 sentences) they could actually say to each other to open a ' +
        'kind, blame-free talk about getting their real numbers in sync so their expense split feels fair. ' +
        'Adapt the tone to the severity band and bridge their communication styles. Include one concrete ' +
        'opening line in quotes they can borrow. Never scold, never assume anyone lied, never mention ' +
        'specific dollar amounts, and don\'t use the word "discrepancy".\n\n' +
        'Never use em dashes; use commas, periods, or hyphens instead. ' +
        'Return JSON with a single field: starter.';

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          temperature: 0.9,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: { starter: { type: Type.STRING } },
            required: ['starter'],
          },
        },
      });

      if (response.text) {
        const parsed = JSON.parse(stripEmDashes(response.text.trim()));
        const starter = (parsed.starter || '').trim();
        if (starter) return res.status(200).json({ success: true, starter });
      }
      throw new Error('Empty starter');
    } catch (err: any) {
      console.error('Conversation Starter Gen Error:', err?.message || err);
      return res.status(200).json({ success: true, starter: fallback });
    }
  }
);

export default router;
