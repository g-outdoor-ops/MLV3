// MakeLogic company data model.
// Everything the app knows is one JSON document persisted through /api/state.
// New fields are optional and filled in by normalize() so data saved by the
// previous UI keeps loading.

export type Customer={id:string;name:string;kind:"customer"|"lead";contact:string;email:string;phone:string;rep:string;stage:string;balance:number;lifetimeSales:number;billing:string;delivery:string;terms:string;notes:string;prices?:Record<string,number>;qb?:boolean;qboId?:string};
export type DocumentRecord={id:string;kind:"quote"|"invoice";customerId:string;item:string;cases:number;rate:number;discount:number;shipping:number;status:string;due:string;paid:number;orderId?:string;quantity?:number;qbSynced?:boolean;note?:string;qboId?:string;qboDocNumber?:string;paymentQboId?:string};
export type OrderLine={item:string;quantity:number;rate:number};
export type OrderRecord={id:string;customerId:string;item:string;cases:number;quantity:number;due:string;status:string;payment:string;
  lines?:OrderLine[];shipMethod?:string;shipping?:number;discount?:number;notes?:string;invoiceNote?:string;stage?:number;invoiceId?:string;rep?:string;createdAt?:string};
export type QcCheck={label:string;result:boolean|null};
export type WorkOrder={id:string;orderId?:string;item:string;quantity:number;good:number;scrap:number;packed:number;date:string;status:string;purpose:string;line?:string;days?:number;qc?:QcCheck[];qcNote?:string;qcResult?:"pass"|"hold"|"scrap"|null};
export type CalendarEvent={id:string;day:number;type:"order"|"stock"|"maintenance"|"delivery";title:string};
export type Notice={id:string;title:string;detail:string;urgent:boolean;read:boolean;createdAt:string;target:string};
export type Activity={id:string;customerId?:string;title:string;detail:string;actor:string;createdAt:string};
export type RoleSetting={id:string;name:string;members:string[];permissions:Record<string,"none"|"view"|"edit">};
export type ItemRate={id:string;item:string;rate:number;minimum:number;discountLimit:number;floor?:number;unitsPerCase?:number;kind?:"finished"|"raw";cost?:number;sub?:string;qcChecks?:string[];material?:string};
export type InventoryRow={id:string;item:string;onHand:number;committed:number;reorder:number;cost:number;kind?:"finished"|"raw";unit?:string;onOrder?:number;eta?:string;usage?:string;supplier?:string};
export type ShipMethod={id:string;name:string;sub:string;rate:number;perCase?:number;custom?:boolean};
export type MaintenanceItem={id:string;machine:string;task:string;due:string;status:"Due"|"Scheduled"|"Complete";downtimeMin?:number;notes?:string};
export type PurchaseOrder={id:string;supplier:string;item:string;quantity:number;unitCost:number;freight:number;duty:number;eta:string;status:"Open"|"Received"|"Cancelled";createdAt:string;receivedAt?:string};
export type AppData={customers:Customer[];documents:DocumentRecord[];orders:OrderRecord[];workOrders:WorkOrder[];calendar:CalendarEvent[];notices:Notice[];activities:Activity[];roles:RoleSetting[];itemRates:ItemRate[];inventory:InventoryRow[];maintenance?:MaintenanceItem[];purchaseOrders?:PurchaseOrder[];
  settings:{company:string;ownerName:string;ownerEmail:string;warehouseToken:string;lines?:string[];shipMethods?:ShipMethod[];discountApproval?:number;monthlyExpenses?:number;cashOnHand?:number;quickBooks:{connected:boolean;realmId:string;lastSync:string;customers:boolean;invoices:boolean;quotes:boolean;conflicts:number}}};

export const STAGES=["Placed","In production","Quality check","Ready","Shipped","Invoiced","Paid"] as const;
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
 settings:{company:"",ownerName:"",ownerEmail:"",warehouseToken:"",lines:["Line 1"],shipMethods:DEFAULT_SHIP,discountApproval:5,monthlyExpenses:0,cashOnHand:0,quickBooks:{connected:false,realmId:"",lastSync:"Never",customers:true,invoices:true,quotes:true,conflicts:0}},
};

export const demoData:AppData={
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
 orders:[
  {id:"SO-1187",customerId:"c3",item:"5-Gallon Bottle · no cap",cases:250,quantity:500,due:label(0),status:"Ready",payment:"Net 30",lines:[{item:"5-Gallon Bottle · no cap",quantity:500,rate:8.2}],shipMethod:"ltl",shipping:312,discount:0,notes:"Ray wants the pallet double-wrapped.",stage:3,rep:"Dad"},
  {id:"SO-1188",customerId:"c2",item:"3-Gallon Bottle · 2 caps",cases:60,quantity:120,due:label(0),status:"Quality check",payment:"Card on pickup",lines:[{item:"3-Gallon Bottle · 2 caps",quantity:120,rate:8.5}],shipMethod:"pickup",shipping:0,discount:0,notes:"",stage:2,rep:"Dad"},
  {id:"SO-1189",customerId:"c1",item:"5-Gallon Bottle · 2 caps",cases:150,quantity:300,due:label(2),status:"In production",payment:"Net 30",lines:[{item:"5-Gallon Bottle · 2 caps",quantity:300,rate:9.4}],shipMethod:"truck",shipping:45,discount:0,notes:"Call Carlos the day before.",stage:1,rep:"Dad"},
  {id:"SO-1190",customerId:"c1",item:"5-Gallon Bottle · 2 caps",cases:150,quantity:300,due:label(-11),status:"Paid",payment:"Paid",lines:[{item:"5-Gallon Bottle · 2 caps",quantity:300,rate:9.4}],shipMethod:"truck",shipping:45,discount:0,stage:6,invoiceId:"INV-1031",rep:"Dad"},
  {id:"SO-1191",customerId:"c3",item:"5-Gallon Bottle · no cap",cases:350,quantity:700,due:label(-28),status:"Invoiced",payment:"$5,831 due",lines:[{item:"5-Gallon Bottle · no cap",quantity:500,rate:8.2},{item:"5-Gallon Bottle · 2 caps",quantity:200,rate:9.25}],shipMethod:"ltl",shipping:312,discount:2,stage:5,invoiceId:"INV-1027",rep:"Dad"},
 ],
 workOrders:[
  {id:"WO-116",orderId:"SO-1187",item:"5-Gallon Bottle · no cap",quantity:500,good:500,scrap:11,packed:500,date:iso(0),status:"Done",purpose:"Palm Aqua Delivery order",line:"Line 1",days:1,qcResult:"pass"},
  {id:"WO-115",orderId:"SO-1188",item:"3-Gallon Bottle · 2 caps",quantity:120,good:120,scrap:3,packed:0,date:iso(0),status:"QC hold",purpose:"Sunshine Coolers order",line:"Line 2",days:1,qc:DEFAULT_QC.map(l=>({label:l,result:null})),qcResult:null},
  {id:"WO-118",orderId:"SO-1189",item:"5-Gallon Bottle · 2 caps",quantity:600,good:418,scrap:9,packed:0,date:iso(1),status:"Running",purpose:"Miami Water Co order + stock",line:"Line 1",days:2,qc:DEFAULT_QC.map((l,i)=>({label:l,result:[true,true,null,true,true,null][i]})),qcNote:"Base looked a touch soft on rack 3 — Luis trimmed lamp zone 5 by 3%."},
  {id:"WO-119",item:"3-Gallon Bottle · 2 caps",quantity:500,good:0,scrap:0,packed:0,date:iso(2),status:"Scheduled",purpose:"Build stock",line:"Line 2",days:2},
  {id:"WO-120",item:"5-Gallon Bottle · no cap",quantity:400,good:0,scrap:0,packed:0,date:iso(3),status:"Scheduled",purpose:"Build stock",line:"Line 1",days:1},
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
  {id:"i1",item:"5-Gallon Bottle · 2 caps",sub:"with 2 screw caps",rate:9.9,floor:8.75,minimum:50,discountLimit:5,unitsPerCase:2,kind:"finished",cost:4.85,material:"PET preforms · 780g (5-gal)",qcChecks:["Weight (780g ±10g)","Wall thickness · base","Leak test · 24h","Visual · haze / streaks","Neck finish 55mm gauge","Handle pull test"]},
  {id:"i2",item:"3-Gallon Bottle · 2 caps",sub:"with 2 screw caps",rate:8.5,floor:7.6,minimum:50,discountLimit:5,unitsPerCase:2,kind:"finished",cost:4.1,material:"PET preforms · 560g (3-gal)",qcChecks:["Weight (560g ±10g)","Wall thickness · base","Leak test · 24h","Visual · haze / streaks","Neck finish 55mm gauge","Handle pull test"]},
  {id:"i3",item:"5-Gallon Bottle · no cap",sub:"no cap",rate:8.6,floor:7.7,minimum:50,discountLimit:5,unitsPerCase:2,kind:"finished",cost:4.4,material:"PET preforms · 780g (5-gal)",qcChecks:["Weight (780g ±10g)","Wall thickness · base","Leak test · 24h","Visual · haze / streaks","Neck finish 55mm gauge","Handle pull test"]},
  {id:"i4",item:"Screw Caps · 10-pack",sub:"pack of 10",rate:3.2,floor:2.4,minimum:10,discountLimit:10,unitsPerCase:20,kind:"finished",cost:0.61,material:"55mm screw caps (bulk)",qcChecks:["Thread fit on 55mm neck","Liner seated","Visual · flash / short shots"]},
  {id:"i5",item:"Silicone Caps · 3-pack",sub:"pack of 3",rate:4.99,floor:3.8,minimum:10,discountLimit:10,unitsPerCase:30,kind:"finished",cost:1.15,material:"Silicone caps (bulk)",qcChecks:["Seal test on 55mm neck","Visual · tears / voids"]},
 ],
 inventory:[
  {id:"s1",item:"5-Gallon Bottle · 2 caps",kind:"finished",onHand:412,committed:300,reorder:250,cost:4.85,unit:"bottles"},
  {id:"s2",item:"3-Gallon Bottle · 2 caps",kind:"finished",onHand:96,committed:120,reorder:200,cost:4.1,unit:"bottles"},
  {id:"s3",item:"5-Gallon Bottle · no cap",kind:"finished",onHand:830,committed:500,reorder:250,cost:4.4,unit:"bottles"},
  {id:"s4",item:"Screw Caps · 10-pack",kind:"finished",onHand:2140,committed:0,reorder:1000,cost:0.61,unit:"packs"},
  {id:"s5",item:"Silicone Caps · 3-pack",kind:"finished",onHand:18,committed:0,reorder:100,cost:1.15,unit:"packs"},
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
export const documentTotal=(d:DocumentRecord)=>Math.round((((d.quantity??d.cases)*d.rate)*(1-d.discount/100)+d.shipping)*100)/100;
export const money=(n:number)=>"$"+n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
export const int=(n:number)=>Math.round(n).toLocaleString("en-US");
// Orders saved by the earlier UI priced by the case; show them that way rather than re-pricing per bottle.
export const orderLines=(o:OrderRecord,rates:ItemRate[]):OrderLine[]=>o.lines&&o.lines.length?o.lines:[{item:`${o.item} · case`,quantity:o.cases||o.quantity,rate:rates.find(r=>r.item===o.item)?.rate??0}];
export function orderTotals(o:OrderRecord,data:AppData){const lines=orderLines(o,data.itemRates);const sub=lines.reduce((a,l)=>a+l.quantity*l.rate,0);const disc=sub*(o.discount||0)/100;const sm=(data.settings.shipMethods||DEFAULT_SHIP).find(s=>s.id===o.shipMethod);const cases=lines.reduce((a,l)=>a+Math.ceil(l.quantity/(data.itemRates.find(r=>r.item===l.item)?.unitsPerCase||2)),0);const ship=o.shipping!=null?o.shipping:sm?(sm.perCase?sm.perCase*cases:sm.rate):0;return {lines,sub,disc,ship,cases,total:Math.round((sub-disc+ship)*100)/100}}
export const stageOf=(o:OrderRecord)=>o.stage!=null?o.stage:Math.max(0,STAGES.findIndex(s=>s.toLowerCase()===o.status.toLowerCase()));
export const freeStock=(row:InventoryRow)=>row.onHand-row.committed;
export const fmtDay=(d:Date)=>d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});

/** Fill in fields the old UI never saved so the new screens always have what they need. */
export function normalize(d:AppData):AppData{
  const s=d.settings||seedData.settings;
  return {...d,
    customers:(d.customers||[]).map(c=>({...c,prices:c.prices||{},qb:c.qb??true})),
    orders:(d.orders||[]).map(o=>({...o,stage:stageOf(o),discount:o.discount||0,shipMethod:o.shipMethod||"pickup",notes:o.notes||""})),
    workOrders:(d.workOrders||[]).map(w=>({...w,line:w.line||"Line 1",days:w.days||1})),
    itemRates:(d.itemRates||[]).map(r=>({...r,kind:r.kind||"finished",unitsPerCase:r.unitsPerCase||2,floor:r.floor??Math.round(r.rate*(1-r.discountLimit/100)*100)/100,qcChecks:r.qcChecks||DEFAULT_QC})),
    inventory:(d.inventory||[]).map(i=>({...i,kind:i.kind||(/(preform|cap \(|caps \(|handle|carton|resin)/i.test(i.item)?"raw":"finished")})),
    maintenance:d.maintenance||[],purchaseOrders:d.purchaseOrders||[],
    calendar:d.calendar||[],notices:d.notices||[],activities:d.activities||[],roles:d.roles||seedData.roles,documents:d.documents||[],
    settings:{...seedData.settings,...s,lines:s.lines||["Line 1"],shipMethods:(s.shipMethods&&s.shipMethods.some(m=>m.custom)?s.shipMethods:[...(s.shipMethods||DEFAULT_SHIP).filter(m=>!m.custom),DEFAULT_SHIP[DEFAULT_SHIP.length-1]]),discountApproval:s.discountApproval??5,monthlyExpenses:s.monthlyExpenses??0,cashOnHand:s.cashOnHand??0,quickBooks:{...seedData.settings.quickBooks,...(s.quickBooks||{})}}};
}

/** True when the record still holds sample customers (starter or demo data). */
export const hasDemoData=(d:AppData)=>/pure alkaline/i.test(d.settings?.company||"")||d.customers.some(c=>/\.test$/i.test(c.email))||d.settings?.ownerEmail?.endsWith(".test")===true;
export const todayIso=()=>new Date().toISOString().slice(0,10);
export const daysFromNow=(n:number)=>{const x=new Date();x.setDate(x.getDate()+n);return x};
