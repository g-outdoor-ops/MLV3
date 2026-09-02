"use client";
import { useState, type FormEvent } from "react";

export type AuthUser={id:string;email:string;name:string;role:"owner"|"sales"|"floor";active:boolean;createdAt:string};
export async function authCall(body:Record<string,unknown>){const r=await fetch("/api/auth",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"Request failed");return j as Record<string,unknown>}
export async function qboCall(body:Record<string,unknown>){const r=await fetch("/api/qbo/action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"QuickBooks request failed");return j as Record<string,unknown>}

export function SignIn({needsSetup,onDone}:{needsSetup:boolean;onDone:(u:AuthUser)=>void}){
  const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [name,setName]=useState("");const [company,setCompany]=useState("");const [err,setErr]=useState("");const [busy,setBusy]=useState(false);
  const submit=async(e:FormEvent)=>{e.preventDefault();setErr("");setBusy(true);try{const j=await authCall(needsSetup?{op:"setup",email,password,name,company}:{op:"login",email,password});onDone(j.user as AuthUser)}catch(x){setErr(x instanceof Error?x.message:"Sign-in failed")}finally{setBusy(false)}};
  return <main className="app-shell"><header className="topbar"><div className="logo">Make<span>Logic</span></div></header>
    <div className="signin-wrap"><form className="panel signin" onSubmit={submit}>
      <p className="eyebrow">{needsSetup?"First-time setup":"Sign in"}</p><h1>{needsSetup?"Create the owner account":"Welcome back"}</h1>
      <p className="intro">{needsSetup?"This is the main company account. You'll add sales and warehouse people from Settings & access afterwards.":"Use the email and password the owner set up for you."}</p>
      {needsSetup&&<label>Your name<input value={name} onChange={e=>setName(e.target.value)} required/></label>}
      <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username"/></label>
      <label>Password{needsSetup&&<small> · at least 8 characters</small>}<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} autoComplete={needsSetup?"new-password":"current-password"}/></label>
      {needsSetup&&<label>Company name<input value={company} onChange={e=>setCompany(e.target.value)} placeholder="EcoForm Bottles"/></label>}
      {err&&<p className="form-error">{err}</p>}
      <button className="primary full" type="submit" disabled={busy}>{busy?"One moment…":needsSetup?"Create account & sign in":"Sign in"}</button>
      {!needsSetup&&<p className="account-copy">Forgot your password? Ask the owner to reset it from Settings &amp; access.</p>}
    </form></div></main>;
}
