// The warehouse link.
//
// A no-login URL the shop floor opens on the tablet: the production schedule, the steps to complete,
// and the run in front of them. The token in that URL is a bearer credential — whoever holds it is in —
// so this file is written on the assumption that the link WILL leak eventually (a photographed screen,
// a forwarded message, a browser left open on a phone that walks out of the building).
//
// Two things follow from that, and they are the whole design:
//
//  1. It reads a hand-built subset, never the company record. No customers' contact details, no
//     addresses, no prices, no invoices, no balances, no settings, no QuickBooks. Customer NAMES are
//     included because "SO-1187" alone tells the floor nothing about whose pallet it is, and the
//     warehouse tablet already shows them — but that is the boundary, and floorView is written as an
//     allow-list so a field added to AppData later cannot leak by default.
//
//  2. It never accepts a company record. The endpoint's vocabulary is three verbs — record a step,
//     update a run's counts, change a run's status — and the server builds every patch itself. A
//     leaked link cannot reprice the catalogue or delete a customer, because there is no way to ask.
// The .ts extension is deliberate: it is what Node's own resolver wants, so this module can be loaded
// straight from tests/warehouse-link.test.mjs and checked as it ships rather than as a copy of itself.
import { ASSEMBLY_LINE, HOLD_REASONS, JOB_COMPLETE, JOB_NOT_STARTED, JOB_PRODUCTION, JOB_STAGES, blockJob, blockedFor, consume, jobForecast,
  jobPaused, jobPriority, jobReadiness, jobRemaining, jobStageOf, newFloorToken, pauseJob, recordStep, resumeJob, setJobStage, runConsumption, stepProgress,
  type AppData, type Blank, type JobHold, type JobPriority, type Machine, type MaterialCheck, type ProdDay, type ProdStep,
  type Sku, type WorkOrder } from "../app-data.ts";

/** Days either side of today the tablet is shown. Old work stays visible long enough to be recorded. */
const WINDOW_BACK=10, WINDOW_FORWARD=28;

export type FloorOrder={id:string;customer:string;item:string;quantity:number;due:string;notes:string};
/** The build sheet — what somebody making this for the first time needs in front of them. */
export type FloorBuild={item:string;sub?:string;size?:string;mold?:string;colour?:string;material?:string;
  caps:{component:string;qty:number}[];label?:string;boxSize?:string;perCase?:number;casesPerPallet?:number;
  palletPattern?:string;instructions?:string;photo?:string;qcChecks:string[]};
export type FloorWork={id:string;orderId?:string;kind?:string;item:string;quantity:number;good:number;scrap:number;
  remaining:number;status:string;line:string;date:string;purpose:string;qcNote?:string;
  stage:number;paused:boolean;hold?:JobHold;blockedMinutes:number;operator?:string;startedAt?:string;
  dueAt?:string;priority:JobPriority;
  ready:{ok:boolean;missing:string[];checks:MaterialCheck[]};
  build:FloorBuild;
  rate?:{perHour:number;finishAt:string}};
export type FloorEvent={title:string;detail:string;actor:string;at:string};
export type FloorView={
  company:string;lines:string[];machines:Machine[];blanks:Blank[];skus:Sku[];
  days:ProdDay[];workOrders:FloorWork[];orders:FloorOrder[];today:string;now:string;
  shift:{active:number;waiting:number;blocked:number;made:number;target:number};
  activity:FloorEvent[];
  stations:string[];
  holdReasons:string[];
};

const iso=(d:Date)=>d.toISOString().slice(0,10);
const shift=(days:number)=>{const d=new Date();d.setDate(d.getDate()+days);return iso(d)};

/**
 * Constant-time-ish comparison. The tokens are short enough that a timing attack over the internet is
 * not the realistic threat, but comparing without an early return costs nothing.
 *
 * An unset token never authenticates: a company that has not created a link must not be one where the
 * empty string is the password.
 */
export function tokenMatches(supplied:string|null|undefined,stored:string|null|undefined){
  const a=String(supplied||""),b=String(stored||"");
  if(!b||b.length<8||a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}

/**
 * Everything the tablet is allowed to see, built field by field. Nothing is spread from the company
 * record — every value here was chosen.
 */
export function floorView(data:AppData):FloorView{
  const from=shift(-WINDOW_BACK),to=shift(WINDOW_FORWARD);
  const days=(data.prodDays||[]).filter(d=>d.date>=from&&d.date<=to)
    .map(d=>({date:d.date,forWhat:d.forWhat,milestone:d.milestone,
      steps:(d.steps||[]).map(s=>{
        // What was made is read the same way here as everywhere else — from the run when a run owns the
        // step. The tablet is the place this mattered most: it was showing the plan's copy of the number
        // beside the run's, with a button under each.
        const p=stepProgress(s,data.workOrders||[],(data.prodDays||[]).flatMap(x=>x.steps||[]));
        return {id:s.id,type:s.type,source:s.source,target:s.target,qty:s.qty,note:s.note,linkedTo:s.linkedTo,
          machineId:s.machineId,workOrderId:s.workOrderId,
          done:p.done,actualQty:p.made||undefined,scrap:p.scrap||undefined,doneAt:p.at,doneBy:p.by,
          reconciledBy:s.reconciledBy,reconciledAt:s.reconciledAt};
      })}));
  const open=(data.workOrders||[]).filter(w=>jobStageOf(w)<JOB_COMPLETE);
  const workOrders:FloorWork[]=open.map(w=>{
    const rate=data.itemRates.find(r=>r.item===w.item);
    const readiness=jobReadiness(w,data);
    const forecast=jobForecast(w);
    return {
      id:w.id,orderId:w.orderId,kind:w.kind,item:w.item,quantity:w.quantity,good:w.good,scrap:w.scrap,
      remaining:jobRemaining(w),status:w.status,line:w.line||"Line 1",date:w.date,purpose:w.purpose,qcNote:w.qcNote,
      stage:jobStageOf(w),paused:jobPaused(w),hold:w.hold,blockedMinutes:blockedFor(w),
      operator:w.operator,startedAt:w.startedAt,dueAt:w.dueAt,priority:jobPriority(w,data.orders||[]),
      ready:{ok:readiness.ready,missing:readiness.missing,checks:readiness.checks},
      build:{item:w.item,sub:rate?.sub,size:/3[- ]?gal/i.test(w.item)?"3 gallon":/5[- ]?gal/i.test(w.item)?"5 gallon":undefined,
        mold:rate?.mold,colour:rate?.colour,material:rate?.material,caps:rate?.caps||[],label:rate?.label,
        boxSize:rate?.boxSize,perCase:rate?.unitsPerCase,casesPerPallet:rate?.casesPerPallet,
        palletPattern:rate?.palletPattern,instructions:rate?.instructions,photo:rate?.photo,
        qcChecks:rate?.qcChecks||[]},
      ...(forecast?{rate:{perHour:forecast.perHour,finishAt:forecast.finishAt}}:{}),
    };
  });
  // Only orders the floor is actually being asked to make or pack, and only the fields it needs to do
  // that: whose it is, what it is, how many, when it is needed, and the note sales left.
  const wanted=new Set([...workOrders.map(w=>w.orderId).filter(Boolean) as string[],
    ...days.flatMap(d=>d.steps.map(s=>s.linkedTo).filter(Boolean) as string[])]);
  const orders=(data.orders||[]).filter(o=>wanted.has(o.id)).map(o=>({
    id:o.id,customer:data.customers.find(c=>c.id===o.customerId)?.name||"",
    item:o.item,quantity:o.quantity,due:o.due,notes:o.notes||""}));
  // The live feed is built from an allow-list of what the floor did, not from the activity log wholesale
  // — that log carries invoice numbers and amounts, and none of that belongs on a tablet in a warehouse.
  const FLOOR_EVENTS=["Production update","Production reported","Run finished","Run started","Order packed",
    "Order ready","Shipped","Quality","Job "];
  const activity:FloorEvent[]=(data.activities||[])
    .filter(a=>FLOOR_EVENTS.some(t=>a.title.startsWith(t)))
    .slice(0,12).map(a=>({title:a.title,detail:a.detail,actor:a.actor,at:a.createdAt}));
  const stations=Array.from(new Set([...(data.settings.lines||["Line 1"]),ASSEMBLY_LINE,...open.map(w=>w.line||"Line 1")]));
  return {
    company:data.settings.company||"",
    lines:data.settings.lines||["Line 1"],
    machines:data.settings.machines||[],
    blanks:data.blanks||[],skus:data.skus||[],
    days,workOrders,orders,today:iso(new Date()),now:new Date().toISOString(),
    shift:{
      active:workOrders.filter(w=>w.stage===JOB_PRODUCTION&&!w.paused).length,
      waiting:workOrders.filter(w=>w.stage===JOB_NOT_STARTED&&!w.hold).length,
      blocked:workOrders.filter(w=>!!w.hold).length,
      made:workOrders.reduce((a,w)=>a+w.good,0),
      target:workOrders.reduce((a,w)=>a+w.quantity,0),
    },
    activity,stations,holdReasons:HOLD_REASONS,
  };
}

export type FloorAction=
  |{op:"step.record";stepId:string;made:number;scrap?:number;by?:string}
  |{op:"wo.progress";woId:string;good?:number;scrap?:number;by?:string}
  |{op:"wo.status";woId:string;status:string;by?:string}
  |{op:"job.stage";woId:string;stage:number;by?:string}
  |{op:"job.pause";woId:string;by?:string}
  |{op:"job.resume";woId:string;by?:string}
  |{op:"job.block";woId:string;reason:string;note?:string;by?:string};

/** The name the tablet gives is a label, not a claim — nobody signed in. Kept short and printable. */
export const floorActor=(by?:string)=>{
  const name=String(by||"").replace(/[^\p{L}\p{N}' .-]/gu,"").trim().slice(0,40);
  return name?`Warehouse link · ${name}`:"Warehouse link";
};

const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)&&n>=0?Math.floor(n):0};
const RUN_STATUS=["Running","Paused","QC hold"];

/**
 * Apply one floor action to the company record. Returns the new record and a line for the audit log,
 * or an error string. Every patch is constructed here: the caller passes ids and numbers, never fields.
 */
export function applyFloorAction(data:AppData,action:FloorAction,now=new Date().toISOString()):
  {data:AppData;summary:string;action:string}|{error:string}{
  const by=String(action.by||"").trim().slice(0,40)||"Warehouse";

  if(action.op==="step.record"){
    const day=(data.prodDays||[]).find(d=>(d.steps||[]).some(s=>s.id===action.stepId));
    const step=day&&day.steps.find(s=>s.id===action.stepId);
    if(!step)return {error:"That step is no longer on the plan"};
    // A step being run has one record and it is the run's. Taking a number here as well is precisely
    // how the schedule and the run ended up disagreeing, so it is refused rather than merged.
    if(step.workOrderId)return {error:`Record this on run ${step.workOrderId} — it is the same work`};
    const made=num(action.made),scrap=num(action.scrap);
    const next=recordStep(step,made,by,scrap);
    return {
      data:{...data,prodDays:(data.prodDays||[]).map(d=>({...d,steps:(d.steps||[]).map(s=>s.id===step.id?{...next,doneAt:now}:s)}))},
      action:"floor.step",
      summary:`${step.id} · ${made} made${scrap?`, ${scrap} scrap`:""} (${by})`,
    };
  }

  if(action.op==="wo.progress"){
    const wo=(data.workOrders||[]).find(w=>w.id===action.woId);
    if(!wo)return {error:"That work order is no longer open"};
    if(wo.status==="Done")return {error:"That run is finished"};
    // Never report more good bottles than the run was for — the same cap the tablet in the app applies,
    // so a fat finger on "+24" at the end of a run cannot invent stock.
    const good=Math.min(num(action.good),Math.max(0,wo.quantity-wo.good));
    const scrap=num(action.scrap);
    if(!good&&!scrap)return {error:"Nothing to add"};
    return {
      data:{...data,
        workOrders:data.workOrders.map(w=>w.id===wo.id?{...w,good:w.good+good,scrap:w.scrap+scrap}:w),
        // Good units eat their materials — preforms on a moulding run, caps on an assembly one. The
        // app's own floor screen does this; if the link did not, counts would drift every time the
        // tablet used the link instead of the app.
        inventory:good?consume(data.inventory,runConsumption(wo,data.itemRates),good):data.inventory},
      action:"floor.progress",
      summary:`${wo.id} · +${good} good${scrap?`, +${scrap} scrap`:""} (${by})`,
    };
  }

  // ---- the traveller: where the job is, who is on it, and what is stopping it ----
  if(action.op==="job.stage"){
    const wo=(data.workOrders||[]).find(w=>w.id===action.woId);
    if(!wo)return {error:"That job is no longer open"};
    const stage=Number(action.stage);
    if(!Number.isInteger(stage)||stage<JOB_NOT_STARTED||stage>JOB_COMPLETE)return {error:"That is not a stage"};
    // Forward only, one step at a time. Sending a job back is a correction, and corrections are the
    // owner's — the tablet reporting a problem is how the floor says something went wrong.
    const at=jobStageOf(wo);
    if(stage<=at)return {error:`${wo.id} is already ${JOB_STAGES[at].toLowerCase()}`};
    if(stage>at+1)return {error:`${wo.id} has to go through ${JOB_STAGES[at+1].toLowerCase()} first`};
    return {data:{...data,workOrders:data.workOrders.map(w=>w.id===wo.id?setJobStage(w,stage,by,now):w)},
      action:"floor.stage",summary:`${wo.id} · ${JOB_STAGES[stage].toLowerCase()} (${by})`};
  }

  if(action.op==="job.pause"||action.op==="job.resume"){
    const wo=(data.workOrders||[]).find(w=>w.id===action.woId);
    if(!wo)return {error:"That job is no longer open"};
    const paused=action.op==="job.pause";
    return {data:{...data,workOrders:data.workOrders.map(w=>w.id===wo.id?(paused?pauseJob(w,by,now):resumeJob(w,by,now)):w)},
      action:paused?"floor.pause":"floor.resume",summary:`${wo.id} ${paused?"paused":"resumed"} (${by})`};
  }

  if(action.op==="job.block"){
    const wo=(data.workOrders||[]).find(w=>w.id===action.woId);
    if(!wo)return {error:"That job is no longer open"};
    // A reason from the list, or a written one — but something. "Blocked" with no reason is a job
    // nobody can unblock without walking to the floor to ask.
    const reason=HOLD_REASONS.includes(String(action.reason))?String(action.reason):"";
    if(!reason)return {error:"Pick what is stopping it"};
    const note=String(action.note||"").trim().slice(0,300);
    if(reason==="Other"&&!note)return {error:"Say what the problem is"};
    return {data:{...data,workOrders:data.workOrders.map(w=>w.id===wo.id?blockJob(w,{reason,note:note||undefined,by},now):w)},
      action:"floor.block",summary:`${wo.id} blocked · ${reason}${note?` · ${note}`:""} (${by})`};
  }

  if(action.op==="wo.status"){
    const wo=(data.workOrders||[]).find(w=>w.id===action.woId);
    if(!wo)return {error:"That work order is no longer open"};
    if(!RUN_STATUS.includes(action.status))return {error:"That is not a status the floor can set"};
    // Finishing hands the run to quality, exactly as the in-app floor screen does. The floor never
    // marks its own work Done — that is the owner's call after the checks.
    return {
      data:{...data,workOrders:data.workOrders.map(w=>w.id===wo.id?{...w,status:action.status as WorkOrder["status"]}:w)},
      action:"floor.status",
      summary:`${wo.id} · ${action.status.toLowerCase()} (${by})`,
    };
  }

  return {error:"Unknown action"};
}

export { newFloorToken };
export type { ProdStep };
