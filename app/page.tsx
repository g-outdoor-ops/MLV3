"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { normalize, seedData, type AppData } from "./app-data";
import { AppContext, Toast, type AppContextValue, type Modal, type Role } from "./components/store";
import { SalesView, salesNav } from "./components/sales";
import { OwnerView, ownerGroups } from "./components/owner";
import { FloorView, floorNav } from "./components/floor";
import { ModalHost } from "./components/modals";
import { CustomerProfileDrawer, NotificationCenter, RecordDrawer } from "./components/drawers";
import { SignIn, authCall, type AuthUser } from "./components/auth";

export default function Home(){
  const mounted=useSyncExternalStore(()=>()=>{},()=>true,()=>false);
  const[auth,setAuth]=useState<{user:AuthUser|null;needsSetup:boolean;checked:boolean}>({user:null,needsSetup:false,checked:false});
  const[data,setData]=useState<AppData>(()=>normalize(seedData));
  const[loaded,setLoaded]=useState(false);
  // The company-record version this client last saw. Sent with every save so the server can reject a
  // write built on stale data rather than letting it clobber whoever saved first.
  const versionRef=useRef(0);
  const[nav,setNav]=useState("");
  const[modal,setModalState]=useState<{type:Modal;arg?:string}>({type:null});
  const[toast,setToast]=useState("");
  const[notificationsOpen,setNotificationsOpen]=useState(false);
  const[record,setRecord]=useState("");
  const[customerId,setCustomerId]=useState("");
  const[line,setLine]=useState("");

  useEffect(()=>{fetch("/api/auth").then(r=>r.json()).then(j=>setAuth({user:j.user||null,needsSetup:!!j.needsSetup,checked:true})).catch(()=>setAuth({user:null,needsSetup:false,checked:true}))},[]);
  useEffect(()=>{if(!auth.user)return;let live=true;Promise.resolve().then(()=>{if(live)setLoaded(false)});fetch("/api/state").then(r=>r.ok?r.json():Promise.reject()).then(x=>{setData(normalize(x.data));versionRef.current=Number(x.version)||0}).catch(()=>setToast("Working offline — changes will retry")).finally(()=>{if(live)setLoaded(true)});
    const m=new URLSearchParams(window.location.search).get("qbo");if(m){Promise.resolve().then(()=>{if(live)setToast(m==="connected"?"QuickBooks connected":`QuickBooks: ${m}`)});history.replaceState(null,"",window.location.pathname+window.location.hash)}return()=>{live=false}},[auth.user]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(""),3600);return()=>clearTimeout(t)},[toast]);

  const role:Role=auth.user?.role||"sales";
  const home=role==="owner"?"Control center":role==="floor"?"Production":"Dashboard";
  const currentNav=nav||home;
  // Every save carries the version this client loaded. If someone else saved in the meantime the
  // server rejects it with 409 rather than letting the last writer silently erase the other's work.
  // On a conflict the only honest thing to do is reload: this client is holding a whole stale copy of
  // the company record, so retrying would just overwrite the newer data with the same old blob.
  const commit=useCallback<AppContextValue["commit"]>((next,action="update",summary="Company data updated")=>{setData(current=>{const resolved=normalize(next(current));
    fetch("/api/state",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({data:resolved,action,summary,version:versionRef.current})})
      .then(async r=>{
        if(r.status===401){setToast("Your session ended — please sign in again");setAuth(a=>({...a,user:null}));return}
        if(r.status===409){
          const c=await r.json().catch(()=>({})) as {updatedBy?:string};
          const who=(c.updatedBy||"Someone else").replace(/\s*<[^>]*>/,"");
          setToast(`${who} saved changes while you were working — reloading so you don't overwrite them`);
          if(typeof window!=="undefined")setTimeout(()=>window.location.reload(),2200);
          return;
        }
        if(!r.ok){setToast("Could not save yet — please try again");return}
        const ok=await r.json().catch(()=>({})) as {version?:number};
        if(ok.version)versionRef.current=ok.version;   // keep in step for the next save
      })
      .catch(()=>setToast("Could not save yet — please try again"));
    return resolved})},[]);
  const notify=useCallback((text:string,target="Control center",urgent=false)=>{setToast(text);commit(current=>({...current,notices:[{id:`n${Date.now()}`,title:text.split(" — ")[0],detail:text,urgent,read:false,createdAt:"Today · "+new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),target},...current.notices].slice(0,200)}),"notification",text)},[commit]);
  const setModal=(type:Modal,arg?:string)=>setModalState({type,arg});
  const goNav=(v:string)=>{setNav(v);window.scrollTo(0,0)};
  const signOut=async()=>{try{await authCall({op:"logout"})}catch{/* already out */}setAuth(a=>({...a,user:null}));setNav("");setData(normalize(seedData))};
  const user=auth.user?.name||"";
  const context:AppContextValue={data,commit,setNav:goNav,setModal,openRecord:setRecord,openCustomer:setCustomerId,notify,role,user,authUser:auth.user,signOut};
  const unread=data.notices.filter(n=>!n.read).length;
  const customer=data.customers.find(c=>c.id===customerId);
  const currentLine=line||(data.settings.lines||["Line 1"])[0];

  if(!mounted||!auth.checked)return <main className="app-shell"><header className="topbar"><div className="logo">Make<span>Logic</span></div></header><p className="intro" style={{padding:40}}>Loading…</p></main>;
  if(!auth.user)return <SignIn needsSetup={auth.needsSetup} onDone={u=>{setAuth({user:u,needsSetup:false,checked:true});setNav("")}}/>;

  return <AppContext.Provider value={context}><>
    <main className={role==="floor"?"floor-shell":"app-shell"}>
      <header className={role==="floor"?"floor-top":"topbar"}><div className="logo">Make<span>Logic</span></div><span className="company-chip">{data.settings.company||""}</span><div className="topbar-right"><button className="notification-button" aria-label={`${unread} unread notifications`} onClick={()=>setNotificationsOpen(v=>!v)}><span>♢</span>{unread>0&&<b>{unread}</b>}</button><button className="avatar" aria-label="Open my account" title={`${auth.user.name} · ${auth.user.role}`} onClick={()=>goNav("My account")}>{user.split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase()}</button></div></header>
      <div className={role==="floor"?"floor-app":"app-layout"}>
        <SideNav role={role} nav={currentNav} setNav={goNav}/>
        <section className={role==="floor"?"floor-workspace":"workspace"}>
          {!loaded?<p className="intro">Loading company records…</p>:currentNav==="My account"?<SalesView nav="My account"/>:role==="sales"?<SalesView nav={currentNav}/>:role==="owner"?<OwnerView nav={currentNav}/>:<FloorView nav={currentNav} line={currentLine} setLine={setLine}/>}
        </section>
      </div>
    </main>
    <ModalHost modal={modal.type} arg={modal.arg} close={()=>setModalState({type:null})}/>
    {notificationsOpen&&<NotificationCenter role={role} unread={unread} close={()=>setNotificationsOpen(false)} markRead={()=>commit(v=>({...v,notices:v.notices.map(n=>({...n,read:true}))}),"notifications","All notifications marked read")}/>}
    {customer&&<CustomerProfileDrawer customer={customer} close={()=>setCustomerId("")}/>}
    {record&&<RecordDrawer id={record} close={()=>setRecord("")}/>}
    {toast&&<Toast text={toast}/>}
  </></AppContext.Provider>;
}

function SideNav({role,nav,setNav}:{role:Role;nav:string;setNav:(v:string)=>void}){
  if(role==="owner")return <aside className="sidebar owner-sidebar"><small>OWNER WORKSPACE</small><button onClick={()=>setNav("Control center")} className={`owner-home ${nav==="Control center"?"selected":""}`}><span>⌂</span>Control center</button><div className="owner-nav-groups">{ownerGroups.map((group,index)=>{const active=group.items.includes(nav);return <details key={group.label} open={active||index===0}><summary><span>{group.label}</span><i>⌄</i></summary><div>{group.items.map(item=><button key={item} onClick={()=>setNav(item)} className={nav===item?"selected":""}>{item}</button>)}</div></details>})}<button onClick={()=>setNav("My account")} className={nav==="My account"?"selected":""} style={{marginTop:10}}>My account</button></div></aside>;
  const items=role==="sales"?salesNav:floorNav;
  return <aside className={role==="floor"?"floor-side":"sidebar"}><small>{role==="sales"?"SALES WORKSPACE":"WAREHOUSE FLOOR"}</small>{items.map(x=><button key={x} onClick={()=>setNav(x)} className={nav===x?"selected":""}>{x}</button>)}</aside>;
}
