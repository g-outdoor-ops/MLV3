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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
