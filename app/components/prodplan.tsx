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
import { DEFAULT_BLANKS, DEFAULT_MACHINES, DEFAULT_SKUS, SEPTEMBER_PLAN, STAGE_SHIPPED, addSteps, dayLoad, dueIso, fmtDue, stageOf, guardStepEdit, loadPlan, orderNeeds, ordersToPlan, planOrder, loadAheadOf, planTotals, productionQueue, reconcileStep, rushImpact, recordStep, runFromSteps, runSteps, stepProgress, stepTargetName, todayIso,
  type AppData, type Blank, type Machine, type MachineLoad, type OrderRecord, type PlanLoad, type ProdDay, type ProdSource, type ProdStep, type WorkOrder } from "../app-data";
import { Kpi, nextId, num, uid, useApp } from "./store";

export const PRODUCTION_CALENDAR="Production calendar";

const TYPES:ProdStep["type"][]=["mold","assemble","palletize","ship"];
const TYPE_LABEL:Record<ProdStep["type"],string>={mold:"Mould",assemble:"Assemble",palletize:"Palletize",ship:"Ship"};
const SOURCE_LABEL:Record<ProdSource,string>={amazon:"Amazon",wholesale:"Wholesale"};
const monthOf=(iso:string)=>iso.slice(0,7);
const monthKey=(y:number,m:number)=>`${y}-${String(m+1).padStart(2,"0")}`;

export function ProductionCalendarView(){
  const {data,commit,notify,openRecord,setModal,role,user}=useApp();
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
  // The month grid answers "what does the month look like", the day list answers "what do I do now".
  // They were two screens; they are two readings of one calendar. The floor opens on the list because a
  // tablet in a warehouse wants today, not a grid.
  const [view,setView]=useState<"month"|"list">(role==="floor"?"list":"month");
  const [selected,setSelected]=useState<string>(todayIso());
  const [moving,setMoving]=useState<string|null>(null);   // the run or step picked up to be moved
  const waiting=(data.workOrders||[]).filter(w=>w.status==="Needs scheduling");
  const [editing,setEditing]=useState<string|null>(null);
  const [recording,setRecording]=useState<string|null>(null);
  const [reconciling,setReconciling]=useState<string|null>(null);
  const [adding,setAdding]=useState<string|null>(null);
  // The guard's question, held until the person answers it. Nothing is written while this is set.
  const [pending,setPending]=useState<{message:string;confirm:()=>void}|null>(null);
  const [loadingPlan,setLoadingPlan]=useState(false);

  const days=all.filter(d=>monthOf(d.date)===ym);
  const runs=data.workOrders||[];
  const everyStep=all.flatMap(d=>d.steps||[]);
  const totals=planTotals(days,blanks,machines,runs);
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

  /**
   * Send a step to the floor as a work order. From here the run owns the numbers: the plan shows what
   * the floor recorded instead of offering a second box to type it into.
   */
  const sendToFloor=(st:ProdStep,day:ProdDay)=>{
    const covered=runSteps(st,all);
    const id=nextId("WO-",runs.map(w=>w.id),116);
    const work=runFromSteps(covered,data,id,day.date);
    if(!work){notify("Only moulding and assembly are run as work orders — palletizing and shipping are recorded on the step",PRODUCTION_CALENDAR,true);return}
    const ids=new Set(covered.map(c=>c.id));
    commit(v=>({...v,
      workOrders:[...(v.workOrders||[]),work],
      prodDays:(v.prodDays||[]).map(d=>({...d,steps:(d.steps||[]).map(x=>ids.has(x.id)?{...x,workOrderId:id}:x)})),
    }),"plan.run",`${id} raised from the plan · ${work.quantity}`);
    notify(`${id} sent to the floor — ${num(work.quantity)} on ${work.line}${covered.length>1?` over ${covered.length} days`:""}`,PRODUCTION_CALENDAR);
  };

  /**
   * Move whatever was picked up to another day. A work order and a production step are moved by
   * different rules — a run that is already turning cannot be dragged, and a step the floor has started
   * has to answer the guard first — so this dispatches rather than pretending they are the same thing.
   */
  const moveTo=(id:string,date:string)=>{
    setMoving(null);
    const run=runs.find(w=>w.id===id);
    if(run){
      if(run.status==="Running"||run.status==="Done"){notify(`${run.id} is ${run.status.toLowerCase()} and cannot be moved`,PRODUCTION_CALENDAR,true);return}
      commit(v=>({...v,workOrders:v.workOrders.map(w=>w.id===id?{...w,date,status:w.status==="Needs scheduling"?"Scheduled":w.status}:w)}),"calendar.move",`${id} moved to ${date}`);
      notify(`${id} moved to ${fmtDue(date)}`,PRODUCTION_CALENDAR);
      return;
    }
    const from=all.find(d=>(d.steps||[]).some(x=>x.id===id));
    const step=from&&from.steps.find(x=>x.id===id);
    if(!step||from.date===date)return;
    if(step.workOrderId){notify(`${step.id} is being run as ${step.workOrderId} — move the run, not the day`,PRODUCTION_CALENDAR,true);return}
    // Ask first, then decide — the same order the code reads in, so it stays obvious that nothing is
    // written before the guard has had its say.
    const message=guardStepEdit(step,{});
    const apply=()=>{writeDays(ds=>relocate(ds,step,date),"plan.step.edit",`${step.id} moved to ${date}`);setPending(null)};
    if(message)setPending({message,confirm:apply});else apply();
  };

  const record=(st:ProdStep,made:number,scrap:number)=>{
    patchStep(st.id,x=>recordStep(x,made,user||"Warehouse",scrap),"plan.record",`${st.id} · ${made} made`);
    setRecording(null);
    notify(`${num(made)} recorded on ${TYPE_LABEL[st.type].toLowerCase()} ${stepTargetName(st,blanks,skus)}`,PRODUCTION_CALENDAR);
  };
  // The other direction: the floor made units and never logged them, so the owner sets the record
  // straight. reconcileStep stamps who corrected it rather than pretending the floor entered it.
  const reconcile=(st:ProdStep,made:number)=>{
    patchStep(st.id,x=>reconcileStep(x,made,user||"Owner"),"plan.reconcile",`${st.id} reconciled to ${made}`);
    setReconciling(null);
    notify(`${stepTargetName(st,blanks,skus)} corrected to ${num(made)} made — recorded by ${user||"the owner"}`,PRODUCTION_CALENDAR);
  };

  return <section className="view">
    <div className="heading-row">
      <div>
        <p className="eyebrow">Amazon and wholesale on the same two machines</p>
        <h1>Production calendar</h1>
        <p className="intro">Every step, run, delivery and due date on one schedule — and what each day asks of the 5-gallon and 3-gallon lines. The two cannot cover for each other, so a day is over capacity when either one is.</p>
      </div>
      <div className="button-row">
        {owner&&<button className="secondary" onClick={()=>setLoadingPlan(true)}>Load the September plan</button>}
        {owner&&<button className="primary" onClick={()=>setModal("workorder")}>+ Work order</button>}
      </div>
    </div>

    {loadingPlan&&owner&&<PlanLoader data={data} onClose={()=>setLoadingPlan(false)} onLoad={(next,s)=>{
      commit(()=>next,"plan.load",`September plan loaded — ${s.added} steps across ${s.days} days`);
      notify(`September plan loaded · ${s.added} steps on ${s.days} days${s.kept.length?` · ${s.kept.length} already under way were kept`:""}`,PRODUCTION_CALENDAR);
      setLoadingPlan(false);
    }}/>}

    {owner&&waiting.length>0&&<div className="company-health" style={{marginBottom:12}}>
      <span><i className="health-dot" style={{background:"#cf6822"}}/>Waiting for a slot: <b>{waiting.map(w=>`${w.id} (${num(w.quantity)} × ${w.item.split(" · ")[0]})`).join(", ")}</b></span>
      <small>{waiting.map(w=><button key={w.id} className="link-button" onClick={()=>setMoving(w.id)}>Place {w.id}</button>)}</small>
    </div>}

    <div className="plan-toolbar">
      <div className="plan-month">
        <button aria-label="Previous month" onClick={()=>stepMonth(-1)}>‹</button>
        <strong>{monthLabel}</strong>
        <button aria-label="Next month" onClick={()=>stepMonth(1)}>›</button>
      </div>
      <div className="segmented">
        <button className={view==="month"?"active":""} onClick={()=>setView("month")}>Month</button>
        <button className={view==="list"?"active":""} onClick={()=>setView("list")}>Day by day</button>
      </div>
      <div className="segmented">
        {(["all","amazon","wholesale"] as const).map(f=>
          <button key={f} className={filter===f?"active":""} onClick={()=>setFilter(f)}>{f==="all"?"Both":SOURCE_LABEL[f]}</button>)}
      </div>
      <span className="plan-toolbar-note">{moving?`Click a day to move ${moving}. `:""}{filter==="all"?"Machine load always counts both — filtering hides steps, never the load.":`Showing ${SOURCE_LABEL[filter as ProdSource].toLowerCase()} steps. The bars still count every step on the day.`}</span>
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

    <TheLine data={data} onOpen={openRecord}/>

    {owner&&<UnplannedOrders data={data} onPlan={(o,entries,summary)=>{
      writeDays(ds=>addSteps(ds,entries),"plan.order",`${o.id} planned · ${entries.length} steps`);
      notify(`${o.id} is on the production plan — ${summary}`,PRODUCTION_CALENDAR);
    }}/>}

    {view==="month"
      ?<MonthGrid ym={ym} days={days} data={data} blanks={blanks} machines={machines} runs={runs} everyStep={everyStep}
          filter={filter} owner={owner} selected={selected} moving={moving} setMoving={setMoving}
          onPick={setSelected} onOpen={openRecord} onMove={moveTo}/>
      :null}
    {(view==="month"?days.filter(d=>d.date===selected):days).length
      ?(view==="month"?days.filter(d=>d.date===selected):days).map(day=>{
      const loads=dayLoad(day,blanks,machines,runs,everyStep);
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

        {adding===day.date&&<AddStep date={day.date} blanks={blankOptions(blanks,data.itemRates)} skus={skus} onCancel={()=>setAdding(null)}
          onAdd={st=>{writeDays(ds=>relocate(ds,st,day.date),"plan.step.add",`${TYPE_LABEL[st.type]} ${st.qty} added to ${day.date}`);setAdding(null)}}/>}

        <div className="plan-steps">
          {shown.length?shown.map(st=>{
            // One reading of what was made, from the run when there is one. The step's own fields are
            // not consulted while a run owns it — that split is what let the two screens disagree.
            const progress=stepProgress(st,runs,everyStep);
            const run=st.workOrderId?runs.find(w=>w.id===st.workOrderId):undefined;
            const started=progress.made>0||progress.done;
            return <div key={st.id} className={`plan-step${progress.done?" done":""}`}>
              <div className="plan-step-main">
                <span className={`plan-chip type-${st.type}`}>{TYPE_LABEL[st.type]}</span>
                <span className={`plan-chip src-${st.source}`}>{SOURCE_LABEL[st.source]}</span>
                <b>{stepTargetName(st,blanks,skus)}</b>
                <span className="plan-qty">{num(st.qty)} planned{progress.made>0&&` · ${num(progress.made)} made`}{progress.scrap?` · ${num(progress.scrap)} scrap`:""}</span>
                <span className={`plan-state${progress.done?" done":started?" part":""}`}>{progress.done?"Done":started?"Part made":run?"On the floor":"Planned"}</span>
              </div>
              {(st.note||st.linkedTo||progress.by||run)&&<p className="plan-step-note">
                {st.linkedTo&&<em>{st.linkedTo}</em>}{st.note}
                {run&&<i>Run {run.id} · {run.line} · {run.status.toLowerCase()} · {num(run.good)} of {num(run.quantity)} made{run.scrap?` · ${num(run.scrap)} scrap on the run`:""}</i>}
                {progress.by&&<i>{st.reconciledBy?`Recorded by ${progress.by}, corrected by ${st.reconciledBy}`:`Recorded by ${progress.by}`}{progress.at?` · ${fmtDue(progress.at)}`:""}</i>}
              </p>}

              <div className="plan-step-actions">
                {/* A step with a run is recorded on the floor, against that run. Offering a second box
                    here is exactly how the plan and the run came to hold different numbers. */}
                {run
                  ?<button className="secondary" onClick={()=>openRecord(run.id)}>Open {run.id}</button>
                  :<>
                    {!progress.done&&<button className="secondary" onClick={()=>{setRecording(recording===st.id?null:st.id);setEditing(null);setReconciling(null)}}>{recording===st.id?"Cancel":"Record made"}</button>}
                    {owner&&(st.type==="mold"||st.type==="assemble")&&!started&&<button className="primary" onClick={()=>sendToFloor(st,day)}>Send to the floor</button>}
                  </>}
                {owner&&<button className="secondary" onClick={()=>{setEditing(editing===st.id?null:st.id);setRecording(null);setReconciling(null)}}>{editing===st.id?"Cancel":"Edit"}</button>}
                {owner&&!run&&<button className="secondary" onClick={()=>{setReconciling(reconciling===st.id?null:st.id);setEditing(null);setRecording(null)}}>{reconciling===st.id?"Cancel":"Reconcile"}</button>}
                {owner&&!started&&!run&&<button className="link-button" onClick={()=>writeDays(ds=>ds.map(d=>({...d,steps:d.steps.filter(x=>x.id!==st.id)})),"plan.step.remove",`${st.id} removed`)}>Remove</button>}
              </div>

              {recording===st.id&&<Amount label="How many were actually made?" initial={progress.made||st.qty} extra="scrap"
                confirm="Save what was made" onCancel={()=>setRecording(null)} onSave={(n,scrap)=>record(st,n,scrap)}/>}

              {reconciling===st.id&&<Amount label={`True quantity made — corrects the record, and notes that you were the one who did it.`}
                initial={progress.made||st.qty} confirm="Correct the record" onCancel={()=>setReconciling(null)} onSave={n=>reconcile(st,n)}/>}

              {editing===st.id&&<EditStep step={st} day={day} blanks={blankOptions(blanks,data.itemRates)} skus={skus}
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
    }):<article className="panel"><p className="empty-list">{view==="month"?`Nothing planned on ${fmtDue(selected)}.${owner?" Pick another day, or add a step from its cell.":""}`:`Nothing planned for ${monthLabel}.`}</p></article>}

    <div className="calendar-legend">
      <span><i className="step-amazon"/>Amazon step</span><span><i className="step-wholesale"/>Wholesale step</span>
      <span><i className="order"/>Run · customer order</span><span><i className="stock"/>Run · build stock</span>
      <span><i className="maintenance"/>Maintenance</span><span><i className="delivery"/>Inbound delivery</span>
    </div>
  </section>;
}

/**
 * The line: every order still to be made, in the order it was taken, each dated behind the ones ahead
 * of it. First in, first served — nothing jumps the queue by being urgent, because the queue is the
 * promise. What it is for is the last two columns: what the customer was told, and what the machines
 * can actually do.
 */
function TheLine({data,onOpen}:{data:AppData;onOpen:(id:string)=>void}){
  const {commit,notify,role,user}=useApp();
  const owner=role==="owner";
  const [rushing,setRushing]=useState<string|null>(null);
  const [why,setWhy]=useState("");
  const queue=productionQueue(data);
  if(!queue.length)return null;
  const slipping=queue.filter(q=>q.daysLate);

  const setRush=(o:OrderRecord,rush:boolean)=>{
    commit(v=>({...v,orders:v.orders.map(x=>x.id===o.id
      ?(rush?{...x,rush:{at:new Date().toISOString(),by:user||"Owner",...(why.trim()?{why:why.trim()}:{})}}
            :{...x,rush:undefined})
      :x)}),rush?"order.rush":"order.rush.clear",`${o.id} ${rush?"moved to the front":"back in line"}`);
    setRushing(null);setWhy("");
    notify(rush?`${o.id} is urgent — it goes to the front of the line`:`${o.id} is back in its place in line`,PRODUCTION_CALENDAR);
  };

  return <section className="plan-queue">
    <div className="plan-queue-head">
      <h2>The line · {queue.length} order{queue.length===1?"":"s"} to make</h2>
      <span className={slipping.length?"late":""}>{slipping.length?`${slipping.length} will miss the date given`:"all on time"}</span>
    </div>
    <div className="plan-queue-rows">
      {queue.map(q=>{
        const customer=data.customers.find(c=>c.id===q.order.customerId);
        return <div key={q.order.id} className={`plan-queue-row${q.daysLate?" late":""}${q.order.rush?" rush":""}`}>
          <span className="plan-queue-pos">{q.position}</span>
          <span className="plan-queue-who">
            <b><button className="link-button" onClick={()=>onOpen(q.order.id)}>{q.order.id}</button> · {customer?.name||"Customer"}
              {q.order.rush&&<i className="rush-chip">Urgent</i>}</b>
            <small>{num(q.order.quantity)} bottles · {q.toMake?`${num(q.toMake)} to make`:"from stock"}{q.scheduled?" · on the calendar":""}
              {q.order.rush?.why?` · ${q.order.rush.why}`:""}{q.order.rush?.by?` · moved up by ${q.order.rush.by}`:""}</small></span>
          <span className="plan-queue-when"><b>{fmtDue(q.finish)}</b>
            <small>{q.order.promised&&q.order.promised!==q.finish?`promised ${fmtDue(q.order.promised)}`:`needed ${fmtDue(q.order.due)}`}</small></span>
          <em>{q.daysLate?`${q.daysLate}d late`:"on time"}</em>
          {owner&&<span className="plan-queue-act">
            {q.order.rush
              ?<button className="link-button" onClick={()=>setRush(q.order,false)}>Back in line</button>
              :<button className="link-button" onClick={()=>{setRushing(rushing===q.order.id?null:q.order.id);setWhy("")}}>{rushing===q.order.id?"Cancel":"Make urgent"}</button>}
          </span>}
          {rushing===q.order.id&&<RushPreview data={data} order={q.order} why={why} setWhy={setWhy}
            onCancel={()=>setRushing(null)} onConfirm={()=>setRush(q.order,true)}/>}
        </div>;
      })}
    </div>
  </section>;
}

/**
 * What moving this order to the front actually costs, before it is done.
 *
 * Somebody is always behind. The orders that go backwards are named, and the ones that would then miss
 * a date their customer has already been given are called out as phone calls — because the point of
 * doing this in the app rather than in someone's head is that the cost is visible when the decision is
 * made, not discovered a fortnight later.
 */
function RushPreview({data,order,why,setWhy,onCancel,onConfirm}:{data:AppData;order:OrderRecord;why:string;setWhy:(v:string)=>void;onCancel:()=>void;onConfirm:()=>void}){
  const impact=rushImpact(data,order.id);
  return <div className="rush-preview">
    <p className="rush-gain">
      {impact.gain>0
        ?<>Moving {order.id} to the front finishes it <b>{fmtDue(impact.finish)}</b> — {impact.gain} day{impact.gain===1?"":"s"} sooner.</>
        :<>Moving {order.id} to the front does not bring it forward: what is ahead of it is already on the calendar and keeps its slot.</>}
    </p>
    {impact.moved.length
      ?<><p className="rush-cost">{impact.moved.length} order{impact.moved.length===1?"":"s"} go{impact.moved.length===1?"es":""} back:</p>
        <ul className="rush-list">{impact.moved.map(m=><li key={m.order.id} className={m.missesPromise?"calls":""}>
          <b>{m.order.id}</b> · {data.customers.find(c=>c.id===m.order.customerId)?.name} — {fmtDue(m.from)} → {fmtDue(m.to)} ({m.days} day{m.days===1?"":"s"} later)
          {m.missesPromise&&<em> · now misses the {fmtDue(m.order.promised)} they were promised</em>}
        </li>)}</ul>
        {impact.calls.length>0&&<p className="rush-calls">{impact.calls.length} customer{impact.calls.length===1?"":"s"} will need a call: {impact.calls.map(c=>data.customers.find(x=>x.id===c.order.customerId)?.name).join(", ")}.</p>}
      </>
      :<p className="rush-cost good">Nothing else moves — there is room in front of it.</p>}
    <label>Why (kept on the order)<input value={why} onChange={e=>setWhy(e.target.value)} placeholder="e.g. their line is down, they collect Friday"/></label>
    <div className="rush-actions">
      <button className="secondary" onClick={onCancel}>Leave it where it is</button>
      <button className="primary" onClick={onConfirm}>Move it to the front</button>
    </div>
  </div>;
}

/**
 * The month at a glance.
 *
 * This is the old production calendar and the production plan as one grid. It draws what each day is
 * asking of the two machines, the steps planned on it, and the things that were only ever on the old
 * calendar — runs, maintenance, inbound deliveries and the dates orders are needed. A run that is
 * carrying out planned steps is NOT drawn separately: its steps already name it, and drawing both is
 * what made the two screens look like different schedules.
 */
const SHOWN=3;                      // chips a month cell shows before it starts counting

/**
 * Blanks, labelled with what they become. A mould step genuinely makes a blank, but nobody orders a
 * "Regular 5-gal" — they order the bottle it turns into, and the two vocabularies meeting on a dropdown
 * is where somebody picks the wrong one.
 */
const blankOptions=(blanks:Blank[],rates:{item:string;blankId?:string}[])=>blanks.map(b=>{
  const makes=rates.filter(r=>r.blankId===b.id).map(r=>r.item);
  return {id:b.id,name:makes.length?`${b.name} — for ${makes.join(", ")}`:b.name};
});
function MonthGrid({ym,days,data,blanks,machines,runs,everyStep,filter,owner,selected,moving,setMoving,onPick,onOpen,onMove}:{
  ym:string;days:ProdDay[];data:AppData;blanks:Blank[];machines:Machine[];runs:WorkOrder[];everyStep:ProdStep[];
  filter:"all"|ProdSource;owner:boolean;selected:string;moving:string|null;setMoving:(v:string|null)=>void;
  onPick:(date:string)=>void;onOpen:(id:string)=>void;onMove:(id:string,date:string)=>void;
}){
  const [y,m]=ym.split("-").map(Number);
  const first=new Date(Date.UTC(y,m-1,1)).getUTCDay();
  const count=new Date(Date.UTC(y,m,0)).getUTCDate();
  const cells=[...Array(first).fill(null),...Array.from({length:count},(_,i)=>i+1)];
  const iso=(d:number)=>`${ym}-${String(d).padStart(2,"0")}`;
  const today=todayIso();

  // Runs with steps are represented by those steps; only a run nobody planned gets its own chip.
  const plannedRunIds=new Set(everyStep.map(s=>s.workOrderId).filter(Boolean) as string[]);
  const runChips=runs.filter(w=>w.status!=="Needs scheduling"&&w.status!=="Done"&&!plannedRunIds.has(w.id))
    .flatMap(w=>Array.from({length:w.days||1},(_,k)=>{
      const d=new Date(w.date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+k);
      const order=data.orders.find(o=>o.id===w.orderId);
      return {id:w.id,date:d.toISOString().slice(0,10),cls:w.orderId?"order":"stock",drag:true,
        title:`${w.id} · ${w.item.split(" · ")[0]}${order?` · ${data.customers.find(c=>c.id===order.customerId)?.name.split(" ")[0]}`:""}${k?" (cont.)":""}`};
    }));
  const other=[
    ...(data.maintenance||[]).filter(x=>x.status!=="Complete")
      .map(x=>({id:x.id,date:dueIso(x.due),cls:"maintenance",drag:false,title:`${x.machine} · ${x.task}`})),
    ...(data.purchaseOrders||[]).filter(p=>p.status==="Open")
      .map(p=>({id:p.id,date:dueIso(p.eta.replace(/\s*\(.*\)/,"")),cls:"delivery",drag:false,title:`${p.id} · ${p.item.split(" · ")[0]} · ${num(p.quantity)}`})),
    ...data.orders.filter(o=>stageOf(o)<STAGE_SHIPPED)
      .map(o=>({id:o.id,date:dueIso(o.due),cls:"due",drag:false,title:`Needed · ${o.id} · ${data.customers.find(c=>c.id===o.customerId)?.name.split(" ")[0]||""}`})),
  ].filter(x=>x.date) as {id:string;date:string;cls:string;drag:boolean;title:string}[];

  return <>
    <div className="month-weekdays">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(x=><span key={x}>{x}</span>)}</div>
    <div className="month-calendar plan-month-grid">{cells.map((date,index)=>{
      if(date===null)return <div className="month-day outside" key={`empty-${index}`}/>;
      const key=iso(date);
      const day=days.find(d=>d.date===key);
      const loads=day?dayLoad(day,blanks,machines,runs,everyStep):[];
      const over=loads.some(l=>l.over>0);
      const steps=(day?.steps||[]).filter(s=>filter==="all"||s.source===filter);
      const chips=[
        ...steps.map(st=>({key:st.id,id:st.id,cls:`step-${st.source}`,drag:owner&&!st.workOrderId,step:st,
          title:`${TYPE_LABEL[st.type]} ${num(st.qty)} · ${stepTargetName(st,blanks,data.skus||[])}`})),
        ...runChips.filter(x=>x.date===key).map((x,k)=>({key:x.id+k,id:x.id,cls:x.cls,drag:x.drag,step:undefined,title:x.title})),
        ...other.filter(x=>x.date===key).map((x,k)=>({key:x.id+k,id:x.id,cls:x.cls,drag:x.drag,step:undefined,title:x.title})),
      ] as {key:string;id:string;cls:string;drag:boolean;step?:ProdStep;title:string}[];
      return <div key={key} role="button" tabIndex={0}
        className={`month-day${key===today?" today":""}${key===selected?" picked":""}${over?" over":""}`}
        onKeyDown={e=>{if(e.key!=="Enter")return;if(moving)onMove(moving,key);else onPick(key)}}
        onDragOver={e=>{if(owner)e.preventDefault()}}
        onDrop={e=>{if(owner)onMove(e.dataTransfer.getData("text/plain"),key)}}
        onClick={()=>moving&&owner?onMove(moving,key):onPick(key)}>
        <header><b>{date}</b>{key===today&&<small>Today</small>}</header>
        {loads.filter(l=>l.units>0).map(l=><div key={l.machine.id} className={`month-load${l.over?" over":""}`}>
          <i style={{width:`${Math.min(100,Math.round(l.units/l.capacity*100))}%`}}/>
          <span>{num(l.units)}/{num(l.capacity)}</span>
        </div>)}
        {/* A month cell is for scanning, not reading. Three chips, then a count — the day's full
            detail is the card below, which is where the buttons that do anything live. */}
        <div>
          {chips.slice(0,SHOWN).map(c=>c.step
            ?<button key={c.key} className={`step-${c.step.source}${moving===c.step.id?" moving":""}`}
              draggable={owner&&!c.step.workOrderId} onDragStart={e=>e.dataTransfer.setData("text/plain",c.step!.id)}
              title={c.step.workOrderId?`On run ${c.step.workOrderId}`:"Open this day"}
              onClick={e=>{e.stopPropagation();onPick(key)}}>{c.title}</button>
            :<button key={c.key} className={`${c.cls}${moving===c.id?" moving":""}`}
              draggable={owner&&c.drag} onDragStart={e=>e.dataTransfer.setData("text/plain",c.id)}
              onClick={e=>{e.stopPropagation();if(owner&&c.drag&&moving!==c.id)setMoving(c.id);else{setMoving(null);onOpen(c.id)}}}
              title={owner&&c.drag?"Click to pick up, again to open":"Open"}>{c.title}</button>)}
          {chips.length>SHOWN&&<button className="month-more" onClick={e=>{e.stopPropagation();onPick(key)}}>+{chips.length-SHOWN} more</button>}
        </div>
      </div>;
    })}</div>
  </>;
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
  // Dates come from the queue, and the steps are placed against the same load the queue used. Reading
  // one number here and writing another was how the panel and the line came to disagree.
  const queue=productionQueue(data);
  if(!waiting.length)return null;
  return <section className="plan-todo">
    <h2>{waiting.length} paid order{waiting.length===1?"":"s"} not on the plan yet</h2>
    <p className="plan-todo-note">These are past the money gate and can go on a machine. Adding one fills the gaps the Amazon plan leaves — it never overbooks a line, so if the date slips, the date is the truth.</p>
    {waiting.map(o=>{
      const customer=data.customers.find(c=>c.id===o.customerId);
      const need=orderNeeds(o,data);
      const plan=planOrder(o,data,undefined,loadAheadOf(data,o.id));
      const place=queue.find(q=>q.order.id===o.id);
      const moulds=plan.entries.filter(e=>e.step.type==="mold");
      const summary=need.toMake?`${num(need.toMake)} to mould over ${new Set(moulds.map(e=>e.date)).size} day${new Set(moulds.map(e=>e.date)).size===1?"":"s"}, shipping ${fmtDue(plan.finish)}`:`nothing to mould — shipping ${fmtDue(plan.finish)} from stock`;
      return <article key={o.id} className="plan-todo-row">
        <div className="plan-todo-head">
          <b>{place?`#${place.position} · `:""}{o.id} · {customer?.name||"Customer"}</b>
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
function EditStep({step,day,blanks,skus,onSave,onCancel}:{step:ProdStep;day:ProdDay;blanks:{id:string;name:string}[];skus:{id:string;name:string}[];onSave:(next:Partial<ProdStep>,toDate:string)=>void;onCancel:()=>void}){
  const [qty,setQty]=useState(String(step.qty));
  const [date,setDate]=useState(day.date);
  const [source,setSource]=useState<ProdSource>(step.source);
  const [note,setNote]=useState(step.note||"");
  // What the step makes was the one thing this form could not change, so a step raised against the
  // wrong product had to be removed and typed again. Moulding makes a blank; everything after it
  // usually names a SKU — and wholesale sells the plain bottle, so blanks stay available there too.
  const [target,setTarget]=useState(step.target);
  const options=step.type==="mold"?blanks:[...skus,...blanks];
  const save=()=>{
    const next:Partial<ProdStep>={};
    const n=Math.max(0,Number(qty)||0);
    if(n!==step.qty)next.qty=n;
    if(source!==step.source)next.source=source;
    if(target!==step.target)next.target=target;
    if(note!==(step.note||""))next.note=note;
    if(!Object.keys(next).length&&date===day.date){onCancel();return}   // nothing actually changed
    onSave(next,date);
  };
  return <div className="plan-form">
    <label>Makes<select value={target} onChange={e=>setTarget(e.target.value)}>
      {[...new Set([step.target,...options.map(o=>o.id)])].map(id=>
        <option key={id} value={id}>{options.find(o=>o.id===id)?.name||id}</option>)}
    </select></label>
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

/**
 * Loading the published month onto a calendar somebody is already working from.
 *
 * The whole point of this screen is that the plan and the floor hold one number, so replacing the plan
 * wholesale would undo that: a step a run was raised from, or one the floor has already recorded
 * against, is a record of bottles that exist. loadPlan keeps those and wholesale work; this shows what
 * that means for THIS company before anything is written, because "load a plan" is not a sentence
 * anybody should have to press on trust.
 */
function PlanLoader({data,onLoad,onClose}:{data:AppData;onLoad:(next:AppData,s:PlanLoad)=>void;onClose:()=>void}){
  // Computed, not applied. The same function does the preview and the write, so what is shown here is
  // exactly what happens — not a second description of it that can drift.
  const {data:next,summary}=loadPlan(data,SEPTEMBER_PLAN);
  const blanks=data.blanks?.length?data.blanks:DEFAULT_BLANKS;
  const skus=data.skus?.length?data.skus:DEFAULT_SKUS;
  const totals=planTotals(SEPTEMBER_PLAN,blanks,data.settings.machines?.length?data.settings.machines:DEFAULT_MACHINES);
  return <div className="overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="modal wide-modal">
      <button className="close" onClick={onClose} aria-label="Close">×</button>
      <p className="eyebrow">September production tracker</p>
      <h2>Load the September plan</h2>
      <p className="intro">{summary.days} days, {fmtDue(summary.from)} to {fmtDue(summary.to)} — the container intake, the emergency LTL on the 11th, Wholesale #1 on the 16th, and the October FTL on the 30th.</p>

      <div className="recap four" style={{marginTop:16}}>
        <Kpi label="Days" value={String(summary.days)} note="Sept 8 to 30"/>
        <Kpi label="Steps added" value={String(summary.added)} note="mould, assemble, palletize, ship"/>
        <Kpi label="Bottles to mould" value={num(totals.totalUnits)} note={blanks.filter(b=>totals.blankLoad[b.id]).map(b=>`${num(totals.blankLoad[b.id])} ${b.name.toLowerCase()}`).join(" · ")}/>
        <Kpi label="Kept as they are" value={String(summary.kept.length+summary.keptWholesale)} note={`${summary.kept.length} already under way · ${summary.keptWholesale} wholesale`}/>
      </div>

      {summary.kept.length>0&&<article className="panel" style={{marginTop:14}}>
        <h3>These are not touched</h3>
        <p className="hint">A run was raised from them, or the floor has already recorded against them. The plan is loaded around them.</p>
        <ul className="plan-kept">
          {summary.kept.slice(0,8).map(st=><li key={st.id}>
            <b>{stepTargetName(st,blanks,skus)}</b>
            <span>{TYPE_LABEL[st.type]} · {num(st.qty)}{st.workOrderId?` · run ${st.workOrderId}`:""}{st.actualQty?` · ${num(st.actualQty)} recorded`:""}</span>
          </li>)}
          {summary.kept.length>8&&<li>and {summary.kept.length-8} more</li>}
        </ul>
      </article>}

      {summary.removed.length>0&&<p className="form-error" style={{marginTop:14}}>
        {summary.removed.length} planned step{summary.removed.length===1?"":"s"} between those dates {summary.removed.length===1?"is":"are"} taken off — the September plan has nothing on {summary.removed.length===1?"that day":"those days"}. Nothing had been started on {summary.removed.length===1?"it":"them"}.
      </p>}

      <div className="button-row" style={{marginTop:18}}>
        <button className="cancel" onClick={onClose}>Cancel</button>
        <button className="primary" onClick={()=>onLoad(next,summary)}>Load {summary.added} steps onto the calendar</button>
      </div>
    </div>
  </div>;
}
