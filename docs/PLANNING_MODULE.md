# Planning module: reports, goals, automation

Owner's brief, November 12th 2026: "everything in Monarch but without the
account linking": advanced category spending views and reports, goals, and
automation, for the household and for the person. This document is the spec
for both clients (this web app and the Flutter app, which mirror domain logic
as `src/lib/*.ts` and `lib/domain/**/*.dart` with parity checks).

Hard constraints carried over from the rest of the product:

- No bank or card aggregation. Every number comes from the ledger the
  household keeps by hand, by receipt scan, or through the recurring
  autopilot. The App Store review notes and the marketing site's privacy
  claims promise this.
- Nothing new leaves the encrypted ledger. Anything stored is encrypted the
  way the vault is (group key for shared data, uid key for private data).
  Emails and pushes stay contentless.
- No em or en dashes in copy. The locked taglines and the one-pun rule apply
  to any marketing of it.
- Both clients ship the same feature with the same arithmetic. A parity
  script in `scripts/` and a Dart test carry the same vectors.

## Vocabulary

- **Household** means one group and its full ledger: every expense, whole
  amounts, every member.
- **Personal** means one member's own share of each expense, which is what
  the itemized ledger makes possible and what a bank feed cannot show. In
  phase 1 it is the member's share within the active group. Phase 3 adds the
  member's share across every group they belong to.
- **Period** is a calendar month by default, with week, quarter and year, and
  a custom range.

## Phase 1: Reports

A reporting screen (mobile: `/reports`, behind the same gate as Insights;
web: a Reports section mounted where Insights is, with the same gating) that
answers "where did it go" for any period, in both views.

Filters, applied to every report at once: period (This month, Last month,
3M, 6M, 1Y, custom), view (Household or Personal), categories (multi-select),
members (who paid, multi-select), include recurring only / one-off only /
both, include settled only / open only / both. Dark Cherry expenses follow
the existing visibility rule (hidden unless you created them).

Reports, each a card in reading order:

1. **Totals strip**: spent in the period, average per day, count, change
   against the previous period of the same length (absolute and percent).
2. **By category**: ranked bars with amount, share of total, and change vs
   the previous period; tapping a bar drills into the list below. Donut on
   the web, bars on mobile (the family's chart idiom is bars and lines).
3. **Over time**: the period split into days (week), weeks (month, 3M) or
   months (6M, 1Y), as a line with the previous period overlaid when
   "compare" is on, reusing the trends chart style.
4. **Category over time**: the same timeline for the top five categories,
   stacked bars.
5. **By person**: in Household view, who paid how much and who was
   responsible for how much (sum of shares); in Personal view, how much of
   the member's share each other member fronted.
6. **How it was paid**: cash, debit, credit, transfer and apps for the
   filtered set (the Insights mix, filtered).
7. **Recurring vs one-off**: two totals and their trend, plus the recurring
   sources active in the period.
8. **Top expenses**: the ten largest lines in the period.
9. **Drill-down list**: the filtered expenses, grouped by month, each row
   opening the expense detail. "Export CSV" exports exactly this list using
   the existing CSV writer.

Arithmetic lives in `src/lib/reports.ts` and `lib/domain/ledger/reports.dart`:
`reportFilter`, `applyFilter`, `periodBounds`, `previousPeriod`,
`totals`, `byCategory`, `overTime`, `categoryOverTime`, `byPerson`,
`byInstrument`, `recurringSplit`, `topExpenses`. Personal view uses
`shares[uid]`; household uses `amount`. Settlement-based splits
(Dark Cherry pots) are excluded from totals for non-creators as today.

Nothing is stored. Filters are remembered per device.

## Phase 1b: Sheet mode, the house account, and export

Owner's direction, November 12th 2026, after the design preview: "function
like a spreadsheet but in app form, something in between, not too
cluttered", exportable to a clean spreadsheet, and a way to track deposits
into a shared account by week or month.

- **Sheet mode** is the same ledger with the cards taken off: a Cards /
  Sheet switch at the top of the ledger on both clients. Six columns on the
  web (date, item with its category bubble, who paid and how, amount, your
  share, status), four on the phone (date, item, amount, yours) with the
  category bubble and status under the item. Tap a header to sort, tap a
  cell to edit it in place, a subtotal row per month and a total at the
  foot, period chips (week, month, quarter). Reports get a Grid / Charts
  switch; the grid is `pivot()` from the reports arithmetic.
- **House account**: a shared account members pay into. A deposit is a
  ledger line of `splitType: 'deposit'` whose `shares` are empty and whose
  `paidBy` is the depositor, so it stays encrypted, exportable and visible
  in the sheet, but never owed to anyone. The screen shows each person's
  total against the agreed ratio, then a week-by-week or month-by-month grid
  per person, and "Log a deposit" as its one action. Deposits are excluded
  from spending reports and budgets.
- **Export** writes a clean workbook: one sheet per thing the person picks
  (ledger lines, category by month, house account deposits, settlements),
  for a chosen period, headers on row one, dates as dates, money as numbers,
  names instead of ids, nothing else. `.xlsx` and `.csv`. Built from
  `exportRows()` and `pivot()` so the file and the screen never disagree.
- **Navigation**: the phone gets a bottom tab bar (Home, Ledger, Reports,
  Plan, Vault) and a single red Log button; the feature pill row goes. The
  web gets a left sidebar with the same five entries plus Settings.
- **Category bubbles**: every ledger row carries its category as a coloured
  chip (the category colour on a 10% tint), on both clients.

## Phase 2: Goals and budgets

- **Budget**: per period, per category limit, with a rollover switch per
  category and three groupings the way Monarch groups them: fixed, flexible
  and non-monthly. Household budgets live on the group; personal budgets on
  the member. Actuals come from the reports arithmetic, so "left to spend" in
  Personal view is the member's share, not the household total.
- **Goals**: a target amount, an optional date, and contributions. A
  household goal is funded by members; a personal goal by one member.
  Contributions are ledger entries of a new `splitType: 'goal'` so they stay
  itemized, encrypted and settle-able, and the goal's progress is computed,
  never stored. A goal shows projected completion from the trailing three
  months of contributions.
- Spending thresholds (mobile) and the per-person threshold (both) fold into
  budgets: a threshold becomes a budget line with alerts on.
- Storage: `group_plans/{gid}` as one encrypted payload `{budgets, goals}`
  with the group key; `users/{uid}/private/plan` for personal, with the uid
  key. Firestore rules mirror `group_vault`.

## Phase 3: Automation

- **Category rules**: "when the title contains X, use category Y", learned
  from history (the mobile `smart_defaults` already suggests) and editable as
  a list. Rules are per household, stored in the plan payload.
- **Recurring detection**: when the same title and a similar amount repeat on
  a cadence, offer to make the source recurring, one tap.
- **Budget and goal alerts**: contentless pushes through the existing
  `/api/notify-ledger-event` and reminder paths: approaching a limit, over a
  limit, goal milestone, goal off track. The bill-reminder cron is scheduled
  as part of this phase (it is written and not running).
- **Month close**: on the first of the month, a summary card (the totals
  strip for last month plus the budget result) and a nudge to settle.
- **Cross-group personal view**: the member's share across every group,
  loading the other groups' ledgers on demand.

## What is deferred, and why

- Bank linking: cost per connected account, review and privacy implications,
  and it is the one thing the owner excluded.
- Net worth and investments: nothing in the product holds balances; without
  linked accounts they would be hand-typed, and the Vault already holds the
  documents that matter.
- Multi-currency reports: the group has no currency field today (only the
  trip setup does); reports format in the device locale like the rest.

## Tier

Insights and trends are Cherry + on both clients today, so Reports mounts
behind the same gate until the owner decides otherwise. The web repo's
CLAUDE.md still says every feature is free; the code and the Flutter docs
disagree with it, and that contradiction is flagged separately.
