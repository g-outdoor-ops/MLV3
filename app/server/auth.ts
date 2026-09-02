// Email + password sign-in with server-side sessions. Passwords are PBKDF2-SHA256 hashed
// (Web Crypto, so it runs on Node and Cloudflare alike). Sessions live in the database and
// ride in an HttpOnly cookie; the tablet can stay signed in for 30 days.
import { audit, getDb } from "./db";

export type Role="owner"|"sales"|"floor";
export type User={id:string;email:string;name:string;role:Role;active:boolean;createdAt:string};
const COOKIE="ml_session";const SESSION_DAYS=30;
const enc=new TextEncoder();
const b64=(b:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));

export async function hashPassword(pw:string){const salt=crypto.getRandomValues(new Uint8Array(16));const key=await crypto.subtle.importKey("raw",enc.encode(pw),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:120000,hash:"SHA-256"},key,256);return `pbkdf2$120000$${b64(salt.buffer)}$${b64(bits)}`}
export async function verifyPassword(pw:string,stored:string){const [,iter,salt,hash]=stored.split("$");if(!salt||!hash)return false;const key=await crypto.subtle.importKey("raw",enc.encode(pw),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:unb64(salt),iterations:Number(iter)||120000,hash:"SHA-256"},key,256);const a=b64(bits);return a.length===hash.length&&a.split("").every((c,i)=>c===hash[i])}
const token=()=>b64(crypto.getRandomValues(new Uint8Array(32)).buffer).replace(/[^a-zA-Z0-9]/g,"").slice(0,40)+Date.now().toString(36);

const rowToUser=(r:Record<string,unknown>):User=>({id:String(r.id),email:String(r.email),name:String(r.name),role:r.role as Role,active:Number(r.active)===1||r.active===true,createdAt:String(r.created_at)});

export async function userCount(){const db=await getDb();const r=await db.query("SELECT COUNT(*) AS n FROM users");return Number(r[0]?.n||0)}
export async function listUsers(){const db=await getDb();return (await db.query("SELECT * FROM users ORDER BY created_at")).map(rowToUser)}
export async function createUser(u:{email:string;name:string;role:Role;password:string}){const db=await getDb();const id=`u${Date.now().toString(36)}${Math.floor(Math.random()*1e4)}`;const email=u.email.trim().toLowerCase();if(!email||!u.password||u.password.length<8)throw new Error("Email and a password of at least 8 characters are required");
  await db.exec("INSERT INTO users(id,email,name,role,password_hash,active,created_at) VALUES($1,$2,$3,$4,$5,1,$6)",[id,email,u.name.trim()||email,u.role,await hashPassword(u.password),new Date().toISOString()]);return id}
export async function updateUser(id:string,patch:{name?:string;role?:Role;active?:boolean;password?:string}){const db=await getDb();
  if(patch.name!==undefined)await db.exec("UPDATE users SET name=$1 WHERE id=$2",[patch.name,id]);
  if(patch.role!==undefined)await db.exec("UPDATE users SET role=$1 WHERE id=$2",[patch.role,id]);
  if(patch.active!==undefined){await db.exec("UPDATE users SET active=$1 WHERE id=$2",[patch.active?1:0,id]);if(!patch.active)await db.exec("DELETE FROM sessions WHERE user_id=$1",[id])}
  if(patch.password){await db.exec("UPDATE users SET password_hash=$1 WHERE id=$2",[await hashPassword(patch.password),id]);await db.exec("DELETE FROM sessions WHERE user_id=$1",[id])}}
export async function deleteUser(id:string){const db=await getDb();await db.exec("DELETE FROM sessions WHERE user_id=$1",[id]);await db.exec("DELETE FROM users WHERE id=$1",[id])}

export async function login(email:string,password:string){const db=await getDb();const rows=await db.query("SELECT * FROM users WHERE email=$1",[email.trim().toLowerCase()]);const r=rows[0];if(!r)return null;const u=rowToUser(r);if(!u.active)return null;if(!(await verifyPassword(password,String(r.password_hash))))return null;
  const t=token();const exp=new Date(Date.now()+SESSION_DAYS*864e5).toISOString();await db.exec("INSERT INTO sessions(token,user_id,expires_at,created_at) VALUES($1,$2,$3,$4)",[t,u.id,exp,new Date().toISOString()]);await audit(u.email,"auth.login",`${u.name} signed in`);return {user:u,token:t}}
export async function logout(t:string){const db=await getDb();await db.exec("DELETE FROM sessions WHERE token=$1",[t])}
export async function userFromRequest(req:Request):Promise<User|null>{const t=readCookie(req);if(!t)return null;const db=await getDb();const rows=await db.query("SELECT u.* , s.expires_at AS exp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1",[t]);const r=rows[0];if(!r)return null;if(new Date(String(r.exp)).getTime()<Date.now()){await db.exec("DELETE FROM sessions WHERE token=$1",[t]);return null}const u=rowToUser(r);return u.active?u:null}

export function readCookie(req:Request){const c=req.headers.get("cookie")||"";const m=c.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));return m?decodeURIComponent(m[1]):""}
export function sessionCookie(t:string,req:Request){const secure=/^https:/.test(req.headers.get("x-forwarded-proto")==="https"?"https:":new URL(req.url).protocol);return `${COOKIE}=${encodeURIComponent(t)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS*86400}${secure?"; Secure":""}`}
export function clearCookie(){return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`}
