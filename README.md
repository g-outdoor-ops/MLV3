# MakeLogic v3 — EcoForm

Orders, production, quality, inventory and money for EcoForm Bottles, simple enough for anyone on the team.

## Who sees what

- **Sales** (`/#sales`) — four big buttons: New Order, Check Stock, Customers, Make a Quote. Orders are a five-step guided flow (Who → What → When → Shipping & price → Check) with shipping method, discount, a note for the warehouse and a note for the invoice. Each order has a status pipeline (Placed → In production → Quality check → Ready → Shipped → Invoiced → Paid) and, once shipped, one button to create the invoice in QuickBooks and send a payment link.
- **Owner** (`/#owner/today`) — Today (what needs you, sorted by urgency), Orders (board by stage), Work orders, Schedule (week grid per line), Inventory (finished goods and raw materials with reorder points), Quality (pass/fail checklist per run → release to stock, hold, or scrap), Money (invoices, payments, quotes), Settings (prices and floors, shipping rates, QuickBooks, people, starter data).
- **Floor** (`/#warehouse`, tablet) — the production screen: +24 good (one rack), +1 scrap, add any amount by racks or bottles, pause / problem, undo, quality note, finish run → quality checks. Pack orders tab: mark packed, mark shipped. Second line at `/#warehouse/line/Line%202`.

Everything each role does updates the others: placing an order that exceeds free stock creates a work order for the owner's schedule; finishing a run on the floor puts it in Quality; passing quality moves stock and the order to Ready; shipping from the floor unlocks the invoice for sales.

## Code layout

- `app/app-data.ts` — the company data model, EcoForm starter data, `normalize()` (fills defaults so data saved by the earlier UI still loads), money/stock helpers.
- `app/page.tsx` — shell: hash routing, load/save through `/api/state`, header, notifications, toasts.
- `app/components/ui.tsx` — icons, pills, notes, the store context.
- `app/components/sales.tsx` — Home, order/quote wizard, order detail (shared with the owner), stock check, customers.
- `app/components/owner.tsx` — the owner tabs.
- `app/components/floor.tsx` — the floor tablet.
- `app/works.css` — the whole design system (warm off-white, forest green, Archivo, 18px minimum text, 44px+ targets).
- `app/api/state/route.ts` — one JSON document + audit log in Postgres (Render) or D1 (Cloudflare).

Existing deployments keep their saved data. To switch a database still holding the old Pure Alkaline test records to the EcoForm starter data, use **Owner → Settings → Load EcoForm starter data**.

---

## Starter notes (vinext)

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

## Deploy on Render

This repository includes a Render Blueprint that creates both the MakeLogic web service and its PostgreSQL database.

1. In Render, choose **New → Blueprint**.
2. Connect the GitHub repository `g-outdoor-ops/MLV3`.
3. Keep the detected `render.yaml` settings and choose **Apply**.
4. Wait for the database and `makelogic-v3` web service to finish deploying.
5. Open the `onrender.com` URL shown by Render.

The first request automatically creates the required database tables and loads the starter company records. Future pushes to the `main` branch deploy automatically. For a production company account, upgrade the database from the free testing plan before entering important business data.

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
