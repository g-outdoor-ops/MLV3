// Exercises denyStateWrite's real logic against realistic blobs.
const OWNER_ONLY=["settings","roles","itemRates"];
const LABEL={settings:"company settings",roles:"roles and access",itemRates:"pricing and product costs"};
const changed=(a,b)=>JSON.stringify(a??null)!==JSON.stringify(b??null);
function denyStateWrite(user,prev,next){
  if(user.role==="owner")return null;
  const touched=OWNER_ONLY.filter(k=>changed(prev[k],next[k]));
  if(!touched.length)return null;
  return `Only an owner can change ${touched.map(t=>LABEL[t]||t).join(" and ")}.`;
}
const base={customers:[{id:"c1",name:"Palm Aqua"}],orders:[],workOrders:[],inventory:[{id:"i1",onHand:100,committed:0}],
  documents:[],activities:[],notices:[],calendar:[],
  itemRates:[{id:"r1",item:"5-Gallon",rate:9.4,floor:8}],
  roles:[{id:"r1",name:"Owner"}],
  settings:{company:"EcoForm",warehouseToken:"tok-abc",discountApproval:5}};
const clone=o=>JSON.parse(JSON.stringify(o));
let pass=0,fail=0;
const t=(name,got,want)=>{const ok=(got===null)===(want===null);
  if(ok)pass++;else fail++;
  console.log(`${ok?"  ok  ":"  FAIL"} ${name}${ok?"":`  (got ${JSON.stringify(got)})`}`)};

console.log("\nNormal work must still go through:");
// Sales takes an order: touches orders, workOrders, inventory.committed, activities, notices.
const salesOrder=clone(base);
salesOrder.orders.push({id:"SO-1",customerId:"c1"});
salesOrder.workOrders.push({id:"WO-1"});
salesOrder.inventory[0].committed=40;
salesOrder.activities.push({id:"a1"});
t("sales takes an order (orders+WO+inventory+activity)",denyStateWrite({role:"sales"},base,salesOrder),null);

const floorRun=clone(base);
floorRun.workOrders.push({id:"WO-2",status:"Running"});
floorRun.inventory[0].onHand=140;
t("floor reports production (workOrders+inventory)",denyStateWrite({role:"floor"},base,floorRun),null);

const salesDoc=clone(base);salesDoc.documents.push({id:"INV-1",total:900});
t("sales raises an invoice document",denyStateWrite({role:"sales"},base,salesDoc),null);

console.log("\nDangerous writes must be refused:");
const stealToken=clone(base);stealToken.settings.warehouseToken="attacker";
t("floor rewrites the warehouse token",denyStateWrite({role:"floor"},base,stealToken),"deny");

const repriceFloor=clone(base);repriceFloor.itemRates[0].rate=0.01;
t("floor reprices the product",denyStateWrite({role:"floor"},base,repriceFloor),"deny");

const salesReprice=clone(base);salesReprice.itemRates[0].floor=0;
t("sales removes the discount floor",denyStateWrite({role:"sales"},base,salesReprice),"deny");

const grantSelf=clone(base);grantSelf.roles.push({id:"r9",name:"Sales",permissions:{all:"edit"}});
t("sales grants itself permissions",denyStateWrite({role:"sales"},base,grantSelf),"deny");

const approval=clone(base);approval.settings.discountApproval=99;
t("sales raises its own discount approval limit",denyStateWrite({role:"sales"},base,approval),"deny");

console.log("\nOwner is unrestricted:");
const ownerAll=clone(base);ownerAll.settings.company="New";ownerAll.itemRates[0].rate=12;ownerAll.roles=[];
t("owner changes settings, pricing and roles",denyStateWrite({role:"owner"},base,ownerAll),null);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
