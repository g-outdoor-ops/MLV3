"use client";
// Production plan — the mixed calendar.
//
// Amazon replenishment and wholesale orders are made on the same two machines, so planning them on
// separate lists is how a month quietly becomes over-committed. One calendar holds both, every step
// says which side of the business it is for, and each day shows what it is asking of each machine
// against what that machine can actually deliver in a shift.
//
// Two rules this screen exists to enforce:
//  · The 5-gallon and 3-gallon lines cannot cover for each other, so capacity is shown per machine,
//    never pooled. A day at 900 on one line and 100 on the other is not "half full".
//  · Nothing the floor has already made may be edited away silently. Every edit runs guardStepEdit
//    first and, when it has something to say, the person has to answer it before the change lands.
import { useState } from "react";
import { DEFAULT_BLANKS, DEFAULT_MACHINES, DEFAULT_SKUS, addSteps, dayLoad, fmtDue, guardStepEdit, orderNeeds, ordersToPlan, planOrder, planTotals, reconcileStep, recordStep, stepStarted, stepTargetName, todayIso,
  type AppData, type MachineLoad, type OrderRecord, type ProdDay, type ProdSource, type ProdStep } from "../app-data";
import { Kpi, num, uid, useApp } from "./store";

export const PRODUCTION_PLAN="Production plan";

const TYPES:ProdStep["type"][]=["mold","assemble","palletize","ship"];
const TYPE_LABEL:Record<ProdStep["type"],string>={mold:"Mould",assemble:"Assemble",palletize:"Palletize",ship:"Ship"};
const SOURCE_LABEL:Record<ProdSource,string>={amazon:"Amazon",wholesale:"Wholesale"};
const monthOf=(iso:string)=>iso.slice(0,7);
const monthKey=(y:number,m:number)=>`${y}-${String(m+1).padStart(2,"0")}`;

export function ProductionPlanView(){
  const {data,commit,notify,role,user}=useApp();
  const owner=role==="owner";
  const blanks=data.blanks?.length?data.blanks:DEFAULT_BLANKS;
  const skus=data.skus?.length?data.skus:DEFAULT_SKUS;
  const machines=data.settings.machines?.length?data.settings.machines:DEFAULT_MACHINES;
  const all=data.prodDays||[];

  // Open on the month the work is in. Usually that is this month; if the plan has moved on (or the
  // month just turned) land on the first month still holding unfinished steps rather than on a blank
  // screen the reader has to page out of.
  const [ym,setYm]=useState(()=>{
    const now=todayIso().slice(0,7);
    if(all.some(d=>monthOf(d.date)===now))return now;
    const open=all.filter(d=>d.steps.some(s=>!s.done)).map(d=>monthOf(d.date)).sort();
    return open[0]||now;
  });
  const [filter,setFilter]=useState<"all"|ProdSource>("all");
  const [editing,setEditing]=useState<string|null>(null);
  const [recording,setRecording]=useState<string|null>(null);
  const [reconciling,setReconciling]=useState<string|null>(null);
  const [adding,setAdding]=useState<string|null>(null);
  // The guard's question, held until the person answers it. Nothing is written while this is set.
  const [pending,setPending]=useState<{message:string;confirm:()=>void}|null>(null);

  const days=all.filter(d=>monthOf(d.date)===ym);
  const totals=planTotals(days,blanks,machines);
  const [y,m]=ym.split("-").map(Number);
  const monthLabel=new Date(Date.UTC(y,m-1,1)).toLocaleDateString("en-US",{month:"long",year:"numeric",timeZone:"UTC"});
  const stepMonth=(mm:number)=>{const d=new Date(Date.UTC(y,m-1+mm,1));setYm(monthKey(d.getUTCFullYear(),d.getUTCMonth()))};

  const writeDays=(fn:(ds:ProdDay[])=>ProdDay[],action:string,summary:string)=>
    commit(v=>({...v,prodDays:fn(v.prodDays||[])}),action,summary);
  const patchStep=(id:string,fn:(st:ProdStep)=>ProdStep,action:string,summary:string)=>
    writeDays(ds=>ds.map(d=>({...d,steps:d.steps.map(s=>s.id===id?fn(s):s)})),action,summary);
  /** Move a step to another date, creating that day if the plan does not have it yet. */
  const relocate=(ds:ProdDay[],step:ProdStep,to:string):ProdDay[]=>{
    const without=ds.map(d=>({...d,steps:d.steps.filter(s=>s.id!==step.id)}));
    const has=without.some(d=>d.date===to);
    const next=has?without.map(d=>d.date===to?{...d,steps:[...d.steps,step]}:d):[...without,{date:to,steps:[step]}];
    return next.filter(d=>d.steps.length||d.forWhat||d.milestone).sort((a,b)=>a.date.localeCompare(b.date));
  };

  const record=(st:ProdStep,made:number,scrap:number)=>{
    patchStep(st.id,x=>recordStep(x,made,user||"Warehouse",scrap),"plan.record",`${st.id} · ${made} made`);
    setRecording(null);
    notify(`${num(made)} recorded on ${TYPE_LABEL[st.type].toLowerCase()} ${stepTargetName(st,blanks,skus)}`,PRODUCTION_PLAN);
  };
  // The other direction: the floor made units and never logged them, so the owner sets the record
  // straight. reconcileStep stamps who corrected it rather than pretending the floor entered it.
  const reconcile=(st:ProdStep,made:number)=>{
    patchStep(st.id,x=>reconcileStep(x,made,user||"Owner"),"plan.reconcile",`${st.id} reconciled to ${made}`);
    setReconciling(null);
    notify(`${stepTargetName(st,blanks,skus)} corrected to ${num(made)} made — recorded by ${user||"the owner"}`,PRODUCTION_PLAN);
  };

  return <section className="view">
    <div className="heading-row">
      <div>
        <p className="eyebrow">Amazon and wholesale on the same two machines</p>
        <h1>Production plan</h1>
        <p className="intro">Every step of the month, and what each day asks of the 5-gallon and 3-gallon lines. The two cannot cover for each other, so a day is over capacity when either one is.</p>
      </div>
    </div>

    <div className="plan-toolbar">
      <div className="plan-month">
        <button aria-label="Previous month" onClick={()=>stepMonth(-1)}>‹</button>
        <strong>{monthLabel}</strong>
        <button aria-label="Next month" onClick={()=>stepMonth(1)}>›</button>
      </div>
      <div className="segmented">
        {(["all","amazon","wholesale"] as const).map(f=>
          <button key={f} className={filter===f?"active":""} onClick={()=>setFilter(f)}>{f==="all"?"Both":SOURCE_LABEL[f]}</button>)}
      </div>
      <span className="plan-toolbar-note">{filter==="all"?"Machine load always counts both — filtering hides steps, never the load.":`Showing ${SOURCE_LABEL[filter as ProdSource].toLowerCase()} steps. The bars still count every step on the day.`}</span>
    </div>

    <div className="recap four">
      <Kpi label="To mould this month" value={num(totals.totalUnits)} note={`${num(totals.bySource.amazon)} Amazon · ${num(totals.bySource.wholesale)} wholesale`}/>
      {machines.map(mc=>{
        const size=mc.makes;
        const need=totals.shiftsNeeded[size]||0;const sched=totals.daysScheduled[mc.id]||0;
        return <Kpi key={mc.id} label={mc.name} value={`${num(totals.unitsBySize[size]||0)}`}
          note={`${need} shift${need===1?"":"s"} of work · ${sched} day${sched===1?"":"s"} scheduled`}
          warn={need>sched}/>;
      })}
      <Kpi label="Days over capacity" value={String(totals.over.length)}
        note={totals.over.length?totals.over.map(d=>fmtDue(d).replace(/^\w+, /,"")).join(" · "):"every day fits"}
        warn={totals.over.length>0}/>
    </div>

    {pending&&<div className="plan-guard" role="alertdialog" aria-label="Confirm this change">
      <p>{pending.message}</p>
      <div className="plan-guard-actions">
        <button className="secondary" onClick={()=>setPending(null)}>Keep it as it is</button>
        <button className="primary" onClick={()=>pending.confirm()}>Make the change anyway</button>
      </div>
    </div>}

    {owner&&<UnplannedOrders data={data} onPlan={(o,entries,summary)=>{
      writeDays(ds=>addSteps(ds,entries),"plan.order",`${o.id} planned · ${entries.length} steps`);
      notify(`${o.id} is on the production plan — ${summary}`,PRODUCTION_PLAN);
    }}/>}

    {days.length?days.map(day=>{
      const loads=dayLoad(day,blanks,machines);
      const over=loads.some(l=>l.over>0);
      const shown=day.steps.filter(s=>filter==="all"||s.source===filter);
      const isToday=day.date===todayIso();
      return <article key={day.date} className={`plan-day${over?" over":""}${isToday?" today":""}`}>
        <header className="plan-day-head">
          <div>
            <b>{fmtDue(day.date)}</b>
            {isToday&&<span className="plan-today">Today</span>}
            {day.milestone&&<span className="plan-milestone">Milestone</span>}
            {day.forWhat&&<small>{day.forWhat}</small>}
          </div>
          {owner&&<button className="link-button" onClick={()=>setAdding(adding===day.date?null:day.date)}>{adding===day.date?"Cancel":"+ Step"}</button>}
        </header>

        <div className="plan-machines">{loads.map(l=><Meter key={l.machine.id} load={l}/>)}</div>
        {over&&<p className="plan-over-note">Over capacity — {loads.filter(l=>l.over>0).map(l=>`${l.machine.name} by ${num(l.over)}`).join(", ")}. Move work to another day or the date this promises will slip.</p>}

        {adding===day.date&&<AddStep date={day.date} blanks={blanks} skus={skus} onCancel={()=>setAdding(null)}
          onAdd={st=>{writeDays(ds=>relocate(ds,st,day.date),"plan.step.add",`${TYPE_LABEL[st.type]} ${st.qty} added to ${day.date}`);setAdding(null)}}/>}

        <div className="plan-steps">
          {shown.length?shown.map(st=>{
            const started=stepStarted(st);
            return <div key={st.id} className={`plan-step${st.done?" done":""}`}>
              <div className="plan-step-main">
                <span className={`plan-chip type-${st.type}`}>{TYPE_LABEL[st.type]}</span>
                <span className={`plan-chip src-${st.source}`}>{SOURCE_LABEL[st.source]}</span>
                <b>{stepTargetName(st,blanks,skus)}</b>
                <span className="plan-qty">{num(st.qty)} planned{st.actualQty!=null&&` · ${num(st.actualQty)} made`}{st.scrap?` · ${num(st.scrap)} scrap`:""}</span>
                <span className={`plan-state${st.done?" done":started?" part":""}`}>{st.done?"Done":started?"Part made":"Planned"}</span>
              </div>
              {(st.note||st.linkedTo||st.doneBy)&&<p className="plan-step-note">
                {st.linkedTo&&<em>{st.linkedTo}</em>}{st.note}
                {st.doneBy&&<i>{st.reconciledBy?`Recorded by ${st.doneBy}, corrected by ${st.reconciledBy}`:`Recorded by ${st.doneBy}`}{st.doneAt?` · ${fmtDue(st.doneAt)}`:""}</i>}
              </p>}

              <div className="plan-step-actions">
                {!st.done&&<button className="secondary" onClick={()=>{setRecording(recording===st.id?null:st.id);setEditing(null);setReconciling(null)}}>{recording===st.id?"Cancel":"Record made"}</button>}
                {owner&&<button className="secondary" onClick={()=>{setEditing(editing===st.id?null:st.id);setRecording(null);setReconciling(null)}}>{editing===st.id?"Cancel":"Edit"}</button>}
                {owner&&<button className="secondary" onClick={()=>{setReconciling(reconciling===st.id?null:st.id);setEditing(null);setRecording(null)}}>{reconciling===st.id?"Cancel":"Reconcile"}</button>}
                {owner&&!started&&<button className="link-button" onClick={()=>writeDays(ds=>ds.map(d=>({...d,steps:d.steps.filter(x=>x.id!==st.id)})),"plan.step.remove",`${st.id} removed`)}>Remove</button>}
              </div>

              {recording===st.id&&<Amount label="How many were actually made?" initial={st.actualQty??st.qty} extra="scrap"
                confirm="Save what was made" onCancel={()=>setRecording(null)} onSave={(n,scrap)=>record(st,n,scrap)}/>}

              {reconciling===st.id&&<Amount label={`True quantity made — corrects the record, and notes that you were the one who did it.`}
                initial={st.actualQty??st.qty} confirm="Correct the record" onCancel={()=>setReconciling(null)} onSave={n=>reconcile(st,n)}/>}

              {editing===st.id&&<EditStep step={st} day={day}
                onCancel={()=>setEditing(null)}
                onSave={(next,toDate)=>{
                  // Nothing is written until guardStepEdit has had its say. It never blocks the edit —
                  // it makes sure the person knows what the floor already did before it lands.
                  const message=guardStepEdit(st,toDate!==day.date?{...next,note:next.note}:next);
                  const apply=()=>{
                    writeDays(ds=>{
                      const patched=ds.map(d=>({...d,steps:d.steps.map(x=>x.id===st.id?{...x,...next}:x)}));
                      const moved=patched.flatMap(d=>d.steps).find(x=>x.id===st.id)!;
                      return toDate!==day.date?relocate(patched,moved,toDate):patched;
                    },"plan.step.edit",`${st.id} edited${toDate!==day.date?` · moved to ${toDate}`:""}`);
                    setEditing(null);setPending(null);
                  };
                  if(message)setPending({message,confirm:apply});else apply();
                }}/>}
            </div>;
          }):<p className="plan-empty">{day.steps.length?`Nothing ${SOURCE_LABEL[filter as ProdSource].toLowerCase()} on this day.`:"No steps on this day."}</p>}
        </div>
      </article>;
    }):<article className="panel"><p className="empty-list">Nothing planned for {monthLabel}.</p></article>}
  </section>;
}

/**
 * Wholesale orders that are paid for and not on the calendar yet.
 *
 * Somebody used to have to remember that a customer order runs on the same two machines as the Amazon
 * plan. This reads it off the record instead: what the order still needs after stock, where it fits in
 * the gaps the Amazon work leaves, and — the part worth seeing before anyone rings the customer back —
 * whether the machines can finish it by the date that was already promised.
 *
 * It only ever offers. Nothing is added to the plan until the owner says so.
 */
function UnplannedOrders({data,onPlan}:{data:AppData;onPlan:(o:OrderRecord,entries:{date:string;step:ProdStep}[],summary:string)=>void}){
  const waiting=ordersToPlan(data);
  if(!waiting.length)return null;
  return <section className="plan-todo">
    <h2>{waiting.length} paid order{waiting.length===1?"":"s"} not on the plan yet</h2>
    <p className="plan-todo-note">These are past the money gate and can go on a machine. Adding one fills the gaps the Amazon plan leaves — it never overbooks a line, so if the date slips, the date is the truth.</p>
    {waiting.map(o=>{
      const customer=data.customers.find(c=>c.id===o.customerId);
      const need=orderNeeds(o,data);
      const plan=planOrder(o,data);
      const moulds=plan.entries.filter(e=>e.step.type==="mold");
      const summary=need.toMake?`${num(need.toMake)} to mould over ${new Set(moulds.map(e=>e.date)).size} day${new Set(moulds.map(e=>e.date)).size===1?"":"s"}, shipping ${fmtDue(plan.finish)}`:`nothing to mould — shipping ${fmtDue(plan.finish)} from stock`;
      return <article key={o.id} className="plan-todo-row">
        <div className="plan-todo-head">
          <b>{o.id} · {customer?.name||"Customer"}</b>
          <span>{num(o.quantity)} bottles · needed {fmtDue(o.due)}</span>
        </div>
        <ul className="plan-todo-lines">
          {need.lines.map(l=><li key={l.item}>
            <b>{l.item}</b> — {num(l.quantity)} ordered
            {/* Stock and moulding only mean anything once the catalogue says what the item is made
                from. Until then the only useful thing to say is that nobody has said. */}
            {l.blankId?<>
              {l.fromStock>0&&<> · <em>{num(l.fromStock)} already in stock</em></>}
              {l.make>0?<> · <strong>{num(l.make)} to mould</strong></>:<> · <em>nothing to mould</em></>}
            </>:<> · <u>no blank set on this item — set it under Item rates before this can be planned</u></>}
          </li>)}
        </ul>
        <div className="plan-todo-foot">
          {/* No finish date is offered for an order that cannot be scheduled — a date the plan cannot
              stand behind is worse than no date. */}
          <span className={need.unplannable.length||plan.daysLate?"late":""}>
            {need.unplannable.length?`Cannot be scheduled until ${need.unplannable.join(" and ")} says what it is moulded from`
              :plan.daysLate?`Finishes ${fmtDue(plan.finish)} — ${plan.daysLate} day${plan.daysLate===1?"":"s"} after the date needed`
              :`Finishes ${fmtDue(plan.finish)}, in time`}
          </span>
          <button className="primary" disabled={!!need.unplannable.length} onClick={()=>onPlan(o,plan.entries,summary)}>
            {need.unplannable.length?"Needs an item rate first":`Add to the plan · ${plan.entries.length} steps`}
          </button>
        </div>
      </article>;
    })}
  </section>;
}

/** One machine's load for a day. The bar is scaled so an overloaded day visibly breaks the line. */
function Meter({load}:{load:MachineLoad}){
  const span=Math.max(load.capacity,load.units)||1;
  const pct=(n:number)=>`${Math.round(n/span*100)}%`;
  return <div className={`plan-meter${load.over?" over":""}`}>
    <span className="plan-meter-name">{load.machine.name}</span>
    <div className="plan-bar">
      <i className="src-amazon" style={{width:pct(load.bySource.amazon)}}/>
      <i className="src-wholesale" style={{width:pct(load.bySource.wholesale)}}/>
      <u className="plan-cap" style={{left:pct(load.capacity)}} aria-hidden="true"/>
    </div>
    <b>{num(load.units)} / {num(load.capacity)}</b>
    {load.over>0&&<em>over by {num(load.over)}</em>}
  </div>;
}

/** A number the floor or the owner is entering, with an optional scrap box. */
function Amount({label,initial,confirm,extra,onSave,onCancel}:{label:string;initial:number;confirm:string;extra?:"scrap";onSave:(n:number,scrap:number)=>void;onCancel:()=>void}){
  const [value,setValue]=useState(String(initial));
  const [scrap,setScrap]=useState("0");
  return <div className="plan-form">
    <label>{label}<input inputMode="numeric" value={value} onChange={e=>setValue(e.target.value)}/></label>
    {extra==="scrap"&&<label>Scrap<input inputMode="numeric" value={scrap} onChange={e=>setScrap(e.target.value)}/></label>}
    <div className="plan-form-actions">
      <button className="secondary" onClick={onCancel}>Cancel</button>
      <button className="primary" onClick={()=>onSave(Math.max(0,Number(value)||0),Math.max(0,Number(scrap)||0))}>{confirm}</button>
    </div>
  </div>;
}

/** Editing a planned step: quantity, the day it sits on, which side of the business, and a note. */
function EditStep({step,day,onSave,onCancel}:{step:ProdStep;day:ProdDay;onSave:(next:Partial<ProdStep>,toDate:string)=>void;onCancel:()=>void}){
  const [qty,setQty]=useState(String(step.qty));
  const [date,setDate]=useState(day.date);
  const [source,setSource]=useState<ProdSource>(step.source);
  const [note,setNote]=useState(step.note||"");
  const save=()=>{
    const next:Partial<ProdStep>={};
    const n=Math.max(0,Number(qty)||0);
    if(n!==step.qty)next.qty=n;
    if(source!==step.source)next.source=source;
    if(note!==(step.note||""))next.note=note;
    if(!Object.keys(next).length&&date===day.date){onCancel();return}   // nothing actually changed
    onSave(next,date);
  };
  return <div className="plan-form">
    <label>Planned quantity<input inputMode="numeric" value={qty} onChange={e=>setQty(e.target.value)}/></label>
    <label>Day<input type="date" value={date} onChange={e=>setDate(e.target.value||day.date)}/></label>
    <label>For<select value={source} onChange={e=>setSource(e.target.value as ProdSource)}>
      {(Object.keys(SOURCE_LABEL) as ProdSource[]).map(s=><option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
    </select></label>
    <label>Note<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Anything the floor needs to know"/></label>
    <div className="plan-form-actions">
      <button className="secondary" onClick={onCancel}>Cancel</button>
      <button className="primary" onClick={save}>Save step</button>
    </div>
  </div>;
}

/** Adding work to a day — a wholesale order landing on a month the Amazon plan already fills. */
function AddStep({date,blanks,skus,onAdd,onCancel}:{date:string;blanks:{id:string;name:string}[];skus:{id:string;name:string}[];onAdd:(st:ProdStep)=>void;onCancel:()=>void}){
  const [type,setType]=useState<ProdStep["type"]>("mold");
  const [source,setSource]=useState<ProdSource>("wholesale");
  // Moulding makes a blank; everything after it usually names a SKU — but wholesale sells the plain
  // bottle, so blanks stay selectable for the later steps too.
  const options=type==="mold"?blanks:[...skus,...blanks];
  const [target,setTarget]=useState(options[0]?.id||"");
  const [qty,setQty]=useState("500");
  const [note,setNote]=useState("");
  const pickType=(t:ProdStep["type"])=>{setType(t);const next=t==="mold"?blanks:[...skus,...blanks];if(!next.some(o=>o.id===target))setTarget(next[0]?.id||"")};
  return <div className="plan-form plan-add">
    <label>Step<select value={type} onChange={e=>pickType(e.target.value as ProdStep["type"])}>
      {TYPES.map(t=><option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
    </select></label>
    <label>For<select value={source} onChange={e=>setSource(e.target.value as ProdSource)}>
      {(Object.keys(SOURCE_LABEL) as ProdSource[]).map(s=><option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
    </select></label>
    <label>What<select value={target} onChange={e=>setTarget(e.target.value)}>
      {options.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
    </select></label>
    <label>Quantity<input inputMode="numeric" value={qty} onChange={e=>setQty(e.target.value)}/></label>
    <label>Note<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Order number, or anything the floor needs"/></label>
    <div className="plan-form-actions">
      <button className="secondary" onClick={onCancel}>Cancel</button>
      <button className="primary" disabled={!target} onClick={()=>onAdd({id:uid("st"),type,source,target,qty:Math.max(0,Number(qty)||0),...(note?{note}:{})})}>Add to {fmtDue(date)}</button>
    </div>
  </div>;
}
