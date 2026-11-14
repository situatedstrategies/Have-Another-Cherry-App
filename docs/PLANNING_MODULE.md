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

Owner decision, November 13th 2026: the whole Plan tab (budgets, goals and
rollover) is Cherry +. Free members see the locked panel on the tab; the
budget hint on the Log form ("Groceries budget: ... left this month after
this") is hidden for them.

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

## Cherry + gating of whole tabs (owner, November 13th 2026)

- Reports, Plan and Checkbook are Cherry + tabs. For a free member, selecting
  the tab opens the paywall (web: `CherryPlusModal`; mobile: the paywall
  screen) straight away, with the tab's own name and one-line pitch at the top.
  Closing the paywall returns to the previous tab; the locked panel is the
  fallback behind it, not the first thing seen.
- The Balance mark (Log form, Settle) and the budget hint on the Log form are
  hidden for free members rather than shown locked.
- RevenueCat must be updated to match, by the owner in the dashboard, before
  this ships: the paywall's feature list and the offering description for
  `have_another_cherry` gain Plan (budgets and goals) and Checkbook; the App
  Store and Google Play in-app purchase descriptions say the same; prices
  stay where they are and never appear in code. The web paywall reads its
  feature list from `CherryPlusModal`, so that list changes in the same
  commit as the gate.

## What is deferred, and why

- Bank linking: cost per connected account, review and privacy implications,
  and it is the one thing the owner excluded.
- Net worth and investments: nothing in the product holds balances; without
  linked accounts they would be hand-typed, and the Vault already holds the
  documents that matter.
- Multi-currency reports: the group has no currency field today (only the
  trip setup does); reports format in the device locale like the rest.

## Tier

Reports, Plan and (on mobile) the Checkbook are Cherry + tabs; see "Cherry +
gating of whole tabs" above. The web repo's CLAUDE.md, the Flutter docs and the
code agree since November 13th 2026.

## Phase 4: Checkbook (approved by the owner, November 13th 2026; Cherry +)

Mobile only (owner, November 13th 2026). The Checkbook ships in the iOS and
Android apps and does not exist on the web: no tab, no route, no Balance mark on
the web Log form or Settle, and the web export never carries a Checkbook sheet.
The web paywall copy does not mention it.

A private register per bank account, for the person who keeps a paper checkbook
and does the arithmetic by hand. Nothing in it is shared with the group. The
whole feature sits behind Cherry + (`hasPlus`): the Checkbook tab shows the
locked panel for free members, and the Balance mark on the Log form and on
Settle is hidden for them, so nothing can post to a checkbook they cannot open.

- Accounts: up to 3 checking and 2 savings per user, each with a name, a
  starting balance and the date it was taken. `checkbooks/{uid}/accounts/{id}`.
  The house account (Phase 1b) can be linked as a destination for transfers.
- Entries: `checkbooks/{uid}/entries/{id}` with `accountId`, `date`, `title`,
  `category`, `amount` (signed: money out negative, money in positive),
  `cleared` (bool), `source` (`{kind: 'expense'|'settlement'|'deposit'|'bill'|
'manual', id}`) and `createdAt`. Balance = starting + sum(amount) in date
  order; the running balance on each row is derived, never stored.
- Posting rule (hard): nothing posts on its own. An expense, settlement, house
  deposit or scheduled bill reaches the register only when the user ticks the
  mark called "Balance" (a checkbox on the Log form, on each bill row and on
  Settle). The amount posted for a shared expense is the user's share, not the
  total. Removing the source entry asks before deleting the register row.
- Disclaimer (owner, November 13th 2026): the checkbook never connects to a
  bank. The first open shows a notice, repeated in Settings, that only what
  the user marks Balance lands in it and that keeping it straight is the
  user's own responsibility. The wording stays plain and never discourages;
  the point is that the person watches their own spending.
- Bills: `checkbooks/{uid}/bills/{id}` with `title`, `amount`, `dueDay`,
  `accountId`, `recurring`. They show under "Bills to take out" with the
  recurring mark and count toward "After bills" (balance minus unposted bills
  due before the next deposit) but never post until added.
- Clearing: a tick per row. "Cleared" balance = starting + cleared entries.
  Reconcile = enter the statement balance; the app lists uncleared rows and
  the difference, the same arithmetic as the back of a paper register.
- Card payments and transfers are plain entries with a `kind` of `card_payment`
  or `transfer` (a transfer to a linked account writes both sides).
- Reports that this unlocks: cash flow (money in vs out by month), balance
  over time per account, bills calendar, "safe to spend" (balance minus bills
  before the next deposit).
- Privacy: checkbook data lives under the user's own document, encrypted like
  the ledger, and is never read by group reports or exports unless the user
  includes the "Checkbook" sheet in their own export.
- Navigation (open decision for the owner): the bottom tab bar has five slots.
  The canvas shows Checkbook taking the fifth slot and the Vault moving to
  Home and Settings. The alternative is Checkbook under Plan.

## Review fixes (November 14th 2026)

Rules both clients follow after the review of the first three phases. Where
this section and an earlier one disagree, this one holds.

- **Savings lines.** A deposit is stored with the category `House account`, a
  goal contribution with `Goal`; neither is ever added to the group's own
  category list, and screens show the translated label. A contribution to a
  personal goal is titled `Goal`, not the goal's name. Neither kind counts as
  spending in any statistic, in or out of Reports, and neither can be owed.
- **Editing.** Editing a deposit or a contribution opens the short form and
  saves the same shape as a new one. The form's mode never outlives the form.
- **Plan writes.** A client writes a plan only after it has read the stored
  one (a document that decrypted, or the server's word that there is none),
  and applies its change to the stored plan as it stands at the write. A plan
  that cannot be read is never written over. The rules accept only the
  envelope (`groupId` or `uid`, `payload`, `updatedAt`, `updatedBy`) and
  refuse a delete of the household plan. Cherry + is not checked in the
  rules, because a member who has just paid is unlocked by the store before
  `users/{uid}.isPlus` is written.
- **Start months.** A budget whose `startMonth` is not `YYYY-MM` carries
  nothing. A budget is given the current month when it is new or when its
  rollover is switched on.
- **House account.** The agreed part is the member's split over the sum of
  the listed members' splits (equal parts when there is no split).
- **Alerts.** A budget is "over" by its own flag as well as its ratio, so a
  rollover budget in deficit counts. Alerts fire on edits as well as new
  lines. A threshold budget posts the id `threshold`, never its category.
  `goal_off_track` is raised when a Cherry + member opens the app and a goal
  that was on track no longer is; the server requires Cherry + for all four.
- **Dates.** A settlement with no payment date is dated by the local day of
  its timestamp. All date stepping is by calendar day, never by 24 hours.
- **Export.** A CSV cell that would run as a formula gets a leading
  apostrophe.
- **Sheet.** Another member's Dark Cherry amount is left out of every total
  and of the ordering. The in-place amount edit obeys the form's limits and
  keeps the shares summing to the amount.
- **Per-group state.** Month close seen, recurring dismissals and report
  filters are kept per group (and per account on the web).
- **Month close push.** Sent on the 1st, and on the 2nd and 3rd to any
  household the first run missed.
