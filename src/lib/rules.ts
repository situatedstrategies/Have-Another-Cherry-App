// Category rules: "when the title contains X, use category Y". Learned from
// what the household actually does on the Log form and editable as a list
// under Plan. Rules live in the household plan payload (lib/plan
// PlanPayload.rules), encrypted with the group key like the budgets, so every
// member's Log form reads them. Pure; mirrored in the Flutter app's
// domain/plan/rules.dart and checked by scripts/rules-check.ts
// (`npm run test:parity`).
import { Expense } from '../types';
import { normalizeTitle, suggestCategory, keywordCategory } from './smartDefaults';

export interface CategoryRule {
  id: string;
  /** Lowercased, trimmed, normalized the way titles are (normalizeTitle). */
  contains: string;
  category: string;
  /** ISO datetime. */
  createdAt: string;
}

/** The first rule, in the order stored, whose `contains` is a substring of
 *  the normalized title; null when none matches or the title is blank. A
 *  rule with a blank `contains` never matches. */
export const matchRule = (title: string, rules: CategoryRule[]): CategoryRule | null => {
  const key = normalizeTitle(title);
  if (!key) return null;
  for (const r of rules) {
    const needle = normalizeTitle(r.contains || '');
    if (needle && key.includes(needle)) return r;
  }
  return null;
};

/** The category the Log form preselects: a rule match first (its category,
 *  whether or not it is in [categories]), then the history and keyword guess
 *  from smartDefaults, then null. */
export const categoryFor = (
  title: string,
  rules: CategoryRule[],
  history: Expense[],
  categories: Iterable<string>
): string | null => {
  const rule = matchRule(title, rules);
  if (rule) return rule.category;
  return suggestCategory(title, history, categories);
};

export interface RuleSuggestion {
  contains: string;
  category: string;
}

/** After a save: the rule to offer, or null. Offered when the person has now
 *  given this normalized title the same category at least twice (the entries
 *  in [history] plus the one being saved, which is not in [history]) and the
 *  keyword table's guess for the title was a different category or none.
 *  Nothing is offered when a stored rule already matches the title with this
 *  category, or when the title normalizes to nothing. `contains` is the
 *  normalized title. */
export const suggestRule = (
  title: string,
  category: string,
  history: Expense[],
  rules: CategoryRule[] = []
): RuleSuggestion | null => {
  const key = normalizeTitle(title);
  const cat = category.trim();
  if (!key || !cat) return null;
  const existing = matchRule(title, rules);
  if (existing && existing.category.trim() === cat) return null;
  let count = 1;
  for (const e of history) {
    if (normalizeTitle(e.title || '') === key && (e.category || '').trim() === cat) count++;
  }
  if (count < 2) return null;
  if (keywordCategory(title) === cat) return null;
  return { contains: key, category: cat };
};

/** A new rule from a suggestion. [now] is injectable for the parity vector. */
export const ruleFrom = (
  s: RuleSuggestion,
  now: string = new Date().toISOString(),
  id: string = `r_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
): CategoryRule => ({ id, contains: s.contains, category: s.category, createdAt: now });
