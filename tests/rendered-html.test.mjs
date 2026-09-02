import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("MakeLogic production build renders the application shell", async()=>{
  const workerUrl=new URL("../dist/server/index.js",import.meta.url);
  workerUrl.searchParams.set("test",`${process.pid}-${Date.now()}`);
  const{default:worker}=await import(workerUrl.href);
  const response=await worker.fetch(new Request("http://localhost/",{headers:{accept:"text/html"}}),{ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},{waitUntil(){},passThroughOnException(){}});
  assert.equal(response.status,200);
  assert.match(response.headers.get("content-type")??"",/^text\/html\b/i);
  const html=await response.text();
  assert.match(html,/class="logo">Make<span>Logic/i);
  assert.doesNotMatch(html,/Your site is taking shape|Building your site/i);
});

test("durable company state and audit logging are configured",async()=>{
  const[hosting,schema,route,migration]=await Promise.all([
    readFile(new URL(".openai/hosting.json",root),"utf8"),
    readFile(new URL("db/schema.ts",root),"utf8"),
    readFile(new URL("app/api/state/route.ts",root),"utf8"),
    readFile(new URL("drizzle/0000_third_mercury.sql",root),"utf8"),
  ]);
  assert.equal(JSON.parse(hosting).d1,"DB");
  assert.match(schema,/appState/);
  assert.match(schema,/auditEvents/);
  assert.match(route,/export async function GET/);
  assert.match(route,/export async function PUT/);
  assert.match(route,/Invalid company data/);
  assert.match(migration,/CREATE TABLE `app_state`/);
  assert.match(migration,/CREATE TABLE `audit_events`/);
});

test("connected business workflows are present",async()=>{
  const files=await Promise.all(["app/components/modals.tsx","app/components/drawers.tsx","app/components/owner.tsx","app/components/sales.tsx","app/components/floor.tsx"].map(f=>readFile(new URL(f,root),"utf8")));
  const source=files.join("\n");
  for(const marker of ["order.create","quote.approve","invoice.create","invoice.payment","order.ship","production.report","production.finish","packing.complete","calendar.move","qc.pass","purchase.create","purchase.receive","maintenance.complete","inventory.move","roles.update","settings.quickbooks","Export company report"]){
    assert.ok(source.includes(marker),marker);
  }
});
