"use client";
import { useCallback, useEffect, useState } from "react";
import { normalize, seedData, type AppData } from "./app-data";
import { Icon, StoreProvider, type Role, type Store } from "./components/ui";
import { Customers, OrderDetail, OrderWizard, SalesHome, StockCheck } from "./components/sales";
import { Inventory, MODS, Money, OrdersBoard, OwnerToday, Quality, Schedule, Settings, WorkOrders, ownerCounts } from "./components/owner";
import { FloorApp } from "./components/floor";

// Routes live in the URL hash so refresh, back and bookmarks all work:
//   #sales · #sales/order · #sales/order/<customerId> · #sales/quote · #sales/so/<id> · #sales/stock · #sales/customers/<id>
//   #owner/<today|orders|wo|sched|inv|qc|money|settings> · #owner/so/<id> · #owner/wo/<id> · #owner/qc/<id>
//   #warehouse · #warehouse/pack · #warehouse/line/<Line>
const readHash=()=>typeof window==="undefined"?"":decodeURIComponent(window.location.hash.replace(/^#\/?/,""));
const roleOf=(h:string):Role=>h.startsWith("owner")?"owner":h.startsWith("warehouse")?"floor":"sales";

export default function Home(){
  const [data,setData]=useState<AppData>(()=>normalize(seedData));
  const [loaded,setLoaded]=useState(false);
  const [hash,setHash]=useState("");
  const [toast,setToast]=useState<{text:string;undo?:()=>void}|null>(null);
  const [bell,setBell]=useState(false);
  useEffect(()=>{const sync=()=>setHash(readHash()||"sales");sync();window.addEventListener("hashchange",sync);return()=>window.removeEventListener("hashchange",sync)},[]);
  useEffect(()=>{fetch("/api/state").then(r=>r.ok?r.json():Promise.reject()).then(x=>setData(normalize(x.data))).catch(()=>setToast({text:"Working offline — changes will retry"})).finally(()=>setLoaded(true))},[]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(null),6500);return()=>clearTimeout(t)},[toast]);
  const role=roleOf(hash);
  useEffect(()=>{document.body.classList.toggle("floor",role==="floor")},[role]);
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==="Escape")setBell(false)};window.addEventListener("keydown",k);return()=>window.removeEventListener("keydown",k)},[]);

  const commit=useCallback<Store["commit"]>((next,action="update",summary="Company data updated")=>{setData(current=>{const resolved=normalize(next(current));fetch("/api/state",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({data:resolved,action,summary,actor:roleOf(readHash())})}).catch(()=>setToast({text:"Could not save yet — please try again"}));return resolved})},[]);
  const go=useCallback((h:string)=>{window.location.hash=h;window.scrollTo(0,0)},[]);
  const user=role==="owner"?(data.settings.ownerName.split(" ")[0]||"Owner"):role==="sales"?(data.roles.find(r=>/sales/i.test(r.name))?.members[0]||"Sales"):(data.roles.find(r=>/warehouse|floor/i.test(r.name))?.members[0]||"Floor");
  const store:Store={data,commit,toast:(text,undo)=>setToast({text,undo}),go,role,user};
  const unread=data.notices.filter(n=>!n.read).length;
  const seg=hash.split("/");

  let view:React.ReactNode;let title="";
  if(role==="floor"){const line=seg[1]==="line"?seg[2]:(data.settings.lines||["Line 1"])[0];view=<FloorApp tab={seg[1]==="pack"?"pack":"production"} line={line}/>}
  else if(role==="owner"){
    const mod=seg[1]||"today";
    const body=mod==="so"?<OrderDetail id={seg[2]}/>:mod==="orders"?<OrdersBoard/>:mod==="wo"?<WorkOrders selected={seg[2]}/>:mod==="sched"?<Schedule/>:mod==="inv"?<Inventory/>:mod==="qc"?<Quality selected={seg[2]}/>:mod==="money"?<Money/>:mod==="settings"?<Settings/>:<OwnerToday/>;
    const counts=ownerCounts(data);
    view=<>{mod!=="so"&&<nav className="modnav">{MODS.map(m=><button key={m[0]} className={mod===m[0]?"on":""} onClick={()=>go(`owner/${m[0]}`)}><Icon name={m[2]} size={18}/>{m[1]}{counts[m[0]]?<span className="cnt">{counts[m[0]]}</span>:null}</button>)}</nav>}{mod==="so"?body:<main>{body}</main>}</>;
    title=mod==="so"?`Order ${seg[2]}`:"";
  } else {
    const mod=seg[1]||"home";
    view=mod==="order"?<OrderWizard mode="order" presetCustomer={seg[2]}/>:mod==="quote"?<OrderWizard mode="quote" presetCustomer={seg[2]}/>:mod==="so"?<OrderDetail id={seg[2]}/>:mod==="stock"?<StockCheck/>:mod==="customers"?<Customers selected={seg[2]}/>:<SalesHome name={user}/>;
    title=mod==="order"?"New order":mod==="quote"?"New quote":mod==="so"?`Order ${seg[2]}`:mod==="stock"?"Check Stock":mod==="customers"?"Customers":"";
  }
  const home=role==="owner"?"owner/today":role==="floor"?"warehouse":"sales";
  const atHome=role==="floor"||(role==="owner"&&!(seg[1]==="so"||(seg[1]==="wo"&&seg[2])||(seg[1]==="qc"&&seg[2])))||hash===""||hash==="sales";

  return <StoreProvider value={store}>
    <header className={role==="floor"?"floor-top":"top"}>
      {atHome?<div className="logo">Make<span>Logic</span></div>:<button className="home-btn" onClick={()=>go(seg[1]==="so"&&role==="owner"?"owner/orders":seg[1]==="wo"?"owner/wo":seg[1]==="qc"?"owner/qc":home)}><Icon name="back" size={22}/> {role==="owner"?"Back":"Home"}</button>}
      <div className="title" style={{flex:1,textAlign:"center",fontWeight:600,fontSize:20}}>{title}</div>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <nav className="rolebar" aria-label="Who is using this">{(["sales","owner","floor"] as Role[]).map(r=><button key={r} className={role===r?"active":""} onClick={()=>go(r==="sales"?"sales":r==="owner"?"owner/today":"warehouse")}>{r==="sales"?"Sales":r==="owner"?"Owner":"Floor"}</button>)}</nav>
        {role!=="floor"&&<button className="icon-btn badge" aria-label={`${unread} unread notifications`} onClick={()=>setBell(true)}><Icon name="bell" size={20}/>{unread>0&&<b>{unread}</b>}</button>}
      </div>
    </header>
    {view}
    {!loaded&&<div className="save-indicator">Loading company records…</div>}
    {bell&&<div className="drawer" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setBell(false)}}><section role="dialog" aria-label="Notifications"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2>What happened</h2><button className="btn link" onClick={()=>{commit(v=>({...v,notices:v.notices.map(n=>({...n,read:true}))}),"notifications","All read");}}>Mark all read</button></div><div className="card">{data.notices.slice(0,30).map(n=><button key={n.id} className={`li ${n.read?"":"unread"}`} style={{width:"100%",textAlign:"left"}} onClick={()=>{commit(v=>({...v,notices:v.notices.map(x=>x.id===n.id?{...x,read:true}:x)}),"notification.read",n.title);setBell(false);const t=n.target.toLowerCase();go(role==="owner"?(t.includes("order")?"owner/orders":t.includes("work")?"owner/wo":t.includes("quality")?"owner/qc":t.includes("money")||t.includes("invoice")?"owner/money":"owner/today"):"sales")}}><span className={`dot ${n.urgent?"warn":""}`}></span><div><b>{n.title}</b><div className="s">{n.detail}</div><div className="s" style={{fontSize:14}}>{n.createdAt}</div></div></button>)}{!data.notices.length&&<div className="empty">Nothing yet.</div>}</div><button className="btn sec" onClick={()=>setBell(false)}>Close</button></section></div>}
    <div className={`toast ${toast?"show":""}`} role="status">{toast?.text}{toast?.undo&&<button onClick={()=>{toast.undo?.();setToast(null)}}>Undo</button>}</div>
  </StoreProvider>;
}
