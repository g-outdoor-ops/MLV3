// Document totals. The review found SO-1191 displaying $5,935.20 against a true $6,143 because a
// multi-line document was squashed to one line and re-multiplied.
import { readFileSync } from "node:fs";
let pass=0,fail=0;
const t=(n,c,d)=>{if(c)pass++;else fail++;console.log(`${c?"  ok  ":"  FAIL"} ${n}${c?"":"  → "+d}`)};
const r2=n=>Math.round(n*100)/100;

// The old formula, and the shipped one.
const oldTotal=d=>r2(((d.quantity??d.cases)*d.rate)*(1-d.discount/100)+d.shipping);
const documentTotal=d=>d.total!=null?r2(d.total)
  :(d.lines&&d.lines.length?r2(d.lines.reduce((a,l)=>a+l.quantity*l.rate,0)*(1-d.discount/100)+d.shipping)
  :oldTotal(d));
const documentBalance=d=>d.balance!=null?r2(d.balance):Math.max(0,r2(documentTotal(d)-(d.paid||0)));

console.log("\nA multi-line invoice (the SO-1191 shape):");
const lines=[{item:"5-Gallon · 2 caps",quantity:600,rate:9.4},{item:"5-Gallon · no cap",quantity:60,rate:8.2}];
const sub=lines.reduce((a,l)=>a+l.quantity*l.rate,0);      // 5640 + 492 = 6132
const shipping=11, discount=0;
const trueTotal=r2(sub*(1-discount/100)+shipping);          // 6143
const qty=lines.reduce((a,l)=>a+l.quantity,0);
const squashed={quantity:qty,cases:qty,rate:lines[0].rate,discount,shipping};   // what used to be saved
const stored={...squashed,lines,total:trueTotal};                               // what is saved now

t("true total is 6143",trueTotal===6143,`${trueTotal}`);
t("old squash was wrong",oldTotal(squashed)!==trueTotal,`old gave ${oldTotal(squashed)}`);
console.log(`       old displayed $${oldTotal(squashed).toLocaleString()} vs true $${trueTotal.toLocaleString()}`);
t("stored lines give the right total",documentTotal(stored)===6143,`${documentTotal(stored)}`);

console.log("\nQuickBooks stays authoritative when it created the invoice:");
const fromQbo={...stored,total:6142.98};
t("its TotalAmt wins over our arithmetic",documentTotal(fromQbo)===6142.98,`${documentTotal(fromQbo)}`);

console.log("\nSingle-line documents are unchanged:");
const single={quantity:500,cases:500,rate:9.4,discount:5,shipping:45};
t("no lines, no total → old formula",documentTotal(single)===oldTotal(single),`${documentTotal(single)} vs ${oldTotal(single)}`);
t("and it is still 4510",documentTotal(single)===4510,`${documentTotal(single)}`);

console.log("\nDiscount applies to goods, not shipping:");
const disc={lines,total:null,discount:5,shipping:150};
const expected=r2(sub*0.95+150);
t("shipping is added after the discount",documentTotal({...disc,total:undefined})===expected,`${documentTotal({...disc,total:undefined})} vs ${expected}`);

console.log("\nBalance tracks part payments:");
const partly={...stored,paid:2000};
t("balance is total less paid",documentBalance(partly)===4143,`${documentBalance(partly)}`);
const qboSays={...stored,paid:2000,balance:4143.01};
t("QuickBooks' balance wins when present",documentBalance(qboSays)===4143.01,`${documentBalance(qboSays)}`);

// ---------------------------------------------------------------------------
// The processing fee. Card payment is off and the customer pays by bank transfer, so the invoice
// carries the cost of taking the money as its own line. The figure here and the figure QuickBooks
// billed must never differ — that mismatch is what three earlier money bugs were made of.
let app=null;
try{app=await import("../app/app-data.ts")}catch(e){console.log("  note: "+e.message.split("\n")[0])}
t("the app module can be imported",!!app,"needs Node 22.18+");
if(app){
const {documentTotal,documentBalance,normalize,seedData,PROCESSING_FEE_LABEL}=app;
console.log("\nThe fee is on the invoice and in the total:");
const lines=[{item:"5-Gallon Bottle · 2 caps",quantity:500,rate:9.4}];
const base={id:"INV-1",kind:"invoice",customerId:"c1",item:"x",cases:250,rate:9.4,discount:0,shipping:312,status:"Open",due:"2026-10-07",paid:0,lines};
t("without a fee the total is goods plus shipping",documentTotal(base)===5012);
t("the fee is added on top",documentTotal({...base,fee:25})===5037,`${documentTotal({...base,fee:25})}`);
// A discount is on the goods, not on the cost of taking the money — the same rule shipping follows.
t("a discount does not eat the fee",documentTotal({...base,discount:10,fee:25})===5037-470,`${documentTotal({...base,discount:10,fee:25})}`);
t("the balance owed includes it",documentBalance({...base,fee:25})===5037);
t("paying the goods still leaves the fee owing",documentBalance({...base,fee:25,paid:5012})===25);
// QuickBooks is authoritative once it has billed: a stored total wins over anything recomputed here.
t("a total QuickBooks gave us is never second-guessed",documentTotal({...base,fee:25,total:5037})===5037);
t("the fee has one name in the app and in QuickBooks",PROCESSING_FEE_LABEL==="Processing fee");
t("a new company starts with the $25 fee set",normalize(seedData).settings.paymentFee===25);
t("and an owner can set it to nothing",normalize({...seedData,settings:{...seedData.settings,paymentFee:0}}).settings.paymentFee===0);

// ---------------------------------------------------------------------------
// The $2.2m dashboard. Invoices imported before this app stored `total` and `lines` kept a SUMMED
// quantity beside ONE line's rate. The code stopped writing that shape, but the rows already in the
// database still hold it, and re-multiplying them is what put $2,287,351 on the owner's Control Center
// against about $27,000 of real invoices.
const {invoiceProblems,invoiceCogs,invoiceCost,totalUnrecorded}=app;
console.log("\nAn invoice imported before totals were stored:");
// A real four-line invoice worth ~$6,143, saved the old way: 660 bottles against the first line's rate.
const legacyImport={id:"qbi2169",kind:"invoice",customerId:"c1",item:"5-Gallon · 2 caps",
  cases:660,quantity:660,rate:9.4,discount:0,shipping:0,status:"Open",due:"2026-03-09",paid:0,
  qboId:"2169",qbSynced:true,source:"quickbooks"};
t("the old formula would have called it 6204",r2(660*9.4)===6204);
t("it is not multiplied out any more",documentTotal(legacyImport)===0,`${documentTotal(legacyImport)}`);
t("and it is named as having no recorded total",totalUnrecorded(legacyImport));
t("a local single-line invoice still computes as it always did",
  documentTotal({...base,qboId:undefined,source:undefined,lines:undefined,shipping:0,cases:500,quantity:500})===4700,
  `${documentTotal({...base,qboId:undefined,source:undefined,lines:undefined,shipping:0,cases:500,quantity:500})}`);
t("a re-import restores the real figure",documentTotal({...legacyImport,total:6143,lines:[{item:"5-Gallon · 2 caps",quantity:600,rate:9.4},{item:"5-Gallon · no cap",quantity:60,rate:8.2}]})===6143);

console.log("\nThe owner is told which invoices the figure cannot be trusted on:");
const audited={...seedData,documents:[legacyImport,
  {id:"INV-9",kind:"invoice",customerId:"c1",item:"x",cases:10,quantity:10,rate:9,discount:0,shipping:0,
   status:"Open",due:"2026-10-01",paid:0,lines:[{item:"5-Gallon Bottle · 2 caps",quantity:10,rate:9}],total:900000},
  {id:"INV-8",kind:"invoice",customerId:"c1",item:"x",cases:10,quantity:10,rate:9,discount:0,shipping:0,
   status:"Open",due:"2026-10-01",paid:0,lines:[{item:"5-Gallon Bottle · 2 caps",quantity:10,rate:9}],total:96.3}]};
const probs=invoiceProblems(audited);
t("the unrecorded one is flagged",probs.some(p=>p.id==="qbi2169"&&p.why==="unrecorded"));
t("so is a total that disagrees with its own lines",probs.some(p=>p.id==="INV-9"&&p.why==="mismatch"));
t("sales tax on top of the lines is not called a bug",!probs.some(p=>p.id==="INV-8"),"7% tax must not flag");
t("a clean book raises nothing",invoiceProblems(seedData).length===0,`${invoiceProblems(seedData).map(p=>p.id).join(", ")}`);

// ---------------------------------------------------------------------------
// 100% margin. COGS counted only orders raised in this app, so an imported invoice — which has no
// order here — cost nothing to make, and every invoiced dollar came out as profit.
console.log("\nCost of goods on an invoice with no order behind it:");
const withCost={...seedData,itemRates:[{id:"i1",item:"5-Gallon Bottle · 2 caps",rate:9.4,cost:3.1,kind:"finished",minimum:50,discountLimit:5,unitsPerCase:2}],orders:[],
  documents:[{id:"qbi1",kind:"invoice",customerId:"c1",item:"5-Gallon Bottle · 2 caps",cases:100,quantity:200,rate:9.4,
    discount:0,shipping:0,status:"Open",due:"2026-10-01",paid:0,qboId:"1",source:"quickbooks",total:1880,
    lines:[{item:"5-Gallon Bottle · 2 caps",quantity:200,rate:9.4}]}]};
t("it is costed from its own lines",invoiceCogs(withCost,withCost.documents).cost===620,`${invoiceCogs(withCost,withCost.documents).cost}`);
t("so the margin is not 100%",r2(1880-620)!==1880);
const noCost={...withCost,itemRates:[{...withCost.itemRates[0],cost:0}]};
t("an item with no cost recorded is reported, not counted as free",
  invoiceCogs(noCost,noCost.documents).cost===0&&invoiceCogs(noCost,noCost.documents).unpriced.length===1);
t("a single-line legacy invoice is still costed",
  invoiceCost(withCost,{...withCost.documents[0],lines:undefined,total:1880}).cost===620);

// The repair path. The sync already asks QuickBooks what each open invoice is worth; storing that
// answer — not only the amount paid — is what puts an unrecorded invoice right without a full import.
console.log("\nThe sync stores the figure the books give it:");
const ownerSrc=readFileSync(new URL("../app/components/owner.tsx",import.meta.url),"utf8");
t("it asks about an unrecorded invoice even when it is marked paid",/d\.status!=="Paid"\|\|totalUnrecorded\(d\)/.test(ownerSrc));
t("and writes the total back, not just the payment",/total:b\.total,balance:b\.balance/.test(ownerSrc));
t("an invoice with no recorded total is left out of the receivables",/!totalUnrecorded\(d\)&&invStatus/.test(ownerSrc));
t("and the dashboard names it instead of quietly dropping it",/invoiceProblems\(data\)/.test(ownerSrc));
t("net profit stops claiming a margin when nothing has a cost",/this is revenue, not profit/.test(ownerSrc));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
