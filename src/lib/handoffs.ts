// Payment handoffs: the registry of payment apps a settlement can hand the
// payer into, by region, and how each one opens. Mirrors the Flutter
// registry (lib/domain/settle/handoffs.dart); the ids, the bank picker ids
// and the regions are the shared contract in docs/REBUILD_PLAN.md section
// 11 of the mobile repo, so change both together.
//
// No app here is ever charged through. The app opens the door (a prefilled
// link where the network documents one, otherwise the person's own payment
// or bank app with the recipient's handle on the clipboard) and the person
// confirms inside that app, then comes back and logs the payment. The
// handoff id is recorded as the settlement's payment method, so the ledger
// keeps saying how something was paid.

import type { PaymentInstrument } from '../types';

export const HANDOFF_IDS = [
  'venmo',
  'zelle',
  'cashapp',
  'paypal',
  'sbp',
  'bizum',
  'spei',
  'mercadopago',
  'modo',
  'nequi',
  'daviplata',
  'bancolombia',
  'yape',
  'plin',
  'mach',
  'tenpo',
  'bank_transfer',
  'cash',
  'other',
] as const;
export type HandoffId = (typeof HANDOFF_IDS)[number];

export const isHandoffId = (v: unknown): v is HandoffId =>
  typeof v === 'string' && (HANDOFF_IDS as readonly string[]).includes(v);

/** What the recipient stores so others can pay them through this app. */
export type HandleKind = 'username' | 'phone' | 'email_or_phone' | 'alias' | 'tag' | 'none';

export interface HandoffDef {
  id: HandoffId;
  /** ISO 3166-1 alpha-2 regions where it is offered; '*' means everywhere. */
  regions: readonly string[];
  handle: HandleKind;
  /** The payer picks their own bank once; the handoff then opens that app. */
  bankPicker: boolean;
  /** Where to send the payer when nothing more specific can be opened. */
  web: string;
  /** A prefilled link the network documents, when one exists. */
  prefilled?: (handle: string, amount: string, note: string) => string;
  /** The payment app's own URL scheme, when it has one worth trying. */
  appScheme?: string;
}

const EVERYWHERE = ['*'] as const;

const money = (amount: number): string => (Math.round(Math.max(0, amount) * 100) / 100).toFixed(2);

export const HANDOFFS: Record<HandoffId, HandoffDef> = {
  venmo: {
    id: 'venmo',
    regions: ['US'],
    handle: 'username',
    bankPicker: false,
    web: 'https://venmo.com/',
    // The https form works on desktop and falls through to the app on
    // mobile; venmo:// would break where the app is not installed.
    prefilled: (handle, amount, note) =>
      `https://venmo.com/?${new URLSearchParams({
        txn: 'pay',
        audience: 'private',
        recipients: handle.replace(/^@/, ''),
        amount,
        note,
      }).toString()}`,
  },
  zelle: {
    id: 'zelle',
    regions: ['US'],
    handle: 'email_or_phone',
    bankPicker: true,
    web: 'https://www.zellepay.com/',
  },
  cashapp: {
    id: 'cashapp',
    regions: ['US'],
    handle: 'tag',
    bankPicker: false,
    web: 'https://cash.app/',
    prefilled: (handle, amount) =>
      `https://cash.app/$${encodeURIComponent(handle.replace(/^\$/, ''))}/${amount}`,
  },
  paypal: {
    id: 'paypal',
    regions: ['US', 'ES', 'MX', 'AR', 'CO', 'PE', 'CL'],
    handle: 'username',
    bankPicker: false,
    web: 'https://www.paypal.com/',
    prefilled: (handle, amount) =>
      `https://paypal.me/${encodeURIComponent(handle.replace(/^@/, ''))}/${amount}`,
  },
  sbp: {
    id: 'sbp',
    regions: ['RU'],
    handle: 'phone',
    bankPicker: true,
    web: 'https://sbp.nspk.ru/',
  },
  bizum: {
    id: 'bizum',
    regions: ['ES'],
    handle: 'phone',
    bankPicker: true,
    web: 'https://bizum.es/',
  },
  spei: {
    id: 'spei',
    regions: ['MX'],
    handle: 'alias',
    bankPicker: true,
    web: 'https://www.banxico.org.mx/servicios/sistema-pagos-electronicos-interbancarios-spei.html',
  },
  mercadopago: {
    id: 'mercadopago',
    regions: ['MX', 'AR', 'CO', 'PE', 'CL'],
    handle: 'alias',
    bankPicker: false,
    web: 'https://www.mercadopago.com/',
    appScheme: 'mercadopago://home',
  },
  modo: {
    id: 'modo',
    regions: ['AR'],
    handle: 'alias',
    bankPicker: false,
    web: 'https://www.modo.com.ar/',
    appScheme: 'modo://',
  },
  nequi: {
    id: 'nequi',
    regions: ['CO'],
    handle: 'phone',
    bankPicker: false,
    web: 'https://www.nequi.com.co/',
    appScheme: 'nequi://',
  },
  daviplata: {
    id: 'daviplata',
    regions: ['CO'],
    handle: 'phone',
    bankPicker: false,
    web: 'https://www.daviplata.com/',
    appScheme: 'daviplata://',
  },
  bancolombia: {
    id: 'bancolombia',
    regions: ['CO'],
    handle: 'phone',
    bankPicker: false,
    web: 'https://www.bancolombia.com/',
    appScheme: 'bancolombia://',
  },
  yape: {
    id: 'yape',
    regions: ['PE'],
    handle: 'phone',
    bankPicker: false,
    web: 'https://www.yape.com.pe/',
    appScheme: 'yape://',
  },
  plin: {
    id: 'plin',
    regions: ['PE'],
    handle: 'phone',
    bankPicker: false,
    web: 'https://www.plin.pe/',
  },
  mach: {
    id: 'mach',
    regions: ['CL'],
    handle: 'phone',
    bankPicker: false,
    web: 'https://www.somosmach.com/',
    appScheme: 'mach://',
  },
  tenpo: {
    id: 'tenpo',
    regions: ['CL'],
    handle: 'phone',
    bankPicker: false,
    web: 'https://www.tenpo.cl/',
    appScheme: 'tenpo://',
  },
  bank_transfer: {
    id: 'bank_transfer',
    regions: EVERYWHERE,
    handle: 'alias',
    bankPicker: false,
    web: '',
  },
  cash: { id: 'cash', regions: EVERYWHERE, handle: 'none', bankPicker: false, web: '' },
  other: { id: 'other', regions: EVERYWHERE, handle: 'none', bankPicker: false, web: '' },
};

/** The handoffs that store a handle on the recipient's profile. */
export const HANDLE_HANDOFFS: HandoffId[] = HANDOFF_IDS.filter(
  (id) => HANDOFFS[id].handle !== 'none'
);

// ---- Banks for the pick-your-bank handoffs -------------------------------

export const BANK_IDS = [
  'chase',
  'bofa',
  'wellsfargo',
  'capitalone',
  'citi',
  'usbank',
  'pnc',
  'truist',
  'sber',
  'tbank',
  'alfa',
  'vtb',
  'raiffeisen',
  'caixabank',
  'bbva',
  'santander',
  'sabadell',
  'ing',
  'openbank',
  'bbva_mx',
  'banorte',
  'santander_mx',
  'banamex',
  'other_bank',
] as const;
export type BankId = (typeof BANK_IDS)[number];

export const isBankId = (v: unknown): v is BankId =>
  typeof v === 'string' && (BANK_IDS as readonly string[]).includes(v);

export interface BankDef {
  id: BankId;
  name: string;
  /** Which handoff this bank serves; '*' is the generic "other bank". */
  handoff: HandoffId | '*';
  /** URL schemes to try, in order; the browser falls back to `web`. */
  schemes: readonly string[];
  web: string;
}

export const BANKS: Record<BankId, BankDef> = {
  chase: {
    id: 'chase',
    name: 'Chase',
    handoff: 'zelle',
    schemes: ['chase://'],
    web: 'https://www.chase.com/',
  },
  bofa: {
    id: 'bofa',
    name: 'Bank of America',
    handoff: 'zelle',
    schemes: ['bofa://'],
    web: 'https://www.bankofamerica.com/',
  },
  wellsfargo: {
    id: 'wellsfargo',
    name: 'Wells Fargo',
    handoff: 'zelle',
    schemes: ['wellsfargo://'],
    web: 'https://www.wellsfargo.com/',
  },
  capitalone: {
    id: 'capitalone',
    name: 'Capital One',
    handoff: 'zelle',
    schemes: ['capitalone://'],
    web: 'https://www.capitalone.com/',
  },
  citi: {
    id: 'citi',
    name: 'Citi',
    handoff: 'zelle',
    schemes: ['citimobile://'],
    web: 'https://www.citi.com/',
  },
  usbank: {
    id: 'usbank',
    name: 'U.S. Bank',
    handoff: 'zelle',
    schemes: ['usbank://'],
    web: 'https://www.usbank.com/',
  },
  pnc: {
    id: 'pnc',
    name: 'PNC',
    handoff: 'zelle',
    schemes: ['pnc://'],
    web: 'https://www.pnc.com/',
  },
  truist: {
    id: 'truist',
    name: 'Truist',
    handoff: 'zelle',
    schemes: ['truist://'],
    web: 'https://www.truist.com/',
  },
  sber: {
    id: 'sber',
    name: 'Sber',
    handoff: 'sbp',
    schemes: ['sberbankonline://', 'sbolonline://'],
    web: 'https://online.sberbank.ru/',
  },
  tbank: {
    id: 'tbank',
    name: 'T-Bank',
    handoff: 'sbp',
    schemes: ['tinkoffbank://', 'tbank://'],
    web: 'https://www.tbank.ru/',
  },
  alfa: {
    id: 'alfa',
    name: 'Alfa-Bank',
    handoff: 'sbp',
    schemes: ['alfabank://'],
    web: 'https://alfabank.ru/',
  },
  vtb: {
    id: 'vtb',
    name: 'VTB',
    handoff: 'sbp',
    schemes: ['vtbonline://', 'vtb://'],
    web: 'https://online.vtb.ru/',
  },
  raiffeisen: {
    id: 'raiffeisen',
    name: 'Raiffeisen',
    handoff: 'sbp',
    schemes: ['raiffeisen://'],
    web: 'https://online.raiffeisen.ru/',
  },
  caixabank: {
    id: 'caixabank',
    name: 'CaixaBank',
    handoff: 'bizum',
    schemes: ['caixabank://'],
    web: 'https://www.caixabank.es/',
  },
  bbva: {
    id: 'bbva',
    name: 'BBVA',
    handoff: 'bizum',
    schemes: ['bbva://'],
    web: 'https://www.bbva.es/',
  },
  santander: {
    id: 'santander',
    name: 'Santander',
    handoff: 'bizum',
    schemes: ['santander://'],
    web: 'https://www.bancosantander.es/',
  },
  sabadell: {
    id: 'sabadell',
    name: 'Sabadell',
    handoff: 'bizum',
    schemes: ['bsabadell://'],
    web: 'https://www.bancsabadell.com/',
  },
  ing: {
    id: 'ing',
    name: 'ING',
    handoff: 'bizum',
    schemes: ['ing://'],
    web: 'https://www.ing.es/',
  },
  openbank: {
    id: 'openbank',
    name: 'Openbank',
    handoff: 'bizum',
    schemes: ['openbank://'],
    web: 'https://www.openbank.es/',
  },
  bbva_mx: {
    id: 'bbva_mx',
    name: 'BBVA México',
    handoff: 'spei',
    schemes: ['bbvamexico://'],
    web: 'https://www.bbva.mx/',
  },
  banorte: {
    id: 'banorte',
    name: 'Banorte',
    handoff: 'spei',
    schemes: ['banorte://'],
    web: 'https://www.banorte.com/',
  },
  santander_mx: {
    id: 'santander_mx',
    name: 'Santander México',
    handoff: 'spei',
    schemes: ['santandermx://'],
    web: 'https://www.santander.com.mx/',
  },
  banamex: {
    id: 'banamex',
    name: 'Banamex',
    handoff: 'spei',
    schemes: ['banamex://'],
    web: 'https://www.banamex.com/',
  },
  other_bank: { id: 'other_bank', name: '', handoff: '*', schemes: [], web: '' },
};

/** The banks offered for one pick-your-bank handoff, generic last. */
export function banksFor(handoff: HandoffId): BankId[] {
  if (!HANDOFFS[handoff].bankPicker) return [];
  return [...BANK_IDS.filter((b) => BANKS[b].handoff === handoff), 'other_bank'];
}

// ---- Regions ---------------------------------------------------------------

/** The regions the registry knows, for the group's region picker. */
export const KNOWN_REGIONS = ['US', 'RU', 'ES', 'MX', 'AR', 'CO', 'PE', 'CL'] as const;

/** The device's region from the browser locale, 'US' when it has none. */
export function deviceRegion(): string {
  const tags = typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [];
  for (const tag of tags) {
    const m = /-([A-Za-z]{2})(?:-|$)/.exec(tag || '');
    if (m) return m[1].toUpperCase();
  }
  return 'US';
}

/** Alpha-2 upper case or the fallback. */
export function normalizeRegion(v: unknown, fallback = 'US'): string {
  return typeof v === 'string' && /^[A-Za-z]{2}$/.test(v) ? v.toUpperCase() : fallback;
}

/** Handoffs offered in a region: its own apps, then the everywhere ones. */
export function handoffsForRegion(region: string): HandoffId[] {
  const r = normalizeRegion(region);
  const local = HANDOFF_IDS.filter((id) => HANDOFFS[id].regions.includes(r));
  const everywhere = HANDOFF_IDS.filter((id) => HANDOFFS[id].regions[0] === '*');
  return [...local, ...everywhere];
}

// ---- Settlements ------------------------------------------------------------

// The ledger already stores VENMO and ZELLE (and CASH, TRANSFER, OTHER) as
// instrument codes both clients read, so those keep their codes; every other
// handoff is stored as its own id.
export function instrumentForHandoff(id: HandoffId): PaymentInstrument {
  switch (id) {
    case 'venmo':
      return 'VENMO';
    case 'zelle':
      return 'ZELLE';
    case 'cash':
      return 'CASH';
    case 'bank_transfer':
      return 'TRANSFER';
    case 'other':
      return 'OTHER';
    default:
      return id;
  }
}

export function handoffForInstrument(code: string | undefined | null): HandoffId | null {
  switch (code) {
    case 'VENMO':
      return 'venmo';
    case 'ZELLE':
      return 'zelle';
    case 'CASH':
      return 'cash';
    case 'TRANSFER':
      return 'bank_transfer';
    case 'OTHER':
      return 'other';
    default:
      return isHandoffId(code) ? code : null;
  }
}

// ---- Opening a handoff ------------------------------------------------------

export interface HandoffTarget {
  handoff: HandoffId;
  /** The recipient's handle, formatted for display; empty when they have none. */
  handle: string;
  /** Text the payer needs on the clipboard inside the other app. */
  copyText: string;
  /** Apps to try, in order (bank schemes or the network's own scheme). */
  appUrls: string[];
  /** What opens when no app answers, or on desktop. */
  fallbackUrl: string;
  /** True when `fallbackUrl` already carries recipient, amount and note. */
  prefilled: boolean;
  bank: BankId | null;
}

export function displayHandle(id: HandoffId, handle: string): string {
  const h = handle.trim();
  if (!h) return '';
  if (HANDOFFS[id].handle === 'username') return `@${h.replace(/^@/, '')}`;
  if (HANDOFFS[id].handle === 'tag') return `$${h.replace(/^\$/, '')}`;
  return h;
}

/**
 * Everything the settle sheet needs to hand the payer into one app, built
 * from the recipient's handle and the payer's own bank choice.
 */
export function buildHandoffTarget(
  id: HandoffId,
  handle: string | undefined,
  amount: number,
  note: string,
  bankApp?: BankId | null
): HandoffTarget {
  const def = HANDOFFS[id];
  const raw = (handle || '').trim();
  const shown = displayHandle(id, raw);
  const bank = def.bankPicker && bankApp && isBankId(bankApp) ? bankApp : null;
  const appUrls: string[] = [];
  if (bank && BANKS[bank].handoff === id) appUrls.push(...BANKS[bank].schemes);
  if (!bank && def.appScheme) appUrls.push(def.appScheme);

  let fallbackUrl = def.web;
  let prefilled = false;
  if (raw && def.prefilled) {
    fallbackUrl = def.prefilled(raw, money(amount), note.slice(0, 140));
    prefilled = true;
  } else if (bank && BANKS[bank].web) {
    fallbackUrl = BANKS[bank].web;
  }

  return {
    handoff: id,
    handle: shown,
    copyText: raw,
    appUrls,
    fallbackUrl,
    prefilled,
    bank,
  };
}

/**
 * Opens the first app that answers, else the fallback. Browsers give no
 * signal when a custom scheme has no handler, so the fallback fires after a
 * moment unless the page was backgrounded, which means an app took over.
 */
export function openHandoff(target: HandoffTarget): void {
  if (typeof window === 'undefined') return;
  const openFallback = () => {
    if (target.fallbackUrl) window.open(target.fallbackUrl, '_blank', 'noopener,noreferrer');
  };
  if (target.appUrls.length === 0) {
    openFallback();
    return;
  }
  const started = Date.now();
  let settled = false;
  const onHide = () => {
    settled = true;
  };
  document.addEventListener('visibilitychange', onHide, { once: true });
  window.location.href = target.appUrls[0];
  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide);
    if (!settled && document.visibilityState === 'visible' && Date.now() - started < 2500) {
      openFallback();
    }
  }, 1200);
}
