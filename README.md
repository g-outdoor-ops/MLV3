# MakeLogic v3

Customers, quotes, orders, production, warehouse, inventory, quality, purchasing and money for EcoForm Bottles — one shared company record, three workspaces.

## What is wired up

- **Sales Rep** — dashboard with live KPIs and search; leads and customers (add, CSV import, edit, agreed prices per customer); quotes and invoices; **New order** with multiple items, a shipping choice from the rate table, discount (over the limit or under the floor → owner approval), a warehouse note and an invoice note. Each order shows a Placed → In production → Quality check → Ready → Shipped → Invoiced → Paid pipeline; once shipped, **Create invoice** and **Record payment** are one click. Quotes convert to orders; the production calendar shows work orders, due dates, deliveries and maintenance.
- **Owner** — control center with live decisions (approvals, unscheduled work orders, quality holds, materials to order, overdue invoices, maintenance due), today's floor, live metrics and cash strip. Work orders (line, date, quantity, release, start, finish), production calendar (drag to move), quality (per-run checklist → pass to stock / scrap and re-run), maintenance (schedule, complete with downtime), inventory (finished goods with on-hand / promised / free; raw materials with reorder points; record movements; add items), purchasing (suggestions → PO → receive with landed cost rolled into unit cost), item rates (list, floor, minimum, discount limit, cost, material), P&L (COGS from item costs, margin by product), reports and CSV exports, settings (pricing rules, shipping rates, lines, QuickBooks, roles, warehouse link, backup, starter data).
- **Warehouse** (`/?floor=<key>#warehouse`) — the running work order for the chosen line: +1 rack, +1 scrap, add any amount by racks or bottles, pause / problem, undo, quality note, finish → quality checks. Pack orders: mark packed, mark shipped (stock moves, invoice unlocks). A rotated key turns old tablet links away.

Everything each role does updates the others. An order that exceeds free stock creates a work order for the owner; finishing a run puts it in Quality; passing quality adds to stock and moves the order to Ready; shipping removes stock and unlocks the invoice.

## Code layout

- `app/app-data.ts` — data model, EcoForm starter data, `normalize()` (fills defaults so data saved by earlier versions keeps loading), money/stock helpers.
- `app/page.tsx` — shell: roles, navigation, load/save through `/api/state`, drawers and modals.
- `app/components/store.tsx` — context and the shared row/tile components.
- `app/components/sales.tsx`, `owner.tsx`, `floor.tsx` — the three workspaces.
- `app/components/modals.tsx` — order/quote/invoice, work order, item rate, purchase order, maintenance, inventory, CRM forms.
- `app/components/drawers.tsx` — order / document / work order / PO detail with every action, customer profile, notifications.
- `app/api/state/route.ts` — one JSON document + audit log in Postgres (Render) or D1 (Cloudflare).

Existing deployments keep their saved data. A database still holding the old Pure Alkaline test records shows a banner on the control center; **Settings & access → Load EcoForm starter data** replaces it.

QuickBooks: the panel records the connection and marks invoices/customers as synced. The live Intuit OAuth + Invoice/Payment API calls are the next piece and need your Intuit developer keys.

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
