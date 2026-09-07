// MakeLogic company data model.
// Everything the app knows is one JSON document persisted through /api/state.
// New fields are optional and filled in by normalize() so data saved by the
// previous UI keeps loading.

export type Customer={id:string;name:string;kind:"customer"|"lead";contact:string;email:string;phone:string;rep:string;stage:string;balance:number;lifetimeSales:number;billing:string;delivery:string;terms:string;notes:string;prices?:Record<string,number>;qb?:boolean;qboId?:string};
export type DocumentRecord={id:string;kind:"quote"|"invoice";customerId:string;item:string;cases:number;rate:number;discount:number;shipping:number;status:string;due:string;paid:number;orderId?:string;quantity?:number;qbSynced?:boolean;note?:string;qboId?:string;qboDocNumber?:string;paymentQboId?:string;
  // Imported from QuickBooks: the document exactly as the books hold it. `total` is authoritative and
  // must never be recomputed — see documentTotal.
  lines?:OrderLine[];total?:number;balance?:number;txnDate?:string;source?:"quickbooks"};
export type OrderLine={item:string;quantity:number;rate:number};
export type OrderRecord={stageV2?:boolean;id:string;customerId:string;item:string;cases:number;quantity:number;due:string;status:string;payment:string;deposit?:number;depositAt?:string;
  lines?:OrderLine[];shipMethod?:string;shipping?:number;discount?:number;notes?:string;invoiceNote?:string;stage?:number;invoiceId?:string;rep?:string;createdAt?:string};
export type QcCheck={label:string;result:boolean|null};
export type WorkOrder={id:string;orderId?:string;item:string;quantity:number;good:number;scrap:number;packed:number;date:string;status:string;purpose:string;line?:string;days?:number;qc?:QcCheck[];qcNote?:string;qcResult?:"pass"|"hold"|"scrap"|null};
export type CalendarEvent={id:string;day:number;type:"order"|"stock"|"maintenance"|"delivery";title:string};
export type Notice={id:string;title:string;detail:string;urgent:boolean;read:boolean;createdAt:string;target:string};
export type Activity={id:string;customerId?:string;title:string;detail:string;actor:string;createdAt:string};
export type RoleSetting={id:string;name:string;members:string[];permissions:Record<string,"none"|"view"|"edit">};
// blankId/caps are what let an order line reach the machines: without them the catalogue knows what a
// bottle costs but not what it is made from, so nothing could turn a wholesale order into production.
// An empty string means "deliberately not moulded here" (a cap pack, a bought-in item) and is left
// alone; undefined means nobody has said yet, and inferBlank has a one-time guess at it.
export type ItemRate={id:string;item:string;rate:number;minimum:number;discountLimit:number;floor?:number;unitsPerCase?:number;kind?:"finished"|"raw";cost?:number;sub?:string;qcChecks?:string[];material?:string;blankId?:string;caps?:AssemblyCap[]};
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
export type Sku={
  id:string;name:string;              // "D5-T0WT-Q5XP", "5 Gal + 2 Screw Caps"
  channel:"amazon"|"wholesale"|"both";
  blankId:string;                     // what gets moulded first
  caps:AssemblyCap[];                 // empty for a bottle-only listing, which still gets
                                      // labelled and boxed, so it is still an assembly step
  unitsPerPalletLtl?:number;          // trailer door limits differ — LTL fits fewer
  unitsPerPalletFtl?:number;
};

// Two machines, one per bottle size, running in parallel. 500 bottles each on a six-hour
// shift. They do not share capacity: a heavy 5-gallon week cannot borrow the 3-gallon
// machine, which is exactly the constraint a plan has to respect.
export type Machine={id:string;name:string;makes:"3-gal"|"5-gal";perShift:number};
// The real catalogue. Four blanks, six Amazon SKUs, and the plain bottles wholesale buys.
export const DEFAULT_BLANKS:Blank[]=[
  {id:"b-s5",name:"Screw-top 5-gal",size:"5-gal",neck:"screw"},
  {id:"b-s3",name:"Screw-top 3-gal",size:"3-gal",neck:"screw"},
  // Both regular blanks are sold plain to wholesale as well as feeding the kitted SKUs.
  {id:"b-r5",name:"Regular 5-gal",size:"5-gal",neck:"regular",sellable:true},
  {id:"b-r3",name:"Regular 3-gal",size:"3-gal",neck:"regular",sellable:true},
];
export const DEFAULT_SKUS:Sku[]=[
  {id:"D5-T0WT-Q5XP",name:"5 Gal + 2 Screw Caps",channel:"amazon",blankId:"b-s5",
    caps:[{component:"Screw cap",qty:2}],unitsPerPalletLtl:80,unitsPerPalletFtl:96},
  {id:"MI-89OO-OBNM",name:"3 Gal + 2 Screw Caps",channel:"amazon",blankId:"b-s3",
    caps:[{component:"Screw cap",qty:2}],unitsPerPalletLtl:150,unitsPerPalletFtl:180},
  // Bottle only. No caps, but it is still labelled and boxed, so assembly still happens.
  {id:"GO-WAAU-08PA",name:"5 Gal Bottle Only",channel:"amazon",blankId:"b-r5",
    caps:[],unitsPerPalletLtl:80,unitsPerPalletFtl:96},
  {id:"BV-B81Q-X4UN",name:"5 Gal + 2 Silicone Caps",channel:"amazon",blankId:"b-r5",
    caps:[{component:"Silicone cap",qty:2}],unitsPerPalletLtl:80,unitsPerPalletFtl:96},
  {id:"MV-1AA8-B2UV",name:"5 Gal + 1 Silicone Cap",channel:"amazon",blankId:"b-r5",
    caps:[{component:"Silicone cap",qty:1}],unitsPerPalletLtl:80,unitsPerPalletFtl:96},
  {id:"ZR-4HHD-8YRL",name:"3 Gal + 1 Silicone Cap",channel:"amazon",blankId:"b-r3",
    caps:[{component:"Silicone cap",qty:1}],unitsPerPalletLtl:150,unitsPerPalletFtl:180},
];

export const DEFAULT_MACHINES:Machine[]=[
  {id:"m5",name:"5-gallon line",makes:"5-gal",perShift:500},
  {id:"m3",name:"3-gallon line",makes:"3-gal",perShift:500},
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
  ...SEPTEMBER_STEPS.map(e=>({...e,step:{...e.step,...(e.step.id==="ps-m1"?{actualQty:200,scrap:4,doneAt:"2026-09-07",doneBy:"Warehouse"}:{})}})),
  ...DEMO_WHOLESALE],DAY_LABELS);

export type ShipMethod={id:string;name:string;sub:string;rate:number;perCase?:number;custom?:boolean};
export type MaintenanceItem={id:string;machine:string;task:string;due:string;status:"Due"|"Scheduled"|"Complete";downtimeMin?:number;notes?:string};
export type PurchaseOrder={id:string;supplier:string;item:string;quantity:number;unitCost:number;freight:number;duty:number;eta:string;status:"Open"|"Received"|"Cancelled";createdAt:string;receivedAt?:string};
export type AppData={blanks?:Blank[];skus?:Sku[];prodDays?:ProdDay[];customers:Customer[];documents:DocumentRecord[];orders:OrderRecord[];workOrders:WorkOrder[];calendar:CalendarEvent[];notices:Notice[];activities:Activity[];roles:RoleSetting[];itemRates:ItemRate[];inventory:InventoryRow[];maintenance?:MaintenanceItem[];purchaseOrders?:PurchaseOrder[];
  settings:{company:string;ownerName:string;ownerEmail:string;warehouseToken:string;lines?:string[];machines?:Machine[];shipMethods?:ShipMethod[];discountApproval?:number;monthlyExpenses?:number;cashOnHand?:number;quickBooks:{connected:boolean;realmId:string;lastSync:string;customers:boolean;invoices:boolean;quotes:boolean;conflicts:number}}};

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
 settings:{company:"",ownerName:"",ownerEmail:"",warehouseToken:"",lines:["Line 1"],shipMethods:DEFAULT_SHIP,discountApproval:5,monthlyExpenses:0,cashOnHand:0,quickBooks:{connected:false,realmId:"",lastSync:"Never",customers:true,invoices:true,quotes:true,conflicts:0}},
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
// A document's total. When it came from QuickBooks the books already hold the figure, so use it
// verbatim: recomputing quantity × rate on a multi-line invoice multiplies a summed quantity against
// one line's unit price, which is how an invoice can appear as $2.2m. Locally-created documents are
// still single-item and compute as before.
export const documentTotal=(d:DocumentRecord)=>{
  if(d.total!=null)return Math.round(d.total*100)/100;
  if(d.lines&&d.lines.length)return Math.round((d.lines.reduce((a,l)=>a+l.quantity*l.rate,0)*(1-d.discount/100)+d.shipping)*100)/100;
  return Math.round((((d.quantity??d.cases)*d.rate)*(1-d.discount/100)+d.shipping)*100)/100;
};
// What is still owed. QuickBooks tells us directly; otherwise fall back to total less amount paid.
export const documentBalance=(d:DocumentRecord)=>d.balance!=null?Math.round(d.balance*100)/100:Math.max(0,Math.round((documentTotal(d)-(d.paid||0))*100)/100);
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
export const stepLoad=(st:ProdStep)=>st.done?(st.actualQty??st.qty):Math.max(st.qty,st.actualQty??0);

export type MachineLoad={machine:Machine;units:number;capacity:number;over:number;bySource:Record<ProdSource,number>};

/**
 * Per-machine load for one day. A step is assigned to a machine by the SIZE of the blank it moulds,
 * not by whatever machineId it was saved with — the 5-gallon line physically cannot run a 3-gallon
 * mould, so the blank is the truth and a stale machineId must not be able to hide an overload.
 */
export function dayLoad(day:ProdDay,blanks:Blank[],machines:Machine[]):MachineLoad[]{
  return machines.map(machine=>{
    const bySource:Record<ProdSource,number>={amazon:0,wholesale:0};
    let units=0;
    for(const st of day.steps||[]){
      if(st.type!=="mold")continue;
      const blank=blanks.find(b=>b.id===st.target);
      if(!blank||blank.size!==machine.makes)continue;
      const n=stepLoad(st);
      units+=n;bySource[st.source]=(bySource[st.source]||0)+n;
    }
    return {machine,units,capacity:machine.perShift,over:Math.max(0,units-machine.perShift),bySource};
  });
}

/** Every day in the plan that asks more of a machine than a shift can deliver. */
export const overCapacityDays=(days:ProdDay[],blanks:Blank[],machines:Machine[])=>
  days.filter(d=>dayLoad(d,blanks,machines).some(l=>l.over>0));

/**
 * Month-level rollup for the header: what is scheduled, how it splits across the two lines, and
 * how many shifts that load actually needs. Days scheduled and shifts needed are reported side by
 * side deliberately — if the plan spreads 3,616 five-gallon bottles over six days, six days is not
 * enough and the difference is a promised date about to be missed.
 */
export function planTotals(days:ProdDay[],blanks:Blank[],machines:Machine[]){
  const blankLoad:Record<string,number>={};
  const bySource:Record<ProdSource,number>={amazon:0,wholesale:0};
  const daysUsed:Record<string,Set<string>>={};
  for(const day of days){
    for(const st of day.steps||[]){
      if(st.type!=="mold")continue;
      const blank=blanks.find(b=>b.id===st.target);if(!blank)continue;
      const n=stepLoad(st);
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
    over:overCapacityDays(days,blanks,machines).map(d=>d.date),
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
export function planOrder(o:OrderRecord,data:AppData,from?:string){
  const blanks=data.blanks?.length?data.blanks:DEFAULT_BLANKS;
  const machines=data.settings.machines?.length?data.settings.machines:DEFAULT_MACHINES;
  const need=orderNeeds(o,data);
  const entries:{date:string;step:ProdStep}[]=[];
  // Load already on the calendar, plus anything this run has placed, so a big order stacked across
  // several days does not book the same shift twice.
  const placed:Record<string,number>={};
  const key=(date:string,machineId:string)=>`${date}|${machineId}`;
  for(const day of data.prodDays||[])
    for(const l of dayLoad(day,blanks,machines))placed[key(day.date,l.machine.id)]=l.units;

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
    settings:{...seedData.settings,...s,lines:s.lines||["Line 1"],machines:s.machines?.length?s.machines:DEFAULT_MACHINES,shipMethods:(s.shipMethods&&s.shipMethods.some(m=>m.custom)?s.shipMethods:[...(s.shipMethods||DEFAULT_SHIP).filter(m=>!m.custom),DEFAULT_SHIP[DEFAULT_SHIP.length-1]]),discountApproval:s.discountApproval??5,monthlyExpenses:s.monthlyExpenses??0,cashOnHand:s.cashOnHand??0,quickBooks:{...seedData.settings.quickBooks,...(s.quickBooks||{})}}};
}

/** True when the record still holds sample customers (starter or demo data). */
export const hasDemoData=(d:AppData)=>/pure alkaline/i.test(d.settings?.company||"")||d.customers.some(c=>/\.test$/i.test(c.email))||d.settings?.ownerEmail?.endsWith(".test")===true;
export const todayIso=()=>new Date().toISOString().slice(0,10);

/**
 * A fresh warehouse-link token. The URL is the only thing standing between this link and the
 * schedule, so it is long and random — and it drops the characters that get misread off a screen
 * (l/1, o/0), because someone will end up typing it into a tablet by hand.
 */
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
export const daysFromNow=(n:number)=>{const x=new Date();x.setDate(x.getDate()+n);return x};
