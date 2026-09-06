// The stage model now runs money-first. Existing orders hold numbers from the old list, so the
// migration has to land each one where the shop would actually expect to find it.
let pass=0,fail=0;
const t=(n,c,d)=>{if(c)pass++;else fail++;console.log(`${c?"  ok  ":"  FAIL"} ${n}${c?"":"  → "+d}`)};

const OLD=["Placed","In production","Quality check","Ready","Shipped","Invoiced","Paid"];
const NEW=["New","Quoted","Invoiced","Paid","In production","Ready to pack","Shipped","Done"];
const S={NEW:0,QUOTED:1,INVOICED:2,PAID:3,PRODUCTION:4,READY:5,SHIPPED:6,DONE:7};
const OLD_TO_NEW={0:S.NEW,1:S.PRODUCTION,2:S.PRODUCTION,3:S.READY,4:S.SHIPPED,5:S.SHIPPED,6:S.DONE};
const migrate=o=>{if(o.stageV2)return o.stage;const mapped=OLD_TO_NEW[o.stage]??S.NEW;return mapped};

console.log("\nOld orders land somewhere sensible:");
const cases=[[0,"New"],[1,"In production"],[2,"In production"],[3,"Ready to pack"],[4,"Shipped"],[5,"Shipped"],[6,"Done"]];
for(const [old,expect] of cases){
  const got=NEW[migrate({stage:old})];
  t(`${OLD[old]} → ${expect}`,got===expect,`got ${got}`);
}

console.log("\nNothing goes backwards in the real world:");
// An order that was shipped must never reappear as unpaid/unmade work.
t("shipped never returns to production",migrate({stage:4})>=S.SHIPPED);
t("old 'Invoiced' (post-ship) does not become pre-production",migrate({stage:5})>=S.SHIPPED);
t("paid stays finished",migrate({stage:6})===S.DONE);

console.log("\nMigration runs once:");
const already={stage:S.PRODUCTION,stageV2:true};
t("an already-migrated order is left alone",migrate(already)===S.PRODUCTION);

console.log("\nProduction is gated on money:");
const canStart=o=>(o.deposit||0)>0||o.payment==="Paid"||o.payment==="Deposit";
t("unpaid order cannot start",!canStart({payment:"Unpaid"}));
t("deposit releases it",canStart({deposit:500,payment:"Deposit"}));
t("paid in full releases it",canStart({payment:"Paid"}));
t("a zero deposit is not a deposit",!canStart({deposit:0,payment:"Unpaid"}));

console.log("\nStage order matches how the shop works:");
t("invoicing comes before production",NEW.indexOf("Invoiced")<NEW.indexOf("In production"));
t("payment comes before production",NEW.indexOf("Paid")<NEW.indexOf("In production"));
t("production comes before shipping",NEW.indexOf("In production")<NEW.indexOf("Shipped"));
t("quote comes before invoice",NEW.indexOf("Quoted")<NEW.indexOf("Invoiced"));

// ---------------------------------------------------------------------------
// The transitions themselves. These mirror the moves wired into the order drawer, the floor screen and
// the invoice payment path; the point is that money moves an order forward and nothing moves it back.

// Paid → In production, gated on money landing.
const release=o=>canStart(o)?{...o,stage:S.PRODUCTION}:o;
// Money recorded against an invoice. A part payment is a deposit, which is enough to reach the floor.
const recordPayment=(o,{settled})=>{const ns=Math.max(o.stage??S.NEW,S.PAID);
  return settled?{...o,stage:ns,payment:"Paid"}:{...o,stage:ns,payment:"Deposit",deposit:(o.deposit||0)+1}};
// Quality passing a run is what makes an order ready to pack.
const qcPass=o=>(o.stage??S.NEW)<S.READY?{...o,stage:S.READY}:o;
const ship=o=>({...o,stage:S.SHIPPED});
const close=o=>({...o,stage:S.DONE});

console.log("\nNothing reaches the floor without money:");
t("an invoiced but unpaid order stays put",release({stage:S.INVOICED,payment:"Net 30"}).stage===S.INVOICED);
t("a paid order goes to production",release({stage:S.PAID,payment:"Paid"}).stage===S.PRODUCTION);
t("a deposit is enough to release",release({stage:S.PAID,deposit:500}).stage===S.PRODUCTION);

console.log("\nMoney moves an order forward, never backwards:");
t("a deposit lands the order on Paid",recordPayment({stage:S.INVOICED},{settled:false}).stage===S.PAID);
t("a deposit is not recorded as paid in full",recordPayment({stage:S.INVOICED},{settled:false}).payment==="Deposit");
t("a deposit opens the production gate",canStart(recordPayment({stage:S.INVOICED},{settled:false})));
t("settling in full marks it paid",recordPayment({stage:S.INVOICED},{settled:true}).payment==="Paid");
// The balance on a deposit-only order often arrives after the goods have gone out.
t("paying the balance does not un-ship an order",recordPayment({stage:S.SHIPPED,deposit:500},{settled:true}).stage===S.SHIPPED);
t("paying the balance does not pull work off the floor",recordPayment({stage:S.PRODUCTION,deposit:500},{settled:true}).stage===S.PRODUCTION);

console.log("\nThe rest of the run through the shop:");
t("quality passing makes an order ready to pack",qcPass({stage:S.PRODUCTION}).stage===S.READY);
t("quality passing never drags a shipped order back",qcPass({stage:S.SHIPPED}).stage===S.SHIPPED);
t("shipping follows packing",ship({stage:S.READY}).stage===S.SHIPPED);
t("done follows shipping",close({stage:S.SHIPPED}).stage===S.DONE);
// Shown, not blocked: an outstanding balance must not stop the goods going out.
const owing={stage:S.READY,deposit:500,total:2000};
t("an outstanding balance does not block shipping",ship(owing).stage===S.SHIPPED);
t("an outstanding balance does not block closing",close(ship(owing)).stage===S.DONE);

console.log("\nEvery step is walked end to end:");
let o={stage:S.NEW,payment:"Net 30"};
o={...o,stage:S.QUOTED};o={...o,stage:S.INVOICED};
o=recordPayment(o,{settled:false});o=release(o);o=qcPass(o);o=ship(o);o=close(o);
t("new → quoted → invoiced → deposit → floor → packed → shipped → done",o.stage===S.DONE,`ended at ${NEW[o.stage]}`);

// ---------------------------------------------------------------------------
// The source itself. Hardcoded stage numbers under the old list are what broke this flow; the constants
// exist so that cannot recur, and a bare `stage:4` in a component is the exact shape of the trap.
console.log("\nNo component writes a bare stage number:");
const { readFileSync, readdirSync } = await import("node:fs");
const files=["app/app-data.ts",...readdirSync("app/components").filter(f=>f.endsWith(".tsx")).map(f=>`app/components/${f}`)];
for(const f of files){
  const src=readFileSync(new URL(`../${f}`,import.meta.url),"utf8");
  const hits=[...src.matchAll(/stage:\s*[0-9]/g)].length+[...src.matchAll(/stageOf\([a-z]+\)\s*[<>=!]+\s*[0-9]/g)].length;
  t(`${f} uses the STAGE_* constants`,hits===0,`${hits} bare stage number(s)`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
