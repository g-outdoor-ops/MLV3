# MakeLogic v3

Customers, quotes, orders, production, warehouse, inventory, quality, purchasing and money for EcoForm Bottles — one shared company record, three workspaces, real sign-ins, QuickBooks Online.

## Going live

1. **Deploy** (Render Blueprint, see below). The first visit shows *Create the owner account* — that becomes the Owner sign-in.
2. **Add people** under Owner → Settings & access → People & sign-ins: each person gets an email, a temporary password and a workspace (Sales, Warehouse, Owner). They change their password under My account. The warehouse tablet signs in once as the warehouse account and stays signed in for 30 days.
3. **Products, prices, materials**: Item rates (list price, floor, minimum, discount limit, unit cost, main material) and Inventory (add items, record counts).
4. **QuickBooks Online** (owner, once):
   - Create an app at developer.intuit.com → *QuickBooks Online Accounting* scope.
   - Redirect URI: `https://<your-app>.onrender.com/api/qbo/callback`.
   - In Render → Environment, set `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI` (the URI above) and `QBO_ENV=production` (use `sandbox` with a sandbox company while testing). Redeploy.
   - Settings & access → **Connect to QuickBooks** → approve in Intuit. From then on every invoice created here is created in QuickBooks (same number, items, discount, shipping), *Email invoice* sends QuickBooks' own email with a Pay Now link, *Record payment* posts the payment against the QuickBooks invoice, and *Sync now* pulls balances back so payments made in QuickBooks mark orders paid here.
5. Databases that still hold sample records show a banner; **Remove sample records** (keeps products, zeroes stock) or **Clear all company data** live in Settings & access. Starter data is otherwise empty.

## What each workspace does

- **Sales** — dashboard, leads, customers (add, CSV import, agreed prices), quotes and invoices, **New order** with multiple items, a shipping choice from the rate table *or a typed freight amount for this shipment* (LTL quotes), discount (over the limit or under the floor → owner approval), warehouse note and invoice note. Order pipeline Placed → In production → Quality check → Ready → Shipped → Invoiced → Paid; once shipped: Create invoice, Email invoice / pay link, Record payment.
- **Owner** — control center with live decisions and metrics; work orders, production calendar (drag to move), quality checklist per run, maintenance, inventory (on hand / promised / free, movements), purchasing (POs, receive with landed cost), item rates, P&L, reports, settings (people, pricing rules, shipping rates, lines, QuickBooks, backup, data reset).
- **Warehouse** — the running work order for the chosen line: +1 rack, +1 scrap, add any amount, pause, undo, quality note, finish → quality checks. Pack orders: mark packed, mark shipped.

## Code layout

- `app/app-data.ts` — data model, `normalize()` (keeps older saved records loading), money/stock helpers.
- `app/page.tsx` — shell: sign-in gate, navigation, load/save through `/api/state`, drawers and modals.
- `app/components/` — `auth.tsx` (sign-in / setup, API helpers), `store.tsx`, `sales.tsx`, `owner.tsx`, `floor.tsx`, `modals.tsx`, `drawers.tsx`.
- `app/server/db.ts` — Postgres (Render) or D1 (Cloudflare): `app_state`, `audit_events`, `users`, `sessions`, `qbo_tokens`.
- `app/server/auth.ts` — PBKDF2 password hashing, server-side sessions, HttpOnly cookie.
- `app/server/qbo.ts` — QuickBooks OAuth 2.0, token refresh, customer / item / invoice / payment / send / balance calls.
- `app/api/` — `auth`, `state`, `qbo/connect`, `qbo/callback`, `qbo/action`, `health`.

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
