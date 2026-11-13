// The Log form's guesses: a category from the title (what this group called
// the same thing before, then plain keywords) and whether the title looks like
// a recurring bill. Guesses only; the person confirms with a tap and nothing
// is saved until they do. Port of the Flutter app's
// domain/ledger/smart_defaults.dart, checked vector for vector by
// scripts/smart-defaults-check.ts (`npm run test:parity`) against
// test/smart_defaults_test.dart. Change the two together.
import { Expense } from '../types';

/** Lowercased, trimmed, punctuation and digits dropped, spaces collapsed, so
 *  `Trader Joe's #12` and `trader joes` compare equal. The letter classes
 *  are Latin (with the extended ranges), Russian and the space. */
export const normalizeTitle = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-zа-яёÀ-ɏ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Keyword to category, checked in order; the first match wins. Categories
 *  are the defaults the form offers. Same table as the Dart file. */
const KEYWORDS: [string[], string][] = [
  [['rent', 'landlord', 'аренда', 'alquiler', 'renta'], 'Rent'],
  [['mortgage', 'ипотека', 'hipoteca'], 'Mortgage'],
  [
    [
      'electric',
      'power',
      'water',
      'gas bill',
      'utility',
      'utilities',
      'свет',
      'вода',
      'коммунал',
      'luz',
      'agua',
      'electricidad',
    ],
    'Utilities',
  ],
  [['internet', 'wifi', 'broadband', 'fiber', 'fibra', 'интернет'], 'Internet'],
  [['phone', 'mobile', 'cell', 'телефон', 'móvil', 'movil', 'celular'], 'Phone'],
  [['insurance', 'страхов', 'seguro'], 'Insurance'],
  [
    [
      'grocer',
      'market',
      'supermarket',
      'costco',
      'trader joe',
      'whole foods',
      'aldi',
      'lidl',
      'mercadona',
      'carrefour',
      'пятёрочка',
      'пятерочка',
      'перекрёсток',
      'перекресток',
      'магнит',
      'продукты',
      'супермаркет',
      'compra',
      'súper',
      'super',
    ],
    'Groceries',
  ],
  [
    [
      'restaurant',
      'dinner',
      'lunch',
      'brunch',
      'cafe',
      'coffee',
      'pizza',
      'sushi',
      'takeout',
      'ресторан',
      'кафе',
      'кофе',
      'обед',
      'ужин',
      'cena',
      'comida',
      'restaurante',
      'café',
    ],
    'Dining Out',
  ],
  [
    [
      'netflix',
      'spotify',
      'hulu',
      'disney',
      'hbo',
      'youtube premium',
      'apple music',
      'icloud',
      'subscription',
      'подписка',
      'suscripción',
      'suscripcion',
    ],
    'Subscription',
  ],
  [
    [
      'uber',
      'lyft',
      'taxi',
      'bus',
      'metro',
      'train',
      'gas',
      'fuel',
      'petrol',
      'parking',
      'такси',
      'бензин',
      'метро',
      'gasolina',
      'transporte',
    ],
    'Transport',
  ],
  [
    ['pharmacy', 'doctor', 'dentist', 'clinic', 'аптека', 'врач', 'farmacia', 'médico', 'medico'],
    'Health',
  ],
  [
    [
      'daycare',
      'nanny',
      'babysit',
      'childcare',
      'няня',
      'садик',
      'guardería',
      'guarderia',
      'niñera',
    ],
    'Childcare',
  ],
  [['vet', 'dog', 'cat food', 'pet', 'ветеринар', 'корм', 'veterinari'], 'Pets'],
  [['gym', 'fitness', 'yoga', 'спортзал', 'фитнес', 'gimnasio'], 'Fitness'],
  [
    [
      'flight',
      'hotel',
      'airbnb',
      'trip',
      'travel',
      'перелёт',
      'перелет',
      'отель',
      'vuelo',
      'viaje',
    ],
    'Travel',
  ],
  [['gift', 'подарок', 'regalo'], 'Gifts'],
  [['ikea', 'furniture', 'мебель', 'mueble'], 'Furniture'],
  [
    ['cleaning', 'detergent', 'paper towel', 'supplies', 'хозтовар', 'limpieza'],
    'Household Supplies',
  ],
];

/** The keyword table's answer for a title, with no history and no allowed
 *  list: the first category whose keyword the normalized title contains, or
 *  null. What `suggestRule` compares the person's choice against. */
export const keywordCategory = (title: string): string | null => {
  const key = normalizeTitle(title);
  if (!key) return null;
  for (const [words, category] of KEYWORDS) {
    for (const w of words) if (key.includes(w)) return category;
  }
  return null;
};

/** The category to preselect for [title], or null when there is no good
 *  guess. This group's own history wins: the category it gave the same
 *  title most often (the first to reach the top count, in ledger order).
 *  Then the keyword table. The result is always one of [categories]. */
export const suggestCategory = (
  title: string,
  history: Expense[],
  categories: Iterable<string>
): string | null => {
  const key = normalizeTitle(title);
  if (!key) return null;
  const allowed = new Set(categories);

  const counts = new Map<string, number>();
  for (const e of history) {
    if (normalizeTitle(e.title || '') === key && allowed.has(e.category)) {
      counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    }
  }
  if (counts.size > 0) {
    let best: [string, number] | null = null;
    for (const entry of counts) if (!best || entry[1] > best[1]) best = entry;
    return best![0];
  }

  for (const [words, category] of KEYWORDS) {
    if (!allowed.has(category)) continue;
    for (const w of words) if (key.includes(w)) return category;
  }
  return null;
};

/** Whether [title] looks like something this group pays again and again:
 *  the same title already logged (not as an autopilot instance) in at least
 *  two different months. Returns the interval to suggest, or null. Four or
 *  more in two months reads as weekly; otherwise monthly. */
export const suggestRecurringInterval = (title: string, history: Expense[]): string | null => {
  const key = normalizeTitle(title);
  if (!key) return null;
  const months = new Set<string>();
  let count = 0;
  for (const e of history) {
    if (e.recurringSourceId) continue;
    if (normalizeTitle(e.title || '') !== key) continue;
    const m = /^(\d{4})-(\d{2})/.exec(e.date || '');
    if (!m) continue;
    months.add(`${Number(m[1])}-${Number(m[2])}`);
    count++;
  }
  if (months.size < 2) return null;
  return count >= 4 && months.size <= 2 ? '1_weeks' : '1_months';
};
