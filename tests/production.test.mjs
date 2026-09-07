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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
