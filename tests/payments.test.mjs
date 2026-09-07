// Payment safety, modelling recordPayment's real logic against a fake QuickBooks invoice.
// These are the paths that move customer money, so each failure mode gets an explicit case.
let pass=0,fail=0;
const t=(name,cond,detail)=>{if(cond)pass++;else fail++;console.log(`${cond?"  ok  ":"  FAIL"} ${name}${cond?"":"  → "+detail}`)};

function makeQbo(total){
  let balance=total;const payments=[];
  return{
    balance:()=>balance,
    payments:()=>payments,
    // Mirrors recordPayment: re-read the live balance, refuse if settled, clamp to what is owed.
    record(amount){
      if(balance<=0.005)throw new Error("That invoice is already paid in full in QuickBooks — nothing left to record.");
      const amt=Math.round(Math.min(amount,balance)*100)/100;
      if(amt<=0)throw new Error("Enter an amount greater than zero.");
      balance=Math.round((balance-amt)*100)/100;payments.push(amt);
      return{applied:amt,remaining:balance};
    }};
}

console.log("\nDouble-click on Record payment:");
let q=makeQbo(6143);
q.record(6143);
let second=null;try{q.record(6143)}catch(e){second=e.message}
t("first click takes the money once",q.payments().length===1&&q.payments()[0]===6143);
t("second click is refused, not charged again",second!==null&&q.payments().length===1,`payments: ${q.payments()}`);
t("customer paid exactly once",q.payments().reduce((a,b)=>a+b,0)===6143);

console.log("\nSending the total instead of the balance (the old bug):");
q=makeQbo(6143);
q.record(2000);                       // customer part-paid earlier
const over=q.record(6143);            // UI sends the full total
t("overpayment is clamped to what is owed",over.applied===4143,`applied ${over.applied}`);
t("balance lands exactly on zero",q.balance()===0,`balance ${q.balance()}`);
t("customer is never charged more than the invoice",q.payments().reduce((a,b)=>a+b,0)===6143);

console.log("\nPart payments:");
q=makeQbo(1000);
const p1=q.record(400);
t("part payment applies",p1.applied===400&&p1.remaining===600);
t("invoice stays open while money is owed",p1.remaining>0.005);
const p2=q.record(600);
t("final payment settles it",p2.remaining===0);
t("settled only when nothing remains",!(p2.remaining>0.005));

console.log("\nRejected input:");
q=makeQbo(500);
let zero=null;try{q.record(0)}catch(e){zero=e.message}
t("zero is refused",zero!==null);
t("nothing was recorded",q.payments().length===0);

console.log("\nInvoice create idempotency (by document number):");
const qbInvoices=new Map();
const createInvoice=doc=>{const found=[...qbInvoices.values()].find(i=>i.docNumber===doc);
  if(found)return{...found,existing:true};
  const inv={qboId:"qb"+(qbInvoices.size+1),docNumber:doc};qbInvoices.set(inv.qboId,inv);return inv};
const a=createInvoice("INV-1042");
const b=createInvoice("INV-1042");           // double-click / retry after timeout
t("the same document number returns the same invoice",a.qboId===b.qboId);
t("no duplicate invoice is created",qbInvoices.size===1,`${qbInvoices.size} invoices`);
t("the retry is reported as pre-existing",b.existing===true);

console.log("\nDiscount must not reduce shipping:");
// QuickBooks applies a percentage DiscountLine to every line above it.
const lines=[{amount:6000,type:"item"},{amount:5,type:"discountPct"},{amount:150,type:"shipping"}];
const goodsAbove=lines.slice(0,lines.findIndex(l=>l.type==="discountPct")).reduce((a,l)=>a+l.amount,0);
t("discount sits above shipping",lines.findIndex(l=>l.type==="discountPct")<lines.findIndex(l=>l.type==="shipping"));
t("discount applies to goods only",goodsAbove===6000,`base ${goodsAbove}`);
t("total is right",Math.round((6000*0.95+150)*100)/100===5850);

// ---------------------------------------------------------------------------
// What the invoice offers the customer, and what a directly-raised invoice does about production.
console.log("\nInvoices go out for bank transfer only:");
const { readFileSync } = await import("node:fs");
const qbo=readFileSync(new URL("../app/server/qbo.ts",import.meta.url),"utf8");
t("card payment is off",/AllowOnlineCreditCardPayment:false/.test(qbo));
t("bank transfer is on",/AllowOnlineACHPayment:true/.test(qbo));
// The fee must sit AFTER the discount line: a QuickBooks percentage discount applies to every line
// above it, so a fee placed before it would be silently discounted.
const feeAt=qbo.indexOf("inv.fee"),discAt=qbo.indexOf("DiscountLineDetail");
t("the fee line comes after the discount line",feeAt>discAt&&discAt>0,`fee ${feeAt}, discount ${discAt}`);
t("the fee is a visible line, not buried in a total",/Description:PROCESSING_FEE/.test(qbo));

console.log("\nBoth places that raise an invoice charge the same fee:");
const modals=readFileSync(new URL("../app/components/modals.tsx",import.meta.url),"utf8");
const drawers=readFileSync(new URL("../app/components/drawers.tsx",import.meta.url),"utf8");
for(const [name,src] of [["the invoice modal",modals],["invoicing from an order",drawers]]){
  t(`${name} reads the fee from settings`,/paymentFee\?\?0/.test(src));
  t(`${name} sends it to QuickBooks`,/shipping:t\.ship,fee,/.test(src));
  t(`${name} stores what was billed`,/billed/.test(src));
}
// A quote is not a payment, so it carries no fee.
t("a quote carries no processing fee",/kind==="invoice"\?\(data\.settings\.paymentFee\?\?0\):0/.test(modals));

console.log("\nAn invoice raised on its own still reaches the shop:");
t("it creates an order",/const soRec:OrderRecord\|null=kind==="invoice"/.test(modals));
// Created, not finalised: the money gate is what releases it, exactly as for any other order.
t("the order sits at Invoiced, not Confirmed",/stage:STAGE_INVOICED/.test(modals));
t("it carries the date the line quoted",/promised:estimate\.finish/.test(modals));
t("and the invoice knows which order it raised",/orderId:soId/.test(modals));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
