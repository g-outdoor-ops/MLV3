"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { AppData } from "../app-data";

// ---- icons: one stroke set, recolor with currentColor ----
const PATHS:Record<string,string>={
  plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>',
  box:'<path d="M3 8l9-4 9 4v8l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v8"/>',
  people:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5a5 5 0 0 1 6 5.5"/>',
  tag:'<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="8" cy="8" r="1.5"/>', back:'<path d="M15 5l-7 7 7 7"/>', check:'<path d="M5 12l5 5 9-10"/>',
  search:'<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
  phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  truck:'<path d="M2 7h11v9H2zM13 10h5l3 3v3h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', doc:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  dollar:'<path d="M12 2v20M17 6.5C17 4.5 14.8 3.5 12 3.5S7 4.5 7 6.5 9 9.5 12 9.5s5 1 5 3.5-2.2 3.5-5 3.5-5-1-5-3"/>',
  pause:'<path d="M8 5v14M16 5v14"/>', play:'<path d="M7 4l12 8-12 8z"/>', link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>', gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
};
export function Icon({name,size=24}:{name:string;size?:number}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{__html:PATHS[name]||""}}/>}

export type Tone=""|"warn"|"bad"|"mute"|"ok";
export const Pill=({tone="",children}:{tone?:Tone;children:ReactNode})=><span className={`pill ${tone==="ok"?"":tone}`}>{children}</span>;
export const Note=({tone="",icon,big,children}:{tone?:Tone;icon?:string;big?:ReactNode;children?:ReactNode})=><div className={`note ${tone==="ok"?"":tone}`}>{icon&&<Icon name={icon} size={26}/>}<div>{big&&<div className="big">{big}</div>}{children&&<div className="txt">{children}</div>}</div></div>;
export const Stat=({k,v,s}:{k:string;v:ReactNode;s?:ReactNode})=><div className="stat"><div className="k">{k}</div><div className="v">{v}</div>{s&&<div className="s">{s}</div>}</div>;

// ---- app store: one document, one commit function, optimistic UI, persisted through /api/state ----
export type Role="sales"|"owner"|"floor";
export type Store={data:AppData;commit:(next:(current:AppData)=>AppData,action?:string,summary?:string)=>void;toast:(text:string,undo?:()=>void)=>void;go:(hash:string)=>void;role:Role;user:string};
const Ctx=createContext<Store|null>(null);
export const StoreProvider=Ctx.Provider;
export function useStore(){const v=useContext(Ctx);if(!v)throw new Error("store unavailable");return v}
export const nowLabel=()=>"Today · "+new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
export const uid=(p:string)=>`${p}${Date.now().toString(36)}${Math.floor(Math.random()*1e3)}`;
export const nextId=(prefix:string,ids:string[],start:number)=>{const n=ids.map(i=>parseInt(i.replace(/\D/g,""),10)).filter(x=>!isNaN(x));return `${prefix}${(n.length?Math.max(...n):start-1)+1}`};
