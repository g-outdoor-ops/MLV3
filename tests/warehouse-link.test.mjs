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

let floor=null,app=null;
try{
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
t("no finished runs clutter it",view.workOrders.every(w=>w.status!=="Done"));
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

console.log("\nThe audit says the record came from the link, not from a person who signed in:");
t("an unnamed tablet is still identified",floorActor()==="Warehouse link");
t("a name given on the tablet is carried through",floorActor("Marta")==="Warehouse link · Marta");
t("and it cannot smuggle markup into the log",!floorActor("<script>alert(1)</script>").includes("<"));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
