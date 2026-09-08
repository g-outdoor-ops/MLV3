// MakeLogic company data model.
// Everything the app knows is one JSON document persisted through /api/state.
// New fields are optional and filled in by normalize() so data saved by the
// previous UI keeps loading.

export type Customer={id:string;name:string;kind:"customer"|"lead";contact:string;email:string;phone:string;rep:string;stage:string;balance:number;lifetimeSales:number;billing:string;delivery:string;terms:string;notes:string;prices?:Record<string,number>;qb?:boolean;qboId?:string};
// `fee` is the processing fee charged for taking payment — a line on the invoice, never discounted, and
// part of the total the customer is asked for. It is stored rather than recomputed so the figure here
// and the figure QuickBooks billed can never drift apart.
export type DocumentRecord={id:string;kind:"quote"|"invoice";customerId:string;item:string;cases:number;rate:number;discount:number;shipping:number;fee?:number;status:string;due:string;paid:number;orderId?:string;quantity?:number;qbSynced?:boolean;note?:string;qboId?:string;qboDocNumber?:string;paymentQboId?:string;
  // Imported from QuickBooks: the document exactly as the books hold it. `total` is authoritative and
  // must never be recomputed — see documentTotal.
  lines?:OrderLine[];total?:number;balance?:number;txnDate?:string;source?:"quickbooks"};
export type OrderLine={item:string;quantity:number;rate:number};
export type OrderRecord={stageV2?:boolean;id:string;customerId:string;item:string;cases:number;quantity:number;due:string;status:string;payment:string;deposit?:number;depositAt?:string;
  lines?:OrderLine[];shipMethod?:string;shipping?:number;discount?:number;notes?:string;invoiceNote?:string;stage?:number;invoiceId?:string;rep?:string;createdAt?:string;
  // The date the customer was actually given when the order was taken, worked out from the line as it
  // stood at that moment. Kept so what was promised can be compared with what happened, rather than
  // being recalculated later against a queue that has moved on.
  promised?:string;
  // Jumped up the line for a customer in a bind. It carries who did it and why, because moving one
  // order forward moves everybody behind it back, and in three months somebody will ask who decided.
  rush?:{at:string;by:string;why?:string}};
export type QcCheck={label:string;result:boolean|null};
// `kind` says which station this run is on, and so what its good units eat: moulding pulls preforms,
// assembly pulls caps. Without it an assembly run deducted PET preforms that had already been consumed
// when the bottle was blown. Runs written before this are moulding.
export type WorkOrder={id:string;orderId?:string;kind?:"mould"|"assembly";item:string;quantity:number;good:number;scrap:number;packed:number;date:string;status:string;purpose:string;line?:string;days?:number;qc?:QcCheck[];qcNote?:string;qcResult?:"pass"|"hold"|"scrap"|null;
  // ---- the job traveller ----
  // `status` above is the word the office screens have always used. These carry the finer state the
  // floor works in: which stage of the journey the job is at, who is on it, when each stage was
  // reached, and what is stopping it. Both are written together so neither view is ever out of date.
  jobStage?:number;paused?:boolean;hold?:JobHold;rework?:boolean;
  operator?:string;startedAt?:string;dueAt?:string;priority?:JobPriority;history?:JobStamp[];
  // Packing is its own job with its own owner: the person who boxes a run is often not the person who
  // moulded it, and "who made this" and "who packed this" are different answers to different questions.
  packing?:PackingRecord};
// ---- one product ---------------------------------------------------------------------
// A product was three records in three places: an item rate (price, how it is made, how it is packed),
// an inventory row (how many there are), and a SKU (the Amazon listing). They were joined by the item's
// name and edited on three screens, so they drifted — a price with no stock line, a listing with no
// price, a photo filed under a name nothing matched.
//
// This is the whole thing as one record. It is a VIEW joined by name, not a fourth table: every money
// path in the app — invoice totals, COGS, the P&L, order pricing — reads itemRates and inventory
// directly, and moving them to reorganise a catalogue would put invoicing at risk to tidy a screen.
// What changes is that there is now one shape to read and exactly one function that writes it, so the
// three cannot fall out of step.
export type Product={
  name:string;sub?:string;kind:"finished"|"raw";
  sku?:string;channel:"wholesale"|"amazon"|"both";barcode?:string;includes:{item:string;qty:number}[];
  rate:number;floor?:number;minimum:number;discountLimit:number;cost:number;
  blankId?:string;caps:AssemblyCap[];material?:string;mold?:string;colour?:string;qcChecks?:string[];
  unitsPerCase:number;packedAs:"loose"|"boxed"|"pallet";shipsAs:"boxed"|"pallet-boxed"|"pallet-loose";
  perPallet?:number;boxItem?:string;boxSize?:string;palletPattern?:string;label?:string;
  onHand:number;committed:number;reorder:number;unit?:string;onOrder?:number;eta?:string;supplier?:string;
  instructions?:string;
};

/** Everything the shop sells or stocks, as one record each. */
export function products(data:AppData):Product[]{
  const rates=data.itemRates||[];const rows=data.inventory||[];const skus=data.skus||[];
  // A listing is a product too. It joins on the catalogue name it is sold as, and a listing that has
  // not been priced or counted yet has only its own name to go on — so that name stands in until it is
  // saved. Leaving them out is what made the Amazon list read empty while six listings existed.
  const names=Array.from(new Set([...rows.map(i=>i.item),...rates.map(r=>r.item),...skus.map(k=>k.itemId||k.name)]));
  return names.map(name=>{
    const r=rates.find(x=>x.item===name);
    const i=rows.find(x=>x.item===name);
    const k=skus.find(x=>x.itemId===name)||skus.find(x=>!x.itemId&&x.name===name);
    return {
      name,sub:r?.sub||(k&&k.name!==name?k.name:undefined),kind:(i?.kind||r?.kind||"finished") as "finished"|"raw",
      // The channel is the product's own, not the listing's: a wholesale bottle has no listing.
      sku:k?.id,channel:r?.channel||k?.channel||"wholesale",barcode:r?.barcode,includes:r?.includes||[],
      rate:r?.rate??0,floor:r?.floor,minimum:r?.minimum??0,discountLimit:r?.discountLimit??0,
      cost:r?.cost??i?.cost??0,
      blankId:r?.blankId??(k?.blankId||undefined),caps:r?.caps?.length?r.caps:(k?.caps||[]),material:r?.material,mold:r?.mold,colour:r?.colour,qcChecks:r?.qcChecks,
      unitsPerCase:r?.unitsPerCase??2,packedAs:r?.packedAs||"boxed",
      shipsAs:r?.shipsAs||(r?.casesPerPallet?"pallet-boxed":"boxed"),
      perPallet:r?.perPallet??r?.casesPerPallet,boxItem:r?.boxItem,boxSize:r?.boxSize,
      palletPattern:r?.palletPattern,label:r?.label,
      onHand:i?.onHand??0,committed:i?.committed??0,reorder:i?.reorder??0,unit:i?.unit,
      onOrder:i?.onOrder,eta:i?.eta,supplier:i?.supplier,
      instructions:r?.instructions,
    };
  });
}
export const productOf=(data:AppData,name:string)=>products(data).find(p=>p.name===name);

/**
 * The only writer. Price, stock, listing and packing go in together, or the three fall out of step
 * again — which is the whole reason this exists.
 *
 * A rename carries the stock line and the listing with it. It deliberately does not rewrite history:
 * an invoice line records what was sold under the name it was sold under.
 */
export function saveProduct(data:AppData,p:Product,previousName?:string):AppData{
  const was=previousName&&previousName!==p.name?previousName:null;
  const key=was||p.name;
  const rate:ItemRate={
    id:(data.itemRates||[]).find(r=>r.item===key)?.id||`i${Date.now().toString(36)}`,
    item:p.name,sub:p.sub,rate:p.rate,floor:p.floor,minimum:p.minimum,discountLimit:p.discountLimit,
    unitsPerCase:p.unitsPerCase,kind:p.kind,cost:p.cost,qcChecks:p.qcChecks||DEFAULT_QC,
    material:p.material,blankId:p.blankId,caps:p.caps,mold:p.mold,colour:p.colour,label:p.label,
    channel:p.channel,barcode:p.barcode,includes:p.includes?.length?p.includes:undefined,
    boxItem:p.boxItem,boxSize:p.boxSize,packedAs:p.packedAs,shipsAs:p.shipsAs,perPallet:p.perPallet,
    casesPerPallet:p.shipsAs==="pallet-boxed"?p.perPallet:undefined,
    palletPattern:p.palletPattern,instructions:p.instructions,
  };
  const oldRow=(data.inventory||[]).find(i=>i.item===key);
  const row:InventoryRow={
    id:oldRow?.id||`s${Date.now().toString(36)}`,item:p.name,kind:p.kind,
    onHand:p.onHand,committed:p.committed,reorder:p.reorder,cost:p.cost,
    unit:p.unit,onOrder:p.onOrder,eta:p.eta,supplier:p.supplier,usage:oldRow?.usage,
  };
  const rates=(data.itemRates||[]).some(r=>r.item===key)
    ?(data.itemRates||[]).map(r=>r.item===key?rate:r):[...(data.itemRates||[]),rate];
  let inventory=(data.inventory||[]).some(i=>i.item===key)
    ?(data.inventory||[]).map(i=>i.item===key?row:i):[...(data.inventory||[]),row];
  // A material named on a product has to be countable, or the floor's readiness check has nothing to
  // check it against; it becomes a raw line the first time it is mentioned.
  if(p.material&&!inventory.some(i=>i.item===p.material))
    inventory=[...inventory,{id:`s${Date.now().toString(36)}m`,item:p.material,kind:"raw" as const,onHand:0,committed:0,reorder:0,cost:0,unit:"units"}];
  let skus=(data.skus||[]).map(k=>k.itemId===key?{...k,itemId:p.name}:k);
  if(p.sku){
    const existing=skus.find(k=>k.id===p.sku);
    const entry:Sku={id:p.sku,name:p.name,channel:p.channel==="wholesale"?"amazon":p.channel,blankId:p.blankId||existing?.blankId||"",
      caps:p.caps,itemId:p.name,unitsPerPalletLtl:existing?.unitsPerPalletLtl,unitsPerPalletFtl:existing?.unitsPerPalletFtl};
    skus=existing?skus.map(k=>k.id===p.sku?entry:k):[...skus,entry];
    // One listing to one product: a code moved here is taken off whatever held it before.
    skus=skus.map(k=>k.id!==p.sku&&k.itemId===p.name?{...k,itemId:undefined}:k);
  }else{
    skus=skus.map(k=>k.itemId===p.name?{...k,itemId:undefined}:k);
  }
  return {...data,itemRates:rates,inventory,skus};
}

/** Remove a product, its stock line and its listing. History keeps the name it was sold under. */
export function deleteProduct(data:AppData,name:string):AppData{
  return {...data,
    itemRates:(data.itemRates||[]).filter(r=>r.item!==name),
    inventory:(data.inventory||[]).filter(i=>i.item!==name),
    // A listing that never got a catalogue name of its own is matched by its own name, which is what
    // it was shown under.
    skus:(data.skus||[]).filter(k=>k.itemId?k.itemId!==name:k.name!==name)};
}

/** Where a product is still referred to, so nothing in use is deleted or renamed by surprise. */
export function productUses(data:AppData,name:string){
  const orders=(data.orders||[]).filter(o=>(o.lines||[]).some(l=>l.item===name)||o.item===name).map(o=>o.id);
  const runs=(data.workOrders||[]).filter(w=>w.item===name).map(w=>w.id);
  const steps=(data.prodDays||[]).flatMap(d=>d.steps||[]).filter(x=>x.target===name).length;
  const docs=(data.documents||[]).filter(d=>(d.lines||[]).some(l=>l.item===name)).map(d=>d.id);
  return {orders,runs,steps,docs,any:orders.length+runs.length+steps+docs.length};
}

// ---- the job traveller -------------------------------------------------------------
// A schedule card says what is planned. A traveller says where the thing actually is: molded, checked,
// packed, on the dock. The floor needs the second one — "what do I do next" is not answerable from a
// date and a quantity.
export const JOB_STAGES=["Not started","In production","Ready for QC","Packaging","Ready to ship","Complete"] as const;
export const JOB_NOT_STARTED=0,JOB_PRODUCTION=1,JOB_QC=2,JOB_PACKAGING=3,JOB_READY_SHIP=4,JOB_COMPLETE=5;
export type JobPriority="rush"|"normal"|"hold";
export type JobStamp={stage:number;at:string;by:string};
export type JobHold={reason:string;note?:string;by:string;at:string};
/** The reasons the floor can give in one tap. "Other" takes a note. */
export const HOLD_REASONS=["Machine down","Material unavailable","Wrong or damaged material","Quality problem",
  "Tooling / mould problem","Packaging unavailable","Waiting for instructions","Quantity mismatch","Other"];
/**
 * Why bottles were scrapped, in one tap. The count on its own says a run went badly; the reason is what
 * anybody can act on, and asking for it at the moment it happened is the only time it is remembered.
 */
export const SCRAP_REASONS=["Short shot","Flash / trim","Contamination","Wrong colour","Dropped or crushed",
  "Neck or thread fault","Startup waste","Other"];

// The office screens read `status` and there are sixty of them, so the two vocabularies are mapped in
// one place rather than rewritten everywhere. Legacy "Done" means the run finished under the old flow,
// which is the end of the line; a job that reaches QC under the new one is set explicitly.
const LEGACY_TO_JOB:Record<string,number>={"Needs scheduling":JOB_NOT_STARTED,"Scheduled":JOB_NOT_STARTED,
  "Released":JOB_NOT_STARTED,"Running":JOB_PRODUCTION,"Paused":JOB_PRODUCTION,"QC hold":JOB_QC,"Done":JOB_COMPLETE};
const JOB_TO_LEGACY:Record<number,string>={0:"Scheduled",1:"Running",2:"QC hold",3:"Done",4:"Done",5:"Done"};

export const jobStageOf=(w:WorkOrder)=>w.jobStage??LEGACY_TO_JOB[w.status]??JOB_NOT_STARTED;
export const jobPaused=(w:WorkOrder)=>w.paused??w.status==="Paused";
export const jobBlocked=(w:WorkOrder)=>!!w.hold;
export const jobRemaining=(w:WorkOrder)=>Math.max(0,w.quantity-w.good);
/** Rush is inherited from the order it is for — the customer is in a bind, not the work order. */
export const jobPriority=(w:WorkOrder,orders:OrderRecord[]=[]):JobPriority=>
  w.priority||(w.orderId&&orders.find(o=>o.id===w.orderId)?.rush?"rush":"normal");

/** Move a job along, stamping who did it and when, and keeping the office's word for it in step. */
export function setJobStage(w:WorkOrder,stage:number,by:string,now=new Date().toISOString()):WorkOrder{
  const legacy=stage===JOB_NOT_STARTED
    ?(w.status==="Needs scheduling"||w.status==="Released"?w.status:"Scheduled")
    :JOB_TO_LEGACY[stage]||w.status;
  return {...w,jobStage:stage,paused:false,hold:undefined,status:legacy,
    ...(stage===JOB_PRODUCTION&&!w.startedAt?{startedAt:now,operator:by}:{}),
    ...(stage===JOB_PRODUCTION?{operator:by}:{}),
    history:[...(w.history||[]),{stage,at:now,by}]};
}
export const pauseJob=(w:WorkOrder,by:string,now=new Date().toISOString()):WorkOrder=>
  ({...w,paused:true,status:"Paused",history:[...(w.history||[]),{stage:jobStageOf(w),at:now,by}]});
export const resumeJob=(w:WorkOrder,by:string,now=new Date().toISOString()):WorkOrder=>
  ({...w,paused:false,hold:undefined,status:jobStageOf(w)===JOB_PRODUCTION?"Running":w.status,
    history:[...(w.history||[]),{stage:jobStageOf(w),at:now,by}]});
/** Something is stopping the job. It stays where it is; the office sees it blocked immediately. */
export const blockJob=(w:WorkOrder,hold:Omit<JobHold,"at">,now=new Date().toISOString()):WorkOrder=>
  ({...w,paused:true,status:"Paused",hold:{...hold,at:now},
    history:[...(w.history||[]),{stage:jobStageOf(w),at:now,by:hold.by}]});
/** How long a job has been stopped, in whole minutes. */
export const blockedFor=(w:WorkOrder,now=Date.now())=>
  w.hold?Math.max(0,Math.round((now-new Date(w.hold.at).getTime())/60000)):0;

/**
 * The rate a job is actually running at, and when it will finish at that rate. Nothing is guessed from
 * a standard: it is what this operator has made on this machine since they started, which is the only
 * figure worth putting in front of somebody who has to promise a time.
 */
export function jobForecast(w:WorkOrder,now=Date.now()){
  if(!w.startedAt||w.good<=0)return null;
  const minutes=(now-new Date(w.startedAt).getTime())/60000;
  if(minutes<1)return null;
  const perHour=Math.round(w.good/minutes*60);
  if(perHour<=0)return null;
  const left=jobRemaining(w);
  return {perHour,minutesLeft:Math.round(left/perHour*60),finishAt:new Date(now+left/perHour*3600000).toISOString()};
}

// ---- packing ------------------------------------------------------------------------
// What comes off the machine is bottles. What leaves is cartons on pallets with a label on them, and
// somebody has to count both. The plan below is worked out from the build sheet; the record is what the
// person at the bench actually did, and the two are kept apart so a short pallet is visible rather than
// assumed away.
export type PackingRecord={
  operator?:string;received?:number;cartons?:number;pallets?:number;
  batchId?:string;note?:string;startedAt?:string;doneAt?:string};

export type PackingPlan={
  packedAs:"loose"|"boxed"|"pallet";shipsAs:"boxed"|"pallet-boxed"|"pallet-loose";perPallet:number;
  received:number;perCase:number;cartons:number;casesPerPallet:number;pallets:number;
  caps:AssemblyCap[];label?:string;boxItem?:string;boxSize?:string;palletPattern?:string;
  uses:{item:string;qty:number}[]};

/**
 * What this run should turn into, from the build sheet: how many bottles are there to pack, how many go
 * in a carton, how many cartons on a pallet, and what gets used up doing it.
 *
 * Caps are only counted here when no assembly run has already fitted them — an assembly run consumes its
 * caps as it records good units, and charging for them twice would empty the shelf for one bottle.
 */
export function packingPlan(w:WorkOrder,itemRates:ItemRate[]):PackingPlan{
  const rate=itemRates.find(r=>r.item===w.item);
  const received=w.packing?.received??w.good;
  const perCase=rate?.unitsPerCase||1;
  // Nothing to count in boxes if it does not go in one.
  const cartons=(rate?.packedAs||"boxed")==="loose"?0:Math.ceil(received/perCase);
  const packedAs=rate?.packedAs||"boxed";
  const shipsAs=rate?.shipsAs||(rate?.casesPerPallet?"pallet-boxed":"boxed");
  const perPallet=rate?.perPallet??rate?.casesPerPallet??0;
  const casesPerPallet=shipsAs==="pallet-boxed"?perPallet:0;
  const pallets=shipsAs==="pallet-boxed"?(perPallet?Math.ceil(cartons/perPallet):0)
    :shipsAs==="pallet-loose"?(perPallet?Math.ceil(received/perPallet):0)
    :0;
  const uses:{item:string;qty:number}[]=[];
  if(rate?.boxItem&&cartons)uses.push({item:rate.boxItem,qty:cartons});
  if(rate?.label&&received)uses.push({item:rate.label,qty:received});
  if(w.kind!=="assembly")for(const c of rate?.caps||[])uses.push({item:c.component,qty:c.qty*received});
  return {packedAs,shipsAs,perPallet,received,perCase,cartons,casesPerPallet,pallets,caps:rate?.caps||[],
    label:rate?.label,boxItem:rate?.boxItem,boxSize:rate?.boxSize,palletPattern:rate?.palletPattern,uses};
}

/** A batch the pallet label can carry and the office can look up later. */
export const newBatchId=(w:WorkOrder,when=new Date())=>
  `B${when.toISOString().slice(2,10).replace(/-/g,"")}-${w.id.replace(/\D/g,"")||w.id}`;

/**
 * What packing actually used, from what the packer counted rather than from the plan. If the run should
 * have made 248 cartons and 246 came out, 246 cartons come off the shelf — taking the planned figure
 * would quietly consume stock nobody touched.
 */
export function packingUses(w:WorkOrder,itemRates:ItemRate[],entry:{received:number;cartons:number}){
  const rate=itemRates.find(r=>r.item===w.item);
  const uses:{item:string;qty:number}[]=[];
  if(rate?.boxItem&&entry.cartons>0&&rate.packedAs!=="loose")uses.push({item:rate.boxItem,qty:entry.cartons});
  if(rate?.label&&entry.received>0)uses.push({item:rate.label,qty:entry.received});
  // An assembly run consumed its caps as it recorded units; charging for them again would empty the
  // shelf twice for one bottle.
  if(w.kind!=="assembly")for(const c of rate?.caps||[])if(entry.received>0)uses.push({item:c.component,qty:c.qty*entry.received});
  return uses;
}

/**
 * Record a packing run. The counts are the packer's, not the plan's — if the pallet came out one carton
 * short that is the number that goes down, and the difference is visible instead of rounded away.
 */
export function recordPacking(w:WorkOrder,entry:{received:number;cartons:number;pallets:number;batchId?:string;note?:string;by:string},
  now=new Date().toISOString()):WorkOrder{
  const received=Math.max(0,Math.floor(entry.received));
  return {...w,
    packed:received,
    packing:{...w.packing,operator:entry.by,received,
      cartons:Math.max(0,Math.floor(entry.cartons)),pallets:Math.max(0,Math.floor(entry.pallets)),
      batchId:entry.batchId||w.packing?.batchId||newBatchId(w,new Date(now)),
      note:entry.note||w.packing?.note,
      startedAt:w.packing?.startedAt||now,doneAt:now},
    history:[...(w.history||[]),{stage:JOB_PACKAGING,at:now,by:entry.by}]};
}

export type MaterialCheck={item:string;need:number;have:number;ok:boolean;tracked:boolean};
/**
 * Whether the job can actually be run and packed. Anything the warehouse counts is checked against what
 * is free; anything it does not count — the mould, the machine — is listed as untracked rather than
 * given a tick it has not earned. Starting a run that cannot be packaged is the thing this prevents.
 */
export function jobReadiness(w:WorkOrder,data:AppData){
  const need=jobRemaining(w)||w.quantity;
  const rate=data.itemRates.find(r=>r.item===w.item);
  const checks:MaterialCheck[]=[];
  const add=(item:string|undefined,perUnit:number)=>{
    if(!item)return;
    const row=data.inventory.find(i=>i.item===item);
    const want=Math.ceil(perUnit*need);
    if(!row){checks.push({item,need:want,have:0,ok:true,tracked:false});return}
    const have=freeStock(row);
    checks.push({item,need:want,have,ok:have>=want,tracked:true});
  };
  for(const use of runConsumption(w,data.itemRates))add(use.item,use.perUnit);
  // What packing the finished bottles needs, from the build sheet.
  if(rate?.label)add(rate.label,1);
  if(rate?.boxItem)add(rate.boxItem,1/(rate.unitsPerCase||1));
  if(rate?.mold)checks.push({item:rate.mold,need:1,have:0,ok:true,tracked:false});
  const missing=checks.filter(c=>c.tracked&&!c.ok).map(c=>c.item);
  return {checks,missing,ready:missing.length===0};
}

export type CalendarEvent={id:string;day:number;type:"order"|"stock"|"maintenance"|"delivery";title:string};
export type Notice={id:string;title:string;detail:string;urgent:boolean;read:boolean;createdAt:string;target:string};
export type Activity={id:string;customerId?:string;title:string;detail:string;actor:string;createdAt:string};
export type RoleSetting={id:string;name:string;members:string[];permissions:Record<string,"none"|"view"|"edit">};
// blankId/caps are what let an order line reach the machines: without them the catalogue knows what a
// bottle costs but not what it is made from, so nothing could turn a wholesale order into production.
// An empty string means "deliberately not moulded here" (a cap pack, a bought-in item) and is left
// alone; undefined means nobody has said yet, and inferBlank has a one-time guess at it.
export type ItemRate={id:string;item:string;rate:number;minimum:number;discountLimit:number;floor?:number;unitsPerCase?:number;kind?:"finished"|"raw";cost?:number;sub?:string;qcChecks?:string[];material?:string;blankId?:string;caps?:AssemblyCap[];
  // The build sheet — what somebody who has never made this before needs in front of them. "5 Gal + 2
  // Screw Caps" is a name, not an instruction.
  // Which side of the business sells this. It lives on the product, not on the listing, because a
  // wholesale bottle has no listing and still has a channel — and because sales only ever want to see
  // one of these two lists while the floor needs to know which it is making.
  channel?:"wholesale"|"amazon"|"both";
  // The barcode the floor labels the bottle with. It has to be right: a mislabelled Amazon unit is a
  // returned pallet, so it is shown on the job rather than looked up somewhere else.
  barcode?:string;
  // What goes in the box with the bottle for a listing — caps as a separate bag, an instruction card,
  // a spare seal. Distinct from `caps`, which are fitted to the bottle at assembly.
  includes?:{item:string;qty:number}[];
  // Two different questions, because the answers come apart: bottles can be boxed and then shipped
  // loose on a pallet, or shipped in boxes with no pallet at all. Together they decide what the packing
  // bench is asked to count — a product that never sees a pallet should not ask anybody for a pallet
  // number. `perPallet` counts boxes when the pallet is boxed and bottles when it is not.
  packedAs?:"loose"|"boxed"|"pallet";
  shipsAs?:"boxed"|"pallet-boxed"|"pallet-loose";
  perPallet?:number;
  mold?:string;colour?:string;label?:string;boxItem?:string;boxSize?:string;casesPerPallet?:number;
  palletPattern?:string;photo?:string;instructions?:string};
export type InventoryRow={id:string;item:string;onHand:number;committed:number;reorder:number;cost:number;kind?:"finished"|"raw";unit?:string;onOrder?:number;eta?:string;usage?:string;supplier?:string};

// ---- what this shop actually makes -------------------------------------------------
// One molded bottle becomes several different products depending on what happens after
// moulding. "Regular 5-gal" is the shared blank behind GO, BV and MV — the difference is
// only which caps go on at assembly.
//
// The important subtlety, from the SKU list: a blank is itself sellable. Wholesale buys
// plain 3-gallon and 5-gallon bottles with no kitting at all, and GO-WAAU-08PA is the
// bare 5-gallon bottle listed on Amazon. So "blank" and "finished good" are not exclusive
// categories — a blank is a product in its own right AND the input to other products.
// Modelling them as separate kinds would force the same bottle to exist twice and the two
// copies would drift. Instead: every Blank is stock that moulding produces, and any SKU
// that needs work after moulding carries an Assembly recipe pointing at its blank.
export type Blank={
  id:string;name:string;              // "Regular 5-gal"
  size:"3-gal"|"5-gal";               // decides which machine makes it
  neck:"screw"|"regular";             // screw-top vs regular neck — a mould change
  sellable?:boolean;                  // sold to wholesale as a plain bottle
};
export type AssemblyCap={component:string;qty:number};   // "Screw cap" × 2
// The two caps this shop fits. They decide the neck, and so the mould: screw caps need a screw-top
// blank, silicone caps sit on a regular one.
export const CAP_KINDS=["Screw cap","Silicone cap"];
/** What the processing fee is called on the invoice the customer reads. */
export const PROCESSING_FEE_LABEL="Processing fee";
export type Sku={
  id:string;name:string;              // "D5-T0WT-Q5XP", "5 Gal + 2 Screw Caps"
  channel:"amazon"|"wholesale"|"both";
  blankId:string;                     // what gets moulded first
  caps:AssemblyCap[];                 // empty for a bottle-only listing, which still gets
                                      // labelled and boxed, so it is still an assembly step
  unitsPerPalletLtl?:number;          // trailer door limits differ — LTL fits fewer
  unitsPerPalletFtl?:number;
  // The catalogue item this listing is priced, stocked, photographed and packed as. Without it an
  // Amazon product is an island: a run raised for one has no item rate to read a material, a box size
  // or a photo from, so the floor gets a name and nothing else.
  itemId?:string;
};

// Two machines, one per bottle size, running in parallel. 500 bottles each on a six-hour
// shift. They do not share capacity: a heavy 5-gallon week cannot borrow the 3-gallon
// machine, which is exactly the constraint a plan has to respect.
// `line` is the name the shop floor screens use for this machine. Machines and lines were two separate
// vocabularies for one physical thing, which is how a run raised against a machine could end up on a
// line nobody was looking at.
export type Machine={id:string;name:string;makes:"3-gal"|"5-gal";perShift:number;line?:string};
// The real catalogue. Four blanks, six Amazon SKUs, and the plain bottles wholesale buys.
export const DEFAULT_BLANKS:Blank[]=[
  {id:"b-s5",name:"Screw-top 5-gal",size:"5-gal",neck:"screw"},
  {id:"b-s3",name:"Screw-top 3-gal",size:"3-gal",neck:"screw"},
  // Both regular blanks are sold plain to wholesale as well as feeding the kitted SKUs.
  {id:"b-r5",name:"Regular 5-gal",size:"5-gal",neck:"regular",sellable:true},
  {id:"b-r3",name:"Regular 3-gal",size:"3-gal",neck:"regular",sellable:true},
];
export const DEFAULT_SKUS:Sku[]=[
  {id:"D5-T0WT-Q5XP",name:"5 Gal + 2 Screw Caps",channel:"amazon",blankId:"b-s5",itemId:"5-Gallon Bottle · 2 caps",
    caps:[{component:"Screw cap",qty:2}],unitsPerPalletLtl:80,unitsPerPalletFtl:96},
  {id:"MI-89OO-OBNM",name:"3 Gal + 2 Screw Caps",channel:"amazon",blankId:"b-s3",itemId:"3-Gallon Bottle · 2 caps",
    caps:[{component:"Screw cap",qty:2}],unitsPerPalletLtl:150,unitsPerPalletFtl:180},
  // Bottle only. No caps, but it is still labelled and boxed, so assembly still happens.
  {id:"GO-WAAU-08PA",name:"5 Gal Bottle Only",channel:"amazon",blankId:"b-r5",itemId:"5-Gallon Bottle · no cap",
    caps:[],unitsPerPalletLtl:80,unitsPerPalletFtl:96},
  {id:"BV-B81Q-X4UN",name:"5 Gal + 2 Silicone Caps",channel:"amazon",blankId:"b-r5",
    caps:[{component:"Silicone cap",qty:2}],unitsPerPalletLtl:80,unitsPerPalletFtl:96},
  {id:"MV-1AA8-B2UV",name:"5 Gal + 1 Silicone Cap",channel:"amazon",blankId:"b-r5",
    caps:[{component:"Silicone cap",qty:1}],unitsPerPalletLtl:80,unitsPerPalletFtl:96},
  {id:"ZR-4HHD-8YRL",name:"3 Gal + 1 Silicone Cap",channel:"amazon",blankId:"b-r3",
    caps:[{component:"Silicone cap",qty:1}],unitsPerPalletLtl:150,unitsPerPalletFtl:180},
];

export const DEFAULT_MACHINES:Machine[]=[
  {id:"m5",name:"5-gallon line",makes:"5-gal",perShift:500,line:"Line 1"},
  {id:"m3",name:"3-gallon line",makes:"3-gal",perShift:500,line:"Line 2"},
];
// ---- the September plan ------------------------------------------------------------
// The month the tracker covers, as production steps rather than a spreadsheet. Quantities are the
// tracker's own per-SKU demand — 2,176 / 1,320 / 704 / 288 / 448 — and they reproduce its headline
// figures exactly: 1,440 regular 5-gal blanks, 4,936 bottles to mould, 6,992 screw caps, 1,024
// silicone. tests/production.test.mjs asserts that against this array, so the plan cannot drift from
// the tracker without the tests saying so.
//
// The day layout is derived, not transcribed: moulding is laid out at one shift per machine per
// working day, screw-top necks first so the single 5-gallon mould change falls over a weekend, then
// assembly, palletizing and the FBA shipment. Every step here is Amazon replenishment; wholesale
// work lands on the same two machines and is added to these days as orders are taken.
const ms=(id:string,date:string,target:string,qty:number,machineId:string):{date:string;step:ProdStep}=>
  ({date,step:{id,type:"mold",source:"amazon",target,qty,machineId}});
const as=(id:string,date:string,target:string,qty:number,type:ProdStep["type"]):{date:string;step:ProdStep}=>
  ({date,step:{id,type,source:"amazon",target,qty,...(type==="ship"?{linkedTo:"FBA-SEP"}:{})}});

const SEPTEMBER_STEPS:{date:string;step:ProdStep}[]=[
  // 5-gallon line — screw-top first (2,176), then the regular neck (1,440). 8 shifts in all.
  ms("ps-m1","2026-09-07","b-s5",500,"m5"),ms("ps-m2","2026-09-08","b-s5",500,"m5"),
  ms("ps-m3","2026-09-09","b-s5",500,"m5"),ms("ps-m4","2026-09-10","b-s5",500,"m5"),
  ms("ps-m5","2026-09-11","b-s5",176,"m5"),
  ms("ps-m6","2026-09-14","b-r5",500,"m5"),ms("ps-m7","2026-09-15","b-r5",500,"m5"),
  ms("ps-m8","2026-09-16","b-r5",440,"m5"),
  // 3-gallon line — 1,320 screw-top, 3 shifts, running alongside the 5-gallon line.
  ms("ps-m9","2026-09-07","b-s3",500,"m3"),ms("ps-m10","2026-09-08","b-s3",500,"m3"),
  ms("ps-m11","2026-09-09","b-s3",320,"m3"),
  // Assembly — caps and boxing. GO is bottle-only but still gets labelled and boxed.
  as("ps-a1","2026-09-10","MI-89OO-OBNM",1320,"assemble"),
  as("ps-a2","2026-09-15","D5-T0WT-Q5XP",2176,"assemble"),
  as("ps-a3","2026-09-17","GO-WAAU-08PA",704,"assemble"),
  as("ps-a4","2026-09-17","BV-B81Q-X4UN",288,"assemble"),
  as("ps-a5","2026-09-18","MV-1AA8-B2UV",448,"assemble"),
  // Pallets, then the shipment.
  as("ps-p1","2026-09-21","D5-T0WT-Q5XP",2176,"palletize"),
  as("ps-p2","2026-09-21","MI-89OO-OBNM",1320,"palletize"),
  as("ps-p3","2026-09-22","GO-WAAU-08PA",704,"palletize"),
  as("ps-p4","2026-09-22","BV-B81Q-X4UN",288,"palletize"),
  as("ps-p5","2026-09-22","MV-1AA8-B2UV",448,"palletize"),
  as("ps-s1","2026-09-23","D5-T0WT-Q5XP",2176,"ship"),
  as("ps-s2","2026-09-23","MI-89OO-OBNM",1320,"ship"),
  as("ps-s3","2026-09-23","GO-WAAU-08PA",704,"ship"),
  as("ps-s4","2026-09-23","BV-B81Q-X4UN",288,"ship"),
  as("ps-s5","2026-09-23","MV-1AA8-B2UV",448,"ship"),
];
const DAY_LABELS:Record<string,{forWhat?:string;milestone?:boolean}>={
  "2026-09-07":{forWhat:"Screw-top run starts — both lines"},
  "2026-09-11":{forWhat:"Screw-top 5-gal finishes"},
  "2026-09-14":{forWhat:"Mould change — regular 5-gal neck"},
  "2026-09-16":{forWhat:"Moulding complete for the month"},
  "2026-09-23":{forWhat:"Amazon FBA shipment leaves",milestone:true},
};

/** Group loose steps into days, newest date last, keeping any labels the day carries. */
export function buildPlan(entries:{date:string;step:ProdStep}[],labels:Record<string,{forWhat?:string;milestone?:boolean}>={}):ProdDay[]{
  const byDate=new Map<string,ProdDay>();
  for(const {date,step} of entries){
    if(!byDate.has(date))byDate.set(date,{date,...(labels[date]||{}),steps:[]});
    byDate.get(date)!.steps.push(step);
  }
  return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export const SEPTEMBER_PLAN:ProdDay[]=buildPlan(SEPTEMBER_STEPS,DAY_LABELS);

// Demo company only: the same September plan with wholesale work dropped onto it, which is what a
// real month actually looks like. Palm Aqua's 500 plain 5-gallon bottles land on the 8th, where the
// Amazon plan already fills the 5-gallon line for the day — precisely the collision this calendar
// exists to catch. One Amazon step is part-recorded so the edit guard and the owner's reconcile have
// something true to protect.
const DEMO_WHOLESALE:{date:string;step:ProdStep}[]=[
  {date:"2026-09-08",step:{id:"pd-w1",type:"mold",source:"wholesale",target:"b-r5",qty:500,machineId:"m5",linkedTo:"SO-1187",note:"Palm Aqua · plain 5-gal, no kitting"}},
  {date:"2026-09-10",step:{id:"pd-w2",type:"mold",source:"wholesale",target:"b-r3",qty:120,machineId:"m3",linkedTo:"SO-1188",note:"Sunshine Coolers · 3-gal"}},
  {date:"2026-09-11",step:{id:"pd-w3",type:"palletize",source:"wholesale",target:"b-r5",qty:500,linkedTo:"SO-1187",note:"Double-wrapped, per Ray"}},
  {date:"2026-09-14",step:{id:"pd-w4",type:"ship",source:"wholesale",target:"b-r5",qty:500,linkedTo:"SO-1187",note:"LTL to Palm Aqua"}},
];
export const demoPlan=():ProdDay[]=>buildPlan([
  // ps-m1 is being run as WO-121 — the plan shows what the floor recorded against that run rather than
  // keeping a second figure of its own. ps-m2 is the next day of the same run.
  ...SEPTEMBER_STEPS.map(e=>({...e,step:{...e.step,...(e.step.id==="ps-m1"||e.step.id==="ps-m2"?{workOrderId:"WO-121"}:{})}})),
  ...DEMO_WHOLESALE],DAY_LABELS);

export type ShipMethod={id:string;name:string;sub:string;rate:number;perCase?:number;custom?:boolean};
export type MaintenanceItem={id:string;machine:string;task:string;due:string;status:"Due"|"Scheduled"|"Complete";downtimeMin?:number;notes?:string};
export type PurchaseOrder={id:string;supplier:string;item:string;quantity:number;unitCost:number;freight:number;duty:number;eta:string;status:"Open"|"Received"|"Cancelled";createdAt:string;receivedAt?:string};
export type AppData={blanks?:Blank[];skus?:Sku[];prodDays?:ProdDay[];customers:Customer[];documents:DocumentRecord[];orders:OrderRecord[];workOrders:WorkOrder[];calendar:CalendarEvent[];notices:Notice[];activities:Activity[];roles:RoleSetting[];itemRates:ItemRate[];inventory:InventoryRow[];maintenance?:MaintenanceItem[];purchaseOrders?:PurchaseOrder[];
  settings:{company:string;ownerName:string;ownerEmail:string;warehouseToken:string;lines?:string[];machines?:Machine[];shipMethods?:ShipMethod[];discountApproval?:number;
    // Charged on every invoice for taking payment. Card payment is off, so customers pay by bank
    // transfer; this covers what that costs instead of it coming out of the margin.
    paymentFee?:number;monthlyExpenses?:number;cashOnHand?:number;quickBooks:{connected:boolean;realmId:string;lastSync:string;customers:boolean;invoices:boolean;quotes:boolean;conflicts:number}}};

// The stages the shop actually works in. The old list ran Placed → In production → … → Invoiced →
// Paid, i.e. make first and bill last, which is backwards for this business: nothing goes on a machine
// until a deposit or full payment has landed. Every board, badge and gate reads this order, so having
// it wrong is why the Airtable flow never came back.
export const STAGES=["New","Quoted","Invoiced","Paid","In production","Ready to pack","Shipped","Done"] as const;
export const STAGE_NEW=0,STAGE_QUOTED=1,STAGE_INVOICED=2,STAGE_PAID=3,STAGE_PRODUCTION=4,STAGE_READY=5,STAGE_SHIPPED=6,STAGE_DONE=7;

// Who is waiting on each stage, so one glance answers "whose move is it?".
export const STAGE_OWNER:Record<number,"Sales"|"Customer"|"Production"|"Warehouse"|"Done">={
  0:"Sales",1:"Customer",2:"Customer",3:"Production",4:"Production",5:"Warehouse",6:"Warehouse",7:"Done"};
export const STAGE_NOTE:Record<number,string>={
  0:"Taken, not yet quoted or invoiced",
  1:"Quote sent — waiting for the customer to approve",
  2:"Invoice sent — waiting for a deposit or payment in full",
  3:"Paid or deposit received — ready to release to the floor",
  4:"On the floor being made",
  5:"Made and waiting to be packed",
  6:"Shipped — collect any balance still due",
  7:"Complete"};

// Production is gated on money, not on someone remembering. A deposit is enough to start.
export const canStartProduction=(o:{deposit?:number;payment?:string})=>
  (o.deposit||0)>0||o.payment==="Paid"||o.payment==="Deposit";
export const DEFAULT_QC=["Weight within spec","Wall thickness · base","Leak test · 24h","Visual · haze / streaks","Neck finish gauge","Handle pull test"];
export const DEFAULT_SHIP:ShipMethod[]=[
  {id:"pickup",name:"Customer picks up",sub:"Miami warehouse, Mon–Fri 8–4",rate:0},
  {id:"truck",name:"Our truck · local delivery",sub:"Miami-Dade & Broward, next business day",rate:45},
  {id:"ltl",name:"Freight (LTL) · palletized",sub:"Quote from carrier, 3–5 days",rate:312},
  {id:"ups",name:"UPS Ground · by the box",sub:"Small orders only, 1–4 days",rate:0,perCase:6.4},
  {id:"custom",name:"Freight quote · enter the amount",sub:"LTL or carrier quote for this shipment",rate:0,custom:true},
];

const today=new Date();const iso=(d:number)=>{const x=new Date(today);x.setDate(x.getDate()+d);return x.toISOString().slice(0,10)};
const label=(d:number)=>{const x=new Date(today);x.setDate(x.getDate()+d);return x.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})};

export const seedData:AppData={
 customers:[],documents:[],orders:[],workOrders:[],calendar:[],notices:[],activities:[],
 roles:[{id:"r1",name:"Owner",members:[],permissions:{all:"edit"}},{id:"r2",name:"Sales",members:[],permissions:{crm:"edit",sales:"edit",calendar:"view",financials:"none",operations:"view",settings:"none"}},{id:"r3",name:"Warehouse",members:[],permissions:{crm:"none",sales:"view",calendar:"view",financials:"none",operations:"edit",settings:"none"}}],
 itemRates:[],inventory:[],maintenance:[],purchaseOrders:[],
 settings:{company:"",ownerName:"",ownerEmail:"",warehouseToken:"",lines:["Line 1"],shipMethods:DEFAULT_SHIP,discountApproval:5,paymentFee:25,monthlyExpenses:0,cashOnHand:0,quickBooks:{connected:false,realmId:"",lastSync:"Never",customers:true,invoices:true,quotes:true,conflicts:0}},
};

export const demoData:AppData={
 blanks:DEFAULT_BLANKS,skus:DEFAULT_SKUS,prodDays:demoPlan(),
 customers:[
  {id:"c1",name:"Miami Water Co",kind:"customer",contact:"Carlos Mendez",email:"carlos@miamiwater.test",phone:"(305) 555-0142",rep:"Dad",stage:"Active",balance:0,lifetimeSales:27600,billing:"8200 NW 30th St, Doral FL 33122",delivery:"8200 NW 30th St, Doral FL 33122",terms:"Net 30",notes:"Price $9.40 on 5-gal (agreed Jan 2026). Call the day before delivery.",prices:{"5-Gallon Bottle · 2 caps":9.4},qb:true},
  {id:"c2",name:"Sunshine Coolers",kind:"customer",contact:"Dana Whitfield",email:"dana@sunshinecoolers.test",phone:"(954) 555-0198",rep:"Dad",stage:"Active",balance:850,lifetimeSales:6420,billing:"1450 SW 12th Ave, Pompano Beach FL 33069",delivery:"Picks up",terms:"Card on pickup",notes:"Pays by card on pickup. White van.",prices:{},qb:true},
  {id:"c3",name:"Palm Aqua Delivery",kind:"customer",contact:"Ray Ortiz",email:"ray@palmaqua.test",phone:"(305) 555-0177",rep:"Dad",stage:"Active",balance:10243,lifetimeSales:88400,billing:"2300 NW 82nd Ave, Doral FL 33122",delivery:"2300 NW 82nd Ave, Doral FL 33122",terms:"Net 30",notes:"Biggest account. Ray texts, does not email.",prices:{"5-Gallon Bottle · 2 caps":9.25,"5-Gallon Bottle · no cap":8.2},qb:true},
  {id:"l1",name:"Bay Harbor Market",kind:"lead",contact:"Ana Ruiz",email:"ana@bayharbormarket.test",phone:"(786) 555-0121",rep:"Dad",stage:"Quote requested",balance:0,lifetimeSales:0,billing:"9700 Bay Harbor Ter, Bay Harbor Islands FL 33154",delivery:"",terms:"Due on receipt",notes:"New. Asked for a price on 300 five-gallon.",prices:{},qb:false},
 ],
 documents:[
  {id:"INV-1042",kind:"invoice",customerId:"c3",item:"5-Gallon Bottle · no cap",cases:250,quantity:500,rate:8.2,discount:0,shipping:312,status:"Sent",due:label(30),paid:0,qbSynced:true},
  {id:"INV-1031",kind:"invoice",customerId:"c1",orderId:"SO-1190",item:"5-Gallon Bottle · 2 caps",cases:150,quantity:300,rate:9.4,discount:0,shipping:45,status:"Paid",due:label(-10),paid:2865,qbSynced:true},
  {id:"INV-1027",kind:"invoice",customerId:"c3",orderId:"SO-1191",item:"5-Gallon Bottle · no cap + 5-Gallon Bottle · 2 caps",cases:350,quantity:700,rate:8.5,discount:2,shipping:312,status:"Due soon",due:label(2),paid:0,qbSynced:true},
  {id:"INV-1019",kind:"invoice",customerId:"c2",item:"3-Gallon Bottle · 2 caps",cases:50,quantity:100,rate:8.5,discount:0,shipping:0,status:"Overdue",due:label(-10),paid:0,qbSynced:true},
  {id:"Q-2040",kind:"quote",customerId:"l1",item:"5-Gallon Bottle · 2 caps",cases:150,quantity:300,rate:9.4,discount:0,shipping:45,status:"Draft",due:label(30),paid:0},
 ],
 // Demo orders sit in the NEW stages directly (stageV2), one per interesting column: money not in yet,
 // paid and waiting for the floor, on the floor, made, and closed.
 orders:[
  {id:"SO-1187",customerId:"c3",item:"5-Gallon Bottle · no cap",cases:250,quantity:500,due:label(0),status:STAGES[STAGE_READY],payment:"Paid",lines:[{item:"5-Gallon Bottle · no cap",quantity:500,rate:8.2}],shipMethod:"ltl",shipping:312,discount:0,notes:"Ray wants the pallet double-wrapped.",stage:STAGE_READY,stageV2:true,rep:"Dad"},
  {id:"SO-1188",customerId:"c2",item:"3-Gallon Bottle · 2 caps",cases:60,quantity:120,due:label(0),status:STAGES[STAGE_PRODUCTION],payment:"Deposit",deposit:400,depositAt:iso(-2),lines:[{item:"3-Gallon Bottle · 2 caps",quantity:120,rate:8.5}],shipMethod:"pickup",shipping:0,discount:0,notes:"",stage:STAGE_PRODUCTION,stageV2:true,rep:"Dad"},
  {id:"SO-1189",customerId:"c1",item:"5-Gallon Bottle · 2 caps",cases:150,quantity:300,due:label(2),status:STAGES[STAGE_PAID],payment:"Paid",lines:[{item:"5-Gallon Bottle · 2 caps",quantity:300,rate:9.4}],shipMethod:"truck",shipping:45,discount:0,notes:"Call Carlos the day before.",stage:STAGE_PAID,stageV2:true,rep:"Dad"},
  {id:"SO-1190",customerId:"c1",item:"5-Gallon Bottle · 2 caps",cases:150,quantity:300,due:label(-11),status:STAGES[STAGE_DONE],payment:"Paid",lines:[{item:"5-Gallon Bottle · 2 caps",quantity:300,rate:9.4}],shipMethod:"truck",shipping:45,discount:0,stage:STAGE_DONE,stageV2:true,invoiceId:"INV-1031",rep:"Dad"},
  {id:"SO-1191",customerId:"c3",item:"5-Gallon Bottle · no cap",cases:350,quantity:700,due:label(-28),status:STAGES[STAGE_INVOICED],payment:"$5,831 due",lines:[{item:"5-Gallon Bottle · no cap",quantity:500,rate:8.2},{item:"5-Gallon Bottle · 2 caps",quantity:200,rate:9.25}],shipMethod:"ltl",shipping:312,discount:2,stage:STAGE_INVOICED,stageV2:true,invoiceId:"INV-1027",rep:"Dad"},
 ],
 workOrders:[
  {id:"WO-116",orderId:"SO-1187",item:"5-Gallon Bottle · no cap",quantity:500,good:500,scrap:11,packed:500,date:iso(0),status:"Done",purpose:"Palm Aqua Delivery order",line:"Line 1",days:1,qcResult:"pass"},
  {id:"WO-115",orderId:"SO-1188",item:"3-Gallon Bottle · 2 caps",quantity:120,good:120,scrap:3,packed:0,date:iso(0),status:"QC hold",purpose:"Sunshine Coolers order",line:"Line 2",days:1,qc:DEFAULT_QC.map(l=>({label:l,result:null})),qcResult:null},
  {id:"WO-118",orderId:"SO-1189",item:"5-Gallon Bottle · 2 caps",quantity:600,good:418,scrap:9,packed:0,date:iso(1),status:"Running",jobStage:JOB_PRODUCTION,operator:"James",startedAt:new Date(Date.now()-166*60000).toISOString(),purpose:"Miami Water Co order + stock",line:"Line 1",days:2,qc:DEFAULT_QC.map((l,i)=>({label:l,result:[true,true,null,true,true,null][i]})),qcNote:"Base looked a touch soft on rack 3 — Luis trimmed lamp zone 5 by 3%."},
  {id:"WO-119",item:"3-Gallon Bottle · 2 caps",quantity:500,good:0,scrap:0,packed:0,date:iso(2),status:"Paused",purpose:"Build stock",line:"Line 2",days:2,
   jobStage:JOB_NOT_STARTED,paused:true,hold:{reason:"Packaging unavailable",note:"Shrink wrap ran out — none until the Thursday delivery",by:"James",at:new Date(Date.now()-52*60000).toISOString()}},
  {id:"WO-120",item:"5-Gallon Bottle · no cap",quantity:400,good:0,scrap:0,packed:0,date:iso(3),status:"Scheduled",purpose:"Build stock",line:"Line 1",days:1},
  // Through the machine and past quality, waiting at the packing bench.
  {id:"WO-117",orderId:"SO-1187",item:"5-Gallon Bottle · no cap",quantity:500,good:496,scrap:11,packed:0,date:iso(0),status:"Done",
   jobStage:JOB_PACKAGING,operator:"James",startedAt:new Date(Date.now()-320*60000).toISOString(),
   purpose:"Palm Aqua Delivery order",line:"Assembly",days:1,qcResult:"pass"},
  // Raised from the September plan: it carries the 7th and 8th of the screw-top 5-gal run, and it is
  // the only record of what those two days made.
  {id:"WO-121",item:"5-Gallon Bottle · 2 caps",quantity:1000,good:620,scrap:14,packed:0,date:"2026-09-07",status:"Running",jobStage:JOB_PRODUCTION,operator:"James",startedAt:new Date(Date.now()-208*60000).toISOString(),
   dueAt:new Date(new Date().setHours(14,0,0,0)).toISOString(),purpose:"Amazon replenishment",line:"Line 1",days:2},
 ],
 calendar:[],
 notices:[
  {id:"n1",title:"Order ready to ship",detail:"SO-1187 Palm Aqua Delivery · pack it, freight pickup 2 pm",urgent:true,read:false,createdAt:"Today · 12:45 PM",target:"Orders"},
  {id:"n2",title:"Production updated",detail:"WO-118 · 418 good bottles so far, 2.1% scrap",urgent:false,read:false,createdAt:"Today · 1:18 PM",target:"Work orders"},
  {id:"n3",title:"Quality hold",detail:"WO-115 finished — 6 checks waiting before Sunshine Coolers can pick up",urgent:true,read:false,createdAt:"Today · 11:02 AM",target:"Quality"},
 ],
 activities:[
  {id:"a1",customerId:"c3",title:"Ready",detail:"SO-1187 passed quality — ready to pack",actor:"Warehouse",createdAt:"Today · 12:45 PM"},
  {id:"a2",customerId:"c1",title:"Production update",detail:"WO-118 at 418 of 600",actor:"Warehouse",createdAt:"Today · 1:18 PM"},
 ],
 roles:[
  {id:"r1",name:"Owner",members:["Christopher"],permissions:{all:"edit"}},
  {id:"r2",name:"Sales",members:["Dad"],permissions:{crm:"edit",sales:"edit",calendar:"view",financials:"none",operations:"view",settings:"none"}},
  {id:"r3",name:"Warehouse",members:["Luis"],permissions:{crm:"none",sales:"view",calendar:"view",financials:"none",operations:"edit",settings:"none"}},
 ],
 itemRates:[
  {id:"i1",item:"5-Gallon Bottle · 2 caps",sub:"with 2 screw caps",channel:"both",barcode:"X00ABC1234",includes:[{item:"Screw cap",qty:2},{item:"Care card",qty:1}],mold:"5-gal screw-top mould",colour:"Natural",label:"Labels · 5-gal",boxItem:"Cartons 18×18×10",boxSize:"18×18×10",packedAs:"boxed",shipsAs:"pallet-boxed",perPallet:48,casesPerPallet:48,palletPattern:"6 per layer, 8 high, stretch-wrapped",instructions:"Caps hand-tightened, not cross-threaded. Label square to the handle.",rate:9.9,floor:8.75,minimum:50,discountLimit:5,unitsPerCase:2,kind:"finished",cost:4.85,material:"PET preforms · 780g (5-gal)",qcChecks:["Weight (780g ±10g)","Wall thickness · base","Leak test · 24h","Visual · haze / streaks","Neck finish 55mm gauge","Handle pull test"]},
  {id:"i2",item:"3-Gallon Bottle · 2 caps",sub:"with 2 screw caps",channel:"amazon",barcode:"X00DEF5678",includes:[{item:"Screw cap",qty:2}],mold:"3-gal screw-top mould",colour:"Natural",label:"Labels · 3-gal",boxItem:"Cartons 18×18×10",boxSize:"18×18×10",packedAs:"boxed",shipsAs:"pallet-boxed",perPallet:60,casesPerPallet:60,palletPattern:"10 per layer, 6 high, stretch-wrapped",rate:8.5,floor:7.6,minimum:50,discountLimit:5,unitsPerCase:2,kind:"finished",cost:4.1,material:"PET preforms · 560g (3-gal)",qcChecks:["Weight (560g ±10g)","Wall thickness · base","Leak test · 24h","Visual · haze / streaks","Neck finish 55mm gauge","Handle pull test"]},
  {id:"i3",item:"5-Gallon Bottle · no cap",sub:"no cap",channel:"both",barcode:"X00GHI9012",mold:"5-gal regular mould",colour:"Natural",label:"Labels · 5-gal",boxItem:"Cartons 18×18×10",boxSize:"18×18×10",packedAs:"boxed",shipsAs:"pallet-boxed",perPallet:48,casesPerPallet:48,palletPattern:"6 per layer, 8 high, stretch-wrapped",rate:8.6,floor:7.7,minimum:50,discountLimit:5,unitsPerCase:2,kind:"finished",cost:4.4,material:"PET preforms · 780g (5-gal)",qcChecks:["Weight (780g ±10g)","Wall thickness · base","Leak test · 24h","Visual · haze / streaks","Neck finish 55mm gauge","Handle pull test"]},
  {id:"i4",item:"Screw Caps · 10-pack",sub:"pack of 10",channel:"wholesale",rate:3.2,floor:2.4,minimum:10,discountLimit:10,unitsPerCase:20,kind:"finished",cost:0.61,material:"55mm screw caps (bulk)",qcChecks:["Thread fit on 55mm neck","Liner seated","Visual · flash / short shots"]},
  {id:"i5",item:"Silicone Caps · 3-pack",sub:"pack of 3",channel:"wholesale",rate:4.99,floor:3.8,minimum:10,discountLimit:10,unitsPerCase:30,kind:"finished",cost:1.15,material:"Silicone caps (bulk)",qcChecks:["Seal test on 55mm neck","Visual · tears / voids"]},
 ],
 inventory:[
  {id:"s1",item:"5-Gallon Bottle · 2 caps",kind:"finished",onHand:412,committed:300,reorder:250,cost:4.85,unit:"bottles"},
  {id:"s2",item:"3-Gallon Bottle · 2 caps",kind:"finished",onHand:96,committed:120,reorder:200,cost:4.1,unit:"bottles"},
  {id:"s3",item:"5-Gallon Bottle · no cap",kind:"finished",onHand:830,committed:500,reorder:250,cost:4.4,unit:"bottles"},
  {id:"s4",item:"Screw Caps · 10-pack",kind:"finished",onHand:2140,committed:0,reorder:1000,cost:0.61,unit:"packs"},
  {id:"s5",item:"Silicone Caps · 3-pack",kind:"finished",onHand:18,committed:0,reorder:100,cost:1.15,unit:"packs"},
  {id:"s12",item:"Labels · 5-gal",kind:"raw",onHand:7400,committed:0,reorder:2000,cost:0.04,unit:"labels"},
  {id:"s13",item:"Labels · 3-gal",kind:"raw",onHand:1800,committed:0,reorder:2000,cost:0.04,unit:"labels"},
  {id:"r1",item:"PET preforms · 780g (5-gal)",kind:"raw",onHand:6200,committed:0,reorder:4000,cost:1.92,unit:"pcs",usage:"~1,200/day",supplier:"ResinCo"},
  {id:"r2",item:"PET preforms · 560g (3-gal)",kind:"raw",onHand:1450,committed:0,reorder:2000,cost:1.48,unit:"pcs",onOrder:8000,eta:label(7),usage:"~900/day",supplier:"ResinCo"},
  {id:"r3",item:"55mm screw caps (bulk)",kind:"raw",onHand:31000,committed:0,reorder:15000,cost:0.061,unit:"pcs",usage:"~2,500/day"},
  {id:"r4",item:"Silicone caps (bulk)",kind:"raw",onHand:54,committed:0,reorder:600,cost:0.38,unit:"pcs",onOrder:1500,eta:label(10)+" (sea)",usage:"~120/day",supplier:"SiliTech"},
  {id:"r5",item:"Handles · blue",kind:"raw",onHand:2900,committed:0,reorder:1500,cost:0.14,unit:"pcs",usage:"~1,200/day"},
  {id:"r6",item:"Cartons 18×18×10",kind:"raw",onHand:410,committed:0,reorder:300,cost:1.1,unit:"pcs",onOrder:600,eta:label(2),usage:"~60/day"},
 ],
 maintenance:[
  {id:"m1",machine:"Blow molder · Line 1",task:"Weekly inspection and lubrication",due:label(1),status:"Due"},
  {id:"m2",machine:"Air compressor",task:"Change intake filter",due:label(6),status:"Scheduled"},
  {id:"m3",machine:"Scale QC-02",task:"Monthly calibration",due:label(6),status:"Scheduled"},
  {id:"m4",machine:"Label applicator",task:"Sensor alignment",due:label(-5),status:"Complete",downtimeMin:42},
 ],
 purchaseOrders:[
  {id:"PO-884",supplier:"ResinCo",item:"PET preforms · 560g (3-gal)",quantity:8000,unitCost:1.42,freight:380,duty:0,eta:label(7),status:"Open",createdAt:label(-6)},
  {id:"PO-885",supplier:"SiliTech (sea)",item:"Silicone caps (bulk)",quantity:1500,unitCost:0.31,freight:95,duty:12,eta:label(10),status:"Open",createdAt:label(-20)},
  {id:"PO-886",supplier:"PackRight",item:"Cartons 18×18×10",quantity:600,unitCost:1.05,freight:30,duty:0,eta:label(2),status:"Open",createdAt:label(-3)},
 ],
 settings:{company:"EcoForm Bottles",ownerName:"Christopher Granitz",ownerEmail:"chris@ecoformbottles.test",warehouseToken:"floor-7Q4M-2026",lines:["Line 1","Line 2"],shipMethods:DEFAULT_SHIP,discountApproval:5,monthlyExpenses:6500,cashOnHand:64280,
  quickBooks:{connected:true,realmId:"9130-EF",lastSync:"4 min ago",customers:true,invoices:true,quotes:true,conflicts:0}},
};

// ---- helpers ----
// A document's total. When it came from QuickBooks the books already hold the figure, so use it
// verbatim: recomputing quantity × rate on a multi-line invoice multiplies a summed quantity against
// one line's unit price, which is how an invoice can appear as $2.2m. Locally-created documents are
// still single-item and compute as before.
export const documentTotal=(d:DocumentRecord)=>{
  if(d.total!=null)return Math.round(d.total*100)/100;
  // The fee sits outside the discount, like shipping: a discount is on the goods, not on the cost of
  // taking the money.
  const fee=d.fee||0;
  if(d.lines&&d.lines.length)return Math.round((d.lines.reduce((a,l)=>a+l.quantity*l.rate,0)*(1-d.discount/100)+d.shipping+fee)*100)/100;
  // An invoice imported before this app stored `total` and `lines` holds a SUMMED quantity next to ONE
  // line's rate. Multiplying those is not an approximation of the invoice, it is a different number:
  // 700 bottles × $9.40 on a four-line invoice that was actually $6,000. Twenty-four of them read as
  // $2.2m on the dashboard. There is nothing here to compute a total from, so it counts as nothing
  // until a re-import brings the books' own figure back — unrecordedTotals() names them on screen.
  if(d.qboId||d.source==="quickbooks")return 0;
  return Math.round((((d.quantity??d.cases)*d.rate)*(1-d.discount/100)+d.shipping+fee)*100)/100;
};
/** An imported document whose real total was never stored, so nothing can be computed from it. */
export const totalUnrecorded=(d:DocumentRecord)=>d.total==null&&!d.lines?.length&&!!(d.qboId||d.source==="quickbooks");
// What is still owed. QuickBooks tells us directly; otherwise fall back to total less amount paid.
export const documentBalance=(d:DocumentRecord)=>d.balance!=null?Math.round(d.balance*100)/100:Math.max(0,Math.round((documentTotal(d)-(d.paid||0))*100)/100);
/**
 * Invoices the dashboard cannot state a total for, and invoices whose stored total does not agree with
 * their own line detail. Both are reasons a revenue figure is not what the owner expects, and both name
 * the document rather than leaving a wrong number to be argued with.
 */
export type InvoiceProblem={id:string;customerId:string;why:"unrecorded"|"mismatch";shown:number;fromLines:number};
export function invoiceProblems(data:AppData):InvoiceProblem[]{
  const out:InvoiceProblem[]=[];
  for(const d of data.documents||[]){
    if(d.kind!=="invoice")continue;
    if(totalUnrecorded(d)){out.push({id:d.id,customerId:d.customerId,why:"unrecorded",shown:0,fromLines:0});continue}
    if(!d.lines?.length)continue;
    const fromLines=Math.round((d.lines.reduce((a,l)=>a+l.quantity*l.rate,0)*(1-(d.discount||0)/100)+(d.shipping||0)+(d.fee||0))*100)/100;
    const shown=documentTotal(d);
    // Sales tax legitimately puts a stored total above its lines, so only a gap far larger than any tax
    // rate counts as a disagreement worth stopping on.
    if(Math.abs(shown-fromLines)>50&&Math.abs(shown-fromLines)>fromLines*0.2)
      out.push({id:d.id,customerId:d.customerId,why:"mismatch",shown,fromLines});
  }
  return out.sort((a,b)=>Math.abs(b.shown-b.fromLines)-Math.abs(a.shown-a.fromLines));
}
/**
 * What an invoice cost to make. From the order it billed where there is one, otherwise from its own
 * lines, otherwise from the single-line summary. An item with no cost recorded is reported rather than
 * counted as free — costing nothing is why a dashboard can claim a 100% margin.
 */
export function invoiceCost(data:AppData,d:DocumentRecord):{cost:number;unpriced:string[]}{
  const o=d.orderId?(data.orders||[]).find(x=>x.id===d.orderId):undefined;
  const lines=o?orderTotals(o,data).lines
    :d.lines?.length?d.lines
    :[{item:d.item,quantity:d.quantity??d.cases,rate:d.rate}];
  let cost=0;const unpriced:string[]=[];
  for(const l of lines){
    if(!l.quantity)continue;
    // History keeps the name a thing was sold under, which may since have gained a suffix, so an exact
    // match is tried before a prefix one.
    const rate=(data.itemRates||[]).find(r=>r.item===l.item)||(data.itemRates||[]).find(r=>l.item.startsWith(r.item));
    if(rate?.cost)cost+=l.quantity*rate.cost;else unpriced.push(l.item);
  }
  return {cost:Math.round(cost*100)/100,unpriced};
}
/** Cost of goods for a set of invoices, and which products still have no cost against them. */
export function invoiceCogs(data:AppData,invoices:DocumentRecord[]){
  let cost=0;const unpriced=new Set<string>();
  for(const d of invoices){const c=invoiceCost(data,d);cost+=c.cost;c.unpriced.forEach(i=>unpriced.add(i))}
  return {cost:Math.round(cost*100)/100,unpriced:Array.from(unpriced)};
}
export const money=(n:number)=>"$"+n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
export const int=(n:number)=>Math.round(n).toLocaleString("en-US");
// Orders saved by the earlier UI priced by the case; show them that way rather than re-pricing per bottle.
export const orderLines=(o:OrderRecord,rates:ItemRate[]):OrderLine[]=>o.lines&&o.lines.length?o.lines:[{item:`${o.item} · case`,quantity:o.cases||o.quantity,rate:rates.find(r=>r.item===o.item)?.rate??0}];
export function orderTotals(o:OrderRecord,data:AppData){const lines=orderLines(o,data.itemRates);const sub=lines.reduce((a,l)=>a+l.quantity*l.rate,0);const disc=sub*(o.discount||0)/100;const sm=(data.settings.shipMethods||DEFAULT_SHIP).find(s=>s.id===o.shipMethod);const cases=lines.reduce((a,l)=>a+Math.ceil(l.quantity/(data.itemRates.find(r=>r.item===l.item)?.unitsPerCase||2)),0);const ship=o.shipping!=null?o.shipping:sm?(sm.perCase?sm.perCase*cases:sm.rate):0;return {lines,sub,disc,ship,cases,total:Math.round((sub-disc+ship)*100)/100}}
// Orders saved under the old seven-stage list hold a number that now means something different.
// Old: 0 Placed, 1 In production, 2 Quality check, 3 Ready, 4 Shipped, 5 Invoiced, 6 Paid.
// Old 5 and 6 came AFTER shipping, so they map forward to Shipped/Done rather than back to Invoiced —
// an order that was invoiced under the old flow had already been made and sent.
const OLD_TO_NEW:Record<number,number>={0:STAGE_NEW,1:STAGE_PRODUCTION,2:STAGE_PRODUCTION,3:STAGE_READY,4:STAGE_SHIPPED,5:STAGE_SHIPPED,6:STAGE_DONE};
export function migrateStage(o:OrderRecord):number{
  if(o.stageV2)return o.stage??STAGE_NEW;              // already migrated
  const old=o.stage!=null?o.stage:Math.max(0,["placed","in production","quality check","ready","shipped","invoiced","paid"].indexOf(String(o.status||"").toLowerCase()));
  const mapped=OLD_TO_NEW[old]??STAGE_NEW;
  o.stageV2=true;
  return mapped;
}
export const stageOf=(o:OrderRecord)=>o.stage!=null?o.stage:Math.max(0,STAGES.findIndex(s=>s.toLowerCase()===o.status.toLowerCase()));
export const freeStock=(row:InventoryRow)=>row.onHand-row.committed;

// ---- production steps, and protecting what the floor already did -------------------
// A planned step becomes a record of what actually happened. Both live on the same object
// so the plan and the truth can be compared rather than one silently replacing the other.
// Both channels share the same two machines, which is the whole reason the plan has to be one
// calendar rather than two. A step says which side of the business it is for so a day can be read
// as "500 for Amazon and 500 for a wholesale order", not just "1,000 bottles".
export type ProdSource="amazon"|"wholesale";
export type ProdStep={
  id:string;type:"mold"|"assemble"|"palletize"|"ship";
  source:ProdSource;
  target:string;                       // blank id for mould, sku id for the rest
  qty:number;                          // planned
  note?:string;linkedTo?:string;       // order or shipment
  machineId?:string;
  // The run carrying this step out, once one has been raised. While it is set, the run is the record of
  // what was made and the fields below are NOT read — see stepProgress. Two places to type the same
  // number is how the plan and the floor came to disagree.
  workOrderId?:string;
  // filled in by the floor, or by the owner reconciling after the fact
  done?:boolean;actualQty?:number;scrap?:number;doneAt?:string;doneBy?:string;
  reconciledBy?:string;reconciledAt?:string;
};
export type ProdDay={date:string;forWhat?:string;milestone?:boolean;steps:ProdStep[]};

export const stepStarted=(st:ProdStep)=>!!(st.done||(st.actualQty??0)>0);

/**
 * Whether an edit to a planned step needs confirming first.
 *
 * The floor and the office both touch these. If the warehouse has already moulded 200 of a
 * planned 300 and the owner then drags that step to next week or changes the quantity, the
 * app must not quietly discard what was made — those bottles physically exist. Equally the
 * owner has to be able to correct the record when the floor made something and never
 * ticked it. So: never block the edit, always surface what is already true, and make the
 * person choose knowingly.
 *
 * Returns null when the edit is unremarkable.
 */
export function guardStepEdit(prev:ProdStep,next:Partial<ProdStep>):string|null{
  if(!stepStarted(prev))return null;
  const made=prev.actualQty??(prev.done?prev.qty:0);
  const when=prev.doneAt?` on ${fmtDue(prev.doneAt)}`:"";
  const who=prev.doneBy?` by ${prev.doneBy}`:"";
  const preamble=`Production has already started on this step — ${made} completed${when}${who}.`;
  if(next.qty!=null&&next.qty!==prev.qty){
    if(next.qty<made)return `${preamble} Lowering the plan to ${next.qty} is below what was already made. Keep the original, or edit and accept the ${made} already produced?`;
    return `${preamble} Change the planned quantity from ${prev.qty} to ${next.qty}?`;
  }
  if(next.type&&next.type!==prev.type)return `${preamble} Changing the step type will not undo it. Continue?`;
  if(next.target&&next.target!==prev.target)return `${preamble} Changing what this step makes will not undo what was already produced. Continue?`;
  return `${preamble} Move or edit it anyway?`;
}

/**
 * The floor logging its own work as it happens. Separate from reconcileStep on purpose: this is a
 * first-hand record, so it carries no reconciled-by stamp. Recording less than planned leaves the
 * step open, because the rest of those bottles still have to be made.
 */
export function recordStep(st:ProdStep,actualQty:number,by:string,scrap?:number):ProdStep{
  const qty=Math.max(0,actualQty);
  return {...st,actualQty:qty,done:qty>=st.qty,scrap:scrap??st.scrap,
    doneAt:new Date().toISOString().slice(0,10),doneBy:by};
}

/**
 * Whether an edit to a run needs confirming first — the same bargain guardStepEdit strikes for a step.
 * Never blocks the edit, never lets one past in silence.
 */
export function guardRunEdit(prev:WorkOrder,next:Partial<WorkOrder>):string|null{
  const running=prev.status==="Running";
  if(!prev.good&&!prev.scrap&&!running)return null;
  const made=`${prev.good} good and ${prev.scrap} scrap recorded`;
  const preamble=`${prev.id} has ${made}${running?", and it is running now":""}.`;
  if(next.quantity!=null&&next.quantity!==prev.quantity){
    if(next.quantity<prev.good)return `${preamble} Lowering it to ${next.quantity} is below what has already been made. Keep the original, or edit and accept the ${prev.good} already produced?`;
    return `${preamble} Change the quantity from ${prev.quantity} to ${next.quantity}?`;
  }
  if(next.item&&next.item!==prev.item)return `${preamble} Changing what it makes does not change what was already made. Continue?`;
  if(next.line&&next.line!==prev.line)return `${preamble} Moving it to ${next.line} does not move what was already made. Continue?`;
  return `${preamble} Edit it anyway?`;
}

/** What removing a run would mean, so the question can be asked properly before it is. */
export function runDeleteImpact(data:AppData,id:string){
  const run=(data.workOrders||[]).find(w=>w.id===id);
  const steps=(data.prodDays||[]).flatMap(d=>d.steps||[]).filter(s=>s.workOrderId===id);
  return {run,steps:steps.length,made:run?run.good:0,scrap:run?run.scrap:0,
    started:!!run&&(run.good>0||run.scrap>0||run.status==="Running")};
}

/**
 * Remove a run.
 *
 * The run goes; what it made does not. Its steps are handed back to the plan carrying the units they
 * were credited with, by the same fill-in-date-order rule the run reported them under — because those
 * bottles physically exist, and deleting the paperwork is not the same as unmaking them. A run that
 * produced nothing simply releases its steps.
 */
export function deleteRun(data:AppData,id:string):AppData{
  const run=(data.workOrders||[]).find(w=>w.id===id);
  if(!run)return data;
  const covered=(data.prodDays||[]).flatMap(d=>d.steps||[]).filter(s=>s.workOrderId===id)
    .sort((a,b)=>(a.id>b.id?1:-1));
  const kept=new Map<string,number>();
  let left=run.good;
  for(const st of covered){const take=Math.min(st.qty,Math.max(0,left));kept.set(st.id,take);left-=take}
  return {...data,
    workOrders:(data.workOrders||[]).filter(w=>w.id!==id),
    prodDays:(data.prodDays||[]).map(d=>({...d,steps:(d.steps||[]).map(st=>{
      if(st.workOrderId!==id)return st;
      const made=kept.get(st.id)||0;
      const freed={...st,workOrderId:undefined};
      if(!made)return freed;
      return {...freed,actualQty:made,done:made>=st.qty,doneAt:st.doneAt||run.date,
        note:[st.note,`${made} made on ${run.id} before it was removed`].filter(Boolean).join(" · ")};
    })}))};
}

/** Owner reconciling the record: the floor made units and never recorded them. */
export function reconcileStep(st:ProdStep,actualQty:number,by:string):ProdStep{
  const qty=Math.max(0,actualQty);
  return {...st,actualQty:qty,done:qty>=st.qty,
    doneAt:st.doneAt||new Date().toISOString().slice(0,10),
    doneBy:st.doneBy||by,reconciledBy:by,reconciledAt:new Date().toISOString().slice(0,10)};
}

// ---- planning maths ---------------------------------------------------------------
// How many blanks a set of SKU quantities needs, rolled up per blank. This is the question
// nothing could answer before: GO, BV and MV all draw on the same regular 5-gallon blank,
// so planning them separately hides the real moulding load.
export function blanksNeeded(want:{skuId:string;qty:number}[],skus:Sku[]):Record<string,number>{
  const out:Record<string,number>={};
  for(const w of want){
    const sku=skus.find(s=>s.id===w.skuId);if(!sku)continue;
    out[sku.blankId]=(out[sku.blankId]||0)+w.qty;
  }
  return out;
}
// Caps consumed at assembly, rolled up by component.
export function capsNeeded(want:{skuId:string;qty:number}[],skus:Sku[]):Record<string,number>{
  const out:Record<string,number>={};
  for(const w of want){
    const sku=skus.find(s=>s.id===w.skuId);if(!sku)continue;
    for(const c of sku.caps)out[c.component]=(out[c.component]||0)+c.qty*w.qty;
  }
  return out;
}
// Days of moulding a blank load implies. The two machines run in parallel and cannot cover
// for each other, so 5-gallon and 3-gallon demand are counted separately and the answer is
// whichever takes longer — not the total divided by combined capacity.
export function mouldDays(blankLoad:Record<string,number>,blanks:Blank[],machines:Machine[]){
  const bySize:Record<string,number>={"3-gal":0,"5-gal":0};
  for(const [id,qty] of Object.entries(blankLoad)){
    const b=blanks.find(x=>x.id===id);if(!b)continue;
    bySize[b.size]=(bySize[b.size]||0)+qty;
  }
  const per=(size:string)=>machines.find(m=>m.makes===size)?.perShift||0;
  const days:Record<string,number>={};
  for(const size of Object.keys(bySize)){
    const cap=per(size);
    days[size]=cap>0?Math.ceil(bySize[size]/cap):0;
  }
  return {unitsBySize:bySize,daysBySize:days,days:Math.max(...Object.values(days),0)};
}
// ---- what a single day asks of the two machines ------------------------------------
// mouldDays answers "how many shifts does this load need". A calendar has to answer the harder
// question: does what has been PUT on this particular day fit? Only moulding occupies a machine —
// assembly, palletizing and shipping happen on the bench and the dock and do not compete for it.
//
// The load a step represents is the plan until the floor has finished it, and what was actually
// made once they have. A part-recorded step still owes the balance, so it keeps its planned figure:
// 200 made of a planned 300 is still 300 bottles of machine time before that day is done.
/**
 * What a step has actually produced.
 *
 * A step and the run carrying it out were two separate records of the same bottles: the plan stored
 * actualQty, the work order stored good, nothing connected them, and whichever screen you typed into
 * was the only one that knew. So once a step has a run, THE RUN IS THE RECORD and this reads it — the
 * step's own fields are ignored rather than kept in step, because two copies of a number are two
 * numbers.
 *
 * A run usually spans several days, and each of those days is a step. The run's output fills them in
 * date order, which is how a multi-day run actually progresses: day one is finished before day two
 * starts. Scrap is not divided up — nobody knows which shift it happened on — so it stays reported
 * against the run.
 */
export type StepProgress={made:number;scrap:number;done:boolean;by?:string;at?:string;runId?:string;runScrap:number};
export function stepProgress(st:ProdStep,workOrders:WorkOrder[]=[],allSteps:ProdStep[]=[]):StepProgress{
  const run=st.workOrderId?workOrders.find(w=>w.id===st.workOrderId):undefined;
  if(!run)return {made:st.actualQty??(st.done?st.qty:0),scrap:st.scrap??0,done:!!st.done,by:st.doneBy,at:st.doneAt,runScrap:0};
  // Everything this run covers, in the order it will be worked through.
  const covered=allSteps.filter(x=>x.workOrderId===run.id).sort((a,b)=>(a.id>b.id?1:-1));
  let left=run.good;
  let made=0;
  for(const x of covered){
    const take=Math.min(x.qty,Math.max(0,left));
    if(x.id===st.id){made=take;break}
    left-=take;
  }
  return {made,scrap:0,done:run.status==="Done"?true:made>=st.qty,by:undefined,at:undefined,runId:run.id,runScrap:run.scrap};
}

/** True when a step's record is owned by a run, so the plan must not offer to type the number again. */
export const stepIsRun=(st:ProdStep)=>!!st.workOrderId;

/** The station an assembly run sits on. Not a moulding machine — capping and boxing is bench work. */
export const ASSEMBLY_LINE="Assembly";

/**
 * What one good unit off a run consumes. Moulding pulls the item's main material — a preform — and
 * assembly pulls its caps, which is the whole reason a run has to say which it is: deducting preforms
 * again at assembly would empty the shelf twice for one bottle.
 */
/** Take a run's consumption off the shelf. Never below zero — a count cannot go negative. */
export const consume=(inventory:InventoryRow[],uses:{item:string;perUnit:number}[],units:number)=>
  uses.length?inventory.map(row=>{
    const use=uses.find(u=>u.item===row.item);
    return use?{...row,onHand:Math.max(0,row.onHand-use.perUnit*units)}:row;
  }):inventory;

export function runConsumption(work:WorkOrder,itemRates:ItemRate[]):{item:string;perUnit:number}[]{
  const rate=itemRates.find(r=>r.item===work.item);
  if(!rate)return [];
  if(work.kind==="assembly")return (rate.caps||[]).map(c=>({item:c.component,perUnit:c.qty}));
  return rate.material?[{item:rate.material,perUnit:1}]:[];
}

export const stepLoad=(st:ProdStep,workOrders:WorkOrder[]=[],allSteps:ProdStep[]=[])=>{
  const p=stepProgress(st,workOrders,allSteps);
  return p.done?(p.made||st.qty):Math.max(st.qty,p.made);
};

export type MachineLoad={machine:Machine;units:number;capacity:number;over:number;bySource:Record<ProdSource,number>};

/**
 * Per-machine load for one day. A step is assigned to a machine by the SIZE of the blank it moulds,
 * not by whatever machineId it was saved with — the 5-gallon line physically cannot run a 3-gallon
 * mould, so the blank is the truth and a stale machineId must not be able to hide an overload.
 */
export function dayLoad(day:ProdDay,blanks:Blank[],machines:Machine[],workOrders:WorkOrder[]=[],allSteps:ProdStep[]=[]):MachineLoad[]{
  return machines.map(machine=>{
    const bySource:Record<ProdSource,number>={amazon:0,wholesale:0};
    let units=0;
    for(const st of day.steps||[]){
      if(st.type!=="mold")continue;
      const blank=blanks.find(b=>b.id===st.target);
      if(!blank||blank.size!==machine.makes)continue;
      const n=stepLoad(st,workOrders,allSteps);
      units+=n;bySource[st.source]=(bySource[st.source]||0)+n;
    }
    return {machine,units,capacity:machine.perShift,over:Math.max(0,units-machine.perShift),bySource};
  });
}

/** Every day in the plan that asks more of a machine than a shift can deliver. */
export const overCapacityDays=(days:ProdDay[],blanks:Blank[],machines:Machine[],workOrders:WorkOrder[]=[])=>{
  const all=days.flatMap(d=>d.steps||[]);
  return days.filter(d=>dayLoad(d,blanks,machines,workOrders,all).some(l=>l.over>0));
};

/**
 * Month-level rollup for the header: what is scheduled, how it splits across the two lines, and
 * how many shifts that load actually needs. Days scheduled and shifts needed are reported side by
 * side deliberately — if the plan spreads 3,616 five-gallon bottles over six days, six days is not
 * enough and the difference is a promised date about to be missed.
 */
export function planTotals(days:ProdDay[],blanks:Blank[],machines:Machine[],workOrders:WorkOrder[]=[]){
  const blankLoad:Record<string,number>={};
  const bySource:Record<ProdSource,number>={amazon:0,wholesale:0};
  const daysUsed:Record<string,Set<string>>={};
  const all=days.flatMap(d=>d.steps||[]);
  for(const day of days){
    for(const st of day.steps||[]){
      if(st.type!=="mold")continue;
      const blank=blanks.find(b=>b.id===st.target);if(!blank)continue;
      const n=stepLoad(st,workOrders,all);
      blankLoad[st.target]=(blankLoad[st.target]||0)+n;
      bySource[st.source]=(bySource[st.source]||0)+n;
      const m=machines.find(x=>x.makes===blank.size);
      if(m)(daysUsed[m.id]||=new Set()).add(day.date);
    }
  }
  const need=mouldDays(blankLoad,blanks,machines);
  return {
    blankLoad,bySource,
    unitsBySize:need.unitsBySize,
    shiftsNeeded:need.daysBySize,
    daysScheduled:Object.fromEntries(machines.map(m=>[m.id,(daysUsed[m.id]||new Set()).size])),
    totalUnits:Object.values(blankLoad).reduce((a,b)=>a+b,0),
    over:overCapacityDays(days,blanks,machines,workOrders).map(d=>d.date),
    steps:days.reduce((a,d)=>a+(d.steps||[]).length,0),
  };
}

/**
 * What a step is making, in words. A mould step names a blank; everything after it normally names a
 * SKU — but wholesale buys the plain bottle, so a blank is a perfectly good target for a palletize or
 * ship step too. Both lists are searched rather than assuming which one applies.
 */
export const stepTargetName=(st:ProdStep,blanks:Blank[],skus:Sku[])=>
  blanks.find(b=>b.id===st.target)?.name||skus.find(x=>x.id===st.target)?.name||st.target;

// ---- turning an accepted order into production -------------------------------------
// Wholesale orders were the one thing the calendar could not fill in for itself: the plan knew about
// Amazon replenishment, and someone had to remember to type in the customer work that runs on the same
// two machines. This is that step, done from the record instead of from memory.
//
// An order becomes production when the money is in — the same gate the order flow uses. Planning work
// for an unpaid order would put it on a machine the shop has not agreed to run, which is the exact
// habit the money-first stage model was built to break.

const WEEKEND=[0,6];
export const isWorkday=(iso:string)=>!WEEKEND.includes(new Date(iso+"T12:00:00Z").getUTCDay());
export const addDays=(iso:string,n:number)=>{const d=new Date(iso+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
export const nextWorkday=(iso:string)=>{let d=iso;for(let i=0;i<7&&!isWorkday(d);i++)d=addDays(d,1);return d};

export type OrderNeedLine={item:string;quantity:number;fromStock:number;make:number;blankId?:string;caps:AssemblyCap[]};
export type OrderNeed={
  lines:OrderNeedLine[];             // per line: ordered, covered by stock, still to mould
  blankLoad:Record<string,number>;   // what has to be moulded, after stock
  caps:Record<string,number>;        // components assembly will eat
  unplannable:string[];              // lines with no blank set on the catalogue row
  toMake:number;                     // bottles to mould in total
};

/**
 * What an order still needs made. Stock on the shelf counts: an order for 500 plain 5-gallon bottles
 * when 830 are sitting in the warehouse needs no machine time at all, and planning it anyway would
 * mould 500 bottles nobody asked for.
 *
 * `committed` already counts this order among the promises against that stock, so the order's own
 * quantity is added back before the shelf is read — otherwise every order would be netted against
 * itself and the shop would quietly over-produce by exactly the amount it had already promised.
 */
export function orderNeeds(o:OrderRecord,data:AppData):OrderNeed{
  const need:OrderNeed={lines:[],blankLoad:{},caps:{},unplannable:[],toMake:0};
  for(const line of orderLines(o,data.itemRates)){
    const rate=data.itemRates.find(r=>r.item===line.item);
    const row=data.inventory.find(i=>i.item===line.item);
    const othersPromised=Math.max(0,(row?.committed||0)-line.quantity);
    const available=Math.max(0,(row?.onHand||0)-othersPromised);
    const covered=Math.min(line.quantity,available);
    const make=Math.max(0,line.quantity-covered);
    const caps=rate?.caps||[];
    need.lines.push({item:line.item,quantity:line.quantity,fromStock:covered,make,blankId:rate?.blankId||undefined,caps});
    if(!rate?.blankId){
      // The catalogue cannot say what this is made from, so nothing is invented — the line is named
      // instead, and the owner sets the blank on the item rate.
      if(!need.unplannable.includes(line.item))need.unplannable.push(line.item);
      continue;
    }
    if(!make)continue;
    need.blankLoad[rate.blankId]=(need.blankLoad[rate.blankId]||0)+make;
    for(const c of caps)need.caps[c.component]=(need.caps[c.component]||0)+c.qty*make;
    need.toMake+=make;
  }
  return need;
}

/**
 * Where an order's work fits. Moulding is placed into whatever a machine has left on each working day
 * rather than stacked onto one — the plan can already be full of Amazon work, and a scheduler that
 * ignores that would produce a calendar that looks fine and a month that cannot be run.
 *
 * Because it only ever fills free capacity, adding an order never creates an over-capacity day. What it
 * does instead is push the finish date out, which is the honest answer and the one worth seeing before
 * the customer is promised anything: `daysLate` says whether the date already given is now a fiction.
 */
/** Machine load per day, keyed date|machineId — the running total a queue is scheduled against. */
export type DayLoadMap=Record<string,number>;
export const loadKey=(date:string,machineId:string)=>`${date}|${machineId}`;
export function committedLoad(data:AppData):DayLoadMap{
  const blanks=data.blanks?.length?data.blanks:DEFAULT_BLANKS;
  const machines=data.settings.machines?.length?data.settings.machines:DEFAULT_MACHINES;
  const all=(data.prodDays||[]).flatMap(d=>d.steps||[]);
  const out:DayLoadMap={};
  for(const day of data.prodDays||[])
    for(const l of dayLoad(day,blanks,machines,data.workOrders||[],all))out[loadKey(day.date,l.machine.id)]=l.units;
  return out;
}

/**
 * Where an order's work fits.
 *
 * `load` is the running total of what the machines are already carrying. Pass one in to schedule an
 * order behind everything ahead of it in the queue — it is updated as this order takes its shifts, so
 * the next order in line sees them gone. Leave it out and the order is planned against the calendar as
 * it stands today.
 */
export function planOrder(o:OrderRecord,data:AppData,from?:string,load?:DayLoadMap){
  const blanks=data.blanks?.length?data.blanks:DEFAULT_BLANKS;
  const machines=data.settings.machines?.length?data.settings.machines:DEFAULT_MACHINES;
  const need=orderNeeds(o,data);
  const entries:{date:string;step:ProdStep}[]=[];
  const placed:DayLoadMap=load||committedLoad(data);
  const key=loadKey;

  const cursor=nextWorkday(from||todayIso());
  let lastMould="";
  let n=0;
  for(const [blankId,wanted] of Object.entries(need.blankLoad)){
    const blank=blanks.find(b=>b.id===blankId);
    const machine=blank&&machines.find(m=>m.makes===blank.size);
    if(!blank||!machine)continue;                      // nothing can make it; orderNeeds already said so
    let left=wanted;let day=cursor;
    for(let guard=0;left>0&&guard<400;guard++,day=nextWorkday(addDays(day,1))){
      const used=placed[key(day,machine.id)]||0;
      const free=machine.perShift-used;
      if(free<=0)continue;
      const take=Math.min(free,left);
      placed[key(day,machine.id)]=used+take;
      entries.push({date:day,step:{id:`${o.id}-m${++n}`,type:"mold",source:"wholesale",target:blankId,qty:take,machineId:machine.id,linkedTo:o.id}});
      left-=take;
      if(day>lastMould)lastMould=day;
    }
  }

  // Assembly, pallets and the truck follow the last bottle off the machine — one step per line, the way
  // the Amazon plan carries one per SKU, because a two-product order is two pallets and two things to
  // count. An order the shelf already covers skips straight to packing: those bottles are made, capped
  // and waiting.
  const after=(d:string)=>nextWorkday(addDays(d,1));
  const assembleDay=lastMould?after(lastMould):nextWorkday(from||todayIso());
  const capped=need.lines.filter(l=>l.make>0&&l.caps.length);
  for(const [i,l] of capped.entries())
    entries.push({date:assembleDay,step:{id:`${o.id}-a${i+1}`,type:"assemble",source:"wholesale",target:l.item,qty:l.make,linkedTo:o.id}});
  const palletDay=capped.length?after(assembleDay):assembleDay;
  for(const [i,l] of need.lines.entries())
    entries.push({date:palletDay,step:{id:`${o.id}-p${i+1}`,type:"palletize",source:"wholesale",target:l.item,qty:l.quantity,linkedTo:o.id}});
  const ship=after(palletDay);
  for(const [i,l] of need.lines.entries())
    entries.push({date:ship,step:{id:`${o.id}-s${i+1}`,type:"ship",source:"wholesale",target:l.item,qty:l.quantity,linkedTo:o.id}});

  const due=dueIso(o.due);
  const daysLate=due?Math.round((new Date(ship+"T12:00:00Z").getTime()-new Date(due+"T12:00:00Z").getTime())/864e5):null;
  return {entries,need,finish:ship,daysLate:daysLate!=null&&daysLate>0?daysLate:null};
}

/**
 * The steps one run would cover: the one chosen, plus the days that follow it making the same thing for
 * the same customer. A run in this shop is a continuous stretch on one machine, so it stops at the first
 * real gap — a weekend is not a gap, a fortnight is a different batch.
 */
export function runSteps(step:ProdStep,days:ProdDay[]):ProdStep[]{
  // Only moulding runs across consecutive days on one machine. Assembly is a batch on a bench: one
  // step, one run.
  if(step.type!=="mold")return [step];
  const dated=days.flatMap(d=>(d.steps||[]).map(s=>({date:d.date,step:s}))).sort((a,b)=>a.date.localeCompare(b.date));
  const start=dated.findIndex(x=>x.step.id===step.id);
  if(start<0)return [step];
  const out=[dated[start].step];
  let previous=dated[start].date;
  for(const {date,step:next} of dated.slice(start+1)){
    if(next.type!=="mold"||next.target!==step.target||next.source!==step.source||next.linkedTo!==step.linkedTo)continue;
    if(next.workOrderId||stepProgress(next).made>0)break;      // already run, or already recorded
    const gap=Math.round((new Date(date+"T12:00:00Z").getTime()-new Date(previous+"T12:00:00Z").getTime())/864e5);
    if(gap>4)break;                                            // a fortnight later is a different batch
    out.push(next);previous=date;
  }
  return out;
}

/**
 * A run raised from the plan, so what the floor sees is the work the calendar asked for rather than a
 * second job typed in beside it. The item is looked up through the blank the step moulds, because the
 * floor screens key their quality checks and their material off the catalogue item, not off the blank.
 */
export function runFromSteps(steps:ProdStep[],data:AppData,id:string,startDate:string):WorkOrder|null{
  const first=steps[0];
  if(!first||(first.type!=="mold"&&first.type!=="assemble"))return null;
  const blanks=data.blanks?.length?data.blanks:DEFAULT_BLANKS;
  const machines=data.settings.machines?.length?data.settings.machines:DEFAULT_MACHINES;
  const assembly=first.type==="assemble";
  const blank=blanks.find(b=>b.id===first.target);
  const machine=blank&&machines.find(m=>m.makes===blank.size);
  const order=first.linkedTo?data.orders.find(o=>o.id===first.linkedTo):undefined;
  // Prefer the item the customer actually ordered; fall back to any catalogue item moulded from this
  // blank; fall back again to the blank's own name so the run is still raised rather than refused.
  const fromOrder=order&&orderLines(order,data.itemRates).map(l=>l.item)
    .find(item=>data.itemRates.find(r=>r.item===item)?.blankId===first.target);
  // An assembly step already names what it is making — a catalogue item for wholesale, a SKU for
  // Amazon — so it is used directly rather than resolved back through a blank.
  const item=assembly
    ?(data.itemRates.find(r=>r.item===first.target)?.item
      ||data.skus?.find(x=>x.id===first.target)?.itemId
      ||data.skus?.find(x=>x.id===first.target)?.name||first.target)
    :(fromOrder||data.itemRates.find(r=>r.blankId===first.target)?.item||blank?.name||first.target);
  const customer=order?data.customers.find(c=>c.id===order.customerId)?.name:"";
  return {
    id,orderId:first.linkedTo,kind:assembly?"assembly":"mould",item,
    quantity:steps.reduce((a,s)=>a+s.qty,0),
    good:0,scrap:0,packed:0,
    date:startDate,status:"Scheduled",
    purpose:order?`${customer||"Customer"} order`:"Build stock",
    line:assembly?ASSEMBLY_LINE:(machine?.line||data.settings.lines?.[0]||"Line 1"),
    days:new Set(steps.map(s=>s.id)).size,
  };
}

// ---- the line ----------------------------------------------------------------------
// What the shop can promise, and when.
//
// Sales needs an answer before the customer is off the phone: if I take this order now, when is it
// done? That answer is only worth anything if it counts everything already promised — the plan on the
// machines AND every order ahead of this one in the queue. So the queue is scheduled in order, each
// order taking the shifts the ones before it left, and the date that falls out is the date to give.
//
// First in, first served: an order's place is the order it was taken in. Nothing jumps the line by
// being urgent, because the queue is the promise.

export type QueueEntry={
  order:OrderRecord;position:number;
  finish:string;                       // when the machines can have it done
  daysLate:number|null;                // against the date the customer was given
  toMake:number;                       // bottles still to mould after stock
  scheduled:boolean;                   // already on the calendar as real steps
};

/**
 * Orders still to be made, in the order they will be worked.
 *
 * Normally that is the order they were taken in. An urgent order goes in front of everything that has
 * not been marked urgent — and urgent orders keep their own order among themselves, by when they were
 * marked, so a second emergency does not quietly overtake the first one.
 */
export const queueOrders=(data:AppData)=>(data.orders||[])
  .filter(o=>o.status!=="Needs approval"&&stageOf(o)<STAGE_READY)
  .sort((a,b)=>{
    if(!!a.rush!==!!b.rush)return a.rush?-1:1;
    const key=(o:OrderRecord)=>String(o.rush?o.rush.at:(o.createdAt||o.id));
    return key(a).localeCompare(key(b));
  });

/**
 * The whole line, each order dated behind the ones ahead of it. Orders already on the calendar keep
 * the date their steps say; the rest are scheduled into what is left, in queue order.
 */
export function productionQueue(data:AppData,from?:string):QueueEntry[]{
  const load=committedLoad(data);
  const days=data.prodDays||[];
  const out:QueueEntry[]=[];
  let position=0;
  for(const order of queueOrders(data)){
    position++;
    const planned=plannedFor(order.id,days);
    if(planned.length){
      // Already on the calendar: its shifts are in `load` already, so read the date off the plan.
      const ship=days.filter(d=>(d.steps||[]).some(s=>s.linkedTo===order.id)).map(d=>d.date).sort().pop()||"";
      const due=dueIso(order.due);
      const late=due&&ship?Math.round((new Date(ship+"T12:00:00Z").getTime()-new Date(due+"T12:00:00Z").getTime())/864e5):null;
      out.push({order,position,finish:ship,daysLate:late!=null&&late>0?late:null,
        toMake:orderNeeds(order,data).toMake,scheduled:true});
      continue;
    }
    const plan=planOrder(order,data,from,load);          // takes its shifts out of `load`
    out.push({order,position,finish:plan.finish,daysLate:plan.daysLate,toMake:plan.need.toMake,scheduled:false});
  }
  return out;
}

/**
 * The machine load with everything ahead of an order in the queue already taken.
 *
 * Planning an order has to put it where the line says it goes, not wherever there happens to be a gap —
 * otherwise the date the customer was given and the date the steps land on are two different answers,
 * which is the same disease as the plan and the run holding two numbers. Orders ahead that are not on
 * the calendar yet are simulated, so their place is held for them.
 */
export function loadAheadOf(data:AppData,orderId:string,from?:string):DayLoadMap{
  const load=committedLoad(data);
  for(const o of queueOrders(data)){
    if(o.id===orderId)break;
    if(plannedFor(o.id,data.prodDays||[]).length)continue;   // already on the calendar, already counted
    planOrder(o,data,from,load);
  }
  return load;
}

/**
 * What moving an order to the front would actually cost.
 *
 * Somebody is always behind. This runs the line as it stands and as it would be, and reports both ends:
 * what the urgent customer gains, and every order that goes backwards — flagging the ones that would
 * then miss a date they have already been given, because those are phone calls somebody has to make.
 *
 * Work already on the calendar keeps its slot. A flag must not shuffle a run the floor may have started;
 * to take a shift off scheduled work the owner moves those steps by hand, and the guard has its say.
 */
export type RushMove={order:OrderRecord;from:string;to:string;days:number;missesPromise:boolean};
export function rushImpact(data:AppData,orderId:string,from?:string){
  const now=new Date().toISOString();
  const before=productionQueue(data,from);
  const after=productionQueue({...data,orders:(data.orders||[]).map(o=>
    o.id===orderId?{...o,rush:{at:now,by:""}}:o)},from);
  const was=new Map(before.map(q=>[q.order.id,q]));
  const moved:RushMove[]=[];
  let gain=0;
  for(const q of after){
    const prev=was.get(q.order.id);
    if(!prev||prev.finish===q.finish)continue;
    const days=Math.round((new Date(q.finish+"T12:00:00Z").getTime()-new Date(prev.finish+"T12:00:00Z").getTime())/864e5);
    if(q.order.id===orderId){gain=-days;continue}
    if(days>0)moved.push({order:q.order,from:prev.finish,to:q.finish,days,
      missesPromise:!!q.order.promised&&q.finish>q.order.promised});
  }
  const target=after.find(q=>q.order.id===orderId);
  return {gain,finish:target?.finish||"",position:target?.position||0,
    was:was.get(orderId)?.finish||"",moved,
    calls:moved.filter(m=>m.missesPromise)};
}

/**
 * What to tell a customer who is on the phone now. The draft is scheduled at the BACK of the line —
 * behind every order already taken — because that is where it will actually sit.
 */
export function estimateOrder(data:AppData,lines:OrderLine[],from?:string){
  const load=committedLoad(data);
  for(const order of queueOrders(data)){
    if(plannedFor(order.id,data.prodDays||[]).length)continue;   // its load is already counted
    planOrder(order,data,from,load);
  }
  const draft:OrderRecord={id:"draft",customerId:"",item:lines.map(l=>l.item).join(" + "),
    cases:0,quantity:lines.reduce((a,l)=>a+l.quantity,0),due:"",status:"Confirmed",payment:"",lines,
    stage:STAGE_NEW,stageV2:true};
  const plan=planOrder(draft,data,from,load);
  return {finish:plan.finish,toMake:plan.need.toMake,need:plan.need,
    position:queueOrders(data).length+1,
    ahead:queueOrders(data).length};
}

/** The steps already on the plan for an order. Used to keep planning it twice from being possible. */
export const plannedFor=(orderId:string,days:ProdDay[])=>
  days.flatMap(d=>d.steps||[]).filter(s=>s.linkedTo===orderId);

/**
 * Orders whose work is not on the calendar yet: past the money gate, not yet made, nothing planned.
 * An order that already has steps is left alone — re-planning around what the floor has started is a
 * different and much more dangerous operation than adding what was never there.
 */
export function ordersToPlan(data:AppData):OrderRecord[]{
  const days=data.prodDays||[];
  return data.orders.filter(o=>o.status!=="Needs approval"&&canStartProduction(o)
    &&stageOf(o)>=STAGE_PAID&&stageOf(o)<STAGE_READY
    &&!plannedFor(o.id,days).length);
}

/** Merge loose steps into the plan, creating any day they land on that does not exist yet. */
export function addSteps(days:ProdDay[],entries:{date:string;step:ProdStep}[]):ProdDay[]{
  const out=days.map(d=>({...d,steps:[...(d.steps||[])]}));
  for(const {date,step} of entries){
    const day=out.find(d=>d.date===date);
    if(day)day.steps.push(step);else out.push({date,steps:[step]});
  }
  return out.sort((a,b)=>a.date.localeCompare(b.date));
}

/**
 * One-time guess at the blank behind an existing catalogue row, for records written before the
 * catalogue could say. It is a guess from the item text and it is meant to be corrected on the Item
 * rates screen, not trusted forever — which is why it only ever fills a field nobody has set, and why
 * planning refuses to work from a row it could not resolve rather than inventing something plausible.
 *
 * Silicone caps sit on a regular neck and screw caps on a screw neck, which is what decides the mould.
 */
export function inferBlank(rate:ItemRate,blanks:Blank[]):{blankId?:string;caps?:AssemblyCap[]}{
  const text=`${rate.item} ${rate.sub||""} ${rate.material||""}`.toLowerCase();
  if(!/\bgal/.test(text))return {};                             // cap packs and bought-in items
  const size=/3\s*-?\s*gal/.test(text)?"3-gal":/5\s*-?\s*gal/.test(text)?"5-gal":null;
  if(!size)return {};
  const capCount=/no\s+caps?/.test(text)?0:Number((text.match(/(\d+)\s*(?:screw|silicone)?\s*caps?/)||[])[1]||0);
  const silicone=/silicone/.test(text);
  const neck=capCount>0&&!silicone?"screw":"regular";
  const blank=blanks.find(b=>b.size===size&&b.neck===neck);
  if(!blank)return {};
  return {blankId:blank.id,caps:capCount>0?[{component:silicone?"Silicone cap":"Screw cap",qty:capCount}]:[]};
}

export const fmtDay=(d:Date)=>d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});

/** Fill in fields the old UI never saved so the new screens always have what they need. */
export function normalize(d:AppData):AppData{
  const s=d.settings||seedData.settings;
  return {...d,
    customers:(d.customers||[]).map(c=>({...c,prices:c.prices||{},qb:c.qb??true})),
    // stageV2 has to be set on the NEW object. The spread copies the flag as it was (unset), and
    // migrateStage only marks the record it was handed, so without this the guard never persisted and
    // the migration re-ran on every load — dragging live orders backwards a second time.
    orders:(d.orders||[]).map(o=>({...o,stage:migrateStage(o),stageV2:true,discount:o.discount||0,shipMethod:o.shipMethod||"pickup",notes:o.notes||""})),
    workOrders:(d.workOrders||[]).map(w=>({...w,line:w.line||"Line 1",days:w.days||1})),
    // blankId is only guessed when nobody has answered yet. An owner who sets it to "not moulded here"
    // stores an empty string, which is an answer and is left alone.
    itemRates:(d.itemRates||[]).map(r=>({...r,kind:r.kind||"finished",unitsPerCase:r.unitsPerCase||2,floor:r.floor??Math.round(r.rate*(1-r.discountLimit/100)*100)/100,qcChecks:r.qcChecks||DEFAULT_QC,
      ...(r.blankId===undefined?inferBlank(r,d.blanks?.length?d.blanks:DEFAULT_BLANKS):{})})),
    inventory:(d.inventory||[]).map(i=>({...i,kind:i.kind||(/(preform|cap \(|caps \(|handle|carton|resin)/i.test(i.item)?"raw":"finished")})),
    maintenance:d.maintenance||[],purchaseOrders:d.purchaseOrders||[],
    // The catalogue and the machines are the shop itself, so they are filled in rather than left
    // undefined — Phase 1 defined them but nothing ever put them in the record, so every screen that
    // asked for a blank or a machine got nothing.
    blanks:d.blanks?.length?d.blanks:DEFAULT_BLANKS,skus:d.skus?.length?d.skus:DEFAULT_SKUS,
    // ?? not ||: an owner who clears the whole plan means it, and must not have September seeded back.
    // `source` is defaulted for safety only — every step written by this app sets it explicitly.
    prodDays:(d.prodDays??SEPTEMBER_PLAN).map(day=>({...day,steps:(day.steps||[]).map(st=>({...st,source:st.source||"wholesale"}))})),
    calendar:d.calendar||[],notices:d.notices||[],activities:d.activities||[],roles:d.roles||seedData.roles,documents:d.documents||[],
    settings:{...seedData.settings,...s,lines:s.lines||["Line 1"],machines:s.machines?.length?s.machines:DEFAULT_MACHINES,shipMethods:(s.shipMethods&&s.shipMethods.some(m=>m.custom)?s.shipMethods:[...(s.shipMethods||DEFAULT_SHIP).filter(m=>!m.custom),DEFAULT_SHIP[DEFAULT_SHIP.length-1]]),discountApproval:s.discountApproval??5,paymentFee:s.paymentFee??25,monthlyExpenses:s.monthlyExpenses??0,cashOnHand:s.cashOnHand??0,quickBooks:{...seedData.settings.quickBooks,...(s.quickBooks||{})}}};
}

/** True when the record still holds sample customers (starter or demo data). */
export const hasDemoData=(d:AppData)=>/pure alkaline/i.test(d.settings?.company||"")||d.customers.some(c=>/\.test$/i.test(c.email))||d.settings?.ownerEmail?.endsWith(".test")===true;
export const todayIso=()=>new Date().toISOString().slice(0,10);

/**
 * A fresh warehouse-link token. The URL is the only thing standing between this link and the
 * schedule, so it is long and random — and it drops the characters that get misread off a screen
 * (l/1, o/0), because someone will end up typing it into a tablet by hand.
 */
/**
 * Photos are keyed by the product's name. A listing needs a second one — a picture of the packed unit,
 * so the floor can see what a finished Amazon box is meant to look like — so it is filed under a
 * composed key rather than a second table nobody would remember to back up.
 */
export const packagingPhotoKey=(name:string)=>`${name}#packaging`;
export const isPackagingKey=(key:string)=>key.endsWith("#packaging");
export const photoKeyName=(key:string)=>key.replace(/#packaging$/,"");

export const newFloorToken=()=>
  "floor-"+Array.from(crypto.getRandomValues(new Uint8Array(18)),b=>"abcdefghijkmnpqrstuvwxyz23456789"[b%32]).join("");

// ---- dates -----------------------------------------------------------------
// Dates were stored two different ways: documents raised here saved a year-less display string
// ("Fri, Sep 5") while invoices imported from QuickBooks saved ISO ("2026-09-05"). Overdue detection
// did Date.parse(`${due} ${thisYear}`), which produces "2026-09-05 2026" for an imported invoice —
// NaN — so imported invoices could never be overdue, and a year-less label is genuinely ambiguous
// across a New Year anyway. Everything is stored ISO now; these helpers read both so existing records
// keep working.
const MONTHS=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
/** Any stored due value → "YYYY-MM-DD", or null when it cannot be understood. */
export function dueIso(v?:string|null):string|null{
  if(!v)return null;
  const s=String(v).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  // Legacy label: "Fri, Sep 5" or "Sep 5". No year, so pick the one that puts the date nearest today —
  // right for a due date within a few months either side, which is what these all are. It is a guess,
  // and it is only ever applied to records written before dates were stored properly.
  const m=s.match(/([a-z]{3})[a-z]*\.?\s+(\d{1,2})/i);
  if(!m)return null;
  const mo=MONTHS.indexOf(m[1].toLowerCase());const day=Number(m[2]);
  if(mo<0||!day)return null;
  const now=new Date();const y=now.getFullYear();
  let best:string|null=null;let bestGap=Infinity;
  for(const yy of [y-1,y,y+1]){
    const d=new Date(Date.UTC(yy,mo,day,12));
    if(d.getUTCMonth()!==mo)continue;                   // e.g. Feb 30
    const gap=Math.abs(d.getTime()-now.getTime());
    if(gap<bestGap){bestGap=gap;best=d.toISOString().slice(0,10)}
  }
  return best;
}
/** Whole days until the due date. Negative means overdue. null when the date is unreadable. */
export function dueDays(v?:string|null):number|null{
  const iso=dueIso(v);if(!iso)return null;
  const due=new Date(iso+"T12:00:00Z").getTime();
  const today=new Date(todayIso()+"T12:00:00Z").getTime();
  return Math.round((due-today)/864e5);
}
/** Human display for a stored due value. Unreadable values are shown as they were saved. */
export function fmtDue(v?:string|null):string{
  const iso=dueIso(v);
  if(!iso)return v?String(v):"—";
  const d=new Date(iso+"T12:00:00Z");
  return d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",timeZone:"UTC"});
}
/**
 * When something is due, in the words somebody standing at a machine reads it. "Needed Tue, Sep 8"
 * makes the reader work out what today is before they know whether to hurry; "Due today" does not.
 * `today` is passed in rather than read from the clock so the floor and the server agree on the day.
 */
export function dueLabel(date?:string|null,dueAt?:string|null,today?:string):string{
  const at=dueAt?` at ${new Date(dueAt).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}`:"";
  const iso=dueIso(date);
  if(!iso)return date?`Due ${date}${at}`:"No date set";
  const now=today&&/^\d{4}-\d{2}-\d{2}$/.test(today)?today:todayIso();
  if(iso<now)return `OVERDUE — was due ${fmtDue(iso)}`;
  if(iso===now)return `Due today${at}`;
  const t=new Date(now+"T12:00:00Z");t.setUTCDate(t.getUTCDate()+1);
  if(iso===t.toISOString().slice(0,10))return `Due tomorrow${at}`;
  return `Due ${fmtDue(iso)}${at}`;
}
export const daysFromNow=(n:number)=>{const x=new Date();x.setDate(x.getDate()+n);return x};
