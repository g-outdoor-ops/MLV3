"use client";
import { useState } from "react";
import { DEFAULT_SHIP, STAGES, fmtDay, freeStock, int, money, orderTotals, stageOf, type AppData, type Customer, type DocumentRecord, type OrderLine, type OrderRecord, type WorkOrder } from "../app-data";
import { Icon, Note, Pill, nextId, nowLabel, uid, useStore, type Tone } from "./ui";

const stockTone=(free:number,reorder:number):Tone=>free<0?"bad":free<reorder*0.5?"warn":"ok";
const invRow=(d:AppData,item:string)=>d.inventory.find(i=>i.item===item);
const in30=()=>{const d=new Date();d.setDate(d.getDate()+30);return fmtDay(d)};
const firstName=(c?:Customer)=>c?.contact?.split(" ")[0]||"the customer";

// =============================================================== HOME
export function SalesHome({name}:{name:string}){
  const {data,go}=useStore();
  const open=data.orders.filter(o=>stageOf(o)<6);
  const hr=new Date().getHours();const greet=hr<12?"Good morning":hr<17?"Good afternoon":"Good evening";
  const tiles=[["plus","New Order","Take an order, add shipping and notes","sales/order"],["box","Check Stock","What can we promise today?","sales/stock"],["people","Customers","Contacts, prices, history","sales/customers"],["tag","Make a Quote","Price a job and email it","sales/quote"]];
  const today=data.notices.filter(n=>!n.read).slice(0,4);
  return <main><div className="row"><div className="grow">
    <h1>{greet}, {name}.</h1><div className="sub">What would you like to do?</div>
    <div className="tiles">{tiles.map(t=><button key={t[1]} className="tile" onClick={()=>go(t[3])}><span className="ic"><Icon name={t[0]} size={32}/></span><span><span className="t">{t[1]}</span><br/><span className="s">{t[2]}</span></span></button>)}</div>
    <h2 style={{marginTop:32}}>Open orders</h2>
    <div className="card wrapx" style={{marginTop:12,padding:"0 10px"}}><table className="tbl"><thead><tr><th>Order</th><th>Customer</th><th>Where it is</th><th>Needed</th><th className="n">Total</th><th></th></tr></thead><tbody>
      {open.map(o=>{const c=data.customers.find(x=>x.id===o.customerId);const st=stageOf(o);return <tr key={o.id} className="click" onClick={()=>go(`sales/so/${o.id}`)}><td><b>{o.id}</b></td><td>{c?.name}</td><td><Pill tone={st>=3?"":"mute"}>{STAGES[st]}</Pill></td><td>{o.due}</td><td className="n">{money(orderTotals(o,data).total)}</td><td style={{textAlign:"right",color:"var(--green)",fontWeight:600}}>{st===4&&!o.invoiceId?"Send invoice →":"Open →"}</td></tr>})}
      {!open.length&&<tr><td colSpan={6} className="empty">No open orders. Tap New Order to take one.</td></tr>}
    </tbody></table></div>
  </div><aside className="side"><h2>Today · {new Date().toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}</h2>
    <div className="card">{today.length?today.map(n=><div key={n.id} className="li"><span className={`dot ${n.urgent?"warn":""}`}></span><div><b>{n.title}</b><div className="s">{n.detail}</div></div></div>):<div className="empty">Nothing waiting on you.</div>}</div>
    <div style={{display:"flex",gap:10,color:"var(--muted)",fontSize:16,padding:"4px 6px"}}><Icon name="phone" size={20}/><span>Stuck? Call Chris. Nothing here deletes — every step has Back or Undo.</span></div>
  </aside></div></main>;
}

// =============================================================== ORDER WIZARD (orders and quotes)
type Draft={custId:string|null;qty:Record<string,number>;when:string;ship:string|null;disc:number;notes:string;invNote:string};
const STEP_LABELS=["Who","What","When","Shipping & price","Check"];
function Steps({n}:{n:number}){return <div className="steps">{STEP_LABELS.map((l,i)=><span key={l} style={{display:"contents"}}><div className={`step ${i+1<n?"done":i+1===n?"now":""}`}><i>{i+1<n?<Icon name="check" size={18}/>:i+1}</i>{l}</div>{i<4&&<div className="sep"></div>}</span>)}</div>}

export function OrderWizard({mode="order",presetCustomer,presetQty}:{mode?:"order"|"quote";presetCustomer?:string;presetQty?:Record<string,number>}){
  const {data,commit,toast,go,user}=useStore();
  const [d,setD]=useState<Draft>({custId:presetCustomer||null,qty:presetQty||{},when:"",ship:null,disc:0,notes:"",invNote:""});
  const [step,setStep]=useState(presetCustomer?2:1);
  const [q,setQ]=useState("");
  const cust=data.customers.find(c=>c.id===d.custId);
  const finished=data.itemRates.filter(r=>r.kind!=="raw");
  const ships=data.settings.shipMethods||DEFAULT_SHIP;
  const lines:OrderLine[]=finished.filter(p=>d.qty[p.item]).map(p=>({item:p.item,quantity:d.qty[p.item],rate:cust?.prices?.[p.item]??p.rate}));
  const draftOrder:OrderRecord={id:"draft",customerId:cust?.id||"",item:lines[0]?.item||"",cases:0,quantity:lines.reduce((a,l)=>a+l.quantity,0),due:d.when,status:"Placed",payment:"",lines,shipMethod:d.ship||undefined,discount:d.disc,notes:d.notes,invoiceNote:d.invNote};
  const t=orderTotals(draftOrder,data);
  const short=lines.filter(l=>{const r=invRow(data,l.item);return r&&l.quantity>freeStock(r)});
  const nItems=lines.reduce((a,l)=>a+l.quantity,0);
  const title=mode==="quote"?`Quote${cust?" for "+cust.name:""}`:`New order${cust?" for "+cust.name:""}`;
  const set=(p:Partial<Draft>)=>setD(x=>({...x,...p}));
  const chg=(item:string,delta:number)=>{const cur=d.qty[item]||0;const nx=Math.max(0,cur+delta);const qty={...d.qty};if(nx)qty[item]=nx;else delete qty[item];set({qty})};

  const addCustomer=(name:string)=>{const id=uid("c");const c:Customer={id,name:name.replace(/\b\w/g,m=>m.toUpperCase()),kind:"customer",contact:"—",email:"",phone:"—",rep:user,stage:"Active",balance:0,lifetimeSales:0,billing:"",delivery:"",terms:"Due on receipt",notes:`Added by ${user}.`,prices:{},qb:false};commit(v=>({...v,customers:[...v.customers,c]}),"customer.create",`${c.name} added`);set({custId:id});setQ("");toast(`Added ${c.name}. They'll be created in QuickBooks with the first invoice.`)};

  const place=()=>{
    if(!cust)return;
    const id=nextId("SO-",data.orders.map(o=>o.id),1187);
    const rec:OrderRecord={id,customerId:cust.id,item:lines.map(l=>l.item).join(" + "),cases:t.cases,quantity:nItems,due:d.when,status:"Placed",payment:cust.terms,lines,shipMethod:d.ship||"pickup",shipping:t.ship,discount:d.disc,notes:d.notes,invoiceNote:d.invNote,stage:0,rep:user,createdAt:new Date().toISOString()};
    const newWOs:WorkOrder[]=short.map((l,i)=>{const r=invRow(data,l.item)!;const need=l.quantity-Math.max(0,freeStock(r));return {id:nextId("WO-",[...data.workOrders.map(w=>w.id),...Array(i).fill(0).map((_,k)=>`WO-${1000+k}`)],116).replace(/\d+$/,m=>String(parseInt(m,10)+i)),orderId:id,item:l.item,quantity:Math.ceil(need/100)*100+100,good:0,scrap:0,packed:0,date:new Date().toISOString().slice(0,10),status:"Needs scheduling",purpose:`${cust.name} order`,line:"Line 1",days:1}});
    const needsOk=d.disc>(data.settings.discountApproval??5);
    commit(v=>({...v,
      orders:[rec,...v.orders],
      workOrders:[...v.workOrders,...newWOs],
      inventory:v.inventory.map(row=>{const l=lines.find(x=>x.item===row.item);return l?{...row,committed:row.committed+l.quantity}:row}),
      customers:v.customers.map(c=>c.id===cust.id&&c.kind==="lead"?{...c,kind:"customer",stage:"Active"}:c),
      notices:[{id:uid("n"),title:`New order ${id} · ${cust.name}`,detail:`${lines.map(l=>int(l.quantity)+" × "+l.item).join(" + ")} · needed ${d.when}${newWOs.length?" · "+newWOs.map(w=>w.id).join(", ")+" needs a slot":""}${needsOk?` · ${d.disc}% discount needs your OK`:""}`,urgent:newWOs.length>0||needsOk,read:false,createdAt:nowLabel(),target:"Orders"},...v.notices],
      activities:[{id:uid("a"),customerId:cust.id,title:"Order placed",detail:`${id} · ${money(t.total)}`,actor:user,createdAt:nowLabel()},...v.activities]}),"order.create",`${id} placed for ${cust.name}`);
    go(`sales/so/${id}`);
    toast(`Order ${id} placed for ${cust.name} — ${money(t.total)}.${newWOs.length?" Work order "+newWOs.map(w=>w.id).join(", ")+" created for Chris.":""}`);
  };
  const sendQuote=()=>{
    if(!cust)return;const id=nextId("Q-",data.documents.filter(x=>x.kind==="quote").map(x=>x.id),2040);
    const under=lines.some(l=>l.rate<(data.itemRates.find(r=>r.item===l.item)?.floor??0));
    const doc:DocumentRecord={id,kind:"quote",customerId:cust.id,orderId:undefined,item:lines.map(l=>l.item).join(" + "),cases:t.cases,quantity:nItems,rate:lines[0]?.rate||0,discount:d.disc,shipping:t.ship,status:under?"Awaiting approval":"Sent",due:in30(),paid:0,note:d.invNote};
    commit(v=>({...v,documents:[doc,...v.documents],customers:v.customers.map(c=>c.id===cust.id&&c.kind==="lead"?{...c,stage:"Quote sent"}:c),notices:under?[{id:uid("n"),title:`Quote ${id} needs your approval`,detail:`${cust.name} · price under the floor`,urgent:true,read:false,createdAt:nowLabel(),target:"Money"},...v.notices]:v.notices,activities:[{id:uid("a"),customerId:cust.id,title:under?"Quote sent for approval":"Quote emailed",detail:`${id} · ${money(t.total)}`,actor:user,createdAt:nowLabel()},...v.activities]}),"quote.create",`${id} for ${cust.name}`);
    go("sales");toast(under?`${id} sent to Chris for approval — it goes to ${firstName(cust)} when he says yes.`:`Quote ${id} emailed to ${cust.contact}.`);
  };

  let body:React.ReactNode;
  if(step===1){
    const list=data.customers.filter(c=>!q||c.name.toLowerCase().includes(q.toLowerCase())||c.phone.includes(q));
    body=<><h1>Who is this {mode} for?</h1><div className="sub">Tap the customer, or type a name to add one.</div>
      <div className="search" style={{marginTop:20}}><Icon name="search" size={22}/><input placeholder="Type a name or phone number…" value={q} onChange={e=>setQ(e.target.value)}/></div>
      <div className="clist">{list.map(c=><button key={c.id} className={`cbtn ${d.custId===c.id?"on":""}`} onClick={()=>set({custId:c.id})}>{c.name}<small>{c.kind==="lead"?"Lead · ":""}{c.terms}{c.qb?" · in QuickBooks":" · not in QuickBooks yet"}</small></button>)}{!list.length&&q&&<button className="cbtn" onClick={()=>addCustomer(q)}><Icon name="plus"/> Add “{q}” as a new customer</button>}</div>
      <div className="nav"><button className="btn sec" onClick={()=>go("sales")}><Icon name="back"/> Cancel</button><button className="btn" disabled={!cust} onClick={()=>setStep(2)}>Next: What are they ordering?</button></div></>;
  } else if(step===2){
    body=<><h1>What are they ordering?</h1><div className="sub">Tap + or −, or type the number. “Free” means on the shelf and not promised to anyone else.</div>
      <div className="plist">{finished.map(p=>{const row=invRow(data,p.item);const free=row?freeStock(row):0;const qv=d.qty[p.item]||0;const stepBy=(p.unitsPerCase||2)>10?10:50;return <div key={p.id} className={`prow ${qv?"on":""}`}><div className="l"><span className="ic"><Icon name="box" size={28}/></span><div><div className="n">{p.item.split(" · ")[0]} <span>{p.sub||p.item.split(" · ")[1]}</span></div><Pill tone={qv>free?"warn":stockTone(free,row?.reorder||100)}>{free>0?int(free)+" free":"none free"}{qv>free?" · will need a run":""}</Pill></div></div>
        <div className="qty"><button aria-label="fewer" onClick={()=>chg(p.item,-stepBy)}><Icon name="minus"/></button><input type="number" min={0} value={qv||""} placeholder="0" onChange={e=>{const n=Math.max(0,parseInt(e.target.value)||0);const qty={...d.qty};if(n)qty[p.item]=n;else delete qty[p.item];set({qty})}}/><button aria-label="more" onClick={()=>chg(p.item,stepBy)}><Icon name="plus"/></button></div></div>})}</div>
      <div className="nav"><button className="btn sec" onClick={()=>setStep(1)}><Icon name="back"/> Back</button><div style={{display:"flex",gap:18,alignItems:"center",flexWrap:"wrap"}}><span style={{color:"var(--muted)"}}>{int(nItems)} items</span><button className="btn" disabled={!nItems} onClick={()=>setStep(3)}>Next: When do they need it?</button></div></div></>;
  } else if(step===3){
    const days=[0,1,2,3,4,7,14].map(n=>{const x=new Date();x.setDate(x.getDate()+n);return {n,label:n===0?"Today":n===1?"Tomorrow":x.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"}),val:fmtDay(x)}});
    body=<><h1>When do they need it?</h1><div className="sub">The schedule plans around this date.</div>
      <div className="clist">{days.map(x=><button key={x.n} className={`cbtn ${d.when===x.val?"on":""}`} onClick={()=>set({when:x.val})}>{x.label}<small>{x.n<=1?(short.length?"Needs a production run first":"On the shelf — yes"):x.n<=4?"Comfortable":"Plenty of time"}</small></button>)}</div>
      {short.length>0&&<div style={{marginTop:20}}><Note tone="warn" icon="clock" big={`${short.map(l=>l.item).join(", ")} needs a run.`}>Only {short.map(l=>int(Math.max(0,freeStock(invRow(data,l.item)!)))).join(" / ")} free right now. Placing this creates a work order for Chris; he confirms the date on the schedule.</Note></div>}
      <div className="nav"><button className="btn sec" onClick={()=>setStep(2)}><Icon name="back"/> Back</button><button className="btn" disabled={!d.when} onClick={()=>setStep(4)}>Next: Shipping &amp; price</button></div></>;
  } else if(step===4){
    const limit=data.settings.discountApproval??5;
    body=<><h1>Shipping, discount and notes</h1><div className="sub">Pick how it gets there. Everything else is optional.</div>
      <div className="split" style={{marginTop:22}}><div style={{display:"flex",flexDirection:"column",gap:22}}>
        <div className="field"><span className="lbl">How does it get to {cust?.name.split(" ")[0]}?</span><div className="opt">{ships.map(s=><button key={s.id} className={d.ship===s.id?"on":""} onClick={()=>set({ship:s.id})}><span>{s.name}<small>{s.sub}</small></span><b>{s.perCase?`${money(s.perCase)} / box · ${t.cases} boxes`:s.rate?money(s.rate):"Free"}</b></button>)}</div></div>
        <div className="field"><span className="lbl">Discount</span><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{[0,2,5,10].map(x=><button key={x} className={`sbtn ${d.disc===x?"pri":""}`} onClick={()=>set({disc:x})}>{x?x+"% off":"None"}</button>)}<input className="inp" style={{width:120,height:42,fontSize:16}} type="number" placeholder="other %" value={[0,2,5,10].includes(d.disc)?"":d.disc} onChange={e=>set({disc:Math.min(50,Math.max(0,parseFloat(e.target.value)||0))})}/></div>{d.disc>limit&&<div style={{color:"var(--amber)",fontSize:15,fontWeight:600}}>Over {limit}% — Chris gets a note to approve. The {mode} still goes through.</div>}</div>
        <div className="field"><label htmlFor="wh-note">Note for the warehouse (not shown to the customer)</label><textarea id="wh-note" className="inp" placeholder="e.g. Double-wrap the pallet. Cap in handle." value={d.notes} onChange={e=>set({notes:e.target.value})}/></div>
        <div className="field"><label htmlFor="cust-note">Note on the {mode==="quote"?"quote":"invoice"} (customer sees this)</label><input id="cust-note" className="inp" placeholder="e.g. PO #4471 · Thank you, Carlos" value={d.invNote} onChange={e=>set({invNote:e.target.value})}/></div>
      </div><div className="sum"><div><span style={{color:"var(--muted)"}}>Items</span><span>{money(t.sub)}</span></div><div><span style={{color:"var(--muted)"}}>Discount {d.disc?d.disc+"%":""}</span><span>{d.disc?"− "+money(t.disc):"—"}</span></div><div><span style={{color:"var(--muted)"}}>Shipping</span><span>{d.ship?(t.ship?money(t.ship):"Free"):"pick above"}</span></div><div className="tot"><span>Total</span><span>{money(t.total)}</span></div><div style={{color:"var(--muted)",fontSize:15}}><span>Payment</span><span>{cust?.terms}{cust?.terms.includes("Card")?"":" · invoice via QuickBooks"}</span></div></div></div>
      <div className="nav"><button className="btn sec" onClick={()=>setStep(3)}><Icon name="back"/> Back</button><button className="btn" disabled={!d.ship} onClick={()=>setStep(5)}>Next: Check everything</button></div></>;
  } else {
    const sm=ships.find(s=>s.id===d.ship);
    body=<><h1>Does this look right?</h1><div className="sub">Nothing is sent until you press the green button.</div>
      <div className="card" style={{marginTop:20}}>
        <div className="kv"><div className="k">Customer</div><div className="v">{cust?.name}<small>{cust?.contact} · {cust?.phone} · {cust?.delivery||cust?.billing}</small></div><button className="btn link" onClick={()=>setStep(1)}>Change</button></div>
        <div className="kv"><div className="k">Items</div><div className="v">{lines.map(l=><span key={l.item}>{int(l.quantity)} × {l.item}<small>{money(l.rate)} each{cust?.prices?.[l.item]?" — their price":""}</small></span>)}</div><button className="btn link" onClick={()=>setStep(2)}>Change</button></div>
        <div className="kv"><div className="k">Needed by</div><div className="v">{d.when}<small>{short.length?"A work order will be created — Chris confirms the date.":"Everything is free on the shelf."}</small></div><button className="btn link" onClick={()=>setStep(3)}>Change</button></div>
        <div className="kv"><div className="k">Shipping</div><div className="v">{sm?.name}<small>{t.ship?money(t.ship):"Free"}{d.disc?` · ${d.disc}% discount`:""}{d.notes?" · warehouse note added":""}{d.invNote?" · customer note added":""}</small></div><button className="btn link" onClick={()=>setStep(4)}>Change</button></div>
        <div className="kv"><div className="k">Total</div><div className="v">{money(t.total)}<small>{cust?.terms}</small></div><span></span></div>
      </div>
      <div style={{marginTop:18}}>{mode==="order"?<Note icon="check">The warehouse gets it now and {firstName(cust)} gets a confirmation. The invoice is created when it ships — you&apos;ll see a “Send invoice” button on the order.</Note>:<Note icon="check">{firstName(cust)} gets the quote by email, good for 30 days. When they say yes, one tap turns it into an order.</Note>}</div>
      <div className="nav"><button className="btn sec" onClick={()=>setStep(4)}><Icon name="back"/> Back</button>{mode==="order"?<button className="btn big" onClick={place}><Icon name="check" size={26}/> Place this order</button>:<button className="btn big" onClick={sendQuote}><Icon name="tag" size={26}/> Email this quote</button>}</div></>;
  }
  return <main><div className="wiz" style={{maxWidth:1040}}><div style={{fontSize:15,color:"var(--muted)",fontWeight:600,marginBottom:10}}>{title}</div><Steps n={step}/>{body}</div></main>;
}

// =============================================================== ORDER DETAIL (Bob and Chris)
export function OrderDetail({id}:{id:string}){
  const {data,commit,toast,go,role,user}=useStore();
  const o=data.orders.find(x=>x.id===id);
  if(!o)return <main><h1>Order not found</h1><div className="nav" style={{justifyContent:"flex-start"}}><button className="btn sec" onClick={()=>go(role==="owner"?"owner/orders":"sales")}>Back</button></div></main>;
  const c=data.customers.find(x=>x.id===o.customerId);const t=orderTotals(o,data);const st=stageOf(o);const sm=(data.settings.shipMethods||DEFAULT_SHIP).find(s=>s.id===o.shipMethod);
  const inv=data.documents.find(x=>x.id===o.invoiceId);const wos=data.workOrders.filter(w=>w.orderId===o.id);const owner=role==="owner";
  const setStage=(n:number)=>commit(v=>({...v,orders:v.orders.map(x=>x.id===o.id?{...x,stage:n,status:STAGES[n]}:x),activities:[{id:uid("a"),customerId:o.customerId,title:STAGES[n],detail:`${o.id} moved to ${STAGES[n]}`,actor:user,createdAt:nowLabel()},...v.activities]}),"order.stage",`${o.id} → ${STAGES[n]}`);
  const makeInvoice=(paidNow=false)=>{
    const invId=nextId("INV-",data.documents.filter(x=>x.kind==="invoice").map(x=>x.id),1042);
    const doc:DocumentRecord={id:invId,kind:"invoice",customerId:o.customerId,orderId:o.id,item:t.lines.map(l=>l.item).join(" + "),cases:t.cases,quantity:o.quantity,rate:t.lines[0]?.rate||0,discount:o.discount||0,shipping:t.ship,status:paidNow?"Paid":"Sent",due:paidNow?"—":in30(),paid:paidNow?t.total:0,qbSynced:true,note:o.invoiceNote};
    commit(v=>({...v,documents:[doc,...v.documents],orders:v.orders.map(x=>x.id===o.id?{...x,invoiceId:invId,stage:paidNow?6:5,status:paidNow?"Paid":"Invoiced",payment:paidNow?"Paid":`${money(t.total)} due`}:x),customers:v.customers.map(x=>x.id===o.customerId?{...x,qb:true,balance:x.balance+(paidNow?0:t.total),lifetimeSales:x.lifetimeSales+t.total}:x),activities:[{id:uid("a"),customerId:o.customerId,title:paidNow?"Paid by card":"Invoice created",detail:`${invId} · ${money(t.total)} · QuickBooks`,actor:user,createdAt:nowLabel()},...v.activities]}),"invoice.create",`${invId} for ${o.id}`);
    toast(paidNow?`Card payment of ${money(t.total)} recorded. ${invId} marked paid in QuickBooks.`:`${invId} created in QuickBooks and emailed to ${c?.contact}.`);
  };
  const recordPayment=()=>commit(v=>({...v,documents:v.documents.map(x=>x.id===o.invoiceId?{...x,status:"Paid",paid:t.total}:x),orders:v.orders.map(x=>x.id===o.id?{...x,stage:6,status:"Paid",payment:"Paid"}:x),customers:v.customers.map(x=>x.id===o.customerId?{...x,balance:Math.max(0,x.balance-t.total)}:x),activities:[{id:uid("a"),customerId:o.customerId,title:"Payment received",detail:`${o.invoiceId} · ${money(t.total)}`,actor:user,createdAt:nowLabel()},...v.activities]}),"payment.record",`${o.invoiceId} paid`);
  const editNote=()=>{const n=window.prompt("Note for the warehouse:",o.notes||"");if(n===null)return;commit(v=>({...v,orders:v.orders.map(x=>x.id===o.id?{...x,notes:n}:x)}),"order.note",`${o.id} note`);toast("Note saved — the floor sees it now.")};
  const next=st<STAGES.length-1?STAGES[st+1]:null;
  return <main><div className="split"><div style={{display:"flex",flexDirection:"column",gap:18}}>
    <div><h1>{c?.name}</h1><div className="sub">{c?.contact} · {c?.phone} · needed {o.due}{o.rep?` · taken by ${o.rep}`:""}</div></div>
    <div className="pipe">{STAGES.map((s,i)=><span key={s} className={i<st?"done":i===st?"now":""}>{i<st&&<Icon name="check" size={14}/>}{s}</span>)}</div>
    <div className="card">
      <div className="kv"><div className="k">Items</div><div className="v">{t.lines.map(l=><span key={l.item}>{int(l.quantity)} × {l.item}<small>{money(l.rate)} each</small></span>)}</div></div>
      <div className="kv"><div className="k">Shipping</div><div className="v">{sm?.name||"—"}<small>{t.ship?money(t.ship):"Free"}{sm?" · "+sm.sub:""}</small></div></div>
      {!!o.discount&&<div className="kv"><div className="k">Discount</div><div className="v">{o.discount}%<small>− {money(t.disc)}</small></div></div>}
      <div className="kv"><div className="k">Notes</div><div className="v" style={{fontWeight:400,fontSize:17}}>{o.notes||<span style={{color:"var(--muted)"}}>No warehouse note</span>}{o.invoiceNote&&<small>On invoice: {o.invoiceNote}</small>}<small><button className="btn link" style={{fontSize:15}} onClick={editNote}>Add or change note</button></small></div></div>
      <div className="kv"><div className="k">Production</div><div className="v">{wos.length?wos.map(w=><span key={w.id}>{w.id}<small>{w.status} · {int(w.good)} of {int(w.quantity)} made · {w.line}</small></span>):<>From stock<small>No run needed</small></>}</div>{owner&&wos.length>0&&<button className="btn link" onClick={()=>go(`owner/wo/${wos[0].id}`)}>Open</button>}</div>
      <div className="kv"><div className="k">Total</div><div className="v">{money(t.total)}<small>{c?.terms}</small></div></div>
    </div>
    {owner&&next&&st<4&&<div style={{display:"flex",gap:10,flexWrap:"wrap"}}><button className="sbtn pri" onClick={()=>{setStage(st+1);toast(`${o.id} moved to ${next}.`)}}>Mark as {next}</button>{st===2&&wos[0]&&<button className="sbtn" onClick={()=>go(`owner/qc/${wos[0].id}`)}>Open quality check</button>}</div>}
  </div><aside style={{display:"flex",flexDirection:"column",gap:14}}><div className="card pad" style={{display:"flex",flexDirection:"column",gap:14}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}><h2>Invoice &amp; payment</h2>{data.settings.quickBooks.connected?<span className="qb"><i></i>QuickBooks connected</span>:<Pill tone="warn">QuickBooks not connected</Pill>}</div>
    {!o.invoiceId?(st>=4?<><p style={{margin:0,color:"var(--muted)"}}>Shipped. Create the invoice in QuickBooks with one tap — customer, items, discount and shipping go across exactly as they are here.</p><button className="btn" onClick={()=>makeInvoice(false)}><Icon name="doc"/> Create invoice in QuickBooks</button></>
      :<><p style={{margin:0,color:"var(--muted)"}}>The invoice button appears once the order is marked Shipped (or Ready, for pickups).{c?.terms.includes("Card")?" This customer pays by card at pickup — you can take payment then.":""}</p>{c?.terms.includes("Card")&&st>=3&&<button className="btn" onClick={()=>makeInvoice(true)}><Icon name="dollar"/> Take card payment · {money(t.total)}</button>}</>)
    :<><div className="sum" style={{border:0,padding:0}}><div><span style={{color:"var(--muted)"}}>Invoice</span><b>{o.invoiceId}</b></div><div><span style={{color:"var(--muted)"}}>Amount</span><b>{money(t.total)}</b></div><div><span style={{color:"var(--muted)"}}>Status</span><Pill tone={st===6?"":"warn"}>{st===6?"Paid":inv?.status||"Sent"}</Pill></div><div><span style={{color:"var(--muted)"}}>QuickBooks</span><span style={{color:"var(--green)",fontWeight:600}}>Synced ✓</span></div></div>
      {st<6&&<div style={{display:"flex",flexDirection:"column",gap:8}}><button className="btn" onClick={()=>toast(`Payment link emailed to ${c?.contact} — card or ACH.`)}><Icon name="link"/> Send payment link</button><button className="btn sec" onClick={()=>{recordPayment();toast(`Payment recorded — ${o.invoiceId} is paid.`)}}>Record a payment</button><button className="btn sec" onClick={()=>toast(`Invoice PDF re-sent to ${c?.contact}.`)}>Re-send invoice</button></div>}</>}
  </div><div style={{color:"var(--muted)",fontSize:15,padding:"0 6px"}}>Invoices, payments and customer records live in QuickBooks; this screen drives them so nobody types anything twice.</div></aside></div></main>;
}

// =============================================================== STOCK
export function StockCheck(){
  const {data,go}=useStore();const [q,setQ]=useState("Can we ship 400 five-gallon by Friday?");const [asked,setAsked]=useState(q);
  const finished=data.itemRates.filter(r=>r.kind!=="raw");
  const answer=(text:string)=>{const t=text.toLowerCase();const m=t.match(/(\d[\d,]*)/);const n=m?parseInt(m[1].replace(/,/g,""),10):null;
    const p=finished.find(r=>/silicone/.test(t)&&/silicone/i.test(r.item))||finished.find(r=>/(no|without|empty)\s*cap/.test(t)&&/no cap/i.test(r.item))||finished.find(r=>/\bcaps?\b|lids?/.test(t)&&!/gallon|gal\b/.test(t)&&/screw/i.test(r.item))||finished.find(r=>/\b(3|three)[\s-]*(gal|gallon)/.test(t)&&/^3-/i.test(r.item))||finished.find(r=>/(gallon|bottle|\b5\b|five)/.test(t)&&/^5-Gallon Bottle · 2/i.test(r.item));
    if(!p)return {tone:"warn" as Tone,big:"I didn't catch which product.",txt:'Try "300 three-gallon by Thursday" or "do we have silicone caps".'};
    const row=invRow(data,p.item);const free=row?freeStock(row):0;const day=(t.match(/mon|tue|wed|thu|fri|sat|sun|today|tomorrow/)||[""])[0];const dn:Record<string,string>={mon:"Monday",tue:"Tuesday",wed:"Wednesday",thu:"Thursday",fri:"Friday",sat:"Saturday",sun:"Sunday",today:"today",tomorrow:"tomorrow"};const by=dn[day]?` by ${dn[day]}`:"";
    if(n==null)return {tone:stockTone(free,row?.reorder||100),big:`${int(Math.max(0,free))} ${p.item} free — ${int(row?.onHand||0)} on the shelf, ${int(row?.committed||0)} promised.`,txt:"“Free” is what nobody else has claimed yet."};
    if(n<=free)return {tone:"ok" as Tone,big:`Yes — ${int(n)} free${by}.`,txt:`${int(row?.onHand||0)} on the shelf, ${int(row?.committed||0)} already promised to other orders.`};
    const w=data.workOrders.find(w=>w.item===p.item&&w.status!=="Done");return {tone:"warn" as Tone,big:`Only ${int(Math.max(0,free))} free — ${int(n)} needs a run.`,txt:w?`${w.id} (${int(w.quantity)} pcs) is ${w.status.toLowerCase()} on ${w.line}. Place the order and Chris confirms the date.`:"Place the order and a work order goes to Chris."}};
  const a=answer(asked);
  return <main><div className="row"><div className="grow"><h1>What we can promise</h1>
    <div className="card wrapx" style={{marginTop:18,padding:"0 10px"}}><table className="tbl"><thead><tr><th>Product</th><th className="n">On shelf</th><th className="n">Promised</th><th className="n">Free</th><th>Next run</th></tr></thead><tbody>{finished.map(p=>{const row=invRow(data,p.item);const free=row?freeStock(row):0;const tone=stockTone(free,row?.reorder||100);const w=data.workOrders.find(w=>w.item===p.item&&w.status!=="Done");return <tr key={p.id}><td style={{fontWeight:600,fontSize:18}}>{p.item}</td><td className="n">{int(row?.onHand||0)}</td><td className="n" style={{color:"var(--muted)"}}>{int(row?.committed||0)}</td><td className="n" style={{fontSize:24,fontWeight:700,color:`var(--${tone==="ok"?"green":tone==="warn"?"amber":"red"})`}}>{int(free)}</td><td style={{color:"var(--muted)",fontSize:16}}>{w?`${w.id} · ${int(w.quantity)} · ${w.status}`:"—"}</td></tr>})}</tbody></table></div></div>
  <aside className="side"><h2>Ask a quick question</h2><form onSubmit={e=>{e.preventDefault();setAsked(q)}} style={{display:"flex",gap:10}}><div className="search" style={{flex:1}}><Icon name="search" size={22}/><input value={q} onChange={e=>setQ(e.target.value)}/></div><button className="btn">Check</button></form>
    <Note tone={a.tone} icon={a.tone==="ok"?"check":"clock"} big={a.big}>{a.txt}</Note><button className="btn sec" onClick={()=>go("sales/order")}><Icon name="plus"/> Start an order for this</button></aside></div></main>;
}

// =============================================================== CUSTOMERS
export function Customers({selected}:{selected?:string}){
  const {data,go}=useStore();const [q,setQ]=useState("");
  const list=data.customers.filter(c=>!q||c.name.toLowerCase().includes(q.toLowerCase())||c.phone.includes(q));
  const c=data.customers.find(x=>x.id===selected)||list[0];
  const orders=c?data.orders.filter(o=>o.customerId===c.id):[];const acts=c?data.activities.filter(a=>a.customerId===c.id).slice(0,5):[];
  return <main><div className="search" style={{maxWidth:560}}><Icon name="search" size={22}/><input placeholder="Type a name or phone number…" value={q} onChange={e=>setQ(e.target.value)}/></div>
    <div className="clist" style={{gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))"}}>{list.map(x=><button key={x.id} className={`cbtn ${c&&x.id===c.id?"on":""}`} style={{fontSize:18,padding:"14px 16px"}} onClick={()=>go(`sales/customers/${x.id}`)}>{x.name}<small>{x.kind==="lead"?"Lead · "+x.stage:x.terms}</small></button>)}</div>
    {c&&<div className="split" style={{marginTop:24}}><div className="card pad" style={{display:"flex",flexDirection:"column",gap:18}}><div style={{fontSize:28,fontWeight:700}}>{c.name}</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}><div style={{display:"flex",gap:12}}><Icon name="people" size={22}/>{c.contact}</div><div style={{display:"flex",gap:12}}><Icon name="phone" size={22}/>{c.phone}{c.email?` · ${c.email}`:""}</div><div style={{display:"flex",gap:12}}><Icon name="truck" size={22}/>{c.delivery||c.billing||"—"}</div></div>
      {c.notes&&<div style={{padding:"16px 18px",background:"var(--amber-l)",borderRadius:12}}><div style={{fontSize:14,fontWeight:700,color:"var(--amber)",textTransform:"uppercase",letterSpacing:".06em"}}>Good to know</div><div style={{marginTop:4}}>{c.notes}</div></div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}><span style={{color:"var(--muted)"}}>Terms: <b style={{color:"var(--ink)"}}>{c.terms}</b>{c.balance>0&&<> · owes <b style={{color:"var(--red)"}}>{money(c.balance)}</b></>}</span>{c.qb?<span className="qb"><i></i>In QuickBooks</span>:<Pill tone="warn">Not in QuickBooks yet</Pill>}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}><button className="btn" onClick={()=>go(`sales/order/${c.id}`)}><Icon name="plus"/> New order for {c.name.split(" ")[0]}</button><button className="btn sec" onClick={()=>go(`sales/quote/${c.id}`)}><Icon name="tag"/> Make them a quote</button></div></div>
    <div><h2>Their orders</h2><div className="card wrapx" style={{marginTop:12,padding:"0 10px"}}><table className="tbl"><tbody>{orders.length?orders.map(o=><tr key={o.id} className="click" onClick={()=>go(`sales/so/${o.id}`)}><td><b>{o.id}</b></td><td>{o.item}</td><td><Pill tone={stageOf(o)===6?"mute":""}>{STAGES[stageOf(o)]}</Pill></td><td className="n">{money(orderTotals(o,data).total)}</td></tr>):<tr><td className="empty">No orders yet.</td></tr>}</tbody></table></div>
      {acts.length>0&&<><h2 style={{marginTop:22}}>Recent activity</h2><div className="card" style={{marginTop:12}}>{acts.map(a=><div key={a.id} className="li"><span className="dot"></span><div><b>{a.title}</b><div className="s">{a.detail} · {a.actor} · {a.createdAt}</div></div></div>)}</div></>}</div></div>}</main>;
}
