"use client";
import { useState } from "react";
import { STAGES, STAGE_INVOICED, STAGE_PRODUCTION, STAGE_READY, STAGE_SHIPPED, STAGE_DONE, documentTotal, orderTotals, stageOf, fmtDue} from "../app-data";
import { Kpi, MiniRow, MoneyRow, initials, num, useApp, usd, usd2, type Modal } from "./store";
import { authCall } from "./auth";

export const salesNav=["Order flow","Dashboard","Leads","Customers","Quotes","Invoices","Orders","Production calendar","My account"];

export function SalesView({nav}:{nav:string}){
  const {setModal}=useApp();
  if(nav==="Leads")return <Leads/>;
  if(nav==="Customers")return <Customers/>;
  if(nav==="Quotes")return <DocList kind="quote"/>;
  if(nav==="Invoices")return <DocList kind="invoice"/>;
  if(nav==="Orders")return <OrdersPage/>;
  if(nav==="My account")return <MyAccount/>;
  return <SalesDashboard setModal={setModal}/>;
}

export function SalesDashboard({setModal}:{setModal:(m:Modal)=>void}){
  const {data,openRecord,openCustomer,setNav}=useApp();const [search,setSearch]=useState("");
  const q=search.trim().toLowerCase();
  const matches=q?[...data.customers.filter(c=>c.name.toLowerCase().includes(q)||c.contact.toLowerCase().includes(q)).map(c=>({label:`${c.name} · ${c.kind==="lead"?"Lead":"Customer"} · ${c.balance?usd(c.balance)+" due":"Paid up"}`,go:()=>openCustomer(c.id)})),...data.orders.filter(o=>o.id.toLowerCase().includes(q)||o.item.toLowerCase().includes(q)).map(o=>({label:`${o.id} · Order · ${o.status}`,go:()=>openRecord(o.id)})),...data.documents.filter(d=>d.id.toLowerCase().includes(q)).map(d=>({label:`${d.id} · ${d.kind} · ${d.status}`,go:()=>openRecord(d.id)}))]:[];
  const invoices=data.documents.filter(d=>d.kind==="invoice");const open=invoices.filter(d=>d.status!=="Paid");const overdue=open.filter(d=>/overdue/i.test(d.status));
  const leads=data.customers.filter(c=>c.kind==="lead");const quotes=data.documents.filter(d=>d.kind==="quote"&&!/Accepted|Declined/.test(d.status));
  const monthSales=data.orders.filter(o=>stageOf(o)>=STAGE_SHIPPED).reduce((a,o)=>a+orderTotals(o,data).total,0);
  return <><div className="heading-row"><div><p className="eyebrow">{new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</p><h1>Sales at a glance</h1><p className="intro">Customers, money, and orders that need attention.</p></div><div className="button-row"><button className="secondary" onClick={()=>setModal("quote")}>+ New quote</button><button className="primary" onClick={()=>setModal("order")}>+ New order</button></div></div>
    <div className="site-search"><span>⌕</span><input aria-label="Search the sales site" placeholder="Search customers, leads, orders, quotes, or invoices..." value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button onClick={()=>setSearch("")}>Clear</button>}{search&&<div className="search-results">{matches.length?matches.map(x=><button key={x.label} onClick={()=>{x.go();setSearch("")}}>{x.label}<span>Open →</span></button>):<p>No matches found.</p>}</div>}</div>
    <div className="recap four"><Kpi label="Open leads" value={String(leads.length)} note={`${leads.filter(l=>/today|new/i.test(l.stage)).length} need follow-up`}/><Kpi label="Quotes open" value={usd(quotes.reduce((a,d)=>a+documentTotal(d),0))} note={`${quotes.length} awaiting reply`}/><Kpi label="Customer balances" value={usd(open.reduce((a,d)=>a+documentTotal(d)-d.paid,0))} note={overdue.length?`${usd(overdue.reduce((a,d)=>a+documentTotal(d)-d.paid,0))} overdue`:"nothing overdue"} warn={overdue.length>0}/><Kpi label="Shipped & invoiced" value={usd(monthSales)} note={`${data.orders.filter(o=>stageOf(o)>=STAGE_SHIPPED).length} orders`}/></div>
    <div className="content-grid sales-grid"><article className="panel"><div className="panel-title"><h2>Money to collect</h2><button onClick={()=>setNav("Invoices")}>View invoices</button></div>{open.length?open.slice(0,5).map(d=>{const c=data.customers.find(x=>x.id===d.customerId);return <MoneyRow key={d.id} customer={c?.name||"Customer"} amount={usd(documentTotal(d)-d.paid)} detail={`${d.id} · ${d.status} · due ${fmtDue(d.due)}`} danger={/overdue/i.test(d.status)} onClick={()=>openRecord(d.id)}/>}):<p className="empty-list">Everyone is paid up.</p>}</article>
    <article className="panel"><div className="panel-title"><h2>Shared leads</h2><button onClick={()=>setModal("lead")}>+ Add lead</button></div>{leads.length?leads.map(l=><MiniRow key={l.id} title={l.name} detail={`${l.stage} · Assigned to ${l.rep}`} status={/quote/i.test(l.stage)?"Waiting":/today/i.test(l.stage)?"Hot":"New"} onClick={()=>openCustomer(l.id)}/>):<p className="empty-list">No open leads.</p>}</article></div>
    <article className="panel dashboard-orders"><div className="panel-title"><h2>Orders moving now</h2><button onClick={()=>setNav("Orders")}>See all orders</button></div><OrdersTable compact embedded filter={o=>stageOf(o)<STAGE_DONE}/></article></>;
}

export function OrdersTable({compact=false,embedded=false,filter}:{compact?:boolean;embedded?:boolean;filter?:(o:import("../app-data").OrderRecord)=>boolean}){
  const {data,openRecord}=useApp();const rows=data.orders.filter(filter||(()=>true));
  return <div className={`orders-table ${compact?"compact":""} ${embedded?"embedded":""}`}><div className="table-head"><span>Order</span><span>Customer / items</span><span>Due</span><span>Status</span><span>Payment</span></div>{rows.map(o=>{const c=data.customers.find(x=>x.id===o.customerId);const t=orderTotals(o,data);const st=stageOf(o);const pay=o.payment==="Paid"?"Paid":o.deposit?`${usd(o.deposit)} deposit in`:o.invoiceId?`${usd(t.total)} due`:o.status==="Needs approval"?"Awaiting approval":`${usd(t.total)} · not invoiced`;return <button className="order-line" key={o.id} onClick={()=>openRecord(o.id)}><b>{o.id}</b><span><b>{c?.name}</b><small>{t.lines.map(l=>`${num(l.quantity)} × ${l.item}`).join(" + ")}</small></span><span>{fmtDue(o.due)}</span><em>{o.status==="Needs approval"?"Needs approval":STAGES[st]}</em><strong className={/approval/.test(pay)?"danger":o.payment==="Paid"?"paid":""}>{pay}</strong></button>})}{!rows.length&&<p className="empty-list">No orders yet.</p>}</div>;
}

export function OrdersPage(){
  const {data,setModal}=useApp();const [tab,setTab]=useState<"open"|"all">("open");
  const open=data.orders.filter(o=>stageOf(o)<STAGE_DONE);
  return <><div className="heading-row"><div><p className="eyebrow">Sale to shipment</p><h1>Orders</h1><p className="intro">Customer orders from sale through production, packing, invoice, and payment.</p></div><button className="primary" onClick={()=>setModal("order")}>+ New order</button></div>
    <div className="recap four"><Kpi label="Open" value={String(open.length)}/><Kpi label="In production" value={String(open.filter(o=>stageOf(o)===STAGE_PRODUCTION).length)}/><Kpi label="Ready to pack" value={String(open.filter(o=>stageOf(o)===STAGE_READY).length)} warn={open.some(o=>stageOf(o)===STAGE_READY)}/><Kpi label="Waiting on money" value={usd(open.filter(o=>stageOf(o)===STAGE_INVOICED).reduce((a,o)=>a+orderTotals(o,data).total,0))} warn={open.some(o=>stageOf(o)===STAGE_INVOICED)}/></div>
    <div className="crm-tabs" style={{marginBottom:12}}><button className={tab==="open"?"active":""} onClick={()=>setTab("open")}>Open</button><button className={tab==="all"?"active":""} onClick={()=>setTab("all")}>All</button></div>
    <article className="panel"><OrdersTable filter={tab==="open"?(o=>stageOf(o)<STAGE_DONE):undefined}/></article></>;
}

export function DocList({kind}:{kind:"quote"|"invoice"}){
  const {data,openRecord,setModal}=useApp();const docs=data.documents.filter(x=>x.kind===kind);const title=kind==="quote"?"Quotes":"Invoices";
  const open=docs.filter(d=>d.status!=="Paid"&&d.status!=="Accepted");
  return <><div className="heading-row"><div><p className="eyebrow">Sales documents</p><h1>{title}</h1><p className="intro">{kind==="quote"?"Owner pricing and approved discounts. Accepted quotes become orders with one tap.":"Invoices are created from shipped orders and mirrored to QuickBooks when connected."}</p></div><button className="primary" onClick={()=>setModal(kind)}>{kind==="quote"?"Create quote":"Create invoice"}</button></div>
    <div className="recap"><Kpi label={kind==="quote"?"Open quotes":"Open invoices"} value={String(open.length)}/><Kpi label={kind==="quote"?"Open value":"Owed to us"} value={usd(open.reduce((a,d)=>a+documentTotal(d)-d.paid,0))}/>{kind==="quote"?<Kpi label="Awaiting owner approval" value={String(docs.filter(d=>d.status==="Awaiting approval").length)} warn={docs.some(d=>d.status==="Awaiting approval")}/>:<Kpi label="Overdue" value={String(docs.filter(d=>/overdue/i.test(d.status)).length)} warn={docs.some(d=>/overdue/i.test(d.status))}/>}</div>
    <article className="panel list">{docs.map((r,i)=>{const customer=data.customers.find(c=>c.id===r.customerId);return <button key={r.id} onClick={()=>openRecord(r.id)}><span className="initials">{i+1}</span><span><b>{r.id} · {customer?.name}</b><small>{num(r.quantity||r.cases)} × {r.item} · {kind==="quote"?"good until":"due"} {fmtDue(r.due)}{r.orderId?` · ${r.orderId}`:""}</small></span><span>{usd2(documentTotal(r))} · {r.status} →</span></button>})}{!docs.length&&<p className="empty-list">No {title.toLowerCase()} yet.</p>}</article></>;
}

export function Leads(){
  const {data,openCustomer,setModal}=useApp();const leads=data.customers.filter(x=>x.kind==="lead");
  return <><div className="heading-row"><div><p className="eyebrow">Shared by the team</p><h1>Leads</h1><p className="intro">Every rep sees the same notes, owner, and next step.</p></div><button className="primary" onClick={()=>setModal("lead")}>+ Add lead</button></div><div className="recap"><Kpi label="Open leads" value={String(leads.length)}/><Kpi label="Follow up today" value={String(leads.filter(x=>/today|new/i.test(x.stage)).length)} warn/><Kpi label="Quotes sent" value={String(leads.filter(x=>/quote/i.test(x.stage)).length)}/></div><article className="panel list">{leads.map(x=><button key={x.id} onClick={()=>openCustomer(x.id)}><span className="initials">{initials(x.name)}</span><span><b>{x.name}</b><small>{x.contact} · {x.email||x.phone}</small></span><span><b>{x.rep}</b><small>{x.stage}</small></span></button>)}{!leads.length&&<p className="empty-list">No open leads.</p>}</article></>;
}

export function Customers(){
  const {data,openCustomer,setModal}=useApp();const [search,setSearch]=useState("");const all=data.customers.filter(x=>x.kind==="customer");const filtered=all.filter(x=>`${x.name} ${x.contact} ${x.email} ${x.phone}`.toLowerCase().includes(search.toLowerCase()));
  return <><div className="heading-row"><div><p className="eyebrow">Sales</p><h1>Customers</h1><p className="intro">Import a spreadsheet or add one company at a time.</p></div><div className="button-row"><button className="secondary" onClick={()=>setModal("import")}>Import CSV</button><button className="primary" onClick={()=>setModal("lead")}>+ Add customer</button></div></div><div className="customer-search"><span>⌕</span><input aria-label="Search customers" placeholder="Search by company, contact, phone, or email..." value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button onClick={()=>setSearch("")}>Clear</button>}</div><p className="result-count">{filtered.length} {filtered.length===1?"customer":"customers"}</p><article className="panel list">{filtered.length?filtered.map(x=><button key={x.id} onClick={()=>openCustomer(x.id)}><span className="initials">{initials(x.name)}</span><span><b>{x.name}</b><small>{x.contact} · {x.rep} · {x.terms}</small></span><span>{x.balance?`${usd(x.balance)} due`:"Paid up"} →</span></button>):<div className="empty-list">No customers match.</div>}</article></>;
}

// The production calendar used to live here as a month grid of work orders, beside a separate
// production plan of steps. They were two schedules for one shop and they disagreed. Both are now one
// screen — app/components/prodplan.tsx — routed from page.tsx for every role.

export function MyAccount(){const{authUser,signOut,notify,data}=useApp();const[cur,setCur]=useState("");const[pw,setPw]=useState("");const[pw2,setPw2]=useState("");const[open,setOpen]=useState(false);const[err,setErr]=useState("");
  const change=async()=>{setErr("");if(pw.length<8)return setErr("New password needs at least 8 characters");if(pw!==pw2)return setErr("Passwords don't match");try{await authCall({op:"password",current:cur,password:pw});setOpen(false);setCur("");setPw("");setPw2("");notify("Password updated","My account")}catch(e){setErr(e instanceof Error?e.message:"Could not change password")}};
  const roleName=authUser?.role==="owner"?"Owner":authUser?.role==="sales"?"Sales":"Warehouse";
  return <><p className="eyebrow">Personal settings</p><h1>My account</h1><p className="intro">Your sign-in for {data.settings.company||"the company"}.</p><div className="account-layout"><section className="panel account-card"><div className="account-heading"><div className="large-avatar">{initials(authUser?.name||"?")}</div><div><h2>{authUser?.name}</h2><p>{roleName} · {authUser?.email}</p></div></div><p className="account-copy">Name and email are managed by the owner under Settings &amp; access.</p><button className="secondary" onClick={signOut}>Sign out</button></section><section className="panel account-card"><h2>Password &amp; security</h2><p className="account-copy">Use a password you don&apos;t use anywhere else.</p>{open?<><label>Current password<input type="password" value={cur} onChange={e=>setCur(e.target.value)} autoComplete="current-password"/></label><label>New password<input type="password" value={pw} onChange={e=>setPw(e.target.value)} autoComplete="new-password"/></label><label>Confirm new password<input type="password" value={pw2} onChange={e=>setPw2(e.target.value)} autoComplete="new-password"/></label>{err&&<p className="form-error">{err}</p>}<button className="primary full" onClick={change}>Update password</button></>:<button className="secondary full" onClick={()=>setOpen(true)}>Change password</button>}</section></div></>;
}
