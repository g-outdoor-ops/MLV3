"use client";
// Warehouse Floor — the tablet on the shop floor, opened from the warehouse link with no sign-in.
//
// This screen used to be a production schedule: a list of what was planned, with the same button under
// everything saying "record what was made". A schedule tells you what exists. A floor-control screen has
// to answer one question first — what do I do next — and then carry that job the whole way: moulded,
// checked, packed, on the dock, with who did each part and when.
//
// So the shape is one job pinned at the top with a single unmistakable action, the rest collapsed
// underneath, and everything needed to actually run it — the build sheet, the materials, the numbers —
// on the same screen rather than somewhere else. Everything it can do still goes through /api/floor,
// which builds every change itself; this page cannot send a company record even if someone rewrote it.
import { useEffect, useState } from "react";
import { dueLabel } from "../app-data";
import type { FloorBuild, FloorView, FloorWork } from "../server/floor";

const STAGE_LABEL=["Not started","In production","Ready for QC","Packaging","Ready to ship","Complete"];
/** The four the operator is walked through. Quality is signed off in the office, not here. */
const STEPPER=[{stage:1,label:"In Production"},{stage:2,label:"Quality Check"},{stage:3,label:"Packaging"},{stage:4,label:"Ready to Ship"}];
const TABS=["Now","Today","Upcoming","Completed","Blocked"] as const;
type Tab=typeof TABS[number];
/** What is open under the job card. One at a time — a tablet has no room for two. */
type Panel="record"|"instructions"|"problem"|"materials"|null;

const num=(n:number)=>Math.round(n).toLocaleString("en-US");
const clock=(iso?:string)=>iso?new Date(iso).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):"";
const ago=(mins:number)=>mins<60?`${mins} min`:`${Math.floor(mins/60)}h ${mins%60}m`;
/** Materials: three states, in the words the floor would use. */
function readyState(w:FloorWork){
  const tracked=w.ready.checks.filter(c=>c.tracked);
  if(!w.ready.checks.length)return {label:"Nothing to check",tone:"na" as const};
  if(!tracked.length)return {label:"Not checked",tone:"wait" as const};
  const short=tracked.filter(c=>!c.ok);
  if(short.length)return {label:`Missing ${short.length} item${short.length===1?"":"s"}`,tone:"stop" as const};
  return {label:"Ready",tone:"go" as const};
}

export default function FloorLinkPage(){
  const [token]=useState<string|null>(()=>typeof window==="undefined"?null:new URLSearchParams(window.location.search).get("t")||"");
  const remembered=()=>{try{return typeof window==="undefined"?"":localStorage.getItem("ml_floor_name")||""}catch{return ""}};
  const [view,setView]=useState<FloorView|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [toast,setToast]=useState("");
  const [who,setWho]=useState(remembered);
  const [asking,setAsking]=useState(()=>!remembered());
  const [since,setSince]=useState(()=>{try{return typeof window==="undefined"?"":localStorage.getItem("ml_floor_since")||""}catch{return ""}});
  const [syncedAt,setSyncedAt]=useState("");
  const [tick,setTick]=useState(0);

  useEffect(()=>{
    if(!token)return;
    let live=true;
    fetch(`/api/floor?t=${encodeURIComponent(token)}`,{cache:"no-store"})
      .then(r=>r.json())
      .then((j:{view?:FloorView;error?:string})=>{if(!live)return;
        if(j.view){setView(j.view);setError("");setSyncedAt(new Date().toISOString())}
        else setError(j.error||"This link is not valid.")})
      .catch(()=>{if(live)setError("No connection. The floor will load when you are back online.")});
    return ()=>{live=false};
  },[token,tick]);
  // A floor screen that is ten minutes stale is worse than useless, so it refreshes itself — but only
  // while somebody is actually looking at it.
  useEffect(()=>{
    if(!token)return;
    const id=setInterval(()=>{if(document.visibilityState==="visible")setTick(t=>t+1)},45000);
    return ()=>clearInterval(id);
  },[token]);
  useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(""),3200);return ()=>clearTimeout(id)},[toast]);

  const send=async(body:Record<string,unknown>,said:string)=>{
    if(!token||busy)return;
    // Nothing is recorded anonymously. The server refuses an unnamed action outright; asking here means
    // the operator gets the sign-in box rather than a rejection after pressing Save.
    if(who.trim().length<2){setAsking(true);setToast("⚠ Put your name in first — every entry says who made it");return}
    setBusy(true);
    try{
      const r=await fetch("/api/floor",{method:"POST",headers:{"content-type":"application/json","x-floor-token":token},
        body:JSON.stringify({...body,by:who})});
      const j=await r.json() as {view?:FloorView;error?:string};
      if(!r.ok||!j.view){setToast("⚠ "+(j.error||"That could not be saved"));setBusy(false);return}
      setView(j.view);setSyncedAt(new Date().toISOString());setToast("✓ "+said);
    }catch{setToast("⚠ No connection — nothing was saved")}
    setBusy(false);
  };

  if(token==="")return <Shell><p className="wf-empty">This link is missing its code. Ask the owner to send it again.</p></Shell>;
  if(error)return <Shell><p className="wf-empty">{error}</p></Shell>;
  if(!view)return <Shell><p className="wf-empty">Loading the floor…</p></Shell>;

  return <FloorScreen view={view} who={who} setWho={setWho} asking={asking} setAsking={setAsking}
    busy={busy} toast={toast} send={send} syncedAt={syncedAt} since={since} setSince={setSince}
    token={token||""} refresh={()=>setTick(t=>t+1)}/>;
}

/** Separated from the loading of it so the screen can be rendered against a known floor. */
export function FloorScreen({view,who,setWho,asking,setAsking,busy,toast,send,syncedAt,since,setSince,token,refresh,initialPanel=null}:{
  view:FloorView;who:string;setWho:(v:string)=>void;asking:boolean;setAsking:(v:boolean)=>void;
  busy:boolean;toast:string;send:(body:Record<string,unknown>,said:string)=>void;syncedAt:string;
  since?:string;setSince?:(v:string)=>void;token?:string;refresh:()=>void;
  // Which panel starts open. Only a rendered check passes this — the tablet always starts closed —
  // but it is what lets the entry controls be looked at without a browser driving the page.
  initialPanel?:Panel;
}){
  const [tab,setTab]=useState<Tab>("Today");
  const [station,setStation]=useState("All stations");
  const [open,setOpen]=useState<string|null>(null);      // a job the operator asked to look at
  const [panel,setPanel]=useState<Panel>(initialPanel);

  const atStation=(w:FloorWork)=>station==="All stations"||w.line===station;
  const inTab=(w:FloorWork)=>{
    if(tab==="Blocked")return !!w.hold;
    if(tab==="Completed")return w.stage>=4;
    if(tab==="Now")return w.stage===1&&!w.paused;
    if(tab==="Upcoming")return w.date>view.today;
    return w.date<=view.today&&w.stage<4;                 // Today
  };
  const jobs=view.workOrders.filter(atStation);
  const shown=jobs.filter(inTab).sort(order);
  // What to do next: whatever is already running, then rush, then the earliest date.
  const next=jobs.filter(w=>!w.hold&&w.stage<4).sort(order)[0];
  const focus=(open&&jobs.find(w=>w.id===open))||next;
  const rest=shown.filter(w=>w.id!==focus?.id);
  const blocked=jobs.filter(w=>w.hold);
  // The "target" tile used to read 1,080 against a job for 600, with nothing saying where the other 480
  // came from. It is every open job added up, so it is now labelled as that and broken down underneath,
  // and the job those bottles are actually on is shown as a card.
  const openJobs=jobs.filter(w=>!w.hold&&w.stage<4);
  const openTarget=openJobs.reduce((a,w)=>a+w.quantity,0);
  const openMade=openJobs.reduce((a,w)=>a+w.good,0);
  const others=openJobs.filter(w=>w.id!==focus?.id);
  const otherUnits=others.reduce((a,w)=>a+w.remaining,0);
  // The job to get a mould and materials ready for — so work already made and waiting on quality or the
  // packing bench is not it.
  const upNext=others.filter(w=>w.stage<=1).sort(order)[0];

  return <Shell company={view.company} who={who} station={station} syncedAt={syncedAt} since={since}>
    <nav className="wf-tabs">
      <div className="wf-tabset">
        {TABS.map(t=><button key={t} className={tab===t?"on":""} onClick={()=>setTab(t)}>
          {t}{t==="Blocked"&&blocked.length>0?<i className="wf-pip">{blocked.length}</i>:null}
        </button>)}
      </div>
      <div className="wf-stations">
        {["All stations",...view.stations].map(s=><button key={s} className={station===s?"on":""} onClick={()=>setStation(s)}>{s}</button>)}
      </div>
    </nav>

    {/* Signing in costs one line, and once it is done it stays one line. The full-width name field was
        taking a third of a tablet screen for something answered once a shift. */}
    {asking
      ?<div className="wf-who">
        <form onSubmit={e=>{e.preventDefault();const n=who.trim();if(n.length<2)return;const at=new Date().toISOString();try{localStorage.setItem("ml_floor_name",n);localStorage.setItem("ml_floor_since",at)}catch{/* private browsing */}setSince?.(at);setAsking(false)}}>
          <label htmlFor="wf-name">Your first name</label>
          <input id="wf-name" value={who} onChange={e=>setWho(e.target.value)} placeholder="every entry says who made it"/>
          <button className="wf-btn primary" type="submit" disabled={who.trim().length<2}>Sign in</button>
        </form>
      </div>
      :<div className="wf-signed">
        <span><i className="wf-avatar">{who.slice(0,1).toUpperCase()}</i><b>{who}</b> · Signed in{since?<em> since {clock(since)}</em>:null}</span>
        <button className="wf-link" onClick={()=>setAsking(true)}>Not you?</button>
      </div>}

    <div className="wf-body">
      <div className="wf-main">
        {focus
          ?<JobCard job={focus} view={view} busy={busy} panel={panel} setPanel={setPanel} send={send} token={token}
             pinned={focus.id===next?.id} onClose={open?()=>{setOpen(null);setPanel(null)}:undefined}/>
          :<article className="wf-job"><p className="wf-empty">{emptyReason(view,jobs,station,tab)}</p></article>}

        {rest.length>0&&<section className="wf-next">
          <h2>{tab==="Today"?"Up next today":tab}</h2>
          <div className="wf-next-grid">
            {rest.map(w=><NextCard key={w.id} job={w} token={token} onOpen={()=>{setOpen(w.id);setPanel(null);window.scrollTo(0,0)}}/>)}
          </div>
        </section>}

        {blocked.map(w=><div key={w.id} className="wf-alert">
          <span><b>{w.id} is blocked</b> · {w.hold?.reason}{w.hold?.note?` — ${w.hold.note}`:""} · stopped {ago(w.blockedMinutes)} ago by {w.hold?.by}</span>
          <button onClick={()=>{setOpen(w.id);setPanel(null);window.scrollTo(0,0)}}>View issue ›</button>
        </div>)}
      </div>

      <aside className="wf-side">
        <section className="wf-panel">
          <h2>Shift overview</h2>
          <div className="wf-tiles">
            <Tile value={view.shift.active} label="Active" tone="go"/>
            <Tile value={view.shift.waiting} label="Waiting" tone="wait"/>
            <Tile value={view.shift.blocked} label="Blocked" tone={view.shift.blocked?"stop":undefined}/>
            <Tile value={`${num(openMade)} / ${num(openTarget)}`} label="Made · every open job" tone="go" wide/>
          </div>
          <p className="wf-breakdown">
            {focus?<><b>{num(focus.remaining)}</b> left on {focus.id}</>:"Nothing open here"}
            {others.length?<> · <b>{num(otherUnits)}</b> on {others.length} other job{others.length===1?"":"s"}</>:null}
          </p>
        </section>

        {/* One card, not the schedule. Enough to get the next mould and its materials to the machine
            before the current run ends. */}
        {upNext&&<section className="wf-panel">
          <h2>Up next</h2>
          <div className="wf-upnext">
            <b>{upNext.item}</b>
            <small>Job {upNext.id} · {upNext.line} · {dueLabel(view.orders.find(o=>o.id===upNext.orderId)?.due||upNext.date,upNext.dueAt,view.today)}</small>
            <div className="wf-upnext-facts">
              <Fact label="To make" value={num(upNext.remaining)}/>
              <Fact label="Mould" value={upNext.build.mold||"—"}/>
              <Fact label="Materials" value={readyState(upNext).label}/>
            </div>
            <button className="wf-btn" onClick={()=>{setOpen(upNext.id);setPanel(null);window.scrollTo(0,0)}}>Open job</button>
          </div>
        </section>}
        <section className="wf-panel">
          <div className="wf-panel-head"><h2>Live activity</h2><button className="wf-link" onClick={refresh}>Refresh</button></div>
          {view.activity.length?<ul className="wf-feed">
            {view.activity.map((e,i)=><li key={i}><i/><span><b>{e.title}</b><small>{e.detail}</small></span><em>{e.at.replace(/^Today · /,"")}</em></li>)}
          </ul>:<p className="wf-quiet">Nothing recorded yet today.</p>}
        </section>
      </aside>
    </div>

    {toast&&<div className={`wf-toast${toast.startsWith("⚠")?" bad":""}`}>{toast}</div>}
  </Shell>;
}

/** Say why the screen is empty, because "nothing here" has several quite different causes. */
function emptyReason(view:FloorView,atStation:FloorWork[],station:string,tab:Tab){
  if(!view.workOrders.length)return "No jobs on the floor. The office sends work here from the production calendar — nothing has been released yet.";
  if(!atStation.length)return `Nothing at ${station}. Other stations have work — try All stations.`;
  if(tab==="Now")return "Nothing running right now. Start the next job from Today.";
  if(tab==="Upcoming")return "Nothing scheduled after today.";
  if(tab==="Completed")return "Nothing finished yet today.";
  if(tab==="Blocked")return "Nothing is blocked. Good.";
  return "Everything for today is done or waiting on the office.";
}

/** Running first, then rush, then whatever is needed soonest. Blocked work sinks. */
function order(a:FloorWork,b:FloorWork){
  const rank=(w:FloorWork)=>(w.hold?3:w.stage===1&&!w.paused?0:w.priority==="rush"?1:2);
  return rank(a)-rank(b)||a.date.localeCompare(b.date)||a.id.localeCompare(b.id);
}

function Shell({children,company,who,station,syncedAt,since}:{children:React.ReactNode;company?:string;who?:string;station?:string;syncedAt?:string;since?:string}){
  return <main className="wf">
    <header className="wf-top">
      <div className="wf-brand"><span className="wf-logo">Make<i>Logic</i></span><span className="wf-co">{company||""}</span></div>
      <h1>Warehouse Floor</h1>
      <div className="wf-topright">
        {who?<span className="wf-chip"><i className="wf-avatar">{who.slice(0,1).toUpperCase()}</i>{who}{station&&station!=="All stations"?<em> · {station}</em>:null}</span>:null}
        {since?<span className="wf-since">On since {clock(since)}</span>:null}
        <span className={`wf-sync${syncedAt?"":" cold"}`}><i/>{syncedAt?`Synced ${clock(syncedAt)}`:"Not synced yet"}</span>
      </div>
    </header>
    {children}
  </main>;
}

function Tile({value,label,tone,wide}:{value:number|string;label:string;tone?:"go"|"wait"|"stop";wide?:boolean}){
  return <div className={`wf-tile${tone?` ${tone}`:""}${wide?" wide":""}`}><strong>{value}</strong><span>{label}</span></div>;
}

/**
 * The job in front of the operator. One unmistakable next action, sized for a glove, with every number
 * labelled — a bare "500" on a screen is a figure somebody has to stop and interpret.
 */
function JobCard({job,view,busy,panel,setPanel,send,pinned,token,onClose}:{job:FloorWork;view:FloorView;busy:boolean;panel:Panel;setPanel:(p:Panel)=>void;send:(b:Record<string,unknown>,s:string)=>void;pinned:boolean;token?:string;onClose?:()=>void}){
  const pct=job.quantity?Math.min(100,Math.round(job.good/job.quantity*100)):0;
  const order=view.orders.find(o=>o.id===job.orderId);
  const stage=job.stage;
  const due=dueLabel(order?.due||job.date,job.dueAt,view.today);
  const ready=readyState(job);
  // A paused job used to read "IN PRODUCTION" with a button underneath offering to resume it. Nothing
  // was moving and the screen said it was.
  const flag=job.hold?"BLOCKED":job.paused?"PAUSED":pinned?"DO THIS NEXT":STAGE_LABEL[stage].toUpperCase();
  return <article className={`wf-job${job.hold?" blocked":""}${job.paused&&!job.hold?" paused":""}${job.priority==="rush"?" rush":""}`}>
    <header className="wf-job-top">
      <span className={`wf-flag${job.paused&&!job.hold?" paused":""}`}>{flag}</span>
      <span className={`wf-due${/^OVERDUE/.test(due)?" late":""}`}>
        {job.priority==="rush"&&<b>RUSH</b>}
        {due}
        {onClose&&<button className="wf-x" onClick={onClose} aria-label="Back to the job to do next">×</button>}
      </span>
    </header>

    <div className="wf-job-body">
      <Shot photo={job.build.photo} alt={job.item} token={token}/>
      <div className="wf-job-head">
        <h2>{job.item}{job.paused&&!job.hold?<span className="wf-paused">PAUSED</span>:null}</h2>
        <p className="wf-sub">Job {job.id}{order?<> · Customer order {order.id} · {order.customer}</>:<> · {job.purpose}</>}</p>
        <div className="wf-facts">
          <Fact label="Station" value={job.line}/>
          <Fact label="Operator" value={job.operator||"—"}/>
          <Fact label="Started" value={job.startedAt?clock(job.startedAt):"Not started"}/>
          <Fact label="Estimated finish" value={job.rate?`${clock(job.rate.finishAt)} · ${num(job.rate.perHour)}/hr`:"—"}/>
        </div>
      </div>
    </div>

    {/* Labelled, because "320 / 500" alone asks the reader to work out which number is which. */}
    <div className="wf-count">
      <div className="wf-count-main"><strong>{num(job.good)}</strong><span>of {num(job.quantity)} made</span></div>
      <div className="wf-count-rest">
        <span><b>{num(job.remaining)}</b> remaining</span>
        <span><b>{num(job.scrap)}</b> scrap</span>
        <em>{pct}%</em>
      </div>
    </div>
    <div className="wf-bar"><i style={{width:`${pct}%`}}/></div>

    <ol className="wf-stepper">
      {STEPPER.map(s=><li key={s.stage} className={stage>s.stage?"done":stage===s.stage?"on":""}>
        <i>{stage>s.stage?"✓":s.stage}</i><span>{s.label}</span>
      </li>)}
    </ol>

    {job.hold&&<div className="wf-hold">
      <b>{job.hold.reason}</b>
      {job.hold.note&&<p>{job.hold.note}</p>}
      <small>Reported by {job.hold.by} · stopped {ago(job.blockedMinutes)} ago</small>
      <button className="wf-btn" disabled={busy} onClick={()=>send({op:"job.resume",woId:job.id},`${job.id} back on`)}>Problem fixed — resume</button>
    </div>}

    {job.build.channel!=="wholesale"&&(job.build.sku||job.build.barcode||job.build.includes.length>0)&&
      <section className="wf-listing">
        <h3>Amazon listing — label and pack to this</h3>
        <div className="wf-listing-top">
          <div className="wf-codes">
            {job.build.sku&&<div><i>Listing code</i><b>{job.build.sku}</b></div>}
            {job.build.barcode
              ?<div className="wf-barcode"><i>Barcode on the label</i><b>{job.build.barcode}</b></div>
              :<div className="wf-barcode missing"><i>Barcode</i><b>not set — ask the office before labelling</b></div>}
          </div>
          {job.build.packagingPhoto&&<Shot photo={job.build.packagingPhoto} alt={`${job.item} packed`} token={token} small/>}
        </div>
        {job.build.includes.length>0&&<div className="wf-includes">
          <i>In the box with each bottle</i>
          <ul>{job.build.includes.map(x=><li key={x.item}><b>{x.qty}×</b> {x.item}</li>)}</ul>
        </div>}
      </section>}

    <div className="wf-two">
      <section className="wf-mini">
        {/* "No · not counted" told nobody whether that was a problem. The state is now one of three
            words, and the list behind it is a button away rather than a row of chips to decode. */}
        <div className="wf-mini-head"><h3>Materials</h3><span className={`wf-state ${ready.tone}`}>{ready.label}</span></div>
        <button className="wf-btn" onClick={()=>setPanel(panel==="materials"?null:"materials")}>
          {panel==="materials"?"Hide materials":"Check materials"}</button>
        {panel==="materials"&&<ul className="wf-matlist">
          {job.ready.checks.map(c=><li key={c.item} className={!c.tracked?"na":c.ok?"ok":"no"}>
            <span>{c.item}</span>
            <b>{c.tracked?`${num(c.have)} of ${num(c.need)} needed`:"not counted in the system"}</b>
            <em>{!c.tracked?"Not checked":c.ok?"Ready":`Short ${num(c.need-c.have)}`}</em>
          </li>)}
          {!job.ready.checks.length&&<li className="na"><span>This job uses nothing that is counted.</span></li>}
        </ul>}
      </section>
      <section className="wf-mini">
        <h3>Packing</h3>
        {/* Each number says what it counts. "no caps • 1 per case • 600 cases" made the reader guess
            which of those was bottles and which was boxes. */}
        <div className="wf-packfacts">
          <Fact label="Caps per bottle" value={job.build.caps.length?job.build.caps.map(c=>`${c.qty} × ${c.component.toLowerCase()}`).join(" + "):"0 — no caps"}/>
          <Fact label="Bottles per case" value={job.build.perCase?num(job.build.perCase):"not boxed"}/>
          <Fact label="Cases required" value={job.build.perCase?num(Math.ceil(job.quantity/job.build.perCase)):"—"}/>
          <Fact label="Cases per pallet" value={job.build.casesPerPallet?num(job.build.casesPerPallet):"—"}/>
        </div>
        {job.packing.record?.cartons!=null&&<p className="wf-packed">
          Packed so far: <b>{num(job.packing.record.cartons)}</b> cartons · <b>{num(job.packing.record.pallets||0)}</b> pallets
          {job.packing.record.batchId?<> · batch <b>{job.packing.record.batchId}</b></>:null}
          {job.packing.record.operator?` · by ${job.packing.record.operator}`:""}
        </p>}
        {order?.notes&&<p className="wf-note"><b>From sales:</b> {order.notes}</p>}
      </section>
    </div>

    <div className="wf-actions">
      <Primary job={job} busy={busy} onRecord={()=>setPanel(panel==="record"?null:"record")} send={send}/>
      <button className="wf-btn" onClick={()=>setPanel(panel==="instructions"?null:"instructions")}>View instructions</button>
      {stage===1&&!job.hold&&<button className="wf-btn" disabled={busy}
        onClick={()=>send({op:job.paused?"job.resume":"job.pause",woId:job.id},`${job.id} ${job.paused?"resumed":"paused"}`)}>{job.paused?"Resume job":"Pause job"}</button>}
      {!job.hold&&<button className="wf-btn danger" onClick={()=>setPanel(panel==="problem"?null:"problem")}>Report a problem</button>}
    </div>

    {panel==="record"&&stage===3&&<Packing job={job} company={view.company} busy={busy} onCancel={()=>setPanel(null)}
      onSave={(e)=>send({op:"job.pack",woId:job.id,...e},`${job.id} · ${num(e.cartons)} cartons recorded`)}
      onDone={()=>send({op:"job.stage",woId:job.id,stage:4},`${job.id} packed and ready to ship`)}/>}
    {panel==="record"&&stage!==3&&<Record job={job} reasons={view.scrapReasons||[]} busy={busy} onCancel={()=>setPanel(null)}
      onSave={(good,scrap,note)=>send({op:"wo.progress",woId:job.id,good,scrap,note},`${job.id} · ${num(good)} recorded`)}
      onFinish={()=>send({op:"job.stage",woId:job.id,stage:2},`${job.id} sent to quality`)}/>}
    {panel==="instructions"&&<Instructions build={job.build} job={job} order={order}/>}
    {panel==="problem"&&<Problem reasons={view.holdReasons} busy={busy} onCancel={()=>setPanel(null)}
      onSave={(reason,note)=>send({op:"job.block",woId:job.id,reason,note},`${job.id} reported — the office can see it`)}/>}
  </article>;
}

/** One action, and it is the right one for where the job actually is. */
function Primary({job,busy,onRecord,send}:{job:FloorWork;busy:boolean;onRecord:()=>void;send:(b:Record<string,unknown>,s:string)=>void}){
  if(job.hold)return <button className="wf-btn primary" disabled>Blocked — clear it below</button>;
  if(job.stage===0)return <button className="wf-btn primary" disabled={busy||!job.ready.ok}
    onClick={()=>send({op:"job.stage",woId:job.id,stage:1},`${job.id} started`)}>
    {job.ready.ok?"▶ Start job":`Cannot start — ${job.ready.missing[0]} short`}</button>;
  if(job.stage===1)return <button className="wf-btn primary" disabled={busy} onClick={onRecord}>▶ Record production</button>;
  // Quality is signed off in the office, where passing it puts the bottles into stock. The floor is
  // told where the job is, not asked to sign it off.
  if(job.stage===2)return <button className="wf-btn primary" disabled>With the office for quality</button>;
  if(job.stage===3)return <button className="wf-btn primary" disabled={busy} onClick={onRecord}>▶ Pack this run</button>;
  return <button className="wf-btn primary" disabled={busy}
    onClick={()=>send({op:"job.stage",woId:job.id,stage:5},`${job.id} handed to shipping`)}>Handed to shipping</button>;
}

function Fact({label,value}:{label:string;value:string}){
  return <div className="wf-fact"><span>{label}</span><b>{value}</b></div>;
}

function NextCard({job,token,onOpen}:{job:FloorWork;token?:string;onOpen:()=>void}){
  const state=job.hold?job.hold.reason:!job.ready.ok?`Short ${job.ready.missing[0]}`:STAGE_LABEL[job.stage];
  const tone=job.hold?"stop":!job.ready.ok?"wait":job.stage===1?"go":"";
  return <article className={`wf-card${job.priority==="rush"?" rush":""}`}>
    <div className="wf-card-top">
      <Shot photo={job.build.photo} alt={job.item} token={token} small/>
      <div className="wf-card-name">
        <b>{job.item}</b>
        <small>Job {job.id} · {job.line}</small>
      </div>
      <span className={`wf-state ${tone}`}>{state}</span>
    </div>
    <div className="wf-card-nums">
      <span><i>Target</i>{num(job.quantity)}</span>
      <span><i>Made</i>{num(job.good)}</span>
      <span><i>Remaining</i>{num(job.remaining)}</span>
    </div>
    <button className="wf-btn" onClick={onOpen}>Open job</button>
  </article>;
}

/**
 * A counter sized for a gloved hand. Two numbers, each with its own big minus and plus, quick jumps for
 * the sizes actually run, and a reason asked for only once there is scrap to explain. Nothing is sent
 * until Save, so a mis-tap costs a tap back rather than a wrong entry in the log.
 */
function Counter({label,value,set,step,quick,tone}:{label:string;value:number;set:(n:number)=>void;step:number;quick:number[];tone?:"scrap"}){
  return <div className={`wf-counter${tone?` ${tone}`:""}`}>
    <span className="wf-counter-label">{label}</span>
    <div className="wf-counter-row">
      <button className="wf-step" onClick={()=>set(Math.max(0,value-step))} aria-label={`${label} down ${step}`}>−</button>
      <input inputMode="numeric" pattern="[0-9]*" value={String(value)} aria-label={label}
        onChange={e=>set(Math.max(0,Math.floor(Number(e.target.value.replace(/[^0-9]/g,""))||0)))}/>
      <button className="wf-step" onClick={()=>set(value+step)} aria-label={`${label} up ${step}`}>+</button>
    </div>
    <div className="wf-quick">{quick.map(q=><button key={q} className="wf-btn" onClick={()=>set(value+q)}>+{q}</button>)}
      {value>0&&<button className="wf-btn" onClick={()=>set(0)}>Clear</button>}</div>
  </div>;
}

function Record({job,reasons,busy,onSave,onFinish,onCancel}:{job:FloorWork;reasons:string[];busy:boolean;onSave:(good:number,scrap:number,note:string)=>void;onFinish:()=>void;onCancel:()=>void}){
  const [good,setGood]=useState(0);
  const [scrap,setScrap]=useState(0);
  const [reason,setReason]=useState("");
  const [note,setNote]=useState("");
  const said=reason==="Other"?note.trim():reason;
  const left=Math.max(0,job.remaining-good);
  return <div className="wf-form wf-record">
    <h3>Record production · {job.id}</h3>
    <div className="wf-counters">
      <Counter label="Good bottles" value={good} set={setGood} step={1} quick={[24,48,100]}/>
      <Counter label="Scrap" value={scrap} set={setScrap} step={1} quick={[1,5,10]} tone="scrap"/>
    </div>
    {scrap>0&&<div className="wf-reason">
      <span className="wf-counter-label">What went wrong? <em>optional</em></span>
      <div className="wf-reasons">
        {reasons.map(r=><button key={r} className={`wf-btn${reason===r?" on":""}`} onClick={()=>setReason(reason===r?"":r)}>{r}</button>)}
      </div>
      {reason==="Other"&&<input value={note} onChange={e=>setNote(e.target.value)} placeholder="In a few words" aria-label="What went wrong"/>}
    </div>}
    <p className="wf-running">Recording <b>{num(good)}</b> good{scrap?<> and <b>{num(scrap)}</b> scrap</>:null} · <b>{num(left)}</b> would still be left on this job.</p>
    <div className="wf-form-actions">
      <button className="wf-btn" onClick={onCancel}>Cancel</button>
      <button className="wf-btn primary" disabled={busy||(!good&&!scrap)} onClick={()=>onSave(good,scrap,said)}>{busy?"Saving…":"Save"}</button>
    </div>
    {/* The end of a run is the same moment as its last entry, so it is offered here rather than as a
        fifth button competing with the one thing to press. */}
    <button className="wf-btn" style={{width:"100%",marginTop:10}} disabled={busy} onClick={onFinish}>That is the lot — send to quality</button>
  </div>;
}

/**
 * The packing bench. What came off the machine is bottles; what leaves is cartons on pallets with a
 * label on them, and both get counted here by whoever is doing the packing — which is often not the
 * person who moulded it, so this records its own owner.
 *
 * The plan is shown beside the entry rather than filled in for them: a pallet that came out a carton
 * short is a real thing that should be visible, not rounded away by a number the app assumed.
 */
function Packing({job,company,busy,onSave,onDone,onCancel}:{job:FloorWork;company:string;busy:boolean;onSave:(e:{received:number;cartons:number;pallets:number;batchId:string;note:string})=>void;onDone:()=>void;onCancel:()=>void}){
  const plan=job.packing;
  const rec=plan.record;
  const [received,setReceived]=useState(String(rec?.received??job.good));
  const [cartons,setCartons]=useState(String(rec?.cartons??plan.cartons));
  const [pallets,setPallets]=useState(String(rec?.pallets??plan.pallets));
  const [batchId,setBatchId]=useState(rec?.batchId||"");
  const [note,setNote]=useState(rec?.note||"");
  const [label,setLabel]=useState(false);
  const n=(v:string)=>Math.max(0,Number(v)||0);
  const shortCartons=plan.cartons-n(cartons);
  return <div className="wf-form">
    <h3>Pack this run · {job.id}</h3>

    <div className="wf-expect">
      <div><i>Bottles to pack</i>{num(job.good)}</div>
      <div><i>Per carton</i>{plan.perCase||"—"}</div>
      <div><i>Cartons expected</i>{num(plan.cartons)}</div>
      <div><i>Cases per pallet</i>{plan.casesPerPallet||"—"}</div>
      <div><i>Pallets expected</i>{plan.pallets?num(plan.pallets):"—"}</div>
    </div>
    <p className="wf-quiet">
      {plan.caps.length?`${plan.caps.map(c=>`${c.qty} × ${c.component}`).join(" + ")} per bottle · `:""}
      {plan.label?`${plan.label} · `:""}{plan.boxSize?`${plan.boxSize} cartons`:""}
      {plan.palletPattern?` · ${plan.palletPattern}`:""}
    </p>

    <div className="wf-grid3">
      <label>Bottles received<input inputMode="numeric" value={received} onChange={e=>setReceived(e.target.value)}/></label>
      <label>Cartons finished<input inputMode="numeric" value={cartons} onChange={e=>setCartons(e.target.value)}/></label>
      <label>Pallets finished<input inputMode="numeric" value={pallets} onChange={e=>setPallets(e.target.value)}/></label>
    </div>
    {shortCartons>0&&n(cartons)>0&&<p className="wf-short">{num(shortCartons)} cartons fewer than the {num(plan.cartons)} this run should make — recorded as entered.</p>}
    <label className="wf-text">Batch / pallet ID<input value={batchId} onChange={e=>setBatchId(e.target.value)} placeholder="left blank, one is generated"/></label>
    <label className="wf-text">Note<input value={note} onChange={e=>setNote(e.target.value)} placeholder="anything odd about this pallet"/></label>

    <div className="wf-form-actions">
      <button className="wf-btn" onClick={onCancel}>Cancel</button>
      <button className="wf-btn primary" disabled={busy}
        onClick={()=>onSave({received:n(received),cartons:n(cartons),pallets:n(pallets),batchId,note})}>{busy?"Saving…":"Save packing"}</button>
    </div>
    <div className="wf-form-actions" style={{marginTop:10}}>
      <button className="wf-btn" onClick={()=>setLabel(v=>!v)} disabled={!rec?.batchId}>
        {rec?.batchId?(label?"Hide label":"Print pallet label"):"Save first, then print"}</button>
      <button className="wf-btn" disabled={busy||!rec} onClick={onDone}>Packing done — ready to ship</button>
    </div>

    {label&&rec?.batchId&&<PalletLabel job={job} company={company} rec={rec} plan={plan}/>}
  </div>;
}

/** A pallet label, sized for a sheet of A4 or letter and hidden from everything else when printing. */
function PalletLabel({job,company,rec,plan}:{job:FloorWork;company:string;rec:NonNullable<FloorWork["packing"]["record"]>;plan:FloorWork["packing"]}){
  return <div className="wf-label" id="wf-label">
    <div className="wf-label-head"><b>{company||"MakeLogic"}</b><span>{new Date().toLocaleDateString("en-US")}</span></div>
    <h4>{job.item}</h4>
    <div className="wf-label-grid">
      <div><i>Batch</i><b>{rec.batchId}</b></div>
      <div><i>Job</i><b>{job.id}</b></div>
      <div><i>Bottles</i><b>{num(rec.received||0)}</b></div>
      <div><i>Cartons</i><b>{num(rec.cartons||0)}</b></div>
      <div><i>Pallets</i><b>{num(rec.pallets||0)}</b></div>
      <div><i>Per carton</i><b>{plan.perCase||"—"}</b></div>
    </div>
    {rec.note&&<p>{rec.note}</p>}
    <div className="wf-label-code">{rec.batchId}</div>
    <button className="wf-btn primary" onClick={()=>window.print()}>Print</button>
  </div>;
}

/** The build sheet: everything needed to make this correctly without asking anybody. */
function Instructions({build,job,order}:{build:FloorBuild;job:FloorWork;order?:{notes:string;customer:string}}){
  const rows:[string,string][]=[
    ["Product",build.item+(build.sub?` · ${build.sub}`:"")],
    ["Size",build.size||"—"],
    ["Mould / tooling",build.mold||"not recorded"],
    ["Material",build.material||"not recorded"],
    ["Colour",build.colour||"Natural"],
    ["Caps",build.caps.length?build.caps.map(c=>`${c.qty} × ${c.component}`).join(" + "):"none"],
    ["Label",build.label||"not recorded"],
    ["Box",build.boxSize?`${build.boxSize}${build.perCase?` · ${build.perCase} bottles per case`:""}`:"not recorded"],
    ["Pallet",build.casesPerPallet?`${build.casesPerPallet} cases per pallet${build.palletPattern?` · ${build.palletPattern}`:""}`:"not recorded"],
    ["This run",`${num(job.quantity)} bottles${build.perCase?` · ${num(Math.ceil(job.quantity/build.perCase))} cases`:""}`],
  ];
  return <div className="wf-form wf-sheet">
    <h3>Build sheet · {job.item}</h3>
    <dl>{rows.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    {build.instructions&&<p className="wf-note"><b>Standing instruction:</b> {build.instructions}</p>}
    {order?.notes&&<p className="wf-note"><b>For {order.customer}:</b> {order.notes}</p>}
    {build.qcChecks.length>0&&<><h4>Quality checks the office will run</h4>
      <ul className="wf-qc">{build.qcChecks.map(c=><li key={c}>{c}</li>)}</ul></>}
    {!build.mold&&<p className="wf-quiet">Anything reading “not recorded” has not been filled in on this product yet — the office sets it under Item rates.</p>}
  </div>;
}

/** Reporting a problem: one tap for the reason, a note when it needs one. */
function Problem({reasons,busy,onSave,onCancel}:{reasons:string[];busy:boolean;onSave:(reason:string,note:string)=>void;onCancel:()=>void}){
  const [reason,setReason]=useState("");
  const [note,setNote]=useState("");
  return <div className="wf-form">
    <h3>What is stopping the job?</h3>
    <div className="wf-reasons">
      {reasons.map(r=><button key={r} className={`wf-btn${reason===r?" primary":""}`} onClick={()=>setReason(r)}>{r}</button>)}
    </div>
    <label>Anything else the office should know{reason==="Other"?" (needed)":""}
      <input value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. Molder 2 tripped out at 10:15"/></label>
    <div className="wf-form-actions">
      <button className="wf-btn" onClick={onCancel}>Cancel</button>
      <button className="wf-btn danger solid" disabled={busy||!reason||(reason==="Other"&&!note.trim())}
        onClick={()=>onSave(reason,note)}>Report it — this stops the job</button>
    </div>
  </div>;
}

/**
 * The product. A photo when the office has put one on the item, the drawing when it has not — a picture
 * identifies a bottle across a bench far faster than a name one word different from its neighbour.
 */
function Shot({photo,alt,token,small}:{photo?:string;alt:string;token?:string;small?:boolean}){
  return <div className={`wf-shot${small?" small":""}`}>
    {photo
      // Served by our own API route and already resized before it was stored; this deployment has no
      // image optimiser for next/image to use.
      // eslint-disable-next-line @next/next/no-img-element
      ?<img src={token?`${photo}&t=${encodeURIComponent(token)}`:photo} alt={alt} className="wf-photo"/>
      :<Bottle/>}
  </div>;
}

/** A bottle, drawn — what is shown until somebody photographs the real one. */
function Bottle(){
  return <svg viewBox="0 0 64 96" className="wf-bottle" role="img" aria-label="Bottle">
    <path d="M26 6h12v9c0 2 1 3 3 4l6 3c4 2 7 6 7 11v52c0 4-3 7-7 7H17c-4 0-7-3-7-7V33c0-5 3-9 7-11l6-3c2-1 3-2 3-4z"
      fill="#e6ebe8" stroke="#aab7ae" strokeWidth="1.5" strokeLinejoin="round"/>
    <rect x="24" y="2" width="16" height="6" rx="2" fill="#c3cec7"/>
    <rect x="16" y="46" width="12" height="22" rx="4" fill="none" stroke="#aab7ae" strokeWidth="1.5"/>
  </svg>;
}
