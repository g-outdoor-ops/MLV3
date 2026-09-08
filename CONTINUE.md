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

`main` is deployed and pushed through **`2905144`** — Phases 1-14. Phase 15 is in the tree, uncommitted:
one product record replacing item rates, inventory details and SKUs.

The order-flow rebuild described below is committed (`c331858` model + board, `e4035f0` the transitions).
The production rebuild is `4b2ed00` (Phase 1, model), `8c0bf42` (Phase 2, the calendar) and Phase 3 in
the tree — see "The production rebuild" below.

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

### The model and the board (`c331858`)

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
- `tests/stages.test.mjs` — assertions on the migration (45 in total now, see below).

The owner has seen the board and confirmed the column order is right.

### The stage transitions (`e4035f0`)

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
`npm run build`, and all five test suites — `tests/stages.test.mjs` is now 45 assertions. **Not verified in a
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

## The production rebuild

### Phase 1 — the model (`4b2ed00`, committed)

Blanks, SKUs, the two machines, `guardStepEdit` / `reconcileStep`, and the planning maths
(`blanksNeeded`, `capsNeeded`, `mouldDays`). Read that commit message; it explains the shared blank and
why capacity is never pooled. `tests/production.test.mjs` checks the model against the real catalogue.

### Phase 2 — the mixed production calendar (`8c0bf42`)

`app/components/prodplan.tsx` — **Production plan**, in the owner's Production group and on the floor's
nav, routed from `page.tsx` the way Order flow is. `data.prodDays` holds `ProdDay[]`; each day holds
`ProdStep[]`; every step carries `source: "amazon" | "wholesale"`, because both channels are made on the
same two machines and that is the whole reason the plan has to be one calendar.

- **Per-day capacity, per machine.** `dayLoad()` totals the day's mould steps against each machine (500
  per shift) and splits the bar by source, so a day reads as "500 for Amazon, 500 for a wholesale order"
  rather than "1,000 bottles". Only moulding occupies a machine. A day over either line is flagged red on
  the card and counted in the header; the two lines are never pooled. `planTotals()` reports shifts needed
  beside days scheduled — if those disagree, the month does not fit.
- **A part-recorded step still owes its balance.** 200 made of a planned 300 counts as 300 of machine
  time until it is finished, otherwise a half-done day looks free.
- **Every edit runs `guardStepEdit` first.** Its question is answered in an in-page panel — "Keep it as it
  is" / "Make the change anyway" — not a browser `confirm`, which cannot carry the sentence the guard
  writes. Nothing is written until it is answered. A test asserts the edit path cannot skip it.
- **`reconcileStep` for the owner, `recordStep` for the floor.** The floor logs its own work as it happens;
  the owner corrects what the floor never recorded, and the record then shows both names. `recordStep` is
  new in Phase 2 — Phase 1 had only the correction half, which left nothing to correct.

Also fixed on the way through: **Phase 1's model was never wired into the record.** `normalize()` filled
nothing for `blanks`, `skus` or `settings.machines`, so every one of them was `undefined` at runtime and
any screen asking for a blank or a machine got nothing. They are filled from the `DEFAULT_*` constants now.

### Where the September seed came from

`SEPTEMBER_PLAN` in `app-data.ts`. **The tracker HTML is not in this repo and I could not find it on this
machine** — what I seeded from is the tracker's per-SKU demand as Phase 1 captured and verified it in
`tests/production.test.mjs` (2,176 / 1,320 / 704 / 288 / 448). The plan reproduces every headline figure —
1,440 regular 5-gal blanks, 4,936 to mould, 6,992 screw caps, 1,024 silicone — and the tests now assert
that against the seeded array itself, so it cannot drift.

**The day-by-day layout is derived, not transcribed**: one shift per machine per working day, screw-top
necks first so the single 5-gallon mould change lands over a weekend, then assembly, pallets, and the FBA
shipment on the 23rd. If the real tracker has its own dates and milestones, point me at the file and I will
replace the layout — the quantities will not change.

Demo data adds wholesale steps on top (Palm Aqua's 500 plain 5-gallon bottles on the 8th, where the Amazon
plan already fills that line) so the over-capacity warning has a real collision to show, plus one
part-recorded step so the guard and reconcile have something true to protect. The live seed is Amazon only.

### Phase 3 — wholesale orders become production (`8ff28e0`)

The calendar can now fill itself in from the record instead of from somebody's memory. A paid order
appears in a panel at the top of Production plan with what it still needs, where it fits, and the date
it would actually finish; the owner presses **Add to the plan** and the steps land, tagged
`source: "wholesale"` and `linkedTo` the order.

- **The money gate decides, not the sales stage.** An order is offered once it is past
  `canStartProduction` and before it is made — the same gate the order flow uses. Planning work for an
  unpaid order would put it on a machine the shop has not agreed to run.
- **Stock counts first.** An order for 500 plain 5-gallon bottles with 830 on the shelf needs no machine
  time. `committed` already counts the order among the promises against that stock, so the order's own
  quantity is added back before the shelf is read — otherwise every order nets against itself and the
  shop over-produces by exactly what it had already promised.
- **Work is fitted into what each machine has left**, day by day, so adding an order can never create an
  over-capacity day. What moves instead is the finish date, and `daysLate` says plainly when the date
  the customer was already given has become a fiction. That is the number worth seeing before anyone
  rings them back.
- **It only ever offers.** Nothing is written until the owner presses the button, and an order that
  already has steps is never offered again — re-planning around work the floor has started is a
  different and far more dangerous operation than adding what was never there.

`ItemRate` gained `blankId` and `caps`, which is what lets an order line reach a machine at all; the
catalogue knew what a bottle cost but not what it was made from. Existing rows get a **one-time guess**
(`inferBlank`, from the item text) and the answer is editable on the Item rates screen — "Moulded from",
plus caps per bottle. An empty string means "not moulded here" and the guess leaves it alone. Planning
**refuses** to work from a row it cannot resolve: the line is named and the button says why, rather than
inventing something plausible.

The Phase 3 tests import `app/app-data.ts` directly rather than mirroring it — the scheduler is too
involved for a copy in the test file to prove anything about the code that ships. That needs Node 22.18+
(the `engines` field still says `>=22.13 <23`, so on 22.13–22.17 those assertions fail loudly rather
than passing quietly). Worth bumping `engines`, or moving the rest of the suites the same way.

### Phase 4 — the plan and the run are one record (`aac91b9`)

**This was a real defect and it was mine.** A mould step and the work order carrying it out were two
independent records of the same bottles: the plan stored `actualQty`, the run stored `good`, nothing
connected them, and whichever screen you typed into was the only one that knew. The production calendar
and the production run disagreed and never converged — and the warehouse link showed both, with a button
under each, so the same 24 bottles could be counted twice.

- `ProdStep.workOrderId` links a step to the run carrying it out. **While it is set, the run is the
  record** — `stepProgress()` reads the run and the step's own fields are ignored rather than kept in
  step, because two copies of a number are two numbers. Every reader goes through it: `stepLoad`,
  `dayLoad`, `planTotals`, the plan screen, `floorView`, the tablet.
- A run usually spans several days and each of those days is a step, so the run's output **fills them in
  date order** — which is how a multi-day run actually progresses. WO-121 has made 620 of 1,000 across
  the 7th and 8th: the 7th shows 500 and done, the 8th shows 120 and part-made. Scrap is *not* split;
  nobody knows which shift it happened on, so it stays reported against the run.
- **Nothing offers to type the number twice.** A step with a run shows "Open WO-121" instead of *Record
  made*; the tablet says "Counted on run WO-121 — use the run above"; and `/api/floor` refuses a
  `step.record` against a run-owned step, naming the run instead.
- **"Send to the floor"** on a planned mould step raises the run: `runSteps` gathers the days that
  continue it (stopping at a real gap — a weekend is not a gap, a fortnight is a different batch) and
  `runFromSteps` builds a work order for their total, on the right line, as a catalogue item the floor
  screens understand.
- `Machine.line` was added because machines and lines were two vocabularies for one physical thing —
  which is how a run raised against a machine could land on a line nobody was looking at.

### Phase 5 — one production calendar (`9d0fa57`)

The month grid and the day list were two screens drawing overlapping work. They are one screen now —
**Production calendar**, `app/components/prodplan.tsx`, routed from `page.tsx` for every role. The old
`ProductionCalendar` in `sales.tsx` is deleted; "Production plan" is gone from the navs.

One screen, two readings of the same calendar, on a toggle:

- **Month** — the grid, with each day's machine load drawn in the cell and over-capacity days tinted.
  It carries everything that was only ever on the old calendar (runs, maintenance, inbound deliveries,
  the dates orders are needed) *and* the plan's steps. A cell shows three chips then a count, because a
  month cell is for scanning; clicking a day opens its full card underneath, which is where the buttons
  that actually do something live.
- **Day by day** — the list, unchanged. The floor opens on this one: a tablet in a warehouse wants
  today, not a grid.

A run that is carrying out planned steps is **not** drawn separately — its steps already name it, and
drawing both is what made the two screens look like different schedules in the first place. Dragging
works for runs and for steps: a run that is already turning refuses to move, and a step the floor has
started has to answer `guardStepEdit` first. There are two write paths for a step edit now, and
`tests/production.test.mjs` checks that *each* of them asks the guard before it writes.

Sales gets the same screen read-only (it keys off `role`, as before). `calendar.move` moved from
`sales.tsx` to `prodplan.tsx`, so `tests/rendered-html.test.mjs` reads that file too now.

### Phase 6 — assembly runs, and the line (`577510f`)

**Assembly is a run now.** "Send to the floor" works on an assembly step as well as a moulding one, and
the work order it raises is marked `kind:"assembly"` and lands on an **Assembly** station rather than a
moulding line. The floor tablet shows a tab for any station that has open work, so assembly is reachable
without the owner adding a line in settings first. Palletizing and shipping still have no run — they are
recorded on the step.

That surfaced a real bug: **an assembly run was deducting PET preforms**, the same preforms the bottle
had already been blown from. A run's consumption now depends on what it is — `runConsumption()` gives
moulding the item's main material and assembly its caps (two screw caps per bottle, from the item rate)
— and both the in-app floor screen and the warehouse link go through it.

**The line.** Sales needs an answer before the customer is off the phone, and it is only worth anything
if it counts everything already promised.

- `productionQueue(data)` puts every order still to be made in the order it was taken — first in, first
  served — and schedules each behind the ones ahead of it, so every order carries the date the machines
  can actually finish it and whether that misses the date the customer was given.
- `estimateOrder(data, lines)` answers the phone: it schedules a draft at the **back** of the line and
  returns the date, what still has to be made, and the position. The order modal shows it live as the
  rep types the quantity — "Can be finished Mon, Oct 12 · 50 to make · 5 orders ahead · #6 in line" —
  and when the date asked for cannot be met it says so plainly, with the date to give instead.
- The quoted date is stored on the order as `promised`, so what was said can be compared with what
  happened rather than recalculated later against a queue that has moved on. It shows in the order
  drawer.
- **The line** panel on the production calendar shows the whole queue, with what will miss its date.

`loadAheadOf()` is what keeps the promise honest: planning an order places it where the **queue** says
it goes, holding the slots of orders ahead of it that are not on the calendar yet. Without it the panel
that plans an order quoted a different date from the line — the same disease as the plan and the run
holding two numbers, and a test now asserts the two agree for every unplanned order.

**Taking an order no longer raises work orders.** The order modal used to create `Needs scheduling` work
orders for anything short of stock, which was a third mechanism putting work on the floor with no idea
of capacity. An order joins the queue instead, gets a real date, and becomes steps on the calendar when
the money lands.

### Phase 7 — urgent orders, and editing a run (`ad39a8a`)

**Urgent.** An order can be moved to the front of the line for a customer in a bind. `order.rush` carries
who did it, when, and why — because moving one order forward moves everybody behind it back, and in
three months somebody will ask who decided.

The point of doing it in the app rather than in someone's head is that **the cost is shown before the
decision**. `rushImpact()` runs the line as it stands and as it would be, and the preview names what the
urgent customer gains, every order that goes backwards and by how much, and — separately — the ones that
would then miss a date they have already been given, because those are phone calls somebody has to make.
Nothing is written until the owner confirms.

Two rules worth keeping: urgent orders keep their own order among themselves (a second emergency does
not overtake the first), and **work already on the calendar keeps its slot** — a flag must not shuffle a
run the floor may have started. To take a shift off scheduled work the owner moves those steps by hand,
and the guard has its say. Clearing the flag puts the order back where it was taken.

**Editing and deleting a run.** The work-order drawer had three fields that committed on every keystroke
and no way to remove a run at all. It now has one editor — makes, quantity, station, start, days,
purpose — with a single save, and every change goes through `guardRunEdit`, which asks before touching a
run that has produced something or is running (and calls out cutting the quantity below what was made).
That also closes review item 9 for this screen.

`deleteRun()` removes the run but **not what it made**: its days go back to the plan carrying the units
they were credited with, by the same fill-in-date-order rule the run reported them under, with a note
saying where they came from. Those bottles physically exist; deleting the paperwork is not the same as
unmaking them. A run that produced nothing simply releases its days. The confirmation says which of the
two is about to happen.

### Phase 8 — invoices: bank transfer only, and the order behind them (`733c4f1`)

Answers to what the owner asked, and the two changes he chose.

- **Placing an order still touches nothing in QuickBooks.** It creates the order, commits stock and puts
  it in the line. Invoicing is two deliberate steps from the order drawer — *Create invoice in
  QuickBooks*, then *Email invoice / pay link*. Nothing reaches a customer without a press.
- **Bank transfer only.** Every invoice used to go out with `AllowOnlineCreditCardPayment:true`, so a
  customer could pick the ~2.9% route on a five-figure invoice. Card is off; ACH is on.
- **A processing fee on every invoice**, `settings.paymentFee`, default $25, editable under Pricing
  rules. It is a visible line the customer can read, it is added **after** the discount line (a
  QuickBooks percentage discount applies to every line above it, so a fee placed before it would be
  silently discounted), and it is stored on the document as `fee` and inside the stored `total` so what
  this app shows and what QuickBooks billed cannot drift. Quotes carry no fee — a quote is not a payment.
- **The estimate now shows on quotes and invoices**, not just orders, worded as what could be done
  rather than what has been booked.
- **An invoice raised on its own creates its order** — at `STAGE_INVOICED`, not Confirmed. It joins the
  line with a promised date and the money gate does the rest: it cannot reach a machine until a deposit
  or payment in full lands. That is "created, not finalised until it is paid" in the model that already
  existed.

### Phase 9 — the Warehouse Floor screen (`cc4205e`)

The warehouse link worked but it was a production schedule: a list of what was planned, with the same
button under everything. It is a floor-control screen now, built to the owner's render — one job pinned
at the top with a single unmistakable action, everything needed to run it on the same screen, and the
rest collapsed underneath.

**The job traveller** (`app/app-data.ts`). `WorkOrder` gained a real stage — Not started → In production
→ Ready for QC → Packaging → Ready to ship → Complete — plus paused, a hold with a reason, the operator,
start time, priority and a stamped history of who moved it and when. The office's `status` word is
written alongside it from one mapping, so sixty existing comparisons across the owner, quality and
packing screens keep working rather than being rewritten.

- `jobReadiness()` checks what the job needs against free stock and **refuses to start** one that is
  short. What the warehouse does not count — the mould, the machine — is listed as *not counted* rather
  than given a tick it has not earned.
- `jobForecast()` gives the rate this operator has actually achieved on this machine and the finish time
  that follows from it. Nothing is taken from a standard.
- `HOLD_REASONS` is the nine-reason list from the spec; `blockJob()` stops the job where it stands and
  `blockedFor()` says how long it has been down.
- `ItemRate` gained the build sheet: mould, colour, label, box, cases per pallet, pallet pattern and
  standing instructions, so "5 Gal + 2 Screw Caps" stops being the whole instruction.

**The screen** (`app/floor/page.tsx`, `app/warehouse-floor.css`). Tabs — Now, Today, Upcoming, Completed,
Blocked with a count — and station filters. The pinned job shows the photo area, the machine, operator,
start and forecast finish, labelled counts (target, made, remaining, scrap) with a progress bar, the
four-step tracker, the materials checklist, the packing spec, and exactly four actions. Beside it, the
shift overview and the live activity feed; underneath, compact next-up cards and a banner per blocked
job. The feed is built from an **allow-list of production events** — the activity log carries invoice
numbers and amounts, and a test asserts none of that reaches the tablet.

**Three new endpoint actions** — `job.stage`, `job.pause`/`job.resume`, `job.block` — all still built by
the server. A stage moves forward one step at a time: skipping quality is how untested bottles reach a
customer, so it is refused, and so is a block with no reason.

### Phase 10 — the packing bench (`9abd116`)

Packing was one button. It is its own job now, with its own owner: the person who boxes a run is often
not the person who moulded it, and "who made this" and "who packed this" are different questions.

- **`packingPlan()`** works out from the build sheet what the run should turn into — bottles to pack,
  bottles per carton, cartons expected, cases per pallet, pallets expected — and shows it *beside* the
  entry rather than filling it in. A pallet that came out a carton short is a real thing that should be
  visible, not rounded away by a number the app assumed.
- **`recordPacking()`** stores what the packer counted: bottles received, cartons finished, pallets
  finished, a note, and a batch id (generated as `B<yymmdd>-<job>` when none is given). The screen says
  plainly when the count is under the plan.
- **`packingUses()`** takes off the shelf what was *actually used* — 246 cartons, not the 248 the plan
  called for. Caps are charged here only when no assembly run already fitted them, or one bottle empties
  the shelf twice.
- **A pallet label** that prints: company, product, batch, job, bottles, cartons, pallets, per carton,
  and the note. A `@media print` block hides everything else on the page, so the tablet prints the label
  and not the screen around it.
- **`job.pack`** on the endpoint, refused before the job reaches the bench and refused for more bottles
  than the run made — that would be somebody else's stock leaving under this job.

Two defects the render caught: the due date showed **Invalid Date** for orders still holding a legacy
label rather than an ISO date (the floor view normalises it now, and the screen shows an unreadable date
as it was stored), and the batch id and note had picked up the big centred styling meant for quantities.

### Phase 11 — product photos (`7031496`)

A photo identifies a bottle across a bench far faster than a name does — "5 Gal + 2 Screw Caps" and
"5 Gal + 1 Silicone Cap" are one word apart on a screen and obvious side by side in a picture. Photos
are keyed by the **item name** the rest of the app already uses, so the inventory list, the build sheet
and the warehouse tablet all reach the same image with no second identifier to keep in step.

- **They live in the company's own Postgres**, in an `item_photos` table. Not on the web server's disk,
  which Render wipes on every deploy; and not in the company record, because every client PUTs that
  record whole on every save and a few hundred kilobytes of base64 would ride along with every changed
  order quantity. Stored base64 in TEXT so Postgres and D1 behave identically — about a third larger
  than bytes, which for a handful of photos beats maintaining two code paths.
- **Uploaded from Inventory** (owner only): a thumbnail per finished product with Add / Replace /
  Remove. The browser resizes to 1,100px and re-encodes as JPEG at 0.72 *before* sending, so a 5MB phone
  photo arrives as roughly 100KB.
- **`/api/photo`** — GET for anyone who can already see the product (a signed-in user, or the warehouse
  link's token); POST and DELETE for the owner. Only JPEG, PNG and WebP are accepted; **SVG is not**,
  because it can carry script. The URL carries the version it was saved at, so it can be cached hard and
  still change the moment a new photo is saved.
- **The tablet is sent a URL, not bytes** — the image is fetched and cached by the browser like any
  other, and appears on the pinned job, the next-up cards and the build sheet, with the drawn bottle as
  the fallback until a photo exists.

Also: the floor's empty state used to say only "Nothing to do at this station right now". It now says
*why* — no jobs released at all, nothing at this station, or nothing in this tab — because those are
three different problems with three different fixes.

### Phase 12 — three things reported from use (`07a525e`)

**"The site randomly refreshes back to dashboard."** A save that lost a version race reloaded the whole
page, which threw the person back to their home screen. That was tolerable when the only writers were
two people in an office; it stopped being tolerable the moment the warehouse tablet started writing on
every recorded bottle, which made a stale version an ordinary event. The **record** is reloaded now, not
the page: the screen catches up, the person stays where they were, and they are told their last change
was not kept rather than having it silently applied over newer data. A tab also catches up when it is
looked at again after being left open — but never while a modal or drawer is open, which would move the
ground under somebody mid-edit.

**"One photo keeps disappearing."** `writePhoto` was a DELETE followed by an INSERT — two commits, and
if the second failed the first had already thrown the old photo away. It is one `ON CONFLICT` statement
now, so replacing a photo can never leave the product with none. The panel also re-reads the list from
the store after every change instead of trusting what it hoped it saved, and it now names any photo
filed under an item name **no product has any more** — a renamed product is the likeliest reason a photo
looks lost when it is really still there under the old name.

**"The edit button can't change what item is manufactured."** The step editor could change quantity, day,
source and note but not the product — so a step raised against the wrong thing had to be deleted and
typed again, even though `guardStepEdit` has always had a branch for exactly that change. It has a
*Makes* field now. Moulding is chosen from blanks and everything after it from products, and each blank
is labelled with what it becomes ("Regular 5-gal — for 5-Gallon Bottle · no cap") because nobody orders
a blank by name.

### Phase 13 — how a product ships, and the catalogue behind the plan (`e1928b1`)

**How it ships.** The item rate form now asks whether a product goes out loose, boxed, or boxed on
pallets, and only asks for boxes per pallet and the pallet pattern when the answer is pallets. Box size
and the label stock are editable there too — they were added for the build sheet in Phase 9 and had no
form. `packingPlan` reads it, so a product that never goes on a pallet stops asking the packing bench
for a pallet count.

**The catalogue the plan schedules against had no screen at all.** Blanks and SKUs arrived with the
production model in Phase 1 and were filled in from the app's own `DEFAULT_*` constants, so the calendar
has been scheduling "Screw-top 5-gal" and "5 Gal + 2 Screw Caps" — products the owner could not see in
inventory, could not edit, and had never entered. That is now a **Moulds & products** editor on the Item
rates screen: blanks (name, size, neck, sold plain) and products (code, name, channel, blank, caps),
with how many plan steps reference each one.

Two guards on it: nothing the plan is using can be removed, and a code cannot be changed once it is
referenced — the calendar would lose track of what it is making. Edits are held locally and saved in one
go, because this feeds pricing and planning and a commit per keystroke would put half-typed names
through the audit log.

`blanks` and `skus` are also **owner-only on the server** now, alongside settings, roles and item rates.
They are catalogue: a floor tablet had no business being able to rewrite them.

### Phase 14 — the inventory side, joined up (`2905144`)

Four things from setting up real item rates.

- **A material could not be typed.** "Main material" was a dropdown of raw inventory rows, so a company
  with none entered had an empty list and no way to name what a product is made from. It is a field with
  suggestions now, and a material named there that the warehouse is not counting yet **becomes a raw
  stock line**, so the floor's readiness check has something to check against instead of reporting it
  untracked forever.
- **Packing is two questions, because the answers come apart.** *How it is packed* — boxed, not boxed,
  straight onto a pallet — and *how it is shipped* — in boxes with no pallet, boxes on a pallet, or on a
  pallet with no boxes. The per-pallet figure is asked for only when something goes on a pallet, and it
  is labelled for what is actually being counted: boxes on a boxed pallet, bottles on a bare one. The
  packing bench follows: a pallet with no boxes counts bottles and asks for no cartons at all.
- **Moulds & products no longer hides itself.** It is where the products the plan schedules against
  live, and hiding them is how they went unnoticed for four phases.
- **The five things are connected now, and say so.** A product (Amazon listing) gained `itemId` — the
  item rate it is priced, stocked, photographed and packed as — because without it a run raised for an
  Amazon product had no item rate to read a material, a box size or a photo from, and the floor got a
  name and nothing else. The panel states the shape in three lines:

  > **Blank** — what a machine moulds; decides which line the run goes on.
  > **Item rate** — the product as priced, stocked, packed and photographed. One stock line, one photo.
  > **Product** — an Amazon listing, pointing at its blank and at the item rate it is sold as.

  Photos hang off the item rate's *name*, which is also the inventory row's name, so one picture serves
  the inventory list, the build sheet and the tablet.

### Phase 15 — one product (in the tree, uncommitted)

A product was three records on three screens — an item rate for its price and how it is made, an
inventory row for how many there are, a SKU for the Amazon listing — joined by the item's name and
edited separately. So they drifted: a price with no stock line, a listing with no price, a photo filed
under a name nothing matched.

**`Product` is the whole thing as one record**, and `app/components/products.tsx` is the one screen:
what it is, what it costs, what it sells for, which mould it comes from and what it is made of, how it
is packed and shipped, how many are on the shelf, its listing code, and its photo — one form, one save.
"Item rates" is gone from the nav; **Products** replaces it, and the moulds table sits underneath the
products that reference it.

**It is a view, not a fourth table.** `products(data)` joins by name; `saveProduct()` is the only writer
and updates the item rate, the stock line and the listing together, so they cannot come apart again.
That is deliberate: every money path in the app — invoice totals, COGS, the P&L, order pricing — reads
`itemRates` and `inventory` directly, across about seventy call sites, and moving them to reorganise a
catalogue would put invoicing at risk to tidy a screen. What changed is that there is now one shape to
read and exactly one function that writes it.

- **Renaming** carries the stock line, the listing and the photo. It deliberately does not rewrite
  history — an invoice line records what was sold under the name it was sold under — and the form says
  so, naming how many records keep the old name.
- **Deleting** refuses while orders, runs, documents or plan steps still refer to it.
- **A material named on a product becomes a countable stock line**, so the floor's readiness check has
  something to check against.
- **"We buy this in"** is now a real answer rather than an absence. An empty mould saved as `""` settles
  the question; `undefined` means nobody has said, and only that shows as *Mould not set*. Bought-in
  goods like cap packs were being flagged as unmakeable forever.

### Still open on products

- **Storage is still three arrays.** One writer keeps them in step and one view reads them, but a
  direct edit elsewhere could still write only one. Nothing in the app does — the old editors are gone —
  but the shape allows it.
- **Only products have photos.** Blanks and moulds do not, which is fine while every product names one.

### Still open on the floor screen

- **A problem report still cannot carry a photo.** The store now exists; hanging one off a `hold` is
  the small remaining piece.
- **Quality is still signed off in the office**, because passing it is what puts bottles into stock. The
  floor is told where the job is rather than asked to sign it.
- **No kiosk mode and no offline queue.** A dropped connection loses the entry rather than holding it.
- **Clocked-in time is the tablet's own**, kept in the browser, not a real clock-in record.

### Still open

- **A quote does not mention the fee**, so a quoted total and the invoice that follows differ by $25.
  Worth a line of small print on the quote before a customer notices it first.
- **The fee is charged even when payment never goes through QuickBooks** (a cheque, cash on pickup). It
  is one number in settings and can be zeroed per company, but not per invoice.
- **Palletizing and shipping steps have no run**, so they keep their own record. Correct today — no work
  order models them — but "who recorded this" still comes from two places depending on the step type.
- **Only the owner can mark an order urgent.** A rep on the phone has to ask, which is probably right —
  it re-promises other customers — but it has not been agreed.
- **A rush does not re-promise anybody automatically.** The line shows who now misses their date; nobody
  is emailed and no `promised` date is rewritten. That is deliberate, and it means the calls are a
  manual job somebody has to actually do.
- **`estimateOrder` re-plans the whole queue on every keystroke** in the order modal. Fine at this size;
  it would want memoising long before the order book reaches a few hundred.
- The month cell caps at three chips. On a heavy day that hides real work behind "+2 more"; the day card
  below shows everything, but somebody scanning the grid for a clash could miss one.

### The warehouse link (`ceab059`)

A no-login URL for the shop tablet: `/floor?t=<token>`. It shows the production schedule, records what
was made against each step, and updates the run in front of the operator. The owner creates and replaces
it from **Settings & access** (the card the `warehouse-link.css` in this repo was written for years ago
and never wired up).

The token is a bearer credential and it will leak eventually — a photographed screen, a forwarded
message, a phone that walks out of the building. Both halves of the design follow from assuming that:

- **It reads a hand-built subset, never the company record.** `floorView` in `app/server/floor.ts` is an
  allow-list: the schedule, open runs, and — for orders the floor is actually being asked to make — the
  customer's *name*, the quantity, the date needed and the note sales left. No contact details, no
  addresses, no prices, no costs, no invoices, no balances, no settings, no QuickBooks. A field added to
  `AppData` later cannot leak by simply existing, and `tests/warehouse-link.test.mjs` asserts that.
- **It never accepts a company record.** `/api/floor` has no PUT. Its whole vocabulary is three verbs —
  record a step, add to a run's counts, change a run's status — and the server builds every patch
  itself. A leaked link cannot reprice the catalogue or delete a customer because there is no way to ask.
  The floor also cannot mark its own work Done: finishing hands the run to quality, as in the app.

Numbers arriving from a page anyone can rewrite are cleaned, not trusted: a run can never report more
than it was for, negatives are refused, and the name the tablet gives is a self-declared label that is
stripped and recorded as `Warehouse link · <name>` so the audit log never implies somebody signed in.
Writes read-then-write against the stored version and retry once, which is correct here in a way it is
not for the main app — the patch is small, so re-applying it to fresher data is exactly right.

`tokenMatches` refuses a stored token under 8 characters and never authenticates an unset one: a company
that has not made a link must not be one where the empty string is the password. `newFloorToken` drops
the characters that get misread off a screen, because somebody will type it into a tablet by hand.

`tsconfig.json` gained `allowImportingTsExtensions`, and `app/server/floor.ts` imports `../app-data.ts`
with its extension, so the tests can load the module Node's own way and check it as it ships.

**Not exercised against a live server.** The pure functions are covered; `/api/floor` itself needs a
database, so the route — token check, retry, audit line — has not been run end to end. Worth doing once
on Render before the tablet is handed over.

### Still open on Phase 3

- **No re-planning.** Change an order's quantity after it is planned and the steps do not follow. The
  guard exists for exactly this shape of problem, so the pieces are there, but the operation has to
  leave started steps alone and nothing does that yet.
- **Cancelling an order leaves its steps on the plan.** Same reason.
- **The one-time blank guess has not been checked against the live catalogue.** It is right for all five
  demo rows; the real one may have items it cannot read, and those will show up as "no blank set" on the
  first order that needs them, which is the intended failure but worth a pass through Item rates first.

### Still open on Phase 2

- **Assembly and palletizing have no capacity model**, so those steps are placed but never checked. Only
  moulding is constrained. If the bench is the real bottleneck on a heavy month, that needs modelling.
- **A month over capacity has no fix-it action** — the calendar names the problem and leaves the moving to
  a person. That is deliberate for now; an auto-reflow that moves a customer's date is not something to
  build before the owner asks for it.

---

## Conventions that matter here

- **Verify money and capacity maths with a test, not by eye.** `tests/money.test.mjs`,
  `tests/payments.test.mjs`, `tests/stages.test.mjs`, `tests/authz.test.mjs`, `tests/production.test.mjs`.
  Run with `node tests/<name>.test.mjs`. 448 assertions.
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
