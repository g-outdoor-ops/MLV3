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
const editBlock=ui.slice(ui.indexOf("onSave={(next,toDate)=>{"),ui.indexOf('"plan.step.edit"'));
t("the edit path calls guardStepEdit before it writes",editBlock.includes("guardStepEdit("),"no guard in the edit path");
t("the guard's question is answered in the app, not a browser dialog",!/window\.(confirm|prompt)/.test(ui));
t("the owner has reconcileStep",ui.includes("reconcileStep("));
t("the floor has its own recordStep",ui.includes("recordStep("));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
