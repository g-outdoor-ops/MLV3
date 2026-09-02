"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { AppData } from "../app-data";

export type Role="sales"|"owner"|"floor";
export type Modal="quote"|"invoice"|"order"|"lead"|"import"|"workorder"|"rate"|"po"|"maintenance"|"inventory"|"movement"|null;
export type AppContextValue={
  data:AppData;
  commit:(next:(current:AppData)=>AppData,action?:string,summary?:string)=>void;
  setNav:(v:string)=>void;
  setModal:(v:Modal,arg?:string)=>void;
  openRecord:(id:string)=>void;
  openCustomer:(id:string)=>void;
  notify:(text:string,target?:string,urgent?:boolean)=>void;
  role:Role;
  user:string;
};
export const AppContext=createContext<AppContextValue|null>(null);
export const useApp=()=>{const v=useContext(AppContext);if(!v)throw new Error("MakeLogic data context unavailable");return v};

export const uid=(p:string)=>`${p}${Date.now().toString(36)}${Math.floor(Math.random()*1e3)}`;
export const nextId=(prefix:string,ids:string[],start:number)=>{const n=ids.map(i=>parseInt(i.replace(/\D/g,""),10)).filter(x=>!isNaN(x));return `${prefix}${(n.length?Math.max(...n):start-1)+1}`};
export const now=()=>"Today · "+new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
export const usd=(n:number)=>"$"+Math.round(n).toLocaleString("en-US");
export const usd2=(n:number)=>"$"+n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
export const num=(n:number)=>Math.round(n).toLocaleString("en-US");
export const initials=(s:string)=>s.split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase();

// ---- Chris's shared row/tile components, unchanged in look ----
export function Kpi({label,value,note,warn}:{label:string;value:string;note?:string;warn?:boolean}){return <article className={`kpi ${warn?"warn":""}`}><span>{label}</span><strong>{value}</strong>{note&&<small>{note}</small>}</article>}
export function MoneyRow({customer,amount,detail,danger,good,onClick}:{customer:string;amount:string;detail:string;danger?:boolean;good?:boolean;onClick?:()=>void}){return <button className="money-row" onClick={onClick} style={{width:"100%",textAlign:"left",background:"none",border:0,padding:0,cursor:onClick?"pointer":"default"}}><span><b>{customer}</b><small>{detail}</small></span><strong className={danger?"danger":good?"paid":""}>{amount}</strong></button>}
export function MiniRow({title,detail,status,onClick}:{title:string;detail:string;status:string;onClick?:()=>void}){return <button className="mini-row" onClick={onClick}><span><b>{title}</b><small>{detail}</small></span><em>{status}</em></button>}
export function OpsRow({cells,alert,onClick}:{cells:string[];alert?:boolean;onClick?:()=>void}){return <button className={alert?"alert":""} onClick={onClick}>{cells.map((x,i)=><span key={i} className={i===4?(alert?"danger":"paid"):""}>{x}</span>)}</button>}
export function CheckRow({title,detail,status,alert,onClick}:{title:string;detail:string;status:string;alert?:boolean;onClick?:()=>void}){return <button className="check-row" onClick={onClick}><span><b>{title}</b><small>{detail}</small></span><em className={alert?"alert":""}>{status}</em></button>}
export function Fact({value,label}:{value:string;label:string}){return <div className="fact"><strong>{value}</strong><span>{label}</span></div>}
export function Decision({n,name,detail,action,onClick}:{n:string;name:string;detail:string;action?:string;onClick?:()=>void}){return <button className="order" onClick={onClick}><span className="initials">{n}</span><span><b>{name}</b><small>{detail}</small></span><em>{action||"Review"}</em></button>}
export function StatusLine({label,detail,state,alert,onClick}:{label:string;detail:string;state:string;alert?:boolean;onClick?:()=>void}){return <button className="status-line" onClick={onClick}><span><b>{label}</b><small>{detail}</small></span><em className={alert?"alert":""}>{state}</em></button>}
export function ControlMetric({label,value,danger,onClick}:{label:string;value:string;danger?:boolean;onClick?:()=>void}){return <button className="control-metric" onClick={onClick}><span>{label}</span><strong className={danger?"danger":""}>{value}</strong></button>}
export function DetailField({label,value}:{label:string;value:ReactNode}){return <div className="detail-field"><span>{label}</span><b>{value}</b></div>}
export function ProfileSection({title,rows}:{title:string;rows:string[][]}){return <section className="profile-section"><h3>{title}</h3>{rows.map(([label,value])=><div key={label}><span>{label}</span><b>{value}</b></div>)}</section>}
export function CrmSection({title,children}:{title:string;children:ReactNode}){return <section className="crm-section"><h3>{title}</h3>{children}</section>}
export function ReportCard({title,detail,value,onClick}:{title:string;detail:string;value:string;onClick?:()=>void}){return <button className="report-card" onClick={onClick}><span>▤</span><b>{title}</b><p>{detail}</p><strong>{value}</strong><em>Open report →</em></button>}
export function PlRow({label,amount,total,grand}:{label:string;amount:string;total?:boolean;grand?:boolean}){return <div className={`pl-row ${total?"total":""} ${grand?"grand":""}`}><span>{label}</span><strong>{amount}</strong></div>}
export function SyncToggle({label,detail,checked,change}:{label:string;detail:string;checked:boolean;change:()=>void}){return <div className="sync-toggle"><span><b>{label}</b><small>{detail}</small></span><button onClick={change} className={checked?"on":""} aria-pressed={checked}><i/></button></div>}
export function SettingRow({label,value,onClick}:{label:string;value:string;onClick?:()=>void}){return <button className="setting-row" onClick={onClick}><span>{label}</span><b>{value} ›</b></button>}
export function Toast({text}:{text:string}){return <div className="toast">✓ {text}</div>}
export function downloadCsv(name:string,rows:(string|number)[][]){const csv=rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));const a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}
