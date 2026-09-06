"use client";
// Order Flow — the whole pipeline on one screen.
//
// This is the view that replaces the Airtable board plus the Slack channel it fed. The point is not to
// list orders (Orders already does that) but to answer, at a glance, WHERE every live order is and
// WHOSE MOVE IT IS. Sales, the floor and the owner all read the same board, which is what kept the
// team in the loop before and is what went missing.
//
// Columns follow the real order of work: quote, invoice, money in, make it, pack it, ship it.
import { STAGES, STAGE_NOTE, STAGE_OWNER, STAGE_DONE, STAGE_SHIPPED, canStartProduction, documentTotal, fmtDue, dueDays, orderTotals, type OrderRecord } from "../app-data";
import { useApp, usd2, num } from "./store";

export const ORDER_FLOW = "Order flow";

export function OrderFlowView(){
  const {data,openRecord,openCustomer,setModal}=useApp();
  const customer=(id:string)=>data.customers.find(c=>c.id===id);
  const invoiceFor=(o:OrderRecord)=>data.documents.find(d=>d.id===o.invoiceId)||data.documents.find(d=>d.kind==="invoice"&&d.orderId===o.id);

  // Finished orders stay out of the way; this board is about live work.
  const live=data.orders.filter(o=>(o.stage??0)<STAGE_DONE);
  const byStage=(n:number)=>live.filter(o=>(o.stage??0)===n);

  // The three things that stall an order, surfaced before the columns so nobody has to hunt.
  const waitingOnMoney=live.filter(o=>(o.stage??0)<=2&&!canStartProduction(o));
  const readyToRelease=live.filter(o=>(o.stage??0)===3&&canStartProduction(o));
  const late=live.filter(o=>{const d=dueDays(o.due);return d!=null&&d<0});

  const card=(o:OrderRecord)=>{
    const cust=customer(o.customerId);
    const inv=invoiceFor(o);
    const t=orderTotals(o,data);
    const total=inv?documentTotal(inv):t.total;
    const paid=inv?(inv.paid||0):(o.deposit||0);
    const owed=Math.max(0,Math.round((total-paid)*100)/100);
    const d=dueDays(o.due);
    const stage=o.stage??0;
    return <button key={o.id} className={`flow-card${d!=null&&d<0?" late":""}`} onClick={()=>openRecord(o.id)}>
      <span className="flow-top"><b>{o.id}</b><em>{usd2(total)}</em></span>
      <span className="flow-cust" onClick={e=>{e.stopPropagation();if(cust)openCustomer(cust.id)}}>{cust?.name||"—"}</span>
      <span className="flow-meta">{num(o.quantity||o.cases)} × {o.item}</span>
      <span className="flow-meta">Needed {fmtDue(o.due)}{d!=null&&d<0?` · ${-d}d late`:d!=null&&d<=3?" · due soon":""}</span>
      {owed>0&&stage<=3&&<span className="flow-owed">{paid>0?`${usd2(paid)} in · ${usd2(owed)} still due`:`${usd2(owed)} to collect`}</span>}
      {stage===3&&canStartProduction(o)&&<span className="flow-go">Ready to release to the floor</span>}
    </button>;
  };

  return <section className="view">
    <div className="heading-row">
      <div>
        <p className="eyebrow">Every live order, and whose move it is</p>
        <h1>Order flow</h1>
        <p className="sub">Quote → invoice → paid → made → packed → shipped. Nothing reaches the floor until a deposit or full payment lands.</p>
      </div>
      <button className="primary" onClick={()=>setModal("order")}>+ New order</button>
    </div>

    <div className="flow-alerts">
      <div className={waitingOnMoney.length?"flow-alert warn":"flow-alert"}>
        <b>{waitingOnMoney.length}</b><span>waiting on money</span>
        <em>{waitingOnMoney.length?"Sales chases these":"Nothing outstanding"}</em>
      </div>
      <div className={readyToRelease.length?"flow-alert go":"flow-alert"}>
        <b>{readyToRelease.length}</b><span>paid, ready for the floor</span>
        <em>{readyToRelease.length?"Release these to production":"Nothing waiting"}</em>
      </div>
      <div className={late.length?"flow-alert late":"flow-alert"}>
        <b>{late.length}</b><span>past the date needed</span>
        <em>{late.length?"Behind — tell the customer":"All on time"}</em>
      </div>
    </div>

    <div className="flow-board">
      {STAGES.map((label,i)=>{
        if(i===STAGE_DONE)return null;                       // finished work lives in Orders
        const col=byStage(i);
        return <div className="flow-col" key={label}>
          <div className="flow-col-head">
            <span className="flow-col-name">{label}</span>
            <span className="flow-col-count">{col.length}</span>
          </div>
          <p className="flow-col-who"><i className={`who who-${STAGE_OWNER[i].toLowerCase()}`}/>{STAGE_OWNER[i]}</p>
          <p className="flow-col-note">{STAGE_NOTE[i]}</p>
          <div className="flow-col-body">
            {col.length?col.map(card):<p className="flow-empty">—</p>}
          </div>
        </div>;
      })}
    </div>

    <p className="flow-foot">Shipped orders stay here until the balance is collected and they are marked done. Everything finished is under Orders.</p>
  </section>;
}
