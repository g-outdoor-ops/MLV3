"use client";
import { useState } from "react";
import { DEFAULT_QC, DEFAULT_SHIP, STAGES, STAGE_NEW, STAGE_INVOICED, STAGE_PAID, STAGE_PRODUCTION, STAGE_READY, STAGE_SHIPPED, STAGE_DONE, canStartProduction, documentBalance, documentTotal, fmtDay, orderTotals, stageOf, todayIso, type Customer, type DocumentRecord, type WorkOrder, fmtDue} from "../app-data";
import { DetailField, ProfileSection, nextId, now, num, uid, useApp, usd2, type Role } from "./store";
import { qboCall } from "./auth";

export function RecordDrawer({id,close}:{id:string;close:()=>void}){
  const {data,commit,notify,setModal,openRecord,role,user}=useApp();
  const [payOpen,setPayOpen]=useState(false);
  const [payAmount,setPayAmount]=useState(0);
  const [payMethod,setPayMethod]=useState("check");
  const [paying,setPaying]=useState(false);
  const doc=data.documents.find(x=>x.id===id);const order=data.orders.find(x=>x.id===id);const work=data.workOrders.find(x=>x.id===id);const po=(data.purchaseOrders||[]).find(x=>x.id===id);
  const customer=data.customers.find(x=>x.id===(doc?.customerId||order?.customerId||data.orders.find(o=>o.id===work?.orderId)?.customerId));
  const owner=role==="owner";
  const act=(fn:(v:typeof data)=>typeof data,action:string,summary:string,msg:string,target="Orders",urgent=false)=>{commit(fn,action,summary);notify(msg,target,urgent)};
  const activity=(customerId:string|undefined,title:string,detail:string)=>({id:uid("a"),customerId,title,detail,actor:user,createdAt:now()});

  // ---------------- ORDER ----------------
  let body:React.ReactNode=null;let footer:React.ReactNode=null;let heading=id;let eyebrow="Record details";let status="";
  if(order){
    const t=orderTotals(order,data);const st=stageOf(order);const sm=(data.settings.shipMethods||DEFAULT_SHIP).find(s=>s.id===order.shipMethod);const wos=data.workOrders.filter(w=>w.orderId===order.id);const inv=data.documents.find(d=>d.id===order.invoiceId);
    const needsApproval=order.status==="Needs approval";
    eyebrow="Customer order";heading=`${order.id} · ${customer?.name||""}`;status=needsApproval?"Needs owner approval":STAGES[st];
    // Money still outstanding on this order. A deposit-only order owes a balance right through shipping,
    // so this is read at every step rather than assumed to be zero once the order is moving.
    const invTotal=inv?documentTotal(inv):t.total;
    const paidSoFar=inv?(inv.paid||0):(order.deposit||0);
    const owed=Math.max(0,Math.round((invTotal-paidSoFar)*100)/100);
    const setStage=(n:number,extra?:(v:typeof data)=>Partial<typeof data>,msg?:string,target="Order flow",urgent=false)=>act(v=>({...v,orders:v.orders.map(x=>x.id===order.id?{...x,stage:n,stageV2:true,status:STAGES[n]}:x),activities:[activity(order.customerId,"Order status updated",`${order.id} · ${STAGES[n]}`),...v.activities],...(extra?extra(v):{})}),"order.status",`${order.id} → ${STAGES[n]}`,msg??`Order ${order.id} is now ${STAGES[n]}`,target,urgent);

    // The four moves that carry an order through the shop. Each writes one notice pointed at Order flow —
    // the single board sales, the floor and the owner all read — so nobody has to be told twice.
    // Paid → In production. Nothing goes on a machine until a deposit or payment in full has landed.
    const release=()=>{if(!canStartProduction(order)){notify(`${order.id} cannot go to the floor yet — no deposit or payment received`,"Order flow",true);return}
      setStage(STAGE_PRODUCTION,undefined,`${order.id} released to the floor — ${customer?.name||"customer"} · needed ${fmtDue(order.due)}`)};
    // In production → Ready to pack. The floor normally gets here by passing quality on the work order;
    // this is the manual equivalent for an order filled from stock with no run of its own.
    const readyToPack=()=>setStage(STAGE_READY,undefined,`${order.id} is made and ready to pack — ${customer?.name||"customer"}`);
    // Ready to pack → Shipped. The goods leave the building here, so this is where stock comes off the shelf.
    const ship=()=>setStage(STAGE_SHIPPED,v=>({inventory:v.inventory.map(row=>{const l=t.lines.find(l=>l.item===row.item);return l?{...row,onHand:Math.max(0,row.onHand-l.quantity),committed:Math.max(0,row.committed-l.quantity)}:row})}),
      `${order.id} shipped — ${customer?.name||"customer"}${owed>0?` · ${usd2(owed)} still to collect`:" · paid in full"}`,"Order flow",owed>0);
    // Shipped → Done. A deposit-only order still owes money at this point, so say so rather than quietly
    // closing it. Shown, deliberately not blocked — collecting the balance is a phone call, not a gate.
    const finishOrder=()=>setStage(STAGE_DONE,undefined,`${order.id} closed${owed>0?` — ${usd2(owed)} still outstanding`:" — paid in full"}`,"Order flow",owed>0);
    const qbOn=data.settings.quickBooks.connected;
    const makeInvoice=async(paidNow=false)=>{const invId=nextId("INV-",data.documents.filter(x=>x.kind==="invoice").map(x=>x.id),1042);const due=new Date();due.setDate(due.getDate()+30);
      let qbo:{qboId?:string;docNumber?:string;customerId?:string}={};
      if(qbOn&&customer){try{const r=await qboCall({op:"invoice.create",invoice:{docNumber:invId,customer:{id:customer.id,name:customer.name,contact:customer.contact,email:customer.email,phone:customer.phone,billing:customer.billing,delivery:customer.delivery,qboId:customer.qboId},lines:t.lines,discountPct:order.discount||0,shipping:t.ship,dueDate:due.toISOString().slice(0,10),memo:order.invoiceNote,email:customer.email}});qbo=r as typeof qbo;if(paidNow&&qbo.qboId&&qbo.customerId)await qboCall({op:"payment.create",qboId:qbo.qboId,customerQboId:qbo.customerId,amount:t.total,method:"Card at pickup"})}catch(e){notify(`QuickBooks: ${e instanceof Error?e.message:"failed"} — invoice not created`,"Invoices",true);return}}
      act(v=>({...v,documents:[{id:invId,kind:"invoice",customerId:order.customerId,orderId:order.id,item:t.lines.map(l=>l.item).join(" + "),cases:t.cases,quantity:order.quantity,rate:t.lines[0]?.rate||0,discount:order.discount||0,shipping:t.ship,status:paidNow?"Paid":"Open",due:paidNow?"—":fmtDay(due),paid:paidNow?t.total:0,qbSynced:!!qbo.qboId,qboId:qbo.qboId,qboDocNumber:qbo.docNumber,note:order.invoiceNote},...v.documents],
        orders:v.orders.map(x=>x.id===order.id?{...x,invoiceId:invId,stage:Math.max(st,paidNow?STAGE_PAID:STAGE_INVOICED),stageV2:true,status:STAGES[Math.max(st,paidNow?STAGE_PAID:STAGE_INVOICED)],payment:paidNow?"Paid":`${usd2(t.total)} due`}:x),
        customers:v.customers.map(c=>c.id===order.customerId?{...c,qb:c.qb||!!qbo.qboId,qboId:qbo.customerId||c.qboId,balance:c.balance+(paidNow?0:t.total),lifetimeSales:c.lifetimeSales+t.total}:c),
        activities:[activity(order.customerId,paidNow?"Paid by card":"Invoice created",`${invId} · ${usd2(t.total)}${qbo.qboId?" · QuickBooks #"+qbo.docNumber:""}`),...v.activities]}),"invoice.create",`${invId} for ${order.id}`,paidNow?`Card payment of ${usd2(t.total)} recorded — ${invId} paid${qbo.qboId?" in QuickBooks":""}`:`Invoice ${invId} created${qbo.qboId?" in QuickBooks":""}`,"Invoices")};
    const sendLink=async()=>{if(!inv?.qboId){notify(qbOn?"This invoice isn't in QuickBooks yet":"Connect QuickBooks (Settings & access) to email invoices with a Pay Now link","Invoices");return}try{await qboCall({op:"invoice.send",qboId:inv.qboId,email:customer?.email});notify(`Invoice emailed from QuickBooks to ${customer?.email||customer?.name} with a Pay Now link`,"Invoices")}catch(e){notify(`QuickBooks: ${e instanceof Error?e.message:"send failed"}`,"Invoices",true)}};
    // Payments are taken on the invoice itself. That path asks for the amount and the method, refuses a
    // second click while the first is in flight, and trusts the balance the server actually applied — none
    // of which this drawer did. With deposits now part of the flow a full-total shortcut is the wrong tool.
    const openInvoice=()=>{if(order.invoiceId)openRecord(order.invoiceId)};
    const approve=()=>act(v=>({...v,orders:v.orders.map(x=>x.id===order.id?{...x,status:"Confirmed"}:x),activities:[activity(order.customerId,"Pricing approved",`${order.id} approved by owner`),...v.activities]}),"order.approve",`${order.id} approved`,`${order.id} approved — sales can proceed`);
    const editNote=()=>{const n=window.prompt("Note for the warehouse:",order.notes||"");if(n===null)return;act(v=>({...v,orders:v.orders.map(x=>x.id===order.id?{...x,notes:n}:x)}),"order.note",`${order.id} note`,"Note saved — the floor sees it now")};
    body=<>
      <div className="detail-status"><span>Status</span><b>{status}</b></div>
      <div className="stage-pipe">{STAGES.map((s,i)=><span key={s} className={i<st?"done":i===st?"now":""}>{s}</span>)}</div>
      <DetailField label="Customer" value={customer?.name||"Customer"}/>
      <DetailField label="Items" value={<>{t.lines.map(l=><div key={l.item}>{num(l.quantity)} × {l.item} <small>@ {usd2(l.rate)}</small></div>)}</>}/>
      <DetailField label="Shipping" value={`${sm?.name||"—"} · ${t.ship?usd2(t.ship):"free"} · ${t.cases} boxes`}/>
      {!!order.discount&&<DetailField label="Discount" value={`${order.discount}% · −${usd2(t.disc)}`}/>}
      <DetailField label="Total" value={`${usd2(t.total)} · ${customer?.terms||""}`}/>
      <DetailField label="Needed" value={`${fmtDue(order.due)}${order.rep?` · taken by ${order.rep}`:""}`}/>
      <DetailField label="Warehouse note" value={<>{order.notes||<i style={{color:"#7b867f"}}>none</i>} <button className="link-button" onClick={editNote}>edit</button></>}/>
      {order.invoiceNote&&<DetailField label="Invoice note" value={order.invoiceNote}/>}
      <DetailField label="Production" value={wos.length?<>{wos.map(w=><div key={w.id}>{w.id} · {w.status} · {num(w.good)} / {num(w.quantity)} · {w.line}</div>)}</>:"From stock — no run needed"}/>
      <DetailField label="Invoice" value={order.invoiceId?`${order.invoiceId} · ${owed<=0?"Paid":`${usd2(owed)} still due`}${inv?.qboId?` · QuickBooks #${inv.qboDocNumber||inv.qboId}`:""}`:"Not yet invoiced"}/>
      {owed>0&&st>=STAGE_SHIPPED&&<DetailField label="Balance outstanding" value={`${usd2(owed)} still to collect${paidSoFar>0?` · ${usd2(paidSoFar)} received`:""}`}/>}
    </>;
    footer=<>
      <button className="secondary" onClick={close}>Close</button>
      {needsApproval&&owner&&<button className="primary" onClick={approve}>Approve pricing</button>}
      {/* Only the pre-money steps advance by hand. Everything past Invoiced moves on a real event —
          money in, released, made, shipped — so no button can walk an order past the payment gate. */}
      {!needsApproval&&st<STAGE_INVOICED&&owner&&<button className="secondary" onClick={()=>setStage(st+1)}>Mark {STAGES[st+1]}</button>}
      {!needsApproval&&!order.invoiceId&&<button className="primary" onClick={()=>makeInvoice(false)}>Create invoice{data.settings.quickBooks.connected?" in QuickBooks":""}</button>}
      {!needsApproval&&!order.invoiceId&&customer?.terms.includes("Card")&&<button className="secondary" onClick={()=>makeInvoice(true)}>Take card payment</button>}
      {order.invoiceId&&owed>0&&<><button className="secondary" onClick={sendLink}>Email invoice / pay link</button><button className="primary" onClick={openInvoice}>Record payment · {usd2(owed)} due</button></>}
      {st===STAGE_PAID&&<button className="primary" onClick={release} disabled={!canStartProduction(order)} title={canStartProduction(order)?"":"Waiting on a deposit or payment in full"}>Release to the floor</button>}
      {owner&&!wos.length&&st>=STAGE_PAID&&st<=STAGE_PRODUCTION&&<button className="secondary" onClick={()=>{close();setModal("workorder",order.id)}}>+ Work order</button>}
      {st===STAGE_PRODUCTION&&<button className="primary" onClick={readyToPack}>Mark ready to pack</button>}
      {st===STAGE_READY&&<button className="primary" onClick={ship}>Mark shipped</button>}
      {st===STAGE_SHIPPED&&<button className="primary" onClick={finishOrder}>Mark done{owed>0?` · ${usd2(owed)} still due`:""}</button>}
    </>;
  }
  // ---------------- DOCUMENT ----------------
  else if(doc){
    eyebrow=doc.kind==="quote"?"Quote / estimate":"Invoice";heading=`${doc.id} · ${customer?.name||""}`;status=doc.status;
    const total=documentTotal(doc);
    // Recording a payment used to send the invoice TOTAL and ask for the method through window.prompt,
    // where pressing Cancel still recorded the payment. On a part-paid invoice that overpaid the
    // customer, and there was no busy state, so a double-click posted twice against live books.
    const payInvoice=async()=>{
      const amt=Math.round(Math.min(Math.max(0,payAmount),dbal)*100)/100;
      if(amt<=0){notify("Enter an amount greater than zero","Invoices",true);return}
      if(paying)return;                       // a second click while the first is in flight
      setPaying(true);
      let pid="";let applied=amt;let remaining=Math.round((dbal-amt)*100)/100;
      if(doc.qboId&&customer?.qboId){
        try{const r=await qboCall({op:"payment.create",qboId:doc.qboId,customerQboId:customer.qboId,amount:amt,method:payMethod}) as {paymentId?:string;applied?:number;remaining?:number};
          pid=String(r.paymentId||"");
          // Trust the server's figures — it checked the live balance before taking anything.
          if(typeof r.applied==="number")applied=r.applied;
          if(typeof r.remaining==="number")remaining=r.remaining;
        }catch(e){setPaying(false);notify(`QuickBooks: ${e instanceof Error?e.message:"payment failed"}`,"Invoices",true);return}
      }
      const settled=remaining<=0.005;
      act(v=>({...v,
        documents:v.documents.map(x=>x.id===doc.id?{...x,status:settled?"Paid":"Open",paid:Math.round(((x.paid||0)+applied)*100)/100,balance:remaining,paymentQboId:pid||x.paymentQboId}:x),
        // Money landing is what moves an order to Paid — and a deposit counts, which is the whole point of
        // the money-first flow: it is what lets the floor start. A part payment is recorded as a deposit
        // with the balance still owed, not as "Paid". Never move an order backwards: one that has already
        // shipped stays shipped when the balance finally comes in.
        orders:v.orders.map(o=>{if(o.invoiceId!==doc.id)return o;const ns=Math.max(o.stage??STAGE_NEW,STAGE_PAID);
          return settled?{...o,stage:ns,stageV2:true,status:STAGES[ns],payment:"Paid"}
                        :{...o,stage:ns,stageV2:true,status:STAGES[ns],payment:"Deposit",deposit:Math.round((((o.deposit||0)+applied))*100)/100,depositAt:todayIso()}}),
        customers:v.customers.map(x=>x.id===doc.customerId?{...x,balance:Math.max(0,Math.round((x.balance-applied)*100)/100)}:x),
        activities:[activity(doc.customerId,settled?"Payment received":"Part payment received",`${doc.id} · ${usd2(applied)}${settled?"":` · ${usd2(remaining)} still due`}`),...v.activities]}),
        "invoice.payment",`${doc.id} ${settled?"paid":"part paid"}`,
        `${settled?"Payment":"Part payment"} received — ${doc.id} · ${usd2(applied)}${settled?"":` · ${usd2(remaining)} still due`}${pid?" · recorded in QuickBooks":""}`,"Invoices",true);
      setPaying(false);setPayOpen(false);
    };
    const sendDoc=async()=>{if(!doc.qboId){notify(data.settings.quickBooks.connected?"This invoice isn't in QuickBooks yet":"Connect QuickBooks to email invoices with a Pay Now link","Invoices");return}try{await qboCall({op:"invoice.send",qboId:doc.qboId,email:customer?.email});notify(`Invoice emailed from QuickBooks to ${customer?.email||customer?.name}`,"Invoices")}catch(e){notify(`QuickBooks: ${e instanceof Error?e.message:"send failed"}`,"Invoices",true)}};
    // Duplicate for a reorder. Copies the customer and every line onto a fresh invoice dated today,
    // and deliberately does NOT carry over the QuickBooks ids, payment or balance — those belong to the
    // original document. The copy is local until it is created in QuickBooks like any other invoice.
    const duplicate=()=>{
      const prefix=doc.kind==="quote"?"Q-":"INV-";
      // Numbered off this app's own documents only. Imported QuickBooks invoices use qbi ids and their
      // own numbering; mixing the two would make our next number collide with theirs.
      const id=nextId(prefix,data.documents.filter(d=>d.kind===doc.kind&&d.id.startsWith(prefix)).map(d=>d.id),1001);
      const lines=doc.lines&&doc.lines.length?doc.lines:[{item:doc.item,quantity:doc.quantity||doc.cases,rate:doc.rate}];
      const sub=lines.reduce((a,l)=>a+l.quantity*l.rate,0);
      const copy:DocumentRecord={...doc,id,status:"Draft",due:todayIso(),txnDate:todayIso(),
        paid:0,lines,total:Math.round((sub*(1-(doc.discount||0)/100)+(doc.shipping||0))*100)/100,
        balance:undefined,qboId:undefined,qboDocNumber:undefined,paymentQboId:undefined,qbSynced:false,
        source:undefined,orderId:undefined};
      act(v=>({...v,documents:[copy,...v.documents],
        activities:[activity(doc.customerId,"Invoice duplicated",`${id} copied from ${doc.id}`),...v.activities]}),
        "invoice.duplicate",`${id} from ${doc.id}`,
        `${id} created as a copy of ${doc.id} — open it, adjust the quantities, then create it in QuickBooks`,"Invoices");
      close();openRecord(id);
    };
    const approveQuote=()=>act(v=>({...v,documents:v.documents.map(x=>x.id===doc.id?{...x,status:"Sent"}:x)}),"quote.approve",`${doc.id} approved`,`${doc.id} approved — ready to email`,"Quotes");
    const send=()=>act(v=>({...v,documents:v.documents.map(x=>x.id===doc.id?{...x,status:"Sent"}:x),activities:[activity(doc.customerId,"Quote emailed",`${doc.id} · ${usd2(total)}`),...v.activities]}),"quote.send",`${doc.id} sent`,`Quote ${doc.id} emailed to ${customer?.contact||customer?.name}`,"Quotes");
    const dl=doc.lines&&doc.lines.length?doc.lines:[{item:doc.item,quantity:doc.quantity||doc.cases,rate:doc.rate}];
    const dsub=dl.reduce((a,l)=>a+l.quantity*l.rate,0);
    const dbal=documentBalance(doc);
    body=<><div className="detail-status"><span>Status</span><b>{doc.status}</b></div>
      <DetailField label="Customer" value={customer?.name||"Lead"}/>
      {doc.txnDate&&<DetailField label="Invoice date" value={doc.txnDate}/>}
      <DetailField label={doc.kind==="quote"?"Good until":"Due"} value={fmtDue(doc.due)}/>
      <div className="doc-lines">
        <table><thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Rate</th><th className="r">Amount</th></tr></thead>
        <tbody>{dl.map((l,i)=><tr key={i}><td>{l.item}</td><td className="r">{num(l.quantity)}</td><td className="r">{usd2(l.rate)}</td><td className="r">{usd2(l.quantity*l.rate)}</td></tr>)}</tbody></table>
        <div className="doc-totals">
          <div><span>Subtotal</span><b>{usd2(dsub)}</b></div>
          {doc.discount?<div><span>Discount {doc.discount}%</span><b>−{usd2(dsub*doc.discount/100)}</b></div>:null}
          {doc.shipping?<div><span>Shipping</span><b>{usd2(doc.shipping)}</b></div>:null}
          <div className="grand"><span>Total</span><b>{usd2(total)}</b></div>
          {doc.kind==="invoice"&&<><div><span>Paid</span><b>{usd2(doc.paid||0)}</b></div>
            <div className={dbal>0?"due":""}><span>Balance due</span><b>{usd2(dbal)}</b></div></>}
        </div>
      </div>
      {payOpen&&<div className="pay-panel">
        <h4>Record a payment</h4>
        <label>Amount<input type="number" step="0.01" min="0" max={dbal} value={payAmount} onChange={e=>setPayAmount(Number(e.target.value))}/></label>
        <label>How was it paid<select value={payMethod} onChange={e=>setPayMethod(e.target.value)}>{["check","ACH","card","cash","other"].map(m=><option key={m} value={m}>{m}</option>)}</select></label>
        <p className="pay-note">Balance due {usd2(dbal)}. Leave the amount as it is for payment in full, or lower it for a part payment.</p>
        <div className="pay-actions">
          <button className="secondary" onClick={()=>setPayOpen(false)} disabled={paying}>Cancel</button>
          <button className="primary" onClick={payInvoice} disabled={paying}>{paying?"Recording…":`Record ${usd2(Math.min(Math.max(0,payAmount),dbal))}`}</button>
        </div>
      </div>}
      {doc.orderId&&<DetailField label="Order" value={doc.orderId}/>}
      {doc.note&&<DetailField label="Note to customer" value={doc.note}/>}
      {doc.kind==="invoice"&&<DetailField label="QuickBooks" value={doc.qboId?`Invoice #${doc.qboDocNumber||doc.qboId}${doc.source==="quickbooks"?" · imported":""}${doc.paymentQboId?" · payment recorded":""}`:"Not in QuickBooks"}/>}</>;
    footer=<><button className="secondary" onClick={close}>Close</button>
      {doc.kind==="quote"&&doc.status==="Awaiting approval"&&owner&&<button className="primary" onClick={approveQuote}>Approve pricing</button>}
      {doc.kind==="quote"&&(doc.status==="Draft")&&<button className="secondary" onClick={send}>Email quote</button>}
      {doc.kind==="quote"&&doc.status!=="Accepted"&&doc.status!=="Awaiting approval"&&<button className="primary" onClick={()=>{close();setModal("order",doc.id)}}>Accept &amp; create order</button>}
      {doc.kind==="invoice"&&<button className="secondary" onClick={duplicate}>Duplicate for reorder</button>}
      {doc.kind==="invoice"&&doc.status!=="Paid"&&<><button className="secondary" onClick={sendDoc}>Email invoice / pay link</button><button className="primary" onClick={()=>{setPayAmount(dbal);setPayOpen(true)}} disabled={dbal<=0}>Record payment</button></>}</>;
  }
  // ---------------- WORK ORDER ----------------
  else if(work){
    const so=data.orders.find(o=>o.id===work.orderId);const rate=data.itemRates.find(r=>r.item===work.item);const checks=work.qc||(rate?.qcChecks||DEFAULT_QC).map(l=>({label:l,result:null as boolean|null}));const done=checks.filter(c=>c.result!==null).length;const fails=checks.filter(c=>c.result===false).length;
    eyebrow="Work order";heading=`${work.id} · ${work.item}`;status=work.status;
    const upd=(patch:Partial<WorkOrder>,action:string,msg:string,extra?:(v:typeof data)=>Partial<typeof data>)=>act(v=>({...v,workOrders:v.workOrders.map(x=>x.id===work.id?{...x,...patch}:x),...(extra?extra(v):{})}),action,`${work.id} ${action}`,msg,"Work orders");
    const setCheck=(i:number,r:boolean)=>commit(v=>({...v,workOrders:v.workOrders.map(x=>x.id===work.id?{...x,qc:checks.map((c,k)=>k===i?{...c,result:r}:c)}:x)}),"qc.check",`${work.id} check`);
    const pass=()=>upd({qcResult:"pass",status:"Done"},"qc.pass",`${work.id} passed — ${num(work.good)} into stock${so?`; ${so.id} is Ready`:""}`,v=>({inventory:v.inventory.map(row=>row.item===work.item?{...row,onHand:row.onHand+work.good}:row),orders:v.orders.map(o=>o.id===work.orderId&&stageOf(o)<STAGE_READY?{...o,stage:STAGE_READY,stageV2:true,status:STAGES[STAGE_READY]}:o),notices:[{id:uid("n"),title:`${work.id} passed quality`,detail:`${num(work.good)} × ${work.item} into stock${so?` · ${so.id} ready to pack`:""}`,urgent:false,read:false,createdAt:now(),target:"Orders"},...v.notices]}));
    body=<><div className="detail-status"><span>Status</span><b>{work.status}</b></div>
      <DetailField label="Purpose" value={so?`${so.id} · ${customer?.name} · needed ${fmtDue(so.due)}`:work.purpose}/>
      <DetailField label="Planned" value={`${num(work.quantity)} bottles · ${work.line} · ${work.days||1} day${(work.days||1)>1?"s":""} from ${work.date}`}/>
      <DetailField label="Good / scrap" value={`${num(work.good)} / ${num(work.scrap)}${work.good?` · ${(work.scrap/(work.good+work.scrap)*100).toFixed(1)}% scrap`:""}`}/>
      <DetailField label="Material" value={rate?.material?`${rate.material} × ~${num(Math.round(work.quantity*1.03))}`:"—"}/>
      {so?.notes&&<DetailField label="Note from sales" value={so.notes}/>}
      {work.qcNote&&<DetailField label="Floor notes" value={work.qcNote}/>}
      {owner&&<div className="form-grid" style={{marginTop:8}}><label>Line<select value={work.line} onChange={e=>upd({line:e.target.value},"wo.line",`${work.id} moved to ${e.target.value}`)}>{(data.settings.lines||["Line 1"]).map(l=><option key={l}>{l}</option>)}</select></label><label>Start date<input type="date" value={work.date} onChange={e=>upd({date:e.target.value,status:work.status==="Needs scheduling"?"Scheduled":work.status},"wo.move",`${work.id} rescheduled`)}/></label><label>Quantity<input type="number" value={work.quantity} onChange={e=>upd({quantity:Math.max(1,Number(e.target.value)||1)},"wo.qty",`${work.id} quantity`)}/></label></div>}
      {(work.status==="QC hold"||work.status==="Running"||work.qc)&&work.status!=="Done"&&<section className="qc-checks"><h3>Quality checks · {done} of {checks.length}</h3>{checks.map((c,i)=><div key={c.label} className="qc-check"><span>{c.label}</span><span><button className={c.result===true?"pass on":"pass"} onClick={()=>setCheck(i,true)} disabled={!owner&&role!=="floor"}>✓</button><button className={c.result===false?"fail on":"fail"} onClick={()=>setCheck(i,false)} disabled={!owner&&role!=="floor"}>✗</button></span></div>)}<label>Notes<textarea value={work.qcNote||""} onChange={e=>commit(v=>({...v,workOrders:v.workOrders.map(x=>x.id===work.id?{...x,qcNote:e.target.value}:x)}),"qc.note",`${work.id} note`)}/></label></section>}
    </>;
    footer=<><button className="secondary" onClick={close}>Close</button>
      {owner&&work.status==="Needs scheduling"&&<button className="primary" onClick={()=>upd({status:"Scheduled",date:work.date||todayIso()},"wo.schedule",`${work.id} scheduled on ${work.line}`)}>Schedule</button>}
      {owner&&work.status==="Scheduled"&&<button className="primary" onClick={()=>upd({status:"Released"},"wo.release",`${work.id} released to the ${work.line} tablet`)}>Release to floor</button>}
      {(owner||role==="floor")&&(work.status==="Released"||work.status==="Paused")&&<button className="primary" onClick={()=>upd({status:"Running"},"wo.start",`${work.id} running`,v=>({workOrders:v.workOrders.map(x=>x.id===work.id?{...x,status:"Running"}:x.status==="Running"&&x.line===work.line?{...x,status:"Paused"}:x),orders:v.orders.map(o=>o.id===work.orderId&&stageOf(o)>=STAGE_PAID&&stageOf(o)<STAGE_PRODUCTION?{...o,stage:STAGE_PRODUCTION,stageV2:true,status:STAGES[STAGE_PRODUCTION]}:o)}))}>Start run</button>}
      {(owner||role==="floor")&&work.status==="Running"&&<button className="primary" onClick={()=>upd({status:"QC hold",qc:work.qc||checks},"production.finish",`${work.id} finished — quality checks waiting`,v=>({notices:[{id:uid("n"),title:`${work.id} finished — quality checks waiting`,detail:`${num(work.good)} good · ${work.scrap} scrap`,urgent:true,read:false,createdAt:now(),target:"Quality"},...v.notices]}))}>Finish run</button>}
      {owner&&work.status==="QC hold"&&<><button className="primary" disabled={done<checks.length||fails>0} onClick={pass}>Pass &amp; release to stock</button>{fails>0&&<button className="secondary" onClick={()=>upd({qcResult:"scrap",scrap:work.scrap+work.good,good:0,status:"Scheduled",qc:undefined},"qc.scrap",`${work.id} scrapped to regrind and re-queued`)}>Scrap &amp; re-run</button>}</>}
    </>;
  }
  // ---------------- PURCHASE ORDER ----------------
  else if(po){
    eyebrow="Purchase order";heading=`${po.id} · ${po.supplier}`;status=po.status;
    const landed=po.quantity?(po.quantity*po.unitCost+po.freight+po.duty)/po.quantity:po.unitCost;
    const receive=()=>act(v=>({...v,purchaseOrders:(v.purchaseOrders||[]).map(p=>p.id===po.id?{...p,status:"Received",receivedAt:now()}:p),inventory:v.inventory.map(r=>{if(r.item!==po.item)return r;const totalQty=r.onHand+po.quantity;const newCost=totalQty?(r.onHand*r.cost+po.quantity*landed)/totalQty:landed;return {...r,onHand:totalQty,onOrder:Math.max(0,(r.onOrder||0)-po.quantity),eta:undefined,cost:Math.round(newCost*1000)/1000}}),activities:[activity(undefined,"Received",`${po.id} · ${num(po.quantity)} ${po.item} · landed ${usd2(landed)} each`),...v.activities]}),"purchase.receive",`${po.id} received`,`${po.id} received — landed cost ${usd2(landed)} each rolled into inventory`,"Inventory");
    body=<><div className="detail-status"><span>Status</span><b>{po.status}</b></div><DetailField label="Material" value={`${num(po.quantity)} × ${po.item}`}/><DetailField label="Unit cost" value={usd2(po.unitCost)}/><DetailField label="Freight + duty" value={`${usd2(po.freight)} + ${usd2(po.duty)}`}/><DetailField label="Landed cost each" value={usd2(landed)}/><DetailField label="Expected" value={po.eta}/><DetailField label="Created" value={po.createdAt}/>{po.receivedAt&&<DetailField label="Received" value={po.receivedAt}/>}</>;
    footer=<><button className="secondary" onClick={close}>Close</button>{po.status==="Open"&&owner&&<><button className="secondary" onClick={()=>act(v=>({...v,purchaseOrders:(v.purchaseOrders||[]).map(p=>p.id===po.id?{...p,status:"Cancelled"}:p),inventory:v.inventory.map(r=>r.item===po.item?{...r,onOrder:Math.max(0,(r.onOrder||0)-po.quantity)}:r)}),"purchase.cancel",`${po.id} cancelled`,`${po.id} cancelled`,"Purchasing")}>Cancel PO</button><button className="primary" onClick={receive}>Mark received</button></>}</>;
  } else {
    body=<DetailField label="Record" value={id}/>;footer=<button className="secondary" onClick={close}>Close</button>;
  }
  return <div className="detail-layer" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><aside className="detail-drawer"><header><div><p className="eyebrow">{eyebrow}</p><h2>{heading}</h2></div><button onClick={close}>×</button></header><div className="detail-body">{body}</div><footer>{footer}</footer></aside></div>;
}

// ---------------- CUSTOMER PROFILE (Chris's V3, live buttons) ----------------
export function CustomerProfileDrawer({customer,close}:{customer:Customer;close:()=>void}){const{data,commit,setModal,openRecord,notify}=useApp();const[tab,setTab]=useState("Profile");const[editing,setEditing]=useState(false);const[form,setForm]=useState(customer);const reps=Array.from(new Set([customer.rep,...data.customers.map(c=>c.rep)])).filter(Boolean);const ordersFor=data.orders.filter(x=>x.customerId===customer.id);const docs=data.documents.filter(x=>x.customerId===customer.id);const activity=data.activities.filter(x=>x.customerId===customer.id);const save=()=>{commit(v=>({...v,customers:v.customers.map(x=>x.id===customer.id?form:x),activities:[{id:uid("a"),customerId:customer.id,title:"Profile updated",detail:"Contact and delivery information saved",actor:"Current user",createdAt:now()},...v.activities]}),"crm.update",`${customer.name} updated`);setEditing(false);notify(`Customer profile saved — ${form.name}`,"Customers")};
  const setPrice=(item:string,val:string)=>{const p={...(form.prices||{})};const n=parseFloat(val);if(isNaN(n)||n<=0)delete p[item];else p[item]=n;setForm({...form,prices:p})};
  return <div className="detail-layer" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><aside className="detail-drawer crm-profile-drawer"><header><div><p className="eyebrow">Customer CRM profile</p><h2>{customer.name}</h2><span className="customer-number">{customer.kind==="lead"?`Lead · ${customer.stage}`:`Customer · ${customer.stage}`} · Sales owner: {customer.rep}</span></div><button onClick={close}>×</button></header><div className="crm-tabs">{["Profile","Orders","Invoices","Activity"].map(x=><button key={x} className={tab===x?"active":""} onClick={()=>{setTab(x);setEditing(false)}}>{x}</button>)}</div><div className="detail-body">{tab==="Profile"&&(editing?<div className="form-grid"><label>Company<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Sales rep<select value={form.rep} onChange={e=>setForm({...form,rep:e.target.value})}>{reps.map(r=><option key={r}>{r}</option>)}<option>Unassigned</option></select></label><label>Contact<input value={form.contact} onChange={e=>setForm({...form,contact:e.target.value})}/></label><label>Email<input value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Phone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label>Terms<select value={form.terms} onChange={e=>setForm({...form,terms:e.target.value})}><option>Net 30</option><option>Net 15</option><option>Due on receipt</option><option>Card on pickup</option><option>Prepaid</option></select></label><label>Billing address<input value={form.billing} onChange={e=>setForm({...form,billing:e.target.value})}/></label><label>Delivery address<input value={form.delivery} onChange={e=>setForm({...form,delivery:e.target.value})}/></label>{data.itemRates.filter(r=>r.kind!=="raw").map(r=><label key={r.id}>Their price · {r.item} <small>list {usd2(r.rate)}</small><input type="number" step="0.05" placeholder="list" value={form.prices?.[r.item]??""} onChange={e=>setPrice(r.item,e.target.value)}/></label>)}<label className="full-field">Internal notes<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label></div>:<><div className="crm-profile-summary"><div><span>Open balance</span><strong className={customer.balance?"danger":""}>{usd2(customer.balance)}</strong></div><div><span>Open orders</span><strong>{ordersFor.filter(x=>stageOf(x)<STAGE_DONE).length}</strong></div><div><span>Lifetime sales</span><strong>{usd2(customer.lifetimeSales)}</strong></div></div><ProfileSection title="Primary contact" rows={[["Name",customer.contact||"Not entered"],["Email",customer.email||"Not entered"],["Phone",customer.phone||"Not entered"]]}/><ProfileSection title="Addresses & delivery" rows={[["Billing",customer.billing||"Not entered"],["Delivery",customer.delivery||"Not entered"],["Terms",customer.terms],["QuickBooks",customer.qb?"Linked":"Not linked yet"]]}/><ProfileSection title="Agreed prices" rows={Object.keys(customer.prices||{}).length?Object.entries(customer.prices||{}).map(([k,v])=>[k,usd2(v)]):[["Prices","List prices apply"]]}/><ProfileSection title="Internal notes" rows={[["Notes",customer.notes||"No notes yet"]]}/></>)}{tab==="Orders"&&<section className="client-tab"><h3>Orders for this customer</h3>{ordersFor.length?ordersFor.map(x=><button className="client-record" key={x.id} onClick={()=>openRecord(x.id)}><span><b>{x.id}</b><small>{num(x.quantity)} bottles · {x.item}</small></span><span><b>{x.status}</b><small>{fmtDue(x.due)}</small></span><em>Open →</em></button>):<p>No orders yet.</p>}</section>}{tab==="Invoices"&&<section className="client-tab"><h3>Quotes and invoices</h3>{docs.length?docs.map(x=><button className="client-record" key={x.id} onClick={()=>openRecord(x.id)}><span><b>{x.id} · {usd2(documentTotal(x))}</b><small>{x.item}</small></span><span><b>{x.status}</b><small>{x.kind}</small></span><em>Open →</em></button>):<p>No documents yet.</p>}</section>}{tab==="Activity"&&<section className="client-tab activity-timeline">{activity.length?activity.map(x=><article key={x.id}><i/><div><small>{x.createdAt}</small><b>{x.title}</b><p>{x.detail}</p><em>By {x.actor}</em></div></article>):<p>No activity yet.</p>}</section>}</div><footer><button className="secondary" onClick={close}>Close</button>{tab==="Profile"&&<button className="primary" onClick={()=>editing?save():setEditing(true)}>{editing?"Save profile":"Edit profile"}</button>}{tab==="Orders"&&<button className="primary" onClick={()=>{close();setModal("order",customer.id)}}>+ New order</button>}{tab==="Invoices"&&<><button className="secondary" onClick={()=>{close();setModal("quote",customer.id)}}>+ Quote</button><button className="primary" onClick={()=>{close();setModal("invoice",customer.id)}}>+ Invoice</button></>}{tab==="Activity"&&<button className="primary" onClick={()=>{const note=prompt("Add a note for this customer");if(note)commit(v=>({...v,activities:[{id:uid("a"),customerId:customer.id,title:"Customer note",detail:note,actor:"Current user",createdAt:now()},...v.activities]}),"activity.create",note)}}>+ Add note</button>}</footer></aside></div>}

// ---------------- NOTIFICATIONS (Chris's) ----------------
export function NotificationCenter({role,unread,close,markRead}:{role:Role;unread:number;close:()=>void;markRead:()=>void}){const{data,setNav,commit}=useApp();return <div className="notification-layer" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><aside className="notification-drawer"><header><div><p className="eyebrow">Live company activity</p><h2>Notifications</h2></div><button className="drawer-close" onClick={close}>×</button></header><div className="notification-tools"><span>{unread} unread</span><button onClick={markRead}>Mark all read</button></div><div className="notification-list">{data.notices.map(n=><button key={n.id} className={n.urgent?"urgent":""} onClick={()=>{commit(v=>({...v,notices:v.notices.map(x=>x.id===n.id?{...x,read:true}:x)}),"notification.read",n.title);setNav(n.target);close()}}><i className="notice-icon">{n.urgent?"!":"✓"}</i><span><b>{n.title}</b><small>{n.detail}</small><em>{n.createdAt}</em></span>{!n.read&&<u aria-label="Unread"/>}</button>)}{!data.notices.length&&<p style={{padding:16,color:"#7b867f"}}>Nothing yet.</p>}</div><footer><button onClick={()=>{setNav(role==="owner"?"Settings & access":"My account");close()}}>Notification settings</button><small>Urgent alerts stay visible until reviewed.</small></footer></aside></div>}
