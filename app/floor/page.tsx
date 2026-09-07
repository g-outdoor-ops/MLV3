"use client";
// The warehouse link page.
//
// Opened from a link on the shop tablet, with no sign-in. It shows the production schedule, lets the
// floor complete the steps on it, and lets them update the run they are working on. Everything it can
// do goes through /api/floor, which builds every change itself — this page cannot send a company
// record even if someone rewrote it in the browser.
//
// Built for a tablet in a warehouse: big targets, short words, no dialogs to dismiss with wet hands.
import { useEffect, useState } from "react";
import type { FloorView, FloorWork } from "../server/floor";

const TYPE_LABEL:Record<string,string>={mold:"Mould",assemble:"Assemble",palletize:"Palletize",ship:"Ship"};
const num=(n:number)=>Math.round(n).toLocaleString("en-US");
const RACK=24;

const fmt=(iso:string)=>{
  const d=new Date(iso+"T12:00:00Z");
  return d.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric",timeZone:"UTC"});
};

export default function FloorLinkPage(){
  // Read straight out of the URL and out of the tablet's own memory during the first render. On the
  // server there is no window, and the page renders its loading state either way, so the markup the
  // browser hydrates matches what it was sent.
  const [token]=useState<string|null>(()=>typeof window==="undefined"?null:new URLSearchParams(window.location.search).get("t")||"");
  const remembered=()=>{try{return typeof window==="undefined"?"":localStorage.getItem("ml_floor_name")||""}catch{return ""}};
  const [view,setView]=useState<FloorView|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [toast,setToast]=useState("");
  const [who,setWho]=useState(remembered);
  const [asking,setAsking]=useState(()=>!remembered());
  const [open,setOpen]=useState<string|null>(null);      // the step or run being entered

  const [tick,setTick]=useState(0);
  useEffect(()=>{
    if(!token)return;
    let live=true;
    fetch(`/api/floor?t=${encodeURIComponent(token)}`,{cache:"no-store"})
      .then(r=>r.json())
      .then((j:{view?:FloorView;error?:string})=>{if(!live)return;if(j.view){setView(j.view);setError("")}else setError(j.error||"This link is not valid.")})
      .catch(()=>{if(live)setError("No connection. The schedule will load when you are back online.")});
    return ()=>{live=false};
  },[token,tick]);
  // A shared schedule that is ten minutes stale is worse than useless on a floor, so it refreshes
  // itself — but only while somebody is actually looking at it.
  useEffect(()=>{
    if(!token)return;
    const id=setInterval(()=>{if(document.visibilityState==="visible")setTick(t=>t+1)},60000);
    return ()=>clearInterval(id);
  },[token]);
  useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(""),3200);return ()=>clearTimeout(id)},[toast]);

  const send=async(body:Record<string,unknown>,said:string)=>{
    if(!token||busy)return;
    setBusy(true);
    try{
      const r=await fetch("/api/floor",{method:"POST",headers:{"content-type":"application/json","x-floor-token":token},
        body:JSON.stringify({...body,by:who})});
      const j=await r.json() as {view?:FloorView;error?:string};
      if(!r.ok||!j.view){setToast(j.error||"That could not be saved");setBusy(false);return}
      setView(j.view);setOpen(null);setToast(said);
    }catch{setToast("No connection — nothing was saved")}
    setBusy(false);
  };

  if(token==="")return <Shell><p className="floor-link-empty">This link is missing its code. Ask the owner to send it again.</p></Shell>;
  if(error)return <Shell><p className="floor-link-empty">{error}</p></Shell>;
  if(!view)return <Shell><p className="floor-link-empty">Loading the schedule…</p></Shell>;

  return <FloorLinkScreen view={view} who={who} setWho={setWho} asking={asking} setAsking={setAsking}
    open={open} setOpen={setOpen} busy={busy} toast={toast} send={send}/>;
}

/**
 * The screen itself, separated from the loading of it so it can be rendered against a known view —
 * a tablet page nobody can sign into is otherwise very hard to look at.
 */
export function FloorLinkScreen({view,who,setWho,asking,setAsking,open,setOpen,busy,toast,send}:{
  view:FloorView;who:string;setWho:(v:string)=>void;asking:boolean;setAsking:(v:boolean)=>void;
  open:string|null;setOpen:(v:string|null)=>void;busy:boolean;toast:string;
  send:(body:Record<string,unknown>,said:string)=>void;
}){
  const days=view.days.filter(d=>d.date>=view.today||d.steps.some(s=>!s.done));
  const name=(target:string)=>view.blanks.find(b=>b.id===target)?.name||view.skus.find(s=>s.id===target)?.name||target;
  const orderFor=(id?:string)=>view.orders.find(o=>o.id===id);

  return <Shell company={view.company}>
    <div className="floor-link-who">
      {asking?<form onSubmit={e=>{e.preventDefault();const n=who.trim();if(!n)return;try{localStorage.setItem("ml_floor_name",n)}catch{/* private browsing */}setAsking(false)}}>
        <label>Your first name<input value={who} onChange={e=>setWho(e.target.value)} placeholder="so the office knows who recorded it"/></label>
        <button className="primary" type="submit">Start</button>
      </form>:<p>Recording as <b>{who||"Warehouse"}</b> <button className="link-button" onClick={()=>setAsking(true)}>change</button></p>}
    </div>

    <section className="floor-link-section">
      <h2>Runs on now</h2>
      {view.workOrders.length?view.workOrders.map(w=>
        <Run key={w.id} work={w} order={orderFor(w.orderId)} busy={busy} open={open===w.id}
          onOpen={()=>setOpen(open===w.id?null:w.id)}
          onCount={(good,scrap)=>send({op:"wo.progress",woId:w.id,good,scrap},`${w.id} updated`)}
          onStatus={s=>send({op:"wo.status",woId:w.id,status:s},`${w.id} ${s.toLowerCase()}`)}/>
      ):<p className="floor-link-none">No runs open. The office releases them.</p>}
    </section>

    <section className="floor-link-section">
      <h2>The schedule</h2>
      {days.length?days.map(day=>
        <article key={day.date} className={`floor-link-day${day.date===view.today?" today":""}`}>
          <header>
            <b>{fmt(day.date)}</b>
            {day.date===view.today&&<span className="floor-link-today">Today</span>}
            {day.forWhat&&<small>{day.forWhat}</small>}
          </header>
          {day.steps.map(step=>{
            const order=orderFor(step.linkedTo);
            return <div key={step.id} className={`floor-link-step${step.done?" done":""}`}>
              <div className="floor-link-step-top">
                <span className="floor-link-type">{TYPE_LABEL[step.type]||step.type}</span>
                <b>{name(step.target)}</b>
                <span className="floor-link-qty">{num(step.qty)}{step.actualQty!=null&&` · ${num(step.actualQty)} made`}</span>
              </div>
              {(order||step.note)&&<p className="floor-link-note">
                {order&&<em>{order.customer} · {order.id}</em>}
                {order?.notes||step.note}
              </p>}
              {step.workOrderId
                ?<p className="floor-link-runref">Counted on run {step.workOrderId} — use the run above</p>
                :step.done
                ?<p className="floor-link-done">Done{step.doneBy?` · ${step.doneBy}`:""}</p>
                :open===step.id
                  ?<Enter label={step.actualQty!=null?`Total made — ${num(step.actualQty)} already recorded`:"How many did you make?"} initial={step.actualQty??step.qty} scrap busy={busy}
                     onCancel={()=>setOpen(null)}
                     onSave={(made,scrap)=>send({op:"step.record",stepId:step.id,made,scrap},`${num(made)} recorded`)}/>
                  :<button className="primary giant" onClick={()=>setOpen(step.id)}>Record what was made</button>}
            </div>;
          })}
          {!day.steps.length&&<p className="floor-link-none">Nothing planned.</p>}
        </article>
      ):<p className="floor-link-none">Nothing on the schedule yet.</p>}
    </section>

    {toast&&<div className="toast">✓ {toast}</div>}
  </Shell>;
}

function Shell({children,company}:{children:React.ReactNode;company?:string}){
  return <main className="floor-shell floor-link">
    <header className="floor-top">
      <div className="logo">Make<span>Logic</span></div>
      <span className="floor-link-company">{company||""}</span>
      <span className="no-login-chip">WAREHOUSE</span>
    </header>
    <div className="floor-link-body">{children}</div>
  </main>;
}

/** One open run: the counts, the buttons that move it, and nothing about what it is worth. */
function Run({work,order,busy,open,onOpen,onCount,onStatus}:{work:FloorWork;order?:{customer:string;id:string;due:string;notes:string};busy:boolean;open:boolean;onOpen:()=>void;onCount:(good:number,scrap:number)=>void;onStatus:(s:string)=>void}){
  const left=Math.max(0,work.quantity-work.good);
  const pct=work.quantity?Math.min(100,Math.round(work.good/work.quantity*100)):0;
  return <article className={`floor-link-run ${work.status==="Running"?"running":""}`}>
    <header>
      <div><b>{work.item}</b><small>{work.id} · {work.line}{order?` · ${order.customer}`:` · ${work.purpose}`}</small></div>
      <span className="floor-link-status">{work.status}</span>
    </header>
    {order?.notes&&<p className="floor-link-note"><em>From sales</em>{order.notes}</p>}
    <div className="progress"><span style={{width:`${pct}%`}}/></div>
    <p className="floor-link-counts">{num(work.good)} of {num(work.quantity)} made · {num(work.scrap)} scrap · {num(left)} to go</p>
    <div className="floor-link-actions">
      <button className="primary giant" disabled={busy||work.status!=="Running"||!left} onClick={()=>onCount(Math.min(RACK,left),0)}>+ {RACK} good</button>
      <button className="secondary giant" disabled={busy||work.status!=="Running"} onClick={()=>onCount(0,1)}>+ 1 scrap</button>
    </div>
    <div className="floor-link-actions">
      {work.status!=="Running"&&work.status!=="QC hold"&&<button className="secondary" disabled={busy} onClick={()=>onStatus("Running")}>Start run</button>}
      {work.status==="Running"&&<button className="secondary" disabled={busy} onClick={()=>onStatus("Paused")}>Pause</button>}
      {work.status==="Running"&&<button className="finish" disabled={busy} onClick={()=>onStatus("QC hold")}>Finish &amp; send to quality</button>}
      <button className="secondary" onClick={onOpen}>{open?"Close":"Enter a number"}</button>
    </div>
    {open&&<Enter label="How many good bottles to add?" initial={Math.min(RACK,left)||0} scrap busy={busy}
      onCancel={onOpen} onSave={(good,scrap)=>onCount(good,scrap)}/>}
  </article>;
}

/** A number, entered with a keypad-friendly field. Cancel really cancels — nothing is sent. */
function Enter({label,initial,scrap,busy,onSave,onCancel}:{label:string;initial:number;scrap?:boolean;busy:boolean;onSave:(n:number,scrap:number)=>void;onCancel:()=>void}){
  const [value,setValue]=useState(String(initial));
  const [bad,setBad]=useState("0");
  return <div className="floor-link-enter">
    <label>{label}<input inputMode="numeric" value={value} onChange={e=>setValue(e.target.value)}/></label>
    {scrap&&<label>Scrap<input inputMode="numeric" value={bad} onChange={e=>setBad(e.target.value)}/></label>}
    <div className="floor-link-enter-actions">
      <button className="secondary" onClick={onCancel}>Cancel</button>
      <button className="primary" disabled={busy} onClick={()=>onSave(Math.max(0,Number(value)||0),Math.max(0,Number(bad)||0))}>{busy?"Saving…":"Save"}</button>
    </div>
  </div>;
}
