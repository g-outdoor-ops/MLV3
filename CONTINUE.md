# MakeLogic (MLV3) — where the work is up to

Drop this at the repo root and point Claude Code at it. Written Sept 5, 2026.

---

## What this app is

Manufacturing operations for EcoForm Bottles: a small Miami shop that imports components and blow-moulds
5-gallon and 3-gallon water bottles. Three people use it — the owner (Chris), a sales person, and one
floor employee. It replaced an Airtable + Slack setup.

It is live on Render, connected to **production QuickBooks** with real company data. Treat every change
to invoicing or payments as touching real money.

---

## The state of play

`main` is deployed. Last pushed commit: **`6626930`**.

There is **uncommitted work in the tree** for the order-flow rebuild — see "The job in progress" below.

### Shipped today (all on `main`)

| Commit | What |
|---|---|
| `06aa2e9` | QuickBooks import — customers, invoices, full history |
| `a7897e9` | Import result panel (a blind reload was hiding every outcome) |
| `a1f9c8f` | Imported invoice totals were fabricated; full line detail; duplicate-for-reorder |
| `a06bf54` | Optimistic concurrency — concurrent saves silently overwrote each other |
| `66096d1` | Server-side role enforcement — the permissions map was never consulted |
| `cee3d55` | Money: payments sent the total, double-clicks charged twice, discount reduced shipping |
| `6626930` | Locally created documents lost their lines and mis-stated the total |

Read those commit messages. They explain **why**, not just what, and several encode decisions that should
not be casually reversed.

---

## The job in progress: restoring the order flow

### The problem being solved

This app replaced an Airtable board plus a Slack channel. The thing that mattered — everyone seeing where
every order stood — was lost. The root cause turned out to be structural:

```
OLD (wrong):  Placed → In production → Quality check → Ready → Shipped → Invoiced → Paid
```

Make first, bill last. The shop runs the opposite way: **nothing goes on a machine until a deposit or full
payment lands.** Every board, badge and gate read the old order, which is why the flow never came back.

```
NEW:  New → Quoted → Invoiced → Paid → In production → Ready to pack → Shipped → Done
        0       1         2        3          4              5            6        7
```

Confirmed with the owner:
- Production waits for **a deposit or payment in full** (not always payment in full).
- Quotes run **Quote → approved → invoice → paid**.
- **Everyone sees every step** — one shared board, not role-filtered.

### Done and in the tree (uncommitted)

- `app/app-data.ts` — new `STAGES`, plus `STAGE_NEW … STAGE_DONE` constants, `STAGE_OWNER` (whose move it
  is), `STAGE_NOTE`, and `canStartProduction(order)` which gates on deposit or paid.
- `app/app-data.ts` — `migrateStage()`, run from `normalize()`, converting old stage numbers. Guarded by a
  `stageV2` flag so it runs once (the guard did not actually persist — fixed, see below).
- `app/components/orderflow.tsx` — the **Order flow** board. Seven columns, whose-move-is-it labels, and
  three counters: waiting on money / paid and ready for the floor / past the date needed.
- Nav + routing wired for all three roles (`sales.tsx`, `floor.tsx`, `owner.tsx`, `page.tsx`).
- `app/globals.css` — `.flow-*` styles.
- Date helpers `dueIso`, `dueDays`, `fmtDue` in `app-data.ts`; documents now store **ISO** dates; render
  sites format at display time; `invStatus` in `owner.tsx` uses `dueDays`.
- `tests/stages.test.mjs` — assertions on the migration (now 44 in total, see below).

The owner has seen the board and confirmed the column order is right.

### Done and in the tree (uncommitted) — the stage transitions

Every hardcoded stage number is gone from the components; `tests/stages.test.mjs` now fails the build if one
comes back. The four moves are wired, each writing a single notice pointed at **Order flow**, the one board
all three roles can open:

1. **Paid → In production** — "Release to the floor" in the order drawer, disabled unless
   `canStartProduction(order)`, with a second runtime check behind it. The floor's own "Start run" advances
   an order only if it is already past the money gate, so a run cannot quietly pull an unpaid order forward.
2. **In production → Ready to pack** — quality passing the work order (that is where the run becomes Done
   and where the packing queue has always taken its cue), plus a manual "Mark ready to pack" for orders
   filled from stock with no run. Finishing a run no longer moves the order: it stays in production until
   quality clears it.
3. **Ready to pack → Shipped** — "Mark shipped" in the drawer and "Mark shipped & notify team" on the floor.
   Both deduct stock, and the notice now carries the balance instead of "ready to invoice" (billing happens
   before the goods are made now).
4. **Shipped → Done** — "Mark done", showing any balance still outstanding on the button, in the drawer body
   and in the notice. **Shown, not blocked** — as intended; ask the owner before changing that.

Also fixed while in there, because the transitions could not be trusted without it:

- **`migrateStage` ran on every load.** `normalize()` did `{...o,stage:migrateStage(o)}` — the spread copied
  `stageV2` *before* `migrateStage` set it, so the guard never persisted and every reload re-migrated live
  orders, dragging them backwards a second time. `normalize()` now writes `stageV2:true` onto the new object.
- **Money never moves an order backwards.** Recording a payment used to set `stage:6`; on the new list that
  pulled a shipped order back to Paid. Payment now takes `Math.max(current, STAGE_PAID)` everywhere it is
  recorded — invoice drawer, order drawer, QuickBooks sync.
- **Deposits were unwired.** Nothing ever set `order.deposit`, so `canStartProduction` could only ever be
  satisfied by payment in full and a deposit order could never reach the floor. A part payment on an invoice
  now records the deposit on the order and moves it to Paid ("Paid or deposit received" — the column already
  said so), which is what opens the gate.
- **One payment path.** The order drawer's "Record payment" opened a full-total, no-busy-state shortcut that
  bypassed everything commit `cee3d55` fixed. It now opens the invoice, where the amount, the method, the
  double-click guard and the server's applied balance all live. That also removed one `window.prompt` (item 10).
- Dashboards read stage numbers too: sales and owner KPIs were counting the old positions (owner's "Ready to
  ship" was counting stage 3, which is now *Paid*). Both now read `STAGE_*`, and the owner's orders panel
  shows New/quoted · **Paid, not yet released** · In production · Ready to pack.
- Demo orders now sit in the new stages directly rather than relying on the migration to place them.

Verified by `npm run lint`, `npx tsc --noEmit -p .` (same four pre-existing `cloudflare:workers` errors),
`npm run build`, and all five test suites — `tests/stages.test.mjs` is now 44 assertions. **Not verified in a
running app**: bringing it up locally needs an account to be created, so the flow has not been clicked through.

### Still open

- **Notice volume.** Every transition writes a notice, as agreed. At a few orders a day that is fine; at
  twenty it becomes the Slack channel again. The suggested compromise — every step **plus** a flag on stuck
  orders (waiting on money, late, paid-but-unreleased) — is still not agreed with the owner. The Order flow
  board already computes those three counters, so the flag half is largely built.
- **Outstanding balance at shipping** is shown, not blocking. Confirm with the owner before changing.
- Old **`status` strings** ("Quality check", "Ready", "Placed") still appear on legacy records. Nothing reads
  them any more — `stageOf` prefers `stage`, and every transition rewrites `status` from `STAGES` — but a
  one-off pass to restate them would tidy the CRM and packing screens.

---

## Conventions that matter here

- **Verify money maths with a test, not by eye.** `tests/money.test.mjs`, `tests/payments.test.mjs`,
  `tests/stages.test.mjs`, `tests/authz.test.mjs`. Run with `node tests/<name>.test.mjs`. 55 assertions.
- **Never recompute a total QuickBooks already gave you.** Three separate bugs came from exactly this.
  `documentTotal` trusts a stored `total` first, then real `lines`, and only then the legacy single-item
  formula. Imported and locally created documents both persist `lines` + `total`.
- **A guard that blocks real work is worse than no guard.** `tests/authz.test.mjs` deliberately asserts both
  directions — that sales can still take an order, *and* that it cannot reprice the catalogue.
- Whole-blob state: every client PUTs the entire company record. Saves carry a `version`; the server rejects
  a stale write with 409 and the client reloads. This is a seatbelt, not a cure.
- `npm run lint`, `npx tsc --noEmit -p .`, `npm run build` all pass. Four pre-existing typecheck errors about
  `cloudflare:workers` / `Fetcher` / `D1Database` are unrelated to app code — ignore them.

---

## Known-open items from the Sept 5 site review

Fix-first list, agreed order. Items 1–4 are **done**.

5. **Off the Render free tier + nightly `pg_dump`.** NOT DONE. Free Postgres is deleted after 30 days.
   Everything above lives in that database. This is dashboard work only the owner can do, and it is the only
   item with a real deadline. It has been raised repeatedly.
6. ISO dates — mostly done in the uncommitted work; `normalize()` migration for legacy `due` strings is not
   written yet.
7. Pickup / card-paid orders should release stock; order cancel.
8. Phone nav for sales (sidebar is `display:none` under 760px with no replacement).
9. Stop per-keystroke commits (settings, work-order fields, QC note).
10. Replace remaining `window.prompt` flows.

Other findings worth knowing: P&L is labelled "month" but computes all-time; COGS matches by `startsWith` on
an item string; production-lines setting cannot be edited; maintenance "Due" is never computed; "Email quote"
sends nothing.

---

## Unanswered strategic question

**Is MakeLogic a product to sell, or this shop's internal tool?** The review's Phase 1–3 (multi-tenancy, RLS,
tenant provisioning, white-label design tokens) is months of work and the wrong investment if it only ever
runs EcoForm. Get an answer before building any of it.

There is also a second app, `~/Projects/makelogic` (Node + Express + SQLite), which has two things MLV3 lacks:
**landed-cost allocation** (container freight and duty spread to SKU — priority one in the owner's own
research) and a **two-queue shop-floor screen**. It is otherwise superseded. Worth porting those two, not
maintaining both.
