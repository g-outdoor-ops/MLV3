// Document totals. The review found SO-1191 displaying $5,935.20 against a true $6,143 because a
// multi-line document was squashed to one line and re-multiplied.
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
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
