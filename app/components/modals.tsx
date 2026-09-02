"use client";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { DEFAULT_QC, DEFAULT_SHIP, daysFromNow, fmtDay, freeStock, orderTotals, todayIso, type Customer, type DocumentRecord, type OrderLine, type OrderRecord, type WorkOrder } from "../app-data";
import { CrmSection, nextId, now, num, uid, useApp, usd2, type Modal } from "./store";
import { qboCall } from "./auth";

function Shell({title,eyebrow,onSubmit,close,children,submitLabel,wide}:{title:string;eyebrow:string;onSubmit:(e:FormEvent<HTMLFormElement>)=>void;close:()=>void;children:React.ReactNode;submitLabel:string;wide?:boolean}){
  return <div className="overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><form className={`modal ${wide?"wide-modal":""}`} role="dialog" aria-modal="true" onSubmit={onSubmit}><button type="button" className="close" onClick={close}>×</button><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{children}<button className="primary full" type="submit">{submitLabel}</button><button type="button" className="cancel" onClick={close}>Cancel</button></form></div>;
}

// =============================== ORDER / QUOTE / INVOICE — multi-line, shipping table, discount guard, notes
export function OrderModal({kind,close,presetCustomer,fromQuote}:{kind:"order"|"quote"|"invoice";close:()=>void;presetCustomer?:string;fromQuote?:DocumentRecord}){
  const {data,commit,notify,user,openRecord}=useApp();
  const finished=data.itemRates.filter(r=>r.kind!=="raw");
  const ships=data.settings.shipMethods||DEFAULT_SHIP;
  const [custId,setCustId]=useState(presetCustomer||fromQuote?.customerId||data.customers.find(c=>c.kind==="customer")?.id||"");
  const [lines,setLines]=useState<OrderLine[]>(fromQuote?[{item:fromQuote.item.split(" + ")[0],quantity:fromQuote.quantity||fromQuote.cases,rate:fromQuote.rate}]:[{item:finished[0]?.item||"",quantity:finished[0]?.minimum||50,rate:0}]);
  const [ship,setShip]=useState(ships[0]?.id||"pickup");const [freight,setFreight]=useState<string>(fromQuote&&fromQuote.shipping?String(fromQuote.shipping):"");
  const [disc,setDisc]=useState(fromQuote?.discount||0);
  const [due,setDue]=useState(daysFromNow(kind==="invoice"?30:3).toISOString().slice(0,10));
  const [notes,setNotes]=useState("");const [custNote,setCustNote]=useState(fromQuote?.note||"");
  const cust=data.customers.find(c=>c.id===custId);
  const priced=lines.map(l=>({...l,rate:l.rate||cust?.prices?.[l.item]||finished.find(r=>r.item===l.item)?.rate||0}));
  const shipMethod=ships.find(x=>x.id===ship);const customShip=shipMethod?.custom?Math.max(0,Number(freight)||0):undefined;
  const draft:OrderRecord={id:"draft",customerId:custId,item:"",cases:0,quantity:priced.reduce((a,l)=>a+l.quantity,0),due,status:"",payment:"",lines:priced,shipMethod:ship,shipping:customShip,discount:disc};
  const t=orderTotals(draft,data);
  const limit=Math.min(data.settings.discountApproval??5,...priced.map(l=>finished.find(r=>r.item===l.item)?.discountLimit??99));
  const underFloor=priced.filter(l=>l.rate<(finished.find(r=>r.item===l.item)?.floor??0));
  const needsApproval=disc>limit||underFloor.length>0;
  const short=priced.filter(l=>{const row=data.inventory.find(i=>i.item===l.item);return row&&l.quantity>freeStock(row)});
  const setLine=(i:number,patch:Partial<OrderLine>)=>setLines(ls=>ls.map((l,k)=>k===i?{...l,...patch,...(patch.item?{rate:0}:{})}:l));
  const dueLabel=fmtDay(new Date(due+"T12:00:00"));

  const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!cust||!priced.length)return;
    if(kind==="order"){
      const id=nextId("SO-",data.orders.map(o=>o.id),1187);
      const rec:OrderRecord={id,customerId:cust.id,item:priced.map(l=>l.item).join(" + "),cases:t.cases,quantity:draft.quantity,due:dueLabel,status:needsApproval?"Needs approval":"Confirmed",payment:cust.terms,lines:priced,shipMethod:ship,shipping:t.ship,discount:disc,notes,invoiceNote:custNote,stage:0,rep:user,createdAt:new Date().toISOString()};
      const newWOs:WorkOrder[]=short.map((l,i)=>{const row=data.inventory.find(x=>x.item===l.item)!;const need=l.quantity-Math.max(0,freeStock(row));return {id:`WO-${parseInt(nextId("WO-",data.workOrders.map(w=>w.id),116).slice(3),10)+i}`,orderId:id,item:l.item,quantity:Math.ceil(need/100)*100+100,good:0,scrap:0,packed:0,date:todayIso(),status:"Needs scheduling",purpose:`${cust.name} order`,line:data.settings.lines?.[0]||"Line 1",days:1}});
      commit(v=>({...v,orders:[rec,...v.orders],workOrders:[...v.workOrders,...newWOs],
        inventory:v.inventory.map(row=>{const l=priced.find(x=>x.item===row.item);return l?{...row,committed:row.committed+l.quantity}:row}),
        customers:v.customers.map(c=>c.id===cust.id&&c.kind==="lead"?{...c,kind:"customer",stage:"Active"}:c),
        documents:fromQuote?v.documents.map(d=>d.id===fromQuote.id?{...d,status:"Accepted",orderId:id}:d):v.documents,
        notices:[{id:uid("n"),title:`New order ${id} · ${cust.name}`,detail:`${priced.map(l=>num(l.quantity)+" × "+l.item).join(" + ")} · needed ${dueLabel}${newWOs.length?" · "+newWOs.map(w=>w.id).join(", ")+" needs a slot":""}${needsApproval?" · pricing needs owner approval":""}`,urgent:newWOs.length>0||needsApproval,read:false,createdAt:now(),target:"Orders"},...v.notices],
        activities:[{id:uid("a"),customerId:cust.id,title:"Order placed",detail:`${id} · ${usd2(t.total)}`,actor:user,createdAt:now()},...v.activities]}),"order.create",`${id} for ${cust.name}`);
      notify(`Order ${id} saved — ${usd2(t.total)}${newWOs.length?` · ${newWOs.map(w=>w.id).join(", ")} created`:""}${needsApproval?" · waiting for owner approval":""}`,"Orders",needsApproval);close();openRecord(id);
    } else {
      const id=nextId(kind==="quote"?"Q-":"INV-",data.documents.filter(x=>x.kind===kind).map(x=>x.id),kind==="quote"?2040:1042);
      let qbo:{qboId?:string;docNumber?:string;customerId?:string}={};
      if(kind==="invoice"&&data.settings.quickBooks.connected){try{qbo=await qboCall({op:"invoice.create",invoice:{docNumber:id,customer:{id:cust.id,name:cust.name,contact:cust.contact,email:cust.email,phone:cust.phone,billing:cust.billing,delivery:cust.delivery,qboId:cust.qboId},lines:priced,discountPct:disc,shipping:t.ship,dueDate:due,memo:custNote,email:cust.email}}) as typeof qbo}catch(e){notify(`QuickBooks: ${e instanceof Error?e.message:"failed"} — invoice not created`,"Invoices",true);return}}
      const doc:DocumentRecord={id,kind,customerId:cust.id,item:priced.map(l=>l.item).join(" + "),cases:t.cases,quantity:draft.quantity,rate:priced[0].rate,discount:disc,shipping:t.ship,status:kind==="quote"?(needsApproval?"Awaiting approval":"Draft"):"Open",due:dueLabel,paid:0,note:custNote,qbSynced:!!qbo.qboId,qboId:qbo.qboId,qboDocNumber:qbo.docNumber};
      commit(v=>({...v,documents:[doc,...v.documents],customers:v.customers.map(c=>c.id===cust.id?{...c,stage:c.kind==="lead"&&kind==="quote"?"Quote sent":c.stage,balance:kind==="invoice"?c.balance+t.total:c.balance,qboId:qbo.customerId||c.qboId,qb:c.qb||!!qbo.qboId}:c),
        notices:needsApproval&&kind==="quote"?[{id:uid("n"),title:`Quote ${id} needs approval`,detail:`${cust.name} · ${underFloor.length?"price under the floor":disc+"% discount"}`,urgent:true,read:false,createdAt:now(),target:"Quotes"},...v.notices]:v.notices,
        activities:[{id:uid("a"),customerId:cust.id,title:kind==="quote"?"Quote created":"Invoice created",detail:`${id} · ${usd2(t.total)}`,actor:user,createdAt:now()},...v.activities]}),`${kind}.create`,`${id} for ${cust.name}`);
      notify(kind==="quote"?(needsApproval?`Quote ${id} sent to the owner for approval`:`Quote ${id} saved — open it to email`):`Invoice ${id} created${qbo.qboId?" in QuickBooks":""}`,kind==="quote"?"Quotes":"Invoices");close();
    }
  };
  const title=kind==="order"?"New customer order":kind==="quote"?"Create quote":"Create invoice";
  return <Shell wide title={title} eyebrow={kind==="order"?"Sale to shipment":"Sales document"} onSubmit={submit} close={close} submitLabel={kind==="order"?(needsApproval?"Save & send for approval":"Place order"):kind==="quote"?"Save quote":"Create invoice"}>
    <div className="form-grid"><label>Customer<select value={custId} onChange={e=>setCustId(e.target.value)}>{data.customers.map(x=><option value={x.id} key={x.id}>{x.name}{x.kind==="lead"?" (lead)":""}</option>)}</select></label><label>{kind==="invoice"?"Due date":"Needed by"}<input type="date" value={due} onChange={e=>setDue(e.target.value)}/></label></div>
    <div className="order-lines">{priced.map((l,i)=>{const r=finished.find(x=>x.item===l.item);const row=data.inventory.find(x=>x.item===l.item);const free=row?freeStock(row):0;return <div className="form-grid line-item" key={i}>
      <label>Item<select value={l.item} onChange={e=>setLine(i,{item:e.target.value})}>{finished.map(x=><option key={x.id}>{x.item}</option>)}</select></label>
      <label>Quantity <small className={l.quantity>free?"danger":"paid"}>{free>0?`${num(free)} free`:"none free"}{l.quantity>free?" · needs a run":""}</small><input type="number" min={1} value={l.quantity} onChange={e=>setLine(i,{quantity:Math.max(1,Number(e.target.value)||1)})}/></label>
      <label>Price each <small>{r?`list ${usd2(r.rate)} · floor ${usd2(r.floor??0)}`:""}{cust?.prices?.[l.item]?` · their price ${usd2(cust.prices[l.item])}`:""}</small><input type="number" step="0.05" min={0} value={l.rate} onChange={e=>setLines(ls=>ls.map((x,k)=>k===i?{...x,rate:Number(e.target.value)||0}:x))} style={r&&l.rate<(r.floor??0)?{borderColor:"#c0392b"}:undefined}/></label>
      {priced.length>1&&<button type="button" className="cancel" style={{alignSelf:"end"}} onClick={()=>setLines(ls=>ls.filter((_,k)=>k!==i))}>Remove</button>}
    </div>})}<button type="button" className="secondary" onClick={()=>setLines(ls=>[...ls,{item:finished[Math.min(ls.length,finished.length-1)]?.item||finished[0]?.item||"",quantity:50,rate:0}])}>+ Add another item</button></div>
    <div className="form-grid">
      <label>Shipping<select value={ship} onChange={e=>setShip(e.target.value)}>{ships.map(s=><option key={s.id} value={s.id}>{s.name}{s.custom?"":` — ${s.perCase?`${usd2(s.perCase)}/box`:s.rate?usd2(s.rate):"free"}`}</option>)}</select></label>{shipMethod?.custom&&<label>Freight amount for this shipment<input type="number" min={0} step="0.01" value={freight} onChange={e=>setFreight(e.target.value)} placeholder="Carrier quote, e.g. 312.00" required/></label>}
      <label>Discount % <small>{disc>limit?`over ${limit}% — owner approval`:`up to ${limit}% without approval`}</small><input type="number" min={0} max={50} value={disc} onChange={e=>setDisc(Math.max(0,Number(e.target.value)||0))}/></label>
      {kind!=="invoice"&&<label>Note for the warehouse<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Pallet, caps, pickup instructions…"/></label>}
      <label>Note on the {kind==="order"?"invoice":kind} (customer sees it)<input value={custNote} onChange={e=>setCustNote(e.target.value)} placeholder="PO number, thank-you…"/></label>
    </div>
    <div className="quote-total"><span>{num(draft.quantity)} bottles · {t.cases} boxes{disc?` · less ${disc}%`:""} · shipping {t.ship?usd2(t.ship):"free"}{short.length?` · ${short.length} item${short.length>1?"s":""} will need a production run`:""}</span><strong>{usd2(t.total)}</strong></div>
    {needsApproval&&<p className="link-warning">{underFloor.length?"A price is below the owner's floor.":`Discount is over ${limit}%.`} This will be saved and sent to Christopher for approval before it goes to the customer.</p>}
  </Shell>;
}

// =============================== WORK ORDER
export function WorkOrderModal({close,forOrder}:{close:()=>void;forOrder?:string}){
  const {data,commit,notify,openRecord}=useApp();const finished=data.itemRates.filter(r=>r.kind!=="raw");const lines=data.settings.lines||["Line 1"];
  const order=data.orders.find(o=>o.id===forOrder);
  const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const id=nextId("WO-",data.workOrders.map(w=>w.id),116);const item=String(f.get("item"));
    const wo:WorkOrder={id,orderId:order?.id,item,quantity:Number(f.get("quantity"))||0,good:0,scrap:0,packed:0,date:String(f.get("date")),status:"Scheduled",purpose:order?`${data.customers.find(c=>c.id===order.customerId)?.name} order`:String(f.get("purpose")||"Build stock"),line:String(f.get("line")),days:Number(f.get("days"))||1};
    commit(v=>({...v,workOrders:[...v.workOrders,wo],orders:order?v.orders.map(o=>o.id===order.id&&(o.stage??0)<1?{...o,stage:1,status:"In production"}:o):v.orders}),"workorder.create",`${id} scheduled`);notify(`Work order created — ${id} on ${wo.line}`,"Work orders");close();openRecord(id)};
  return <Shell title={order?`Work order for ${order.id}`:"Create work order"} eyebrow="Production" onSubmit={submit} close={close} submitLabel="Create & schedule"><div className="form-grid">
    {!order&&<label>Purpose<select name="purpose"><option>Build stock</option><option>Customer order</option><option>Samples / trial</option></select></label>}
    <label>Bottle<select name="item" defaultValue={order?order.lines?.[0]?.item:undefined}>{finished.map(x=><option key={x.id}>{x.item}</option>)}</select></label>
    <label>Quantity<input name="quantity" type="number" defaultValue={order?order.quantity:500} min="1"/></label>
    <label>Line<select name="line">{lines.map(l=><option key={l}>{l}</option>)}</select></label>
    <label>Start<input name="date" type="date" defaultValue={todayIso()}/></label>
    <label>Days<input name="days" type="number" min="1" defaultValue="1"/></label>
  </div></Shell>;
}

// =============================== ITEM RATE
export function RateModal({close,editId}:{close:()=>void;editId?:string}){
  const {data,commit,notify}=useApp();const r=data.itemRates.find(x=>x.id===editId);
  const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const item=String(f.get("item"));const rec={id:r?.id||uid("i"),item,sub:String(f.get("sub")||""),rate:Number(f.get("rate")),floor:Number(f.get("floor")),minimum:Number(f.get("minimum")),discountLimit:Number(f.get("limit")),unitsPerCase:Number(f.get("upc"))||2,kind:"finished" as const,cost:Number(f.get("cost"))||0,material:String(f.get("material")||""),qcChecks:r?.qcChecks||DEFAULT_QC};
    commit(v=>({...v,itemRates:r?v.itemRates.map(x=>x.id===r.id?{...x,...rec}:x):[...v.itemRates,rec],inventory:r||v.inventory.some(i=>i.item===item)?v.inventory:[...v.inventory,{id:uid("s"),item,kind:"finished" as const,onHand:0,committed:0,reorder:100,cost:rec.cost,unit:"bottles"}]}),r?"rate.update":"rate.create",`${item} rate saved`);notify(`Item rate saved — ${item}`,"Item rates");close()};
  const raws=data.inventory.filter(i=>i.kind==="raw");
  return <Shell title={r?`Edit ${r.item}`:"Set item rate"} eyebrow="Owner controlled pricing" onSubmit={submit} close={close} submitLabel="Save"><div className="form-grid">
    <label>Item<input name="item" defaultValue={r?.item||""} required placeholder="e.g. 5-Gallon Bottle · 2 caps"/></label><label>Description<input name="sub" defaultValue={r?.sub||""}/></label>
    <label>List price (each)<input name="rate" type="number" step="0.05" defaultValue={r?.rate??9.9}/></label><label>Floor price (each)<input name="floor" type="number" step="0.05" defaultValue={r?.floor??8.75}/></label>
    <label>Minimum order<input name="minimum" type="number" defaultValue={r?.minimum??50}/></label><label>Rep discount limit %<input name="limit" type="number" defaultValue={r?.discountLimit??5}/></label>
    <label>Units per box<input name="upc" type="number" defaultValue={r?.unitsPerCase??2}/></label><label>Unit cost<input name="cost" type="number" step="0.01" defaultValue={r?.cost??0}/></label>
    <label>Main material<select name="material" defaultValue={r?.material||""}><option value="">—</option>{raws.map(x=><option key={x.id}>{x.item}</option>)}</select></label>
  </div></Shell>;
}

// =============================== PURCHASE ORDER
export function PoModal({close,presetItem}:{close:()=>void;presetItem?:string}){
  const {data,commit,notify}=useApp();const raws=data.inventory.filter(i=>i.kind==="raw");const pre=raws.find(r=>r.item===presetItem)||raws[0];
  const [item,setItem]=useState(pre?.item||"");const row=raws.find(r=>r.item===item);
  const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const id=nextId("PO-",(data.purchaseOrders||[]).map(p=>p.id),884);const qty=Number(f.get("quantity"))||0;
    const po={id,supplier:String(f.get("supplier")),item,quantity:qty,unitCost:Number(f.get("unitCost"))||0,freight:Number(f.get("freight"))||0,duty:Number(f.get("duty"))||0,eta:fmtDay(new Date(String(f.get("eta"))+"T12:00:00")),status:"Open" as const,createdAt:now()};
    commit(v=>({...v,purchaseOrders:[po,...(v.purchaseOrders||[])],inventory:v.inventory.map(r=>r.item===item?{...r,onOrder:(r.onOrder||0)+qty,eta:po.eta,supplier:po.supplier}:r),activities:[{id:uid("a"),title:"Purchase order",detail:`${id} · ${num(qty)} ${item} from ${po.supplier}`,actor:"Owner",createdAt:now()},...v.activities]}),"purchase.create",`${id} created`);notify(`Purchase order ${id} created — ${num(qty)} ${item}`,"Purchasing");close()};
  return <Shell title="Create purchase order" eyebrow="Inbound materials" onSubmit={submit} close={close} submitLabel="Create PO"><div className="form-grid">
    <label>Material<select value={item} onChange={e=>setItem(e.target.value)}>{raws.map(r=><option key={r.id}>{r.item}</option>)}</select></label><label>Supplier<input name="supplier" defaultValue={row?.supplier||""} placeholder="Supplier name"/></label>
    <label>Quantity <small>{row?`${num(row.onHand)} on hand · reorder at ${num(row.reorder)}`:""}</small><input name="quantity" type="number" defaultValue={row?Math.max(row.reorder*2-row.onHand,row.reorder):1000} min="1"/></label><label>Unit cost<input name="unitCost" type="number" step="0.001" defaultValue={row?.cost||0}/></label>
    <label>Freight (total)<input name="freight" type="number" step="1" defaultValue="0"/></label><label>Duty (total)<input name="duty" type="number" step="1" defaultValue="0"/></label>
    <label>Expected<input name="eta" type="date" defaultValue={daysFromNow(21).toISOString().slice(0,10)}/></label>
  </div><p className="link-warning">When you mark it received, freight and duty are spread into the unit cost so landed cost is right.</p></Shell>;
}

// =============================== MAINTENANCE
export function MaintenanceModal({close}:{close:()=>void}){
  const {commit,notify}=useApp();
  const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const m={id:uid("m"),machine:String(f.get("machine")),task:String(f.get("task")),due:fmtDay(new Date(String(f.get("due"))+"T12:00:00")),status:"Scheduled" as const};
    commit(v=>({...v,maintenance:[...(v.maintenance||[]),m]}),"maintenance.create",`${m.machine} · ${m.task}`);notify(`Maintenance scheduled — ${m.machine}`,"Maintenance");close()};
  return <Shell title="Schedule maintenance" eyebrow="Equipment care" onSubmit={submit} close={close} submitLabel="Schedule"><div className="form-grid"><label>Machine<input name="machine" required placeholder="Blow molder · Line 1"/></label><label>Task<input name="task" required placeholder="Inspection, filter, calibration…"/></label><label>Due<input name="due" type="date" defaultValue={daysFromNow(7).toISOString().slice(0,10)}/></label></div></Shell>;
}

// =============================== INVENTORY ITEM / MOVEMENT
export function InventoryItemModal({close}:{close:()=>void}){
  const {commit,notify}=useApp();
  const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const row={id:uid("s"),item:String(f.get("item")),kind:String(f.get("kind")) as "finished"|"raw",onHand:Number(f.get("onHand"))||0,committed:0,reorder:Number(f.get("reorder"))||0,cost:Number(f.get("cost"))||0,unit:String(f.get("unit")||"pcs"),supplier:String(f.get("supplier")||"")};
    commit(v=>({...v,inventory:[...v.inventory,row]}),"inventory.create",`${row.item} added`);notify(`Inventory item added — ${row.item}`,"Inventory");close()};
  return <Shell title="Add inventory item" eyebrow="Materials + finished goods" onSubmit={submit} close={close} submitLabel="Add item"><div className="form-grid"><label>Item<input name="item" required/></label><label>Type<select name="kind"><option value="raw">Raw material / packaging</option><option value="finished">Finished good</option></select></label><label>On hand<input name="onHand" type="number" defaultValue="0"/></label><label>Reorder at<input name="reorder" type="number" defaultValue="100"/></label><label>Unit cost<input name="cost" type="number" step="0.001" defaultValue="0"/></label><label>Unit<input name="unit" defaultValue="pcs"/></label><label>Supplier<input name="supplier"/></label></div></Shell>;
}
export function MovementModal({close}:{close:()=>void}){
  const {data,commit,notify}=useApp();
  const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const item=String(f.get("item"));const qty=Number(f.get("qty"))||0;const dir=String(f.get("dir"));const reason=String(f.get("reason")||"");const delta=dir==="in"?qty:-qty;
    commit(v=>({...v,inventory:v.inventory.map(r=>r.item===item?{...r,onHand:Math.max(0,r.onHand+delta)}:r),activities:[{id:uid("a"),title:"Inventory movement",detail:`${item} ${delta>0?"+":""}${num(delta)}${reason?" · "+reason:""}`,actor:"Owner",createdAt:now()},...v.activities]}),"inventory.move",`${item} ${delta}`);notify(`Inventory updated — ${item} ${delta>0?"+":""}${num(delta)}`,"Inventory");close()};
  return <Shell title="Record movement" eyebrow="Count, receive, scrap or adjust" onSubmit={submit} close={close} submitLabel="Record"><div className="form-grid"><label>Item<select name="item">{data.inventory.map(r=><option key={r.id}>{r.item}</option>)}</select></label><label>Direction<select name="dir"><option value="in">Add (received / found)</option><option value="out">Remove (scrap / damaged / used)</option></select></label><label>Quantity<input name="qty" type="number" min="1" defaultValue="1"/></label><label>Reason<input name="reason" placeholder="Cycle count, damaged in transit…"/></label></div></Shell>;
}

// =============================== CRM (Chris's, kept) ================
export function CrmCreateModal({close}:{close:()=>void}){const{commit,notify,data}=useApp();const[kind,setKind]=useState<"customer"|"lead">("customer");const reps=Array.from(new Set([useApp().user,...data.customers.map(c=>c.rep)])).filter(Boolean);const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);const name=String(f.get("name")||"").trim();if(!name)return;const record:Customer={id:uid(kind[0]),name,kind,contact:String(f.get("contact")||""),email:String(f.get("email")||""),phone:String(f.get("phone")||""),rep:String(f.get("rep")||"Unassigned"),stage:kind==="lead"?"New":"Active",balance:0,lifetimeSales:0,billing:String(f.get("billing")||""),delivery:String(f.get("delivery")||""),terms:String(f.get("terms")||"Net 30"),notes:String(f.get("notes")||""),prices:{},qb:false};commit(v=>({...v,customers:[record,...v.customers],activities:[{id:uid("a"),customerId:record.id,title:`${kind==="lead"?"Lead":"Customer"} created`,detail:`${name} was added to the shared CRM`,actor:"Current user",createdAt:now()},...v.activities]}),"crm.create",`${name} added`);close();notify(`${kind==="lead"?"Lead":"Customer"} created — ${name}`,kind==="lead"?"Leads":"Customers")};return <div className="overlay crm-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><form className="modal crm-create-modal" onSubmit={submit}><button type="button" className="close" onClick={close}>×</button><p className="eyebrow">Standard CRM profile</p><h2>Add customer or lead</h2><div className="profile-type"><button type="button" className={kind==="customer"?"active":""} onClick={()=>setKind("customer")}>Customer</button><button type="button" className={kind==="lead"?"active":""} onClick={()=>setKind("lead")}>Lead</button></div><CrmSection title="Company & contact"><div className="form-grid"><label>Company name<input name="name" required placeholder="Legal company name"/></label><label>Assigned sales rep<select name="rep">{reps.map(r=><option key={r}>{r}</option>)}<option>Unassigned</option></select></label><label>Primary contact<input name="contact" placeholder="Full name"/></label><label>Email<input name="email" type="email"/></label><label>Phone<input name="phone"/></label><label>Payment terms<select name="terms"><option>Net 30</option><option>Due on receipt</option><option>Net 15</option><option>Card on pickup</option><option>Prepaid</option></select></label></div></CrmSection><CrmSection title="Addresses"><label>Billing address<input name="billing" placeholder="Street, city, state, ZIP"/></label><label>Primary delivery address<input name="delivery" placeholder="Street, dock, receiving instructions"/></label></CrmSection><CrmSection title="Internal CRM notes"><label>Notes<textarea name="notes" placeholder="Needs, preferences, next steps, and delivery instructions…"/></label></CrmSection><button className="primary full" type="submit">Create {kind} profile</button><button type="button" className="cancel" onClick={close}>Cancel</button></form></div>}

export function CsvImport({close}:{close:()=>void}){const{commit,notify}=useApp();const[fileName,setFileName]=useState("");const importFile=async(e:ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;setFileName(file.name);const text=await file.text();const lines=text.split(/\r?\n/).filter(Boolean);const headers=lines.shift()?.split(",").map(x=>x.trim().toLowerCase())||[];const records:Customer[]=lines.map((line,i)=>{const values=line.split(",").map(x=>x.trim());const get=(name:string)=>values[headers.indexOf(name)]||"";return {id:uid("c")+i,name:get("company")||get("name")||`Imported customer ${i+1}`,kind:"customer" as const,contact:get("contact"),email:get("email"),phone:get("phone"),rep:get("rep")||"Unassigned",stage:"Active",balance:0,lifetimeSales:0,billing:get("billing")||get("address"),delivery:get("delivery")||get("address"),terms:get("terms")||"Net 30",notes:"Imported from CSV",prices:{},qb:false}});commit(v=>({...v,customers:[...records,...v.customers]}),"crm.import",`${records.length} customers imported from ${file.name}`);notify(`CSV import complete — ${records.length} customers added`,"Customers");close()};return <div className="overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="modal wide-modal" role="dialog"><button type="button" className="close" onClick={close}>×</button><p className="eyebrow">Guided setup</p><h2>Import customers from CSV</h2><div className="upload-zone"><strong>Choose a CSV customer file</strong><span>Company, contact, phone, email, address</span><label className="secondary file-button">{fileName||"Choose file"}<input hidden type="file" accept=".csv,text/csv" onChange={importFile}/></label></div><button type="button" className="cancel" onClick={close}>Cancel</button></div></div>}

export function ModalHost({modal,arg,close}:{modal:Modal;arg?:string;close:()=>void}){
  const {data}=useApp();
  if(!modal)return null;
  if(modal==="lead")return <CrmCreateModal close={close}/>;
  if(modal==="import")return <CsvImport close={close}/>;
  if(modal==="order"){const q=data.documents.find(d=>d.id===arg&&d.kind==="quote");return <OrderModal kind="order" close={close} presetCustomer={q?undefined:arg} fromQuote={q}/>}
  if(modal==="quote"||modal==="invoice")return <OrderModal kind={modal} close={close} presetCustomer={arg}/>;
  if(modal==="workorder")return <WorkOrderModal close={close} forOrder={arg}/>;
  if(modal==="rate")return <RateModal close={close} editId={arg}/>;
  if(modal==="po")return <PoModal close={close} presetItem={arg}/>;
  if(modal==="maintenance")return <MaintenanceModal close={close}/>;
  if(modal==="inventory")return <InventoryItemModal close={close}/>;
  if(modal==="movement")return <MovementModal close={close}/>;
  return null;
}
