// The warehouse link — a no-login URL on a shop tablet.
//
// The token in that link is a bearer credential and it will leak eventually. Everything here is written
// from that assumption: these assertions are about what a stranger holding the link can SEE and what
// they can DO, not about whether the page looks right.
//
// Runs against the real modules rather than a copy — a test of a second implementation would prove
// nothing about the code that actually answers the request.
let pass=0,fail=0;
const t=(n,c,d)=>{if(c)pass++;else fail++;console.log(`${c?"  ok  ":"  FAIL"} ${n}${c?"":"  → "+d}`)};

const readFileSyncRoute=()=>{
  const {readFileSync}=require$("node:fs");
  return readFileSync(new URL("../app/api/floor/route.ts",import.meta.url),"utf8");
};
let require$=null;
let floor=null,app=null;
try{
  require$=await import("node:module").then(m=>m.createRequire(import.meta.url));
  floor=await import("../app/server/floor.ts");
  app=await import("../app/app-data.ts");
}catch(e){console.log("  note: "+e.message.split("\n")[0])}
t("the warehouse-link modules can be imported",!!floor&&!!app,"needs Node 22.18+ for type stripping");

if(floor&&app){
const {tokenMatches,floorView,applyFloorAction,floorActor}=floor;
const {normalize,demoData,newFloorToken}=app;
const data=normalize({...demoData,settings:{...demoData.settings,warehouseToken:"floor-abcdefghijklmnop"}});

console.log("\nThe token is the whole door, so it is checked like one:");
t("the right token opens it",tokenMatches("floor-abcdefghijklmnop","floor-abcdefghijklmnop"));
t("a wrong token does not",!tokenMatches("floor-abcdefghijklmnoq","floor-abcdefghijklmnop"));
// A company that has never made a link must not be one where the empty string is the password.
t("an unset token never authenticates",!tokenMatches("","")&&!tokenMatches(undefined,undefined));
t("and no supplied value opens an unset one",!tokenMatches("anything",""));
t("a too-short stored token is refused outright",!tokenMatches("short","short"));
t("a prefix of the real token does not open it",!tokenMatches("floor-abcdefghijklmno","floor-abcdefghijklmnop"));
const fresh=newFloorToken();
t("a generated token is long enough to be worth having",fresh.length>=20,`${fresh.length}`);
t("generated tokens differ",newFloorToken()!==newFloorToken());
t("and avoid the characters people misread off a screen",!/[l1o0]/.test(fresh.replace(/^floor-/,"")),fresh);

console.log("\nWhat a stranger holding the link can see:");
const view=floorView(data);
const seen=JSON.stringify(view);
const leaks=[
  ["a customer's email","carlos@miamiwater.test"],
  ["a customer's phone","(305) 555-0142"],
  ["a billing address","8200 NW 30th St"],
  ["an invoice number","INV-1031"],
  ["the warehouse token itself","floor-abcdefghijklmnop"],
  ["the owner's email",data.settings.ownerEmail],
  ["a QuickBooks realm id",String(data.settings.quickBooks.realmId||"§none§")],
];
for(const [what,needle] of leaks)
  t(`no ${what}`,needle==="§none§"||!seen.includes(needle),`found ${needle}`);
// Prices are the ones that would matter most to a competitor holding the link.
t("no list prices",!seen.includes("\"rate\":9.9")&&!seen.includes("\"floor\":8.75"));
t("no unit costs",!seen.includes("\"cost\":4.85"));
t("no customer balances or lifetime sales",!seen.includes("lifetimeSales")&&!seen.includes("\"balance\""));
t("no documents at all",!seen.includes("\"kind\":\"invoice\"")&&!seen.includes("\"kind\":\"quote\""));
t("no settings beyond the lines and the machines",!seen.includes("discountApproval")&&!seen.includes("quickBooks"));

console.log("\nWhat it does show, because the floor cannot work without it:");
t("the schedule",view.days.length>0);
t("the open runs",view.workOrders.length>0);
// Not by the office's word for it: "Done" there means quality passed, and a job that passed quality is
// still at the packing bench. What the floor should not see is a job that is finished end to end.
t("no finished jobs clutter it",view.workOrders.every(w=>w.stage<5));
t("but one waiting at the bench is shown",view.workOrders.some(w=>w.stage===3));
t("the customer name on an order it has to make",view.orders.some(o=>o.customer));
t("the note sales left for the warehouse",view.orders.some(o=>o.notes));
t("but nothing about what that order is worth",!JSON.stringify(view.orders).includes("payment")&&!JSON.stringify(view.orders).includes("deposit"));
// The view is an allow-list, so a field added to the record later cannot leak by simply existing.
const withSecret=normalize({...data,customers:data.customers.map(c=>({...c,secretNote:"do not share"}))});
t("a new field on a record does not leak by default",!JSON.stringify(floorView(withSecret)).includes("do not share"));

console.log("\nWhat it can change — and everything it cannot:");
// A step nobody has raised a run for: those are the ones the tablet records directly.
const step=data.prodDays.flatMap(d=>d.steps).find(s=>!s.done&&!s.workOrderId);
const wo=data.workOrders.find(w=>w.status!=="Done"&&w.good<w.quantity);
const finishedRun=data.workOrders.find(w=>w.status!=="Done"&&w.good>=w.quantity);
const untouched=(before,after)=>["customers","documents","itemRates","roles","orders","settings","skus","blanks"]
  .every(k=>JSON.stringify(before[k])===JSON.stringify(after[k]));

const recorded=applyFloorAction(data,{op:"step.record",stepId:step.id,made:120,scrap:3,by:"Marta"});
t("recording a step is allowed",!recorded.error);
t("it stores what was made",recorded.data.prodDays.flatMap(d=>d.steps).find(s=>s.id===step.id).actualQty===120);
t("and who said so",recorded.data.prodDays.flatMap(d=>d.steps).find(s=>s.id===step.id).doneBy==="Marta");
t("recording touches nothing outside production",untouched(data,recorded.data));

const progress=applyFloorAction(data,{op:"wo.progress",woId:wo.id,good:24,by:"Marta"});
t("adding to a run is allowed",!progress.error);
t("the count goes up",progress.data.workOrders.find(w=>w.id===wo.id).good===wo.good+24);
t("a run update touches nothing outside production and stock",untouched(data,progress.data));
// The material is consumed, exactly as the in-app floor screen does it.
const material=data.itemRates.find(r=>r.item===wo.item)?.material;
const before=data.inventory.find(i=>i.item===material)?.onHand;
t("good bottles eat their preforms",before===undefined||progress.data.inventory.find(i=>i.item===material).onHand===before-24);
const overshoot=applyFloorAction(data,{op:"wo.progress",woId:wo.id,good:999999,by:"Marta"});
t("a run cannot report more than it was for",overshoot.data.workOrders.find(w=>w.id===wo.id).good===wo.quantity,`${overshoot.data?.workOrders.find(w=>w.id===wo.id).good}`);
// A run that has already made its full quantity has nothing left to add, and says so rather than
// quietly accepting a press that would invent stock.
t("a run that is already complete takes no more",!!applyFloorAction(data,{op:"wo.progress",woId:finishedRun.id,good:24}).error);

t("the floor can hand a run to quality",!applyFloorAction(data,{op:"wo.status",woId:wo.id,status:"QC hold"}).error);
// Marking work Done is the owner's call after the checks; the link must not be able to close its own.
t("but it cannot mark its own work Done",!!applyFloorAction(data,{op:"wo.status",woId:wo.id,status:"Done"}).error);
t("nor invent a status",!!applyFloorAction(data,{op:"wo.status",woId:wo.id,status:"Shipped"}).error);
t("an unknown verb is refused",!!applyFloorAction(data,{op:"settings.update",woId:wo.id}).error);
t("a step that is not on the plan is refused",!!applyFloorAction(data,{op:"step.record",stepId:"nope",made:5}).error);
t("a work order that is not open is refused",!!applyFloorAction(data,{op:"wo.progress",woId:"nope",good:5}).error);
// Numbers arrive from a page anyone can rewrite, so they are cleaned rather than trusted.
t("a negative count cannot run the record backwards",applyFloorAction(data,{op:"wo.progress",woId:wo.id,good:-500,scrap:-5}).error==="Nothing to add");
t("a nonsense count is refused, not stored",!!applyFloorAction(data,{op:"wo.progress",woId:wo.id,good:"lots"}).error);

console.log("\nThe tablet cannot count the same bottles twice:");
// The link used to show the run AND the plan's copy of the same work, each with its own button.
const onRun=data.prodDays.flatMap(d=>d.steps).find(s=>s.workOrderId);
t("a step being run is refused here",!!applyFloorAction(data,{op:"step.record",stepId:onRun.id,made:400}).error);
t("and it says where the number goes instead",
  applyFloorAction(data,{op:"step.record",stepId:onRun.id,made:400}).error.includes(onRun.workOrderId));
const shown=floorView(data).days.flatMap(d=>d.steps).find(s=>s.id===onRun.id);
t("the tablet shows the run's figure, not the plan's",shown.actualQty===500,`${shown.actualQty}`);
t("and names the run so the operator knows where to look",shown.workOrderId===onRun.workOrderId);
const free=data.prodDays.flatMap(d=>d.steps).find(s=>!s.workOrderId&&!s.done);
t("a step with no run is still recordable from the tablet",!applyFloorAction(data,{op:"step.record",stepId:free.id,made:10}).error);

// ---------------------------------------------------------------------------
// The job traveller: what the floor screen runs on.
console.log("\nA job carries where it is, not just what was planned:");
const {JOB_NOT_STARTED,JOB_PRODUCTION,JOB_QC,JOB_COMPLETE,jobStageOf,setJobStage,pauseJob,blockJob,blockedFor,
  jobReadiness,jobForecast,jobPriority}=app;
const running=data.workOrders.find(w=>w.id==="WO-121");
t("a job knows which stage it is at",jobStageOf(running)===JOB_PRODUCTION);
// Records written before the traveller existed still read correctly.
t("an older record is read from the word the office used",jobStageOf({status:"QC hold",quantity:1,good:0,scrap:0})===JOB_QC);
t("and one that was finished reads as complete",jobStageOf({status:"Done",quantity:1,good:0,scrap:0})===JOB_COMPLETE);

const started=setJobStage({...running,jobStage:JOB_NOT_STARTED,startedAt:undefined,status:"Scheduled"},JOB_PRODUCTION,"Marta","2026-09-07T09:14:00.000Z");
t("starting a job records who started it",started.operator==="Marta"&&started.startedAt==="2026-09-07T09:14:00.000Z");
t("and stamps the stage in its history",started.history?.at(-1)?.stage===JOB_PRODUCTION);
// The office reads `status`; both words have to stay in step or one of the two screens lies.
t("the office's word for it keeps up",started.status==="Running");
t("sending it to quality says QC hold",setJobStage(started,JOB_QC,"Marta").status==="QC hold");

console.log("\nStopping a job says why, who and for how long:");
const stopped=blockJob(running,{reason:"Machine down",note:"Molder 2 tripped out",by:"James"},new Date(Date.now()-90*60000).toISOString());
t("it is held, not lost",stopped.hold.reason==="Machine down"&&stopped.paused===true);
t("the office sees it as not running",stopped.status==="Paused");
t("how long it has been down is known",blockedFor(stopped)>=89&&blockedFor(stopped)<=91,`${blockedFor(stopped)}`);
t("pausing is not the same as blocking",!pauseJob(running,"James").hold);

console.log("\nA job will not start without what it needs:");
const ready=jobReadiness(running,data);
t("materials are checked against free stock",ready.checks.some(c=>c.tracked));
t("and the mould is listed without a tick it has not earned",ready.checks.some(c=>!c.tracked));
const bare=normalize({...data,inventory:data.inventory.map(i=>/preform/i.test(i.item)?{...i,onHand:0,committed:0}:i)});
const short=jobReadiness(running,bare);
t("an empty shelf stops the job being started",!short.ready&&short.missing.length>0,JSON.stringify(short.missing));
t("and names what is short",/preform/i.test(short.missing[0]));

console.log("\nThe rate is what this operator actually did:");
const fc=jobForecast(running);
t("a running job has a rate",!!fc&&fc.perHour>0,JSON.stringify(fc));
t("and a finish time from it",!!fc&&/^\d{4}-/.test(fc.finishAt));
t("a job that has made nothing is not guessed at",jobForecast({...running,good:0})===null);
t("rush is inherited from the order, not typed on the job",
  jobPriority({...running,orderId:"SO-X"},[{id:"SO-X",rush:{at:"x",by:"Chris"}}])==="rush");

console.log("\nThe floor screen gets what it needs and nothing more:");
const v=floorView(data);
t("each job carries its stage",v.workOrders.every(w=>typeof w.stage==="number"));
t("its readiness",v.workOrders.every(w=>Array.isArray(w.ready.checks)));
t("and its build sheet",v.workOrders.some(w=>w.build.mold));
t("the shift is counted",v.shift.active+v.shift.waiting+v.shift.blocked>0);
t("the stations are listed",v.stations.length>0);
t("the reasons for stopping are offered",v.holdReasons.includes("Machine down"));
// The activity log carries invoice numbers and amounts; none of that belongs on a tablet.
const feed=JSON.stringify(v.activity);
t("the live feed carries no money",!/\$/.test(feed));
t("and no invoice numbers",!/INV-/.test(feed));

console.log("\nNothing about this endpoint may sit in a cache:");
const route=readFileSyncRoute();
t("the answer is no-store",/NO_STORE/.test(route)&&/"cache-control":"no-store"/.test(route));
// A cached 401 in front of a link that works would look exactly like a broken link.
t("so is the refusal",/const deny=\(\)=>Response\.json\([^)]*status:401,headers:NO_STORE/.test(route.replace(/\n/g," ")));

console.log("\nThe actions the tablet is allowed, and their limits:");
const job=data.workOrders.find(w=>w.id==="WO-121");
const waiting=data.workOrders.find(w=>jobStageOf(w)===JOB_NOT_STARTED&&!w.hold);
t("it can start a job that has not begun",!applyFloorAction(data,{op:"job.stage",woId:waiting.id,stage:JOB_PRODUCTION,by:"James"}).error,waiting?.id);
// Forward, one step at a time. Skipping quality is how untested bottles reach a customer.
t("it cannot skip a stage",!!applyFloorAction(data,{op:"job.stage",woId:job.id,stage:4,by:"James"}).error);
t("it cannot send a job backwards",!!applyFloorAction(data,{op:"job.stage",woId:job.id,stage:0,by:"James"}).error);
t("nor invent one",!!applyFloorAction(data,{op:"job.stage",woId:job.id,stage:99,by:"James"}).error);
t("it can pause and resume",!applyFloorAction(data,{op:"job.pause",woId:job.id,by:"James"}).error
  &&!applyFloorAction(data,{op:"job.resume",woId:job.id,by:"James"}).error);
const rep=applyFloorAction(data,{op:"job.block",woId:job.id,reason:"Machine down",note:"tripped out",by:"James"});
t("it can report a problem",!rep.error);
t("which stops the job where it stands",rep.data.workOrders.find(w=>w.id===job.id).hold.reason==="Machine down");
t("and says who reported it",rep.data.workOrders.find(w=>w.id===job.id).hold.by==="James");
// A block with no reason is one nobody can clear without walking to the floor to ask.
t("a problem needs a reason from the list",!!applyFloorAction(data,{op:"job.block",woId:job.id,reason:"whatever",by:"James"}).error);
t("and 'Other' needs saying what it is",!!applyFloorAction(data,{op:"job.block",woId:job.id,reason:"Other",by:"James"}).error);
t("reporting a problem touches nothing outside production",untouched(data,rep.data));

console.log("\nPacking is its own job, counted in cartons and pallets:");
const {packingPlan,recordPacking,newBatchId,JOB_PACKAGING}=app;
const atBench=data.workOrders.find(w=>jobStageOf(w)===JOB_PACKAGING);
const plan=packingPlan(atBench,data.itemRates);
t("there is a job at the bench",!!atBench,`${atBench?.id}`);
// 496 bottles, 2 to a carton, 48 cartons to a pallet.
t("cartons come from what was actually made",plan.cartons===Math.ceil(atBench.good/plan.perCase),`${plan.cartons}`);
t("pallets come from the cartons",plan.pallets===Math.ceil(plan.cartons/plan.casesPerPallet),`${plan.pallets}`);
t("it says what will be used up",plan.uses.some(u=>/carton/i.test(u.item))&&plan.uses.some(u=>/label/i.test(u.item)));
// An assembly run already fitted its caps as it recorded units; charging for them again empties the
// shelf twice for one bottle.
t("an assembly run's caps are not charged again at packing",
  !packingPlan({...atBench,kind:"assembly"},data.itemRates).uses.some(u=>/cap/i.test(u.item)));
t("a moulding run's caps are",packingPlan({...atBench,kind:"mould",item:"5-Gallon Bottle · 2 caps"},data.itemRates).uses.some(u=>/cap/i.test(u.item)));

const packed=recordPacking(atBench,{received:496,cartons:246,pallets:6,by:"Marta"});
t("what the packer counted is what is stored",packed.packing.cartons===246&&packed.packing.pallets===6);
// The plan said 248 cartons. The packer said 246. The record keeps 246.
t("a short pallet is kept, not rounded up to the plan",packed.packing.cartons!==plan.cartons);
t("packing records its own owner",packed.packing.operator==="Marta");
t("and a batch id is generated when none is given",/^B\d{6}-\d+$/.test(packed.packing.batchId),`${packed.packing.batchId}`);
t("a given batch id is kept",recordPacking(atBench,{received:1,cartons:1,pallets:1,batchId:"PAL-9",by:"M"}).packing.batchId==="PAL-9");
t("the batch id is stable for a job and a day",newBatchId(atBench,new Date("2026-09-08"))===newBatchId(atBench,new Date("2026-09-08")));

console.log("\nThe bench cannot invent stock:");
t("packing is refused before the job gets there",!!applyFloorAction(data,{op:"job.pack",woId:"WO-121",received:10,cartons:5,pallets:1,by:"M"}).error);
const ok=applyFloorAction(data,{op:"job.pack",woId:atBench.id,received:496,cartons:246,pallets:6,by:"Marta"});
t("and allowed once it is at the bench",!ok.error,`${ok.error}`);
// More bottles than the run made would be somebody else's stock leaving under this job.
t("more bottles than were made is refused",!!applyFloorAction(data,{op:"job.pack",woId:atBench.id,received:99999,cartons:1,pallets:1,by:"M"}).error);
t("nothing at all is refused",!!applyFloorAction(data,{op:"job.pack",woId:atBench.id,received:0,cartons:0,pallets:0,by:"M"}).error);
const cartonsBefore=data.inventory.find(i=>/carton/i.test(i.item)).onHand;
// What the packer counted, not what the plan said — 246 cartons, not the 248 the run should have made.
t("the cartons actually used come off the shelf",
  ok.data.inventory.find(i=>/carton/i.test(i.item)).onHand===cartonsBefore-246,
  `${ok.data.inventory.find(i=>/carton/i.test(i.item)).onHand} from ${cartonsBefore}`);
t("packing touches nothing outside production and stock",untouched(data,ok.data));
t("the tablet is given the plan and the record together",
  floorView(ok.data).workOrders.find(w=>w.id===atBench.id).packing.record.cartons===246);

console.log("\nThe audit says the record came from the link, not from a person who signed in:");
t("an unnamed tablet is still identified",floorActor()==="Warehouse link");
t("a name given on the tablet is carried through",floorActor("Marta")==="Warehouse link · Marta");
t("and it cannot smuggle markup into the log",!floorActor("<script>alert(1)</script>").includes("<"));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
