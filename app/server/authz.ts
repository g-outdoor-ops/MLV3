// Server-side authorisation.
//
// Until now the only check on /api/state was "are you signed in". The permissions map in settings is
// rendered in the UI but never consulted by the server, so a floor tablet could rewrite pricing,
// settings or the warehouse token by sending a crafted PUT — the browser simply never offered the
// button.
//
// The company record is one JSON blob, which limits how precisely a write can be policed: a single
// ordinary action (take an order) legitimately touches orders, work orders, inventory, activities and
// notices at once. Refusing a whole PUT because it touched inventory would break the app for the very
// people who need it. So this guards the sections where a wrong write is genuinely dangerous and
// cannot be reached by normal work, and leaves the operational sections open to any signed-in user.
//
// This is deliberately not the full permissions matrix. Enforcing that properly needs per-entity
// endpoints (Phase 1 of the review) so the server can see WHAT changed rather than diffing a blob.
import type { AppData } from "../app-data";
import type { User } from "./auth";

// Sections only an owner may change. Each is either money, identity or access:
//   settings  — company details, discount approval threshold, the warehouse token that grants floor
//               access, and the QuickBooks connection
//   roles     — who can do what
//   itemRates — the price list, discount floors and product costs
const OWNER_ONLY = ["settings", "roles", "itemRates"] as const;

const LABEL: Record<string, string> = {
  settings: "company settings",
  roles: "roles and access",
  itemRates: "pricing and product costs",
};

// Deep value comparison via canonical JSON. Key order is stable here because both sides are produced
// by the same normalise step on the client, and a false positive only ever costs an owner-only action
// an explanatory 403 rather than letting a bad write through.
function changed(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
}

/**
 * Returns null when the write is allowed, or a human-readable reason when it is not.
 * `prev` is the record as stored, `next` is what the client is trying to save.
 */
export function denyStateWrite(user: User, prev: AppData, next: AppData): string | null {
  if (user.role === "owner") return null;
  const touched = OWNER_ONLY.filter(k => changed(prev[k as keyof AppData], next[k as keyof AppData]));
  if (!touched.length) return null;
  return `Only an owner can change ${touched.map(t => LABEL[t] || t).join(" and ")}.`;
}

// QuickBooks operations that move money or change the connection. Reading status is fine for anyone —
// the UI shows a connection badge — but creating invoices, emailing them, taking payments, importing
// the books or disconnecting are all owner decisions.
const OWNER_ONLY_QBO = new Set(["disconnect", "invoice.create", "invoice.send", "payment.create", "import"]);

export function denyQboOp(user: User, op: string): string | null {
  if (user.role === "owner") return null;
  return OWNER_ONLY_QBO.has(op) ? "Only an owner can do this in QuickBooks." : null;
}
