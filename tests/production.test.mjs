// The production model, checked against Chris's real catalogue and the September tracker.
let pass=0,fail=0;
const t=(n,c,d)=>{if(c)pass++;else fail++;console.log(`${c?"  ok  ":"  FAIL"} ${n}${c?"":"  → "+d}`)};

const BLANKS=[
 {id:"b-s5",name:"Screw-top 5-gal",size:"5-gal",neck:"screw"},
 {id:"b-s3",name:"Screw-top 3-gal",size:"3-gal",neck:"screw"},
 {id:"b-r5",name:"Regular 5-gal",size:"5-gal",neck:"regular",sellable:true},
 {id:"b-r3",name:"Regular 3-gal",size:"3-gal",neck:"regular",sellable:true}];
const SKUS=[
 {id:"D5-T0WT-Q5XP",blankId:"b-s5",caps:[{component:"Screw cap",qty:2}]},
 {id:"MI-89OO-OBNM",blankId:"b-s3",caps:[{component:"Screw cap",qty:2}]},
 {id:"GO-WAAU-08PA",blankId:"b-r5",caps:[]},
 {id:"BV-B81Q-X4UN",blankId:"b-r5",caps:[{component:"Silicone cap",qty:2}]},
 {id:"MV-1AA8-B2UV",blankId:"b-r5",caps:[{component:"Silicone cap",qty:1}]},
 {id:"ZR-4HHD-8YRL",blankId:"b-r3",caps:[{component:"Silicone cap",qty:1}]}];
const MACHINES=[{id:"m5",makes:"5-gal",perShift:500},{id:"m3",makes:"3-gal",perShift:500}];

const blanksNeeded=(w,skus)=>{const o={};for(const x of w){const s=skus.find(s=>s.id===x.skuId);if(!s)continue;o[s.blankId]=(o[s.blankId]||0)+x.qty}return o};
const capsNeeded=(w,skus)=>{const o={};for(const x of w){const s=skus.find(s=>s.id===x.skuId);if(!s)continue;for(const c of s.caps)o[c.component]=(o[c.component]||0)+c.qty*x.qty}return o};
const mouldDays=(load,blanks,machines)=>{const by={"3-gal":0,"5-gal":0};
  for(const [id,q] of Object.entries(load)){const b=blanks.find(x=>x.id===id);if(b)by[b.size]+=q}
  const per=s=>machines.find(m=>m.makes===s)?.perShift||0;const days={};
  for(const s of Object.keys(by))days[s]=per(s)>0?Math.ceil(by[s]/per(s)):0;
  return {unitsBySize:by,daysBySize:days,days:Math.max(...Object.values(days),0)}};

console.log("\nThe shared blank — the thing nothing could answer before:");
// September totals from the tracker.
const sept=[{skuId:"D5-T0WT-Q5XP",qty:2176},{skuId:"MI-89OO-OBNM",qty:1320},
            {skuId:"GO-WAAU-08PA",qty:704},{skuId:"BV-B81Q-X4UN",qty:288},{skuId:"MV-1AA8-B2UV",qty:448}];
const load=blanksNeeded(sept,SKUS);
t("GO + BV + MV roll up to one regular 5-gal load",load["b-r5"]===1440,`got ${load["b-r5"]}`);
console.log(`       704 + 288 + 448 = ${load["b-r5"]} regular 5-gal blanks — matches the tracker's 1,440`);
t("screw-top 5-gal load",load["b-s5"]===2176,`${load["b-s5"]}`);
t("screw-top 3-gal load",load["b-s3"]===1320,`${load["b-s3"]}`);
const total=Object.values(load).reduce((a,b)=>a+b,0);
t("total bottles to mould is 4,936",total===4936,`${total}`);

console.log("\nCaps, rolled up by type:");
const caps=capsNeeded(sept,SKUS);
t("screw caps = 6,992",caps["Screw cap"]===6992,`${caps["Screw cap"]}`);
t("silicone caps = 1,024",caps["Silicone cap"]===1024,`${caps["Silicone cap"]}`);
console.log(`       matches the tracker headline exactly`);

console.log("\nCapacity — two machines that cannot cover for each other:");
const d=mouldDays(load,BLANKS,MACHINES);
t("5-gal machine carries 3,616",d.unitsBySize["5-gal"]===3616,`${d.unitsBySize["5-gal"]}`);
t("3-gal machine carries 1,320",d.unitsBySize["3-gal"]===1320,`${d.unitsBySize["3-gal"]}`);
t("5-gal needs 8 shifts",d.daysBySize["5-gal"]===8,`${d.daysBySize["5-gal"]}`);
t("3-gal needs 3 shifts",d.daysBySize["3-gal"]===3,`${d.daysBySize["3-gal"]}`);
t("the month is paced by the 5-gal line, not the total",d.days===8,`${d.days}`);
// The naive answer would be ceil(4936/1000)=5 days, which would have you promise dates you cannot hit.
t("parallel capacity is not pooled",d.days!==Math.ceil(total/1000));

console.log("\nWholesale sells the blank itself:");
t("regular 5-gal is sellable plain",BLANKS.find(b=>b.id==="b-r5").sellable===true);
t("regular 3-gal is sellable plain",BLANKS.find(b=>b.id==="b-r3").sellable===true);
t("bottle-only Amazon SKU still has an assembly step",SKUS.find(s=>s.id==="GO-WAAU-08PA").caps.length===0);

console.log("\nSafeguard on editing started production:");
const stepStarted=s=>!!(s.done||(s.actualQty??0)>0);
const guard=(prev,next)=>{
  if(!stepStarted(prev))return null;
  const made=prev.actualQty??(prev.done?prev.qty:0);
  if(next.qty!=null&&next.qty!==prev.qty)return next.qty<made?"below-made":"confirm-qty";
  return "confirm";
};
t("editing an untouched step is silent",guard({qty:300},{qty:400})===null);
t("editing a started step asks first",guard({qty:300,actualQty:200},{qty:400})==="confirm-qty");
t("cutting below what was made is called out",guard({qty:300,actualQty:200},{qty:150})==="below-made");
t("moving a started step asks first",guard({qty:300,done:true},{note:"moved"})==="confirm");

console.log("\nOwner reconciling what the floor forgot to record:");
const reconcile=(s,q,by)=>({...s,actualQty:q,done:q>=s.qty,doneBy:s.doneBy||by,reconciledBy:by});
const r=reconcile({id:"s1",qty:300,type:"mold"},200,"Chris");
t("records the 200 actually made",r.actualQty===200);
t("does not mark it complete — 100 still to go",r.done===false);
t("notes who reconciled it",r.reconciledBy==="Chris");
const full=reconcile({id:"s2",qty:300,type:"mold"},300,"Chris");
t("reconciling the full quantity completes it",full.done===true);

// ---------------------------------------------------------------------------
// Phase 2: the calendar. A day has to answer "does what is on this day fit on these two machines",
// which is a different question from "how many shifts does the month need".

const stepLoad=st=>st.done?(st.actualQty??st.qty):Math.max(st.qty,st.actualQty??0);
const dayLoad=(day,blanks,machines)=>machines.map(machine=>{
  const bySource={amazon:0,wholesale:0};let units=0;
  for(const st of day.steps||[]){
    if(st.type!=="mold")continue;
    const b=blanks.find(x=>x.id===st.target);
    if(!b||b.size!==machine.makes)continue;
    const n=stepLoad(st);units+=n;bySource[st.source]+=n;
  }
  return {machine,units,capacity:machine.perShift,over:Math.max(0,units-machine.perShift),bySource};
});

console.log("\nA day is measured per machine, never pooled:");
// The collision the calendar exists to catch: an Amazon shift and a wholesale order on one line.
const clash={date:"2026-09-08",steps:[
  {id:"a",type:"mold",source:"amazon",target:"b-s5",qty:500},
  {id:"b",type:"mold",source:"wholesale",target:"b-r5",qty:500},
  {id:"c",type:"mold",source:"amazon",target:"b-s3",qty:500}]};
const loads=dayLoad(clash,BLANKS,MACHINES);
const five=loads.find(l=>l.machine.makes==="5-gal"),three=loads.find(l=>l.machine.makes==="3-gal");
t("both 5-gal steps land on the 5-gallon line",five.units===1000,`${five.units}`);
t("the day is flagged over by 500",five.over===500,`${five.over}`);
t("the 3-gallon line is counted separately and fits",three.units===500&&three.over===0,`${three.units}/${three.over}`);
// Pooling would call this day fine: 1,500 bottles across 1,000 of "capacity" is only 50% over, and
// the 3-gallon line has nothing spare to lend. The 5-gallon line is still double-booked.
t("a 3-gallon machine cannot absorb 5-gallon work",three.bySource.amazon===500&&five.units>five.capacity);

console.log("\nThe two channels are visible separately on the same day:");
t("Amazon load on the 5-gallon line",five.bySource.amazon===500,`${five.bySource.amazon}`);
t("wholesale load on the same line",five.bySource.wholesale===500,`${five.bySource.wholesale}`);
t("the split adds up to the day's load",five.bySource.amazon+five.bySource.wholesale===five.units);

console.log("\nA part-recorded step still owes the balance:");
const partial={date:"d",steps:[{id:"p",type:"mold",source:"amazon",target:"b-s5",qty:500,actualQty:200}]};
t("200 made of 500 still occupies 500",dayLoad(partial,BLANKS,MACHINES)[0].units===500);
const finished={date:"d",steps:[{id:"p",type:"mold",source:"amazon",target:"b-s5",qty:500,actualQty:480,done:true}]};
t("a finished step counts what was actually made",dayLoad(finished,BLANKS,MACHINES)[0].units===480);
const nonMould={date:"d",steps:[{id:"p",type:"assemble",source:"amazon",target:"D5-T0WT-Q5XP",qty:2176}]};
t("assembly does not occupy a machine",dayLoad(nonMould,BLANKS,MACHINES).every(l=>l.units===0));

// ---------------------------------------------------------------------------
// The seeded September plan, read out of the source it ships in. The plan is derived from the
// tracker, so it has to keep reproducing the tracker's own totals.
console.log("\nThe seeded September plan still matches the tracker:");
const { readFileSync } = await import("node:fs");
const src=readFileSync(new URL("../app/app-data.ts",import.meta.url),"utf8");
const parse=(fn)=>[...src.matchAll(new RegExp(fn+'\\("([^"]+)","([^"]+)","([^"]+)",(\\d+),"([^"]+)"\\)',"g"))]
  .map(m=>({id:m[1],date:m[2],target:m[3],qty:Number(m[4]),last:m[5]}));
const moulds=parse("ms"),rest=parse("as");
t("the plan is in the source",moulds.length>0&&rest.length>0,`${moulds.length} mould, ${rest.length} other`);

const planBlank={};for(const st of moulds)planBlank[st.target]=(planBlank[st.target]||0)+st.qty;
t("screw-top 5-gal scheduled = 2,176",planBlank["b-s5"]===2176,`${planBlank["b-s5"]}`);
t("regular 5-gal scheduled = 1,440",planBlank["b-r5"]===1440,`${planBlank["b-r5"]}`);
t("screw-top 3-gal scheduled = 1,320",planBlank["b-s3"]===1320,`${planBlank["b-s3"]}`);
const planTotal=Object.values(planBlank).reduce((a,b)=>a+b,0);
t("the month schedules all 4,936 bottles",planTotal===4936,`${planTotal}`);

const assembled=rest.filter(x=>x.last==="assemble").map(x=>({skuId:x.target,qty:x.qty}));
const planCaps=capsNeeded(assembled,SKUS);
t("assembly consumes the tracker's 6,992 screw caps",planCaps["Screw cap"]===6992,`${planCaps["Screw cap"]}`);
t("assembly consumes the tracker's 1,024 silicone caps",planCaps["Silicone cap"]===1024,`${planCaps["Silicone cap"]}`);
const shipped=rest.filter(x=>x.last==="ship").reduce((a,x)=>a+x.qty,0);
t("everything assembled is shipped",shipped===assembled.reduce((a,x)=>a+x.qty,0),`${shipped}`);

console.log("\nNo scheduled day is over capacity as seeded:");
const byDate={};
for(const st of moulds)(byDate[st.date]||=[]).push({...st,type:"mold",source:"amazon"});
const overs=Object.entries(byDate).filter(([date,steps])=>dayLoad({date,steps},BLANKS,MACHINES).some(l=>l.over>0));
t("the Amazon plan fits the machines it is laid on",overs.length===0,overs.map(o=>o[0]).join(", "));
t("moulding is spread over 8 five-gallon days",new Set(moulds.filter(x=>x.target!=="b-s3").map(x=>x.date)).size===8);
t("and 3 three-gallon days",new Set(moulds.filter(x=>x.target==="b-s3").map(x=>x.date)).size===3);

// ---------------------------------------------------------------------------
console.log("\nRecording vs reconciling stay distinct:");
const recordStep=(st,q,by)=>({...st,actualQty:Math.max(0,q),done:q>=st.qty,doneBy:by});
const rec=recordStep({id:"s",qty:500,type:"mold"},480,"Warehouse");
t("the floor's own record names the floor",rec.doneBy==="Warehouse"&&rec.reconciledBy===undefined);
t("recording short of the plan leaves the step open",rec.done===false);
const corrected=reconcile({...rec},500,"Chris");
t("a correction keeps the original recorder",corrected.doneBy==="Warehouse",`${corrected.doneBy}`);
t("and names who corrected it",corrected.reconciledBy==="Chris");

// The screen must not be able to write an edit that skipped the guard.
console.log("\nThe calendar cannot edit a started step silently:");
const ui=readFileSync(new URL("../app/components/prodplan.tsx",import.meta.url),"utf8");
// Every write of an edited step — the editor and the drag-to-another-day on the month grid — has to
// have asked the guard first. Checking each write site, not just the first one, is the point: a second
// way to move a step is exactly how the guard would get bypassed.
const editWrites=[...ui.matchAll(/"plan\.step\.edit"/g)].map(m=>m.index);
t("there is more than one way to edit a step",editWrites.length>=2,`${editWrites.length}`);
t("every edit path calls guardStepEdit before it writes",
  editWrites.length>0&&editWrites.every(i=>ui.slice(Math.max(0,i-900),i).includes("guardStepEdit(")),
  "a write with no guard above it");
t("the guard's question is answered in the app, not a browser dialog",!/window\.(confirm|prompt)/.test(ui));
t("the owner has reconcileStep",ui.includes("reconcileStep("));
t("the floor has its own recordStep",ui.includes("recordStep("));

// ---------------------------------------------------------------------------
// Phase 3: wholesale orders become production. These run against the REAL exports rather than a copy
// of them — the scheduler is too involved for a mirror in here to be worth anything, and a test of a
// second implementation proves nothing about the one that ships. Node strips the types on import
// (22.18+ / 24); on an older runtime this fails loudly rather than quietly passing.
let app=null;
try{app=await import("../app/app-data.ts")}catch(e){app=null;console.log("  note: "+e.message.split("\n")[0])}
t("the app module can be imported directly",!!app,"needs Node 22.18+ for type stripping — the Phase 3 checks did not run");

if(app){
const {normalize,demoData,orderNeeds,ordersToPlan,planOrder,addSteps,dayLoad,DEFAULT_BLANKS,DEFAULT_MACHINES,isWorkday}=app;
const base=normalize(demoData);
const order=(over)=>({id:"SO-T",customerId:"c1",item:"5-Gallon Bottle · 2 caps",cases:0,quantity:0,due:"2026-09-18",
  status:"Paid",payment:"Paid",stage:3,stageV2:true,notes:"",...over});
const withOrders=(...os)=>normalize({...base,orders:[...base.orders,...os]});

console.log("\nThe catalogue learns what each item is moulded from:");
const rate=n=>base.itemRates.find(r=>r.item===n);
t("5-gal with screw caps is a screw-top blank",rate("5-Gallon Bottle · 2 caps").blankId==="b-s5",`${rate("5-Gallon Bottle · 2 caps").blankId}`);
t("3-gal with screw caps is the 3-gal screw blank",rate("3-Gallon Bottle · 2 caps").blankId==="b-s3");
t("the plain 5-gal wholesale bottle is the regular blank",rate("5-Gallon Bottle · no cap").blankId==="b-r5");
t("and it carries no caps",rate("5-Gallon Bottle · no cap").caps.length===0);
t("caps sold by the pack are not moulded here",rate("Screw Caps · 10-pack").blankId===undefined);
// "" is the owner saying "not moulded here" — a real answer, and the guess must not overwrite it.
const answered=normalize({...base,itemRates:base.itemRates.map(r=>r.item==="5-Gallon Bottle · 2 caps"?{...r,blankId:""}:r)});
t("an owner's 'not moulded here' survives the next load",answered.itemRates.find(r=>r.item==="5-Gallon Bottle · 2 caps").blankId==="");

console.log("\nStock on the shelf counts before a machine is booked:");
// 412 on hand, 300 committed — and those 300 are this very order, so the shelf covers it outright.
const covered=orderNeeds(order({lines:[{item:"5-Gallon Bottle · 2 caps",quantity:300,rate:9.4}],quantity:300}),base);
t("an order the warehouse can already fill needs no moulding",covered.toMake===0,`${covered.toMake}`);
t("and it is reported as coming from stock",covered.lines[0].fromStock===300);
const partly=orderNeeds(order({lines:[{item:"5-Gallon Bottle · 2 caps",quantity:2000,rate:9.4}],quantity:2000}),base);
t("a bigger order moulds only the shortfall",partly.toMake===1588,`${partly.toMake}`);
t("the caps follow the shortfall, not the order",partly.caps["Screw cap"]===1588*2,`${partly.caps["Screw cap"]}`);
// Without adding the order's own promise back, every order would be netted against itself.
t("an order is not netted against its own promise",covered.lines[0].make===0&&partly.lines[0].fromStock===412);
const noBlank=orderNeeds(order({lines:[{item:"Screw Caps · 10-pack",quantity:400,rate:3.2}],quantity:400}),base);
t("a line with no blank is named, not guessed at",noBlank.unplannable[0]==="Screw Caps · 10-pack");

console.log("\nWork is fitted into what the machines have left:");
const big=order({id:"SO-BIG",lines:[{item:"5-Gallon Bottle · 2 caps",quantity:2000,rate:9.4}],quantity:2000});
const dataBig=withOrders(big);
const plan=planOrder(big,dataBig,"2026-09-07");
const moulds=plan.entries.filter(e=>e.step.type==="mold");
t("every bottle short is scheduled",moulds.reduce((a,e)=>a+e.step.qty,0)===1588,`${moulds.reduce((a,e)=>a+e.step.qty,0)}`);
// Sep 7-10 are full of Amazon screw-top work; the 11th has 176 on it, so 324 is what is left.
t("it starts on the first day with room, not the first day",moulds[0].date==="2026-09-11"&&moulds[0].step.qty===324,`${moulds[0].date} ${moulds[0].step.qty}`);
t("it steps over days the Amazon plan already fills",!moulds.some(e=>e.date==="2026-09-14"||e.date==="2026-09-15"));
t("nothing is scheduled on a weekend",plan.entries.every(e=>isWorkday(e.date)));
const after=addSteps(dataBig.prodDays,plan.entries);
const overs=after.filter(d=>dayLoad(d,DEFAULT_BLANKS,DEFAULT_MACHINES).some(l=>l.over>0)).map(d=>d.date);
// The demo's own 8th is over before this runs; planning must not add a second one.
t("planning an order never overbooks a line",overs.length===1&&overs[0]==="2026-09-08",overs.join(", "));
t("the assembly follows the last bottle off the machine",plan.entries.find(e=>e.step.type==="assemble").date>moulds[moulds.length-1].date);
t("shipping is last",plan.finish===plan.entries[plan.entries.length-1].date);

console.log("\nThe date already promised is checked against the machines:");
t("a month that cannot be made by the date needed says so",plan.daysLate===6,`${plan.daysLate}`);
const roomy=planOrder(order({id:"SO-ROOM",lines:[{item:"5-Gallon Bottle · 2 caps",quantity:300,rate:9.4}],quantity:300,due:"2026-09-30"}),base,"2026-09-07");
t("an order that fits is not flagged",roomy.daysLate===null);
t("an order the shelf covers skips straight to packing",roomy.entries.every(e=>e.step.type!=="mold")&&roomy.entries.length===2,roomy.entries.map(e=>e.step.type).join(","));

console.log("\nOnly orders that are actually ready get planned:");
const ids=d=>ordersToPlan(d).map(o=>o.id);
t("a paid order with nothing planned is offered",ids(withOrders(order({id:"SO-PAID"}))).includes("SO-PAID"));
t("an invoiced but unpaid order is left alone",!ids(withOrders(order({id:"SO-UNPAID",stage:2,payment:"Net 30",deposit:0}))).includes("SO-UNPAID"));
t("a deposit is enough",ids(withOrders(order({id:"SO-DEP",payment:"Deposit",deposit:500}))).includes("SO-DEP"));
t("an order awaiting the owner's pricing is left alone",!ids(withOrders(order({id:"SO-APPR",status:"Needs approval"}))).includes("SO-APPR"));
t("an order already made is left alone",!ids(withOrders(order({id:"SO-MADE",stage:5}))).includes("SO-MADE"));
// Planning twice would double the work; the steps it left behind are what stops it.
const once=withOrders(order({id:"SO-ONCE"}));
const planned=normalize({...once,prodDays:addSteps(once.prodDays,planOrder(once.orders.find(o=>o.id==="SO-ONCE"),once,"2026-09-07").entries)});
t("an order already on the plan is not offered again",!ids(planned).includes("SO-ONCE"));
t("its steps are all marked wholesale",planned.prodDays.flatMap(d=>d.steps).filter(s=>s.linkedTo==="SO-ONCE").every(s=>s.source==="wholesale"));
}

// ---------------------------------------------------------------------------
// Phase 4: the plan and the run are one record.
//
// They were two. A mould step stored actualQty, the work order carrying it out stored good, nothing
// connected them, and whichever screen you typed into was the only one that knew — so the production
// calendar and the production run disagreed and never converged. These assertions are the fix's shape:
// where a run exists, IT is the record, and nothing offers to type the number twice.
if(app){
const {normalize,demoData,stepProgress,stepLoad,runSteps,runFromSteps,dayLoad,planTotals,DEFAULT_BLANKS,DEFAULT_MACHINES}=app;
const d=normalize(demoData);
const all=d.prodDays.flatMap(x=>x.steps);
const runs=d.workOrders;
const byId=id=>all.find(s=>s.id===id);

console.log("\nA step being run reads its numbers off the run:");
const linked=byId("ps-m1");
t("the demo step is linked to a run",linked.workOrderId==="WO-121");
const run=runs.find(w=>w.id==="WO-121");
// WO-121 covers the 7th (500) and the 8th (500) and has made 620: the first day is full, the second
// has 120 on it. That is how a run over two days actually progresses.
t("the first day of the run is full",stepProgress(linked,runs,all).made===500,`${stepProgress(linked,runs,all).made}`);
t("the balance lands on the second day",stepProgress(byId("ps-m2"),runs,all).made===120,`${stepProgress(byId("ps-m2"),runs,all).made}`);
t("no day is credited with more than it planned",stepProgress(linked,runs,all).made<=linked.qty);
t("the two days add up to what the run made",
  stepProgress(linked,runs,all).made+stepProgress(byId("ps-m2"),runs,all).made===run.good);
t("the finished day is done",stepProgress(linked,runs,all).done===true);
t("the day still being made is not",stepProgress(byId("ps-m2"),runs,all).done===false);
// Scrap is not split across days — nobody knows which shift it happened on, so it stays on the run.
t("scrap is reported against the run, not guessed at per day",stepProgress(linked,runs,all).scrap===0&&stepProgress(linked,runs,all).runScrap===14);
t("the step names the run that owns it",stepProgress(linked,runs,all).runId==="WO-121");

console.log("\nA step with no run still keeps its own record:");
const loose={id:"x",type:"mold",source:"amazon",target:"b-s5",qty:300,actualQty:180};
t("its own figure is used",stepProgress(loose,runs,all).made===180);
t("and it is not marked done early",stepProgress(loose,runs,all).done===false);

console.log("\nCapacity counts the run's work, not a stale copy of it:");
// Before the fix the 7th read as untouched, because the plan's own actualQty was never written.
const seventh=d.prodDays.find(x=>x.date==="2026-09-07");
const load=dayLoad(seventh,DEFAULT_BLANKS,DEFAULT_MACHINES,runs,all);
t("the day is still measured against the machine",load.find(l=>l.machine.makes==="5-gal").units===500);
t("a part-made day keeps its planned load",stepLoad(byId("ps-m2"),runs,all)===500);
t("the month total is unchanged by who is recording it",planTotals(d.prodDays,DEFAULT_BLANKS,DEFAULT_MACHINES,runs).totalUnits===5556,
  `${planTotals(d.prodDays,DEFAULT_BLANKS,DEFAULT_MACHINES,runs).totalUnits}`);

console.log("\nRaising a run from the plan:");
const step=byId("ps-m6");                        // regular 5-gal, 14th, unlinked
const covered=runSteps(step,d.prodDays);
t("a run covers the days that continue it",covered.length===3&&covered[0].id==="ps-m6",`${covered.map(c=>c.id)}`);
t("and stops before a different batch",covered.every(c=>c.target===step.target));
const work=runFromSteps(covered,d,"WO-900","2026-09-14");
t("the run is for everything those days planned",work.quantity===1440,`${work.quantity}`);
t("it lands on the line that machine is",work.line==="Line 1",`${work.line}`);
t("it is raised as a catalogue item the floor screens understand",
  d.itemRates.some(r=>r.item===work.item),`${work.item}`);
t("it spans the days it covers",work.days===3,`${work.days}`);
t("and starts where the plan put it",work.date==="2026-09-14");
// A step already being run must not be swept into a second one.
t("a step already on a run is not covered again",!runSteps(byId("ps-m1"),d.prodDays).some(x=>x.id==="ps-m2"));
// Assembly raises a run of its own now (see Phase 6 below); packing and the truck do not.
t("shipping raises no run",runFromSteps([all.find(x=>x.type==="ship")],d,"WO-901","2026-09-23")===null);
}

// ---------------------------------------------------------------------------
// Phase 6: assembly runs, and the line.
if(app){
const {normalize,demoData,runFromSteps,runConsumption,consume,productionQueue,estimateOrder,queueOrders,ASSEMBLY_LINE}=app;
const d=normalize(demoData);
const all=d.prodDays.flatMap(x=>x.steps);

console.log("\nAssembly is a run too:");
const asm=all.find(x=>x.type==="assemble");
const asmRun=runFromSteps([asm],d,"WO-950","2026-09-15");
t("an assembly step raises a run",!!asmRun);
t("it is marked as assembly, not moulding",asmRun.kind==="assembly");
t("it goes to the bench, not a moulding line",asmRun.line===ASSEMBLY_LINE,`${asmRun.line}`);
t("it is for what the step assembles",asmRun.quantity===asm.qty);
// Palletizing and shipping are recorded on the step; there is no run for them.
t("palletizing raises no run",runFromSteps([all.find(x=>x.type==="palletize")],d,"WO-951","2026-09-21")===null);

console.log("\nA run eats what it actually uses:");
const mould={id:"m",kind:"mould",item:"5-Gallon Bottle · 2 caps",quantity:100,good:0,scrap:0,packed:0,date:"",status:"Running",purpose:""};
const assembly={...mould,id:"a",kind:"assembly"};
const mouldUses=runConsumption(mould,d.itemRates),asmUses=runConsumption(assembly,d.itemRates);
t("moulding pulls preforms",mouldUses.length===1&&/preform/i.test(mouldUses[0].item),JSON.stringify(mouldUses));
t("assembly pulls caps",asmUses.length===1&&/cap/i.test(asmUses[0].item),JSON.stringify(asmUses));
t("two caps per bottle, not one",asmUses[0].perUnit===2,`${asmUses[0].perUnit}`);
// The bug this closes: assembly used to deduct the preforms the bottle was already blown from.
t("assembly does not take preforms a second time",!asmUses.some(u=>/preform/i.test(u.item)));
const before=d.inventory.find(i=>/preform/i.test(i.item)&&/5-gal/i.test(i.item));
const afterAsm=consume(d.inventory,asmUses,10);
t("so the preform shelf is untouched by an assembly run",
  afterAsm.find(i=>i.item===before.item).onHand===before.onHand);
t("and a count never goes below zero",consume(d.inventory,mouldUses,1e9).every(i=>i.onHand>=0));

console.log("\nThe line — first in, first served:");
const queue=productionQueue(d,"2026-09-07");
t("every order still to be made is in it",queue.length===queueOrders(d).length);
t("positions run 1..n in the order they were taken",queue.every((q,i)=>q.position===i+1));
t("an order already on the calendar keeps the date its steps say",queue.some(q=>q.scheduled));
t("every order gets a finish date",queue.every(q=>/^\d{4}-\d{2}-\d{2}$/.test(q.finish)),queue.map(q=>q.finish).join(","));
// The whole point: a date that counts what is already promised, not just this order's own work.
const est=estimateOrder(d,[{item:"5-Gallon Bottle · 2 caps",quantity:2000,rate:9.4}],"2026-09-07");
t("a new order is quoted from the back of the line",est.position===queue.length+1&&est.ahead===queue.length);
t("and it is told what it still has to make",est.toMake===1588,`${est.toMake}`);
t("the date is after everything ahead of it",queue.every(q=>est.finish>=q.finish),`${est.finish}`);
// Two identical orders taken one after the other cannot both be promised the same shift.
const one=estimateOrder(d,[{item:"5-Gallon Bottle · 2 caps",quantity:2000,rate:9.4}],"2026-09-07");
const withFirst=normalize({...d,orders:[...d.orders,{id:"SO-Q1",customerId:"c1",item:"5-Gallon Bottle · 2 caps",cases:0,quantity:2000,due:"2026-10-30",status:"Confirmed",payment:"Paid",stage:3,stageV2:true,createdAt:"2026-09-07T10:00:00Z",lines:[{item:"5-Gallon Bottle · 2 caps",quantity:2000,rate:9.4}]}]});
const two=estimateOrder(withFirst,[{item:"5-Gallon Bottle · 2 caps",quantity:2000,rate:9.4}],"2026-09-07");
t("the second of two identical orders is quoted later than the first",two.finish>one.finish,`${one.finish} then ${two.finish}`);
t("and it is one place further back",two.position===one.position+1);
// A small order behind a big one still waits for the machine, which is the honest answer.
const small=estimateOrder(withFirst,[{item:"5-Gallon Bottle · 2 caps",quantity:50,rate:9.4}],"2026-09-07");
t("a small order behind a big one is not promised the earth",small.finish>=one.finish||small.toMake===0,`${small.finish} make ${small.toMake}`);

console.log("\nThe date shown is the date the steps land on:");
// The queue said one thing and the panel that plans the order said another, because one counted the
// orders ahead and the other did not.
const {loadAheadOf,planOrder:plan2,ordersToPlan:toPlan}=app;
for(const o of toPlan(d)){
  const q=productionQueue(d,"2026-09-07").find(x=>x.order.id===o.id);
  const placed=plan2(o,d,"2026-09-07",loadAheadOf(d,o.id,"2026-09-07"));
  t(`${o.id} is planned on the date the line quotes`,placed.finish===q.finish,`line ${q.finish}, plan ${placed.finish}`);
}
// An order's place is held even when the ones ahead of it have not been added to the calendar yet.
const first=toPlan(d)[0],last=toPlan(d)[toPlan(d).length-1];
if(first&&last&&first.id!==last.id)
  t("an order behind another is not given the shifts in front of it",
    Object.keys(loadAheadOf(d,last.id,"2026-09-07")).length>=Object.keys(loadAheadOf(d,first.id,"2026-09-07")).length);

console.log("\nUrgent — moving a customer up the line:");
const {rushImpact,queueOrders:qo}=app;
// A shop with an empty shelf and two big orders, so a rush has something to displace.
const busy=normalize({...d,
  inventory:d.inventory.map(i=>i.item==="5-Gallon Bottle · 2 caps"?{...i,onHand:0,committed:0}:i),
  orders:[...d.orders,
    {...d.orders[0],id:"SO-AHEAD",customerId:"c3",quantity:4000,due:"2026-10-30",status:"Paid",payment:"Paid",stage:3,stageV2:true,createdAt:"2026-09-06T09:00:00Z",promised:"2026-10-01",invoiceId:undefined,lines:[{item:"5-Gallon Bottle · 2 caps",quantity:4000,rate:9.4}]},
    {...d.orders[0],id:"SO-BIND",customerId:"c2",quantity:3000,due:"2026-09-11",status:"Paid",payment:"Paid",stage:3,stageV2:true,createdAt:"2026-09-07T12:00:00Z",invoiceId:undefined,lines:[{item:"5-Gallon Bottle · 2 caps",quantity:3000,rate:9.4}]}]});
const im=rushImpact(busy,"SO-BIND","2026-09-07");
t("the urgent order comes forward",im.gain>0,`${im.gain} days`);
t("it goes to the front of the line",im.position===1);
t("what it costs is named, not hidden",im.moved.some(m=>m.order.id==="SO-AHEAD"));
t("including how far back that order goes",im.moved.find(m=>m.order.id==="SO-AHEAD").days>0);
// The reason to do this in the app: the promise that just broke is a phone call somebody has to make.
t("an order that now misses a promise is flagged as a call",im.calls.some(c=>c.order.id==="SO-AHEAD"));
t("the preview changes nothing by itself",!busy.orders.find(o=>o.id==="SO-BIND").rush);

const rushed=normalize({...busy,orders:busy.orders.map(o=>o.id==="SO-BIND"?{...o,rush:{at:"2026-09-07T12:00:00Z",by:"Chris",why:"their line is down"}}:o)});
const after=productionQueue(rushed,"2026-09-07");
t("once marked, it is first in the line",after[0].order.id==="SO-BIND");
t("and it finishes when the preview said it would",after[0].finish===im.finish,`${after[0].finish} vs ${im.finish}`);
t("the order it jumped is right behind it",after[1].order.id==="SO-AHEAD");
t("why it was moved is kept on the order",rushed.orders.find(o=>o.id==="SO-BIND").rush.why==="their line is down");
t("and who moved it",rushed.orders.find(o=>o.id==="SO-BIND").rush.by==="Chris");
// Two emergencies in a week: the first one asked for keeps its place ahead of the second.
const both=normalize({...rushed,orders:rushed.orders.map(o=>o.id==="SO-AHEAD"?{...o,rush:{at:"2026-09-08T09:00:00Z",by:"Chris"}}:o)});
t("a second urgent order does not overtake the first",qo(both)[0].id==="SO-BIND"&&qo(both)[1].id==="SO-AHEAD");
t("but both are ahead of everything else",qo(both).slice(0,2).every(o=>o.rush));
// Clearing the flag puts it back where it was taken.
const cleared=normalize({...rushed,orders:rushed.orders.map(o=>o.id==="SO-BIND"?{...o,rush:undefined}:o)});
t("taking urgent off puts it back in its place",productionQueue(cleared,"2026-09-07")[0].order.id!=="SO-BIND");

console.log("\nTaking an order no longer raises work orders behind the plan's back:");
const modal=readFileSync(new URL("../app/components/modals.tsx",import.meta.url),"utf8");
t("the order modal quotes from the line",modal.includes("estimateOrder("));
t("it stores what the customer was told",modal.includes("promised:estimate.finish"));
t("and it raises no work orders of its own",/const newWOs:WorkOrder\[\]=\[\];/.test(modal));
}

// ---------------------------------------------------------------------------
// Editing and removing a run.
if(app){
const {normalize,demoData,guardRunEdit,deleteRun,runDeleteImpact,stepProgress}=app;
const d=normalize(demoData);
const run=d.workOrders.find(w=>w.id==="WO-121");     // covers two planned days, 620 made, 14 scrap

console.log("\nEditing a run that has already made something asks first:");
const fresh={id:"WO-X",item:"x",quantity:500,good:0,scrap:0,packed:0,date:"",status:"Scheduled",purpose:""};
t("an untouched run is edited in silence",guardRunEdit(fresh,{quantity:600})===null);
t("a run with output asks before the quantity changes",!!guardRunEdit(run,{quantity:1200}));
t("cutting below what was made is called out",/below what has already been made/.test(guardRunEdit(run,{quantity:100})));
t("changing what it makes asks too",/does not change what was already made/.test(guardRunEdit(run,{item:"something else"})));
t("moving it to another station asks",/does not move what was already made/.test(guardRunEdit(run,{line:"Assembly"})));
t("a running job asks even with nothing recorded",!!guardRunEdit({...fresh,status:"Running"},{line:"Line 2"}));

console.log("\nRemoving a run keeps what it made:");
const impact=runDeleteImpact(d,"WO-121");
t("the question can say what is at stake",impact.made===620&&impact.scrap===14&&impact.steps===2,JSON.stringify(impact).slice(0,90));
const after=deleteRun(d,"WO-121");
t("the run is gone",!after.workOrders.some(w=>w.id==="WO-121"));
const steps=after.prodDays.flatMap(x=>x.steps).filter(x=>x.id==="ps-m1"||x.id==="ps-m2");
t("its days go back to being planned work",steps.every(x=>!x.workOrderId));
// 620 across two 500-bottle days: the first is full, the second keeps 120. The bottles exist either way.
t("the first day keeps the 500 it was credited with",steps.find(x=>x.id==="ps-m1").actualQty===500);
t("and the second keeps its 120",steps.find(x=>x.id==="ps-m2").actualQty===120);
t("the finished day still reads as done",stepProgress(steps.find(x=>x.id==="ps-m1"),after.workOrders,after.prodDays.flatMap(x=>x.steps)).done===true);
t("and the record says where those units came from",/WO-121 before it was removed/.test(steps.find(x=>x.id==="ps-m1").note||""));
// A run that never produced anything just releases its days.
const clean=normalize({...d,workOrders:d.workOrders.map(w=>w.id==="WO-121"?{...w,good:0,scrap:0}:w)});
const afterClean=deleteRun(clean,"WO-121");
t("a run that made nothing leaves no phantom production",
  afterClean.prodDays.flatMap(x=>x.steps).filter(x=>x.id==="ps-m1").every(x=>x.actualQty===undefined&&!x.workOrderId));
t("removing a run that does not exist changes nothing",deleteRun(d,"WO-nope").workOrders.length===d.workOrders.length);

const drawer=readFileSync(new URL("../app/components/drawers.tsx",import.meta.url),"utf8");
t("the drawer edits a run through the guard",drawer.includes("guardRunEdit(")&&drawer.includes("RunEditor"));
t("and deletes through deleteRun",drawer.includes("deleteRun("));
// The old fields committed on every keystroke; the editor saves once.
t("editing a run no longer writes on every keystroke",!/onChange=\{e=>upd\(\{(line|date|quantity)/.test(drawer));
}

// The step editor has to be able to change what a step makes. The guard has always had a branch for it
// — the form simply never offered the field, so a step raised against the wrong product could only be
// deleted and typed again.
if(app){
const ui=readFileSync(new URL("../app/components/prodplan.tsx",import.meta.url),"utf8");
console.log("\nA step can be pointed at a different product:");
const editor=ui.slice(ui.indexOf("function EditStep("),ui.indexOf("function AddStep("));
t("the editor offers what the step makes",/setTarget/.test(editor)&&/<label>Makes/.test(editor));
t("and sends the change through the guard",/next\.target=target/.test(editor));
t("the guard has something to say about it",
  /Changing what this step makes/.test(app.guardStepEdit({id:"x",type:"mold",source:"amazon",target:"b-s5",qty:10,done:true},{target:"b-r5"})||""));
t("moulding is chosen from blanks, the rest from products",/step\.type==="mold"\?blanks:\[\.\.\.skus,\.\.\.blanks\]/.test(editor));
t("and a blank says which product it becomes",/for \$\{makes\.join/.test(ui));
}

// ---------------------------------------------------------------------------
// One product. Price, stock and listing were three records joined by a name and edited on three
// screens, so they drifted. There is one shape to read now and exactly one function that writes it.
if(app){
const {products,productOf,saveProduct,deleteProduct,productUses,normalize:nz,demoData:dm}=app;
const base=nz(dm);

console.log("\nA product is one record:");
const p=productOf(base,"5-Gallon Bottle · 2 caps");
t("it carries the price",p.rate>0);
t("and the stock",p.onHand>0);
t("and how it is made",!!p.blankId&&!!p.material);
t("and how it is packed",p.unitsPerCase>0&&!!p.packedAs);
t("and its listing",p.sku==="D5-T0WT-Q5XP",`${p.sku}`);
t("a material is a product too, just not one we sell",products(base).some(x=>x.kind==="raw"));

console.log("\nThe two sides are kept apart:");
t("a product says which side sells it",["wholesale","amazon","both"].includes(p.channel));
t("the cap packs are wholesale only",productOf(base,"Screw Caps · 10-pack").channel==="wholesale");
t("a listing carries a barcode for the floor to label from",!!productOf(base,"3-Gallon Bottle · 2 caps").barcode);
t("and what goes in the box with the bottle",productOf(base,"3-Gallon Bottle · 2 caps").includes.length>0);
t("a wholesale-only product carries neither",
  !productOf(base,"Screw Caps · 10-pack").barcode&&productOf(base,"Screw Caps · 10-pack").includes.length===0);
// Sales quote from one list, the floor works from the other; the screen splits on this.
const prodUi=readFileSync(new URL("../app/components/products.tsx",import.meta.url),"utf8");
t("the screen has a list for each side",/setTab\("wholesale"\)/.test(prodUi)&&/setTab\("amazon"\)/.test(prodUi));
t("the listing block is only shown for a listing",/p\.channel!=="wholesale"&&<>/.test(prodUi));
t("a listing can carry its own packed-unit photo",/packagingPhotoKey/.test(prodUi));

console.log("\nOne save writes all three:");
const saved=saveProduct(base,{...p,rate:11.5,onHand:999,sku:"NEW-ASIN-1",channel:"amazon"});
t("the price lands on the item rate",saved.itemRates.find(r=>r.item===p.name).rate===11.5);
t("the count lands on the stock line",saved.inventory.find(i=>i.item===p.name).onHand===999);
t("the listing lands on the sku",saved.skus.find(k=>k.itemId===p.name).id==="NEW-ASIN-1");
t("and reading it back gives one record again",productOf(saved,p.name).rate===11.5&&productOf(saved,p.name).sku==="NEW-ASIN-1");
// The drift this exists to prevent: a price with no stock line.
const fresh=saveProduct(base,{...p,name:"Brand New Bottle",sku:undefined});
t("a new product gets a stock line without being asked",!!fresh.inventory.find(i=>i.item==="Brand New Bottle"));
t("and an item rate",!!fresh.itemRates.find(r=>r.item==="Brand New Bottle"));
// A material named on a product has to be countable or the floor can never check it.
const withMat=saveProduct(base,{...p,name:"Another Bottle",material:"HDPE pellets · natural"});
t("a new material becomes a countable line",!!withMat.inventory.find(i=>i.item==="HDPE pellets · natural"&&i.kind==="raw"));

console.log("\nRenaming carries everything that can safely follow:");
const renamed=saveProduct(base,{...p,name:"5-Gallon · two screw caps"},p.name);
t("the stock line follows",!!renamed.inventory.find(i=>i.item==="5-Gallon · two screw caps"));
t("the old stock line is gone, not duplicated",!renamed.inventory.find(i=>i.item===p.name));
t("the item rate follows",!!renamed.itemRates.find(r=>r.item==="5-Gallon · two screw caps"));
t("the listing follows",renamed.skus.find(k=>k.id===p.sku).itemId==="5-Gallon · two screw caps");
// History does not follow: an invoice records what was sold under the name it was sold under.
t("what was already sold keeps the name it was sold under",
  renamed.orders.some(o=>(o.lines||[]).some(l=>l.item===p.name)));

console.log("\nNothing in use disappears quietly:");
const uses=productUses(base,p.name);
t("the app can say where a product is still referred to",uses.any>0,JSON.stringify({o:uses.orders.length,r:uses.runs.length,s:uses.steps}));
t("a product nobody uses reports nothing",productUses(base,"Nothing Like This").any===0);
const gone=deleteProduct(base,"Silicone Caps · 3-pack");
t("deleting takes the stock line with it",!gone.inventory.some(i=>i.item==="Silicone Caps · 3-pack"));
t("and the item rate",!gone.itemRates.some(r=>r.item==="Silicone Caps · 3-pack"));
}

// The plan schedules against blanks and SKUs. Those arrived with the model and were filled in from the
// app's own defaults, so for a while the calendar referenced products the owner could not see anywhere.
if(app){
const owner=readFileSync(new URL("../app/components/owner.tsx",import.meta.url),"utf8");
const modal=readFileSync(new URL("../app/components/modals.tsx",import.meta.url),"utf8");
const authz=readFileSync(new URL("../app/server/authz.ts",import.meta.url),"utf8");
console.log("\nEverything the plan references can be seen and changed:");
const prod=readFileSync(new URL("../app/components/products.tsx",import.meta.url),"utf8");
t("there is an editor for the moulds",/function CatalogueEditor/.test(owner));
t("it sits with the products that reference them",/<Moulds\/>/.test(prod));
t("it saves in one go rather than on every keystroke",/dirty/.test(owner)&&/catalogue\.update/.test(owner));
// Removing something the calendar points at would leave steps making a thing that no longer exists.
t("it will not remove one the plan is using",/is on the production plan/.test(owner));
t("nor one that products are moulded from",/point those at another mould first/.test(owner));
// Everything else about a product is one record on one screen now.
t("price, stock, listing and packing are one form",
  /How it is made/.test(prod)&&/How it is packed and shipped/.test(prod)&&/How many there are/.test(prod)&&/Amazon listing code/.test(prod));
t("and one writer",/saveProduct\(v,p,editing\.was\)/.test(prod));
// They are catalogue, like prices: a floor tablet must not be able to rewrite them.
t("blanks and products are owner-only on the server",/"blanks", "skus"/.test(authz));

console.log("\nThe five things are actually connected:");
const {normalize:n3,demoData:dd3,runFromSteps:rfs}=app;
const d3=n3(dd3);
const sku=d3.skus.find(x=>x.id==="D5-T0WT-Q5XP");
t("a product names the blank it is moulded from",!!d3.blanks.find(b=>b.id===sku.blankId));
t("and the item rate it is priced and stocked as",!!d3.itemRates.find(r=>r.item===sku.itemId));
t("that item has a stock line",!!d3.inventory.find(i=>i.item===sku.itemId));
// Without the link a run raised for an Amazon product had no item rate to read from, so the floor got
// a name and no material, box size or photo.
const asmStep={id:"s",type:"assemble",source:"amazon",target:"D5-T0WT-Q5XP",qty:100};
t("a run raised for that product lands on the catalogue item",
  rfs([asmStep],d3,"WO-T","2026-09-15").item===sku.itemId,`${rfs([asmStep],d3,"WO-T","2026-09-15").item}`);
t("so its build sheet can find a material",!!d3.itemRates.find(r=>r.item===sku.itemId)?.material);

console.log("\nAn item says how it ships:");
const {packingPlan,normalize:norm2,demoData:demo2}=app;
const d2=norm2(demo2);
const wo=d2.workOrders.find(w=>w.item==="5-Gallon Bottle · no cap");
t("the item rate form asks",/How it ships/.test(modal)&&/packedAs/.test(modal));
// The pallet count is asked for only when something goes on a pallet, and it is labelled for what is
// actually being counted there — boxes on a boxed pallet, bottles on a bare one.
t("a pallet count is only asked for when it ships on one",/shipsAs!=="boxed"&&<label>/.test(modal));
t("and it is labelled boxes or bottles to suit",/shipsAs==="pallet-boxed"\?"Boxes per pallet":"Bottles per pallet"/.test(modal));
t("a material can be typed, not only picked",/list="ml-raws"/.test(modal)&&/<datalist id="ml-raws">/.test(modal));
t("and a new material becomes a stock line to count",/kind:"raw" as const/.test(modal));
const rate=(patch)=>d2.itemRates.map(r=>r.item==="5-Gallon Bottle · no cap"?{...r,...patch}:r);
t("boxes with no pallet ask for no pallet count",packingPlan(wo,rate({packedAs:"boxed",shipsAs:"boxed"})).pallets===0);
t("boxes on a pallet count boxes",packingPlan(wo,rate({packedAs:"boxed",shipsAs:"pallet-boxed",perPallet:48})).pallets===Math.ceil(packingPlan(wo,rate({packedAs:"boxed",shipsAs:"pallet-boxed",perPallet:48})).cartons/48));
// A pallet with no boxes counts bottles, not cartons — that is the whole reason the two questions split.
const loosePallet=packingPlan(wo,rate({packedAs:"loose",shipsAs:"pallet-loose",perPallet:500}));
t("a pallet with no boxes counts bottles",loosePallet.pallets===Math.ceil(loosePallet.received/500),`${loosePallet.pallets}`);
t("and asks for no cartons at all",loosePallet.cartons===0);
t("the plan says how it is packed and how it ships",
  ["loose","boxed","pallet"].includes(loosePallet.packedAs)&&["boxed","pallet-boxed","pallet-loose"].includes(loosePallet.shipsAs));
}

// One calendar, not two. The month grid and the day list were separate screens drawing overlapping
// work; a second one creeping back is the regression worth catching in the source.
console.log("\nThere is one production calendar:");
const nav=readFileSync(new URL("../app/components/owner.tsx",import.meta.url),"utf8");
const floorNav=readFileSync(new URL("../app/components/floor.tsx",import.meta.url),"utf8");
const salesSrc=readFileSync(new URL("../app/components/sales.tsx",import.meta.url),"utf8");
const planSrc=readFileSync(new URL("../app/components/prodplan.tsx",import.meta.url),"utf8");
t("the owner has one calendar in the nav",(nav.match(/"Production calendar"/g)||[]).length>=1&&!nav.includes('"Production plan"'));
t("so does the floor",floorNav.includes('"Production calendar"')&&!floorNav.includes('"Production plan"'));
t("the old month-grid component is gone from sales",!/export function ProductionCalendar\b/.test(salesSrc));
t("the merged screen draws both readings",planSrc.includes('view==="month"')&&planSrc.includes("MonthGrid"));
t("and it still carries what only the old calendar had",
  ["maintenance","purchaseOrders","STAGE_SHIPPED"].every(k=>planSrc.includes(k)));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
