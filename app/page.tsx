"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { normalize, seedData, type AppData } from "./app-data";
import { AppContext, Toast, type AppContextValue, type Modal, type Role } from "./components/store";
import { SalesView, salesNav } from "./components/sales";
import { OwnerView, ownerGroups } from "./components/owner";
import { FloorView, floorNav } from "./components/floor";
import { ModalHost } from "./components/modals";
import { CustomerProfileDrawer, NotificationCenter, RecordDrawer } from "./components/drawers";

const initialRole=():Role=>{if(typeof window==="undefined")return "sales";const h=window.location.hash;return h==="#warehouse"?"floor":h==="#owner"?"owner":"sales"};

export default function Home(){
  const[data,setData]=useState<AppData>(()=>normalize(seedData));
  const[loaded,setLoaded]=useState(false);
  const[roleState,setRole]=useState<Role>(initialRole);
  const[navState,setNav]=useState(()=>{const r=initialRole();return r==="floor"?"Production":r==="owner"?"Control center":"Dashboard"});
  const[modal,setModalState]=useState<{type:Modal;arg?:string}>({type:null});
  const[toast,setToast]=useState("");
  const[notificationsOpen,setNotificationsOpen]=useState(false);
  const[record,setRecord]=useState("");
  const[customerId,setCustomerId]=useState("");
  const[line,setLine]=useState("");
  // Dates, clocks and the URL hash differ between server and browser, so the workspace renders after mount.
  const mounted=useSyncExternalStore(()=>()=>{},()=>true,()=>false);
  const role:Role=mounted?roleState:"sales";const nav=mounted?navState:"Dashboard";
  const[floorKey]=useState(()=>typeof window==="undefined"?null:(window.location.hash==="#warehouse"?new URLSearchParams(window.location.search).get("floor"):null));

  useEffect(()=>{fetch("/api/state").then(r=>r.ok?r.json():Promise.reject()).then(x=>setData(normalize(x.data))).catch(()=>setToast("Working offline — changes will retry")).finally(()=>setLoaded(true))},[]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(""),3200);return()=>clearTimeout(t)},[toast]);
  // The warehouse link carries ?floor=<key>; a tablet that opened with a stale key is turned away once records load.
  const floorKeyOk=!loaded||floorKey===null||floorKey===data.settings.warehouseToken;

  const commit=useCallback<AppContextValue["commit"]>((next,action="update",summary="Company data updated")=>{setData(current=>{const resolved=normalize(next(current));fetch("/api/state",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({data:resolved,action,summary,actor:role})}).catch(()=>setToast("Could not save yet — please try again"));return resolved})},[role]);
  const notify=useCallback((text:string,target="Control center",urgent=false)=>{setToast(text);commit(current=>({...current,notices:[{id:`n${Date.now()}`,title:text.split(" — ")[0],detail:text,urgent,read:false,createdAt:"Today · "+new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),target},...current.notices].slice(0,200)}),"notification",text)},[commit]);
  const changeRole=(next:Role)=>{setRole(next);setNav(next==="sales"?"Dashboard":next==="owner"?"Control center":"Production");history.replaceState(null,"",`#${next==="floor"?"warehouse":next==="owner"?"owner":"sales"}`)};
  const setModal=(type:Modal,arg?:string)=>setModalState({type,arg});
  const user=role==="owner"?data.settings.ownerName.split(" ")[0]:role==="sales"?(data.roles.find(r=>/sales/i.test(r.name))?.members[0]||"Sales"):(data.roles.find(r=>/warehouse|floor/i.test(r.name))?.members[0]||"Warehouse");
  const goNav=(v:string)=>{setNav(v);window.scrollTo(0,0)};
  const context:AppContextValue={data,commit,setNav:goNav,setModal,openRecord:setRecord,openCustomer:setCustomerId,notify,role,user};
  const unread=data.notices.filter(n=>!n.read).length;
  const customer=data.customers.find(c=>c.id===customerId);
  const currentLine=line||(data.settings.lines||["Line 1"])[0];

  if(!floorKeyOk)return <main className="floor-shell"><div className="floor-heading" style={{padding:40}}><div><p className="eyebrow">Warehouse floor</p><h1>This link is no longer valid</h1><p>The warehouse key was rotated. Ask the owner for the new link (Settings &amp; access → Copy warehouse link).</p></div></div></main>;

  return <AppContext.Provider value={context}><>
    <main className={role==="floor"?"floor-shell":"app-shell"}>
      <header className={role==="floor"?"floor-top":"topbar"}><div className="logo">Make<span>Logic</span></div><nav className="rolebar" aria-label="Preview role">{(["sales","owner","floor"] as Role[]).map(r=><button key={r} onClick={()=>changeRole(r)} className={role===r?"active":""}>{r==="sales"?"Sales Rep":r==="owner"?"Owner":"Warehouse"}</button>)}</nav><button className="notification-button" aria-label={`${unread} unread notifications`} onClick={()=>setNotificationsOpen(v=>!v)}><span>♢</span>{unread>0&&<b>{unread}</b>}</button><button className="avatar" aria-label="Open my account" onClick={()=>goNav(role==="owner"?"Settings & access":"My account")}>{user.slice(0,2).toUpperCase()}</button></header>
      <div className={role==="floor"?"floor-app":"app-layout"}>
        <SideNav role={role} nav={nav} setNav={goNav}/>
        <section className={role==="floor"?"floor-workspace":"workspace"}>
          {!mounted?<p className="intro">Loading company records…</p>:role==="sales"?<SalesView nav={nav}/>:role==="owner"?<OwnerView nav={nav}/>:nav==="My account"?<SalesViewAccount/>:<FloorView nav={nav} line={currentLine} setLine={setLine}/>}
        </section>
      </div>
    </main>
    {!loaded&&<div className="save-indicator">Loading company records…</div>}
    <ModalHost modal={modal.type} arg={modal.arg} close={()=>setModalState({type:null})}/>
    {notificationsOpen&&<NotificationCenter role={role} unread={unread} close={()=>setNotificationsOpen(false)} markRead={()=>commit(v=>({...v,notices:v.notices.map(n=>({...n,read:true}))}),"notifications","All notifications marked read")}/>}
    {customer&&<CustomerProfileDrawer customer={customer} close={()=>setCustomerId("")}/>}
    {record&&<RecordDrawer id={record} close={()=>setRecord("")}/>}
    {toast&&<Toast text={toast}/>}
  </></AppContext.Provider>;
}

function SalesViewAccount(){return <SalesView nav="My account"/>}

function SideNav({role,nav,setNav}:{role:Role;nav:string;setNav:(v:string)=>void}){
  if(role==="owner")return <aside className="sidebar owner-sidebar"><small>OWNER WORKSPACE</small><button onClick={()=>setNav("Control center")} className={`owner-home ${nav==="Control center"?"selected":""}`}><span>⌂</span>Control center</button><div className="owner-nav-groups">{ownerGroups.map((group,index)=>{const active=group.items.includes(nav);return <details key={group.label} open={active||index===0}><summary><span>{group.label}</span><i>⌄</i></summary><div>{group.items.map(item=><button key={item} onClick={()=>setNav(item)} className={nav===item?"selected":""}>{item}</button>)}</div></details>})}</div></aside>;
  const items=role==="sales"?salesNav:floorNav;
  return <aside className={role==="floor"?"floor-side":"sidebar"}><small>{role==="sales"?"SALES WORKSPACE":"WAREHOUSE FLOOR"}</small>{items.map(x=><button key={x} onClick={()=>setNav(x)} className={nav===x?"selected":""}>{x}</button>)}</aside>;
}
