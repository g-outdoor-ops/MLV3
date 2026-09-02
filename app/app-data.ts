export type Customer={id:string;name:string;kind:"customer"|"lead";contact:string;email:string;phone:string;rep:string;stage:string;balance:number;lifetimeSales:number;billing:string;delivery:string;terms:string;notes:string};
export type DocumentRecord={id:string;kind:"quote"|"invoice";customerId:string;item:string;cases:number;rate:number;discount:number;shipping:number;status:string;due:string;paid:number};
export type OrderRecord={id:string;customerId:string;item:string;cases:number;quantity:number;due:string;status:string;payment:string};
export type WorkOrder={id:string;orderId?:string;item:string;quantity:number;good:number;scrap:number;packed:number;date:string;status:string;purpose:string};
export type CalendarEvent={id:string;day:number;type:"order"|"stock"|"maintenance"|"delivery";title:string};
export type Notice={id:string;title:string;detail:string;urgent:boolean;read:boolean;createdAt:string;target:string};
export type Activity={id:string;customerId?:string;title:string;detail:string;actor:string;createdAt:string};
export type RoleSetting={id:string;name:string;members:string[];permissions:Record<string,"none"|"view"|"edit">};
export type AppData={customers:Customer[];documents:DocumentRecord[];orders:OrderRecord[];workOrders:WorkOrder[];calendar:CalendarEvent[];notices:Notice[];activities:Activity[];roles:RoleSetting[];itemRates:{id:string;item:string;rate:number;minimum:number;discountLimit:number}[];inventory:{id:string;item:string;onHand:number;committed:number;reorder:number;cost:number}[];settings:{company:string;ownerName:string;ownerEmail:string;warehouseToken:string;quickBooks:{connected:boolean;realmId:string;lastSync:string;customers:boolean;invoices:boolean;quotes:boolean;conflicts:number}}};

export const seedData:AppData={
 customers:[
  {id:"c1",name:"Martin Supply",kind:"customer",contact:"John Martin",email:"john@martinsupply.test",phone:"215-555-0128",rep:"Dad",stage:"Active",balance:3240,lifetimeSales:48620,billing:"1250 Market St, Philadelphia, PA 19107",delivery:"4800 Industrial Dr, Newark, NJ 07105",terms:"Net 30",notes:"Prefers email confirmations."},
  {id:"c2",name:"North Point Labs",kind:"customer",contact:"Maria Chen",email:"maria@northpoint.test",phone:"973-555-0184",rep:"Dad",stage:"Active",balance:6480,lifetimeSales:72840,billing:"80 Broad St, Newark, NJ 07102",delivery:"4800 Industrial Dr, Newark, NJ 07105",terms:"Net 30",notes:"Call receiving 30 minutes ahead."},
  {id:"c3",name:"Atlas Chemical",kind:"customer",contact:"Elena Ruiz",email:"elena@atlaschemical.test",phone:"410-555-0114",rep:"Sarah",stage:"Active",balance:0,lifetimeSales:36280,billing:"90 Harbor Way, Baltimore, MD 21224",delivery:"90 Harbor Way, Dock B",terms:"Net 30",notes:"Customer carrier."},
  {id:"l1",name:"Hudson Labs",kind:"lead",contact:"Maria Chen",email:"maria@hudson.test",phone:"215-555-0184",rep:"Sarah",stage:"Follow up today",balance:0,lifetimeSales:0,billing:"",delivery:"",terms:"Net 30",notes:"Interested in 16 oz clear."},
  {id:"l2",name:"Westfield Supply",kind:"lead",contact:"Tom Adams",email:"tom@westfield.test",phone:"",rep:"Dad",stage:"Quote sent",balance:0,lifetimeSales:0,billing:"",delivery:"",terms:"Net 30",notes:"Waiting for purchasing review."}
 ],
 documents:[
  {id:"Q-108",kind:"quote",customerId:"c1",item:"16 oz Clear",cases:72,rate:54,discount:5,shipping:486,status:"Draft",due:"Sep 8",paid:0},
  {id:"Q-107",kind:"quote",customerId:"l1",item:"12 oz Amber",cases:140,rate:62,discount:0,shipping:260,status:"Sent",due:"Sep 6",paid:0},
  {id:"INV-392",kind:"invoice",customerId:"c1",item:"32 oz Handleware",cases:12,rate:255,discount:0,shipping:180,status:"Overdue",due:"Aug 20",paid:0},
  {id:"INV-391",kind:"invoice",customerId:"c2",item:"12 oz Amber",cases:96,rate:62,discount:0,shipping:528,status:"Due Friday",due:"Sep 4",paid:0},
  {id:"INV-390",kind:"invoice",customerId:"c3",item:"16 oz Clear",cases:40,rate:54,discount:0,shipping:0,status:"Paid",due:"Sep 1",paid:2160}
 ],
 orders:[
  {id:"#2051",customerId:"c3",item:"16 oz Clear",cases:8,quantity:2000,due:"Today",status:"Ready",payment:"Paid"},
  {id:"#2050",customerId:"c2",item:"12 oz Amber",cases:24,quantity:6000,due:"Friday",status:"In production",payment:"$6,480 due"},
  {id:"#2049",customerId:"c1",item:"32 oz Handleware",cases:12,quantity:3000,due:"Sep 8",status:"Confirmed",payment:"$3,240 overdue"}
 ],
 workOrders:[
  {id:"WO-1048",orderId:"#2050",item:"12 oz Amber",quantity:6000,good:1250,scrap:18,packed:0,date:"2026-09-01",status:"Running",purpose:"North Point Labs order"},
  {id:"WO-1049",item:"16 oz Clear",quantity:4000,good:0,scrap:0,packed:0,date:"2026-09-02",status:"Scheduled",purpose:"Build in-house stock"}
 ],
 calendar:[{id:"ev1",day:1,type:"order",title:"WO-1048 · North Point"},{id:"ev2",day:2,type:"stock",title:"WO-1049 · Build stock"},{id:"ev3",day:3,type:"maintenance",title:"Line 1 service"},{id:"ev4",day:4,type:"delivery",title:"Resin delivery"},{id:"ev5",day:8,type:"order",title:"#2049 · Martin Supply"},{id:"ev6",day:29,type:"maintenance",title:"Month-end inventory"}],
 notices:[{id:"n1",title:"Payment received",detail:"Atlas Chemical paid INV-390 · $2,160",urgent:false,read:false,createdAt:"Today · 1:32 PM",target:"Invoices"},{id:"n2",title:"Production updated",detail:"Warehouse reported 1,250 good bottles on WO-1048",urgent:false,read:false,createdAt:"Today · 1:18 PM",target:"Work orders"},{id:"n3",title:"Order ready",detail:"Order #2051 is ready to pack",urgent:true,read:false,createdAt:"Today · 12:45 PM",target:"Orders"}],
 activities:[{id:"a1",customerId:"c2",title:"Production update",detail:"Order #2050 reached 21% completion",actor:"Warehouse",createdAt:"Today · 1:18 PM"},{id:"a2",customerId:"c3",title:"Payment received",detail:"INV-390 paid in full",actor:"System",createdAt:"Today · 1:32 PM"}],
 roles:[{id:"r1",name:"Owner",members:["Christopher"],permissions:{all:"edit"}},{id:"r2",name:"Sales representatives",members:["Dad","Sarah"],permissions:{crm:"edit",sales:"edit",calendar:"view",financials:"none",operations:"view",settings:"none"}},{id:"r3",name:"Warehouse production",members:["Warehouse"],permissions:{crm:"none",sales:"view",calendar:"view",financials:"none",operations:"edit",settings:"none"}}],
 itemRates:[{id:"i1",item:"16 oz Clear",rate:54,minimum:4,discountLimit:8},{id:"i2",item:"12 oz Amber",rate:62,minimum:4,discountLimit:8},{id:"i3",item:"32 oz Handleware",rate:255,minimum:2,discountLimit:5}],
 inventory:[{id:"s1",item:"Clear preforms",onHand:18400,committed:6000,reorder:5000,cost:.18},{id:"s2",item:"Blue caps",onHand:8400,committed:6000,reorder:10000,cost:.08},{id:"s3",item:"16 oz Clear bottles",onHand:4500,committed:2000,reorder:2000,cost:.42}],
 settings:{company:"Pure Alkaline LLC",ownerName:"Christopher Granitz",ownerEmail:"christopher@purealkaline.test",warehouseToken:"floor-7Q4M-2026",quickBooks:{connected:false,realmId:"",lastSync:"Never",customers:true,invoices:true,quotes:true,conflicts:0}}
};

export const documentTotal=(d:DocumentRecord)=>Math.round(((d.cases*d.rate)*(1-d.discount/100)+d.shipping)*100)/100;
