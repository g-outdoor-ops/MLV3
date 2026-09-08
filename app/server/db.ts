// One small storage layer for Postgres (Render) or Cloudflare D1.
// Tables: app_state (the company record), audit_events, users, sessions, qbo_tokens, item_photos.
import { seedData, type AppData } from "../app-data";

type Row=Record<string,unknown>;
export type Db={
  query:(sql:string,params?:unknown[])=>Promise<Row[]>;
  exec:(sql:string,params?:unknown[])=>Promise<void>;
  kind:"pg"|"d1";
};

const SCHEMA_PG=[
  `CREATE TABLE IF NOT EXISTS app_state (id TEXT PRIMARY KEY, payload TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, updated_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS audit_events (id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS qbo_tokens (id TEXT PRIMARY KEY, realm_id TEXT NOT NULL, access_token TEXT NOT NULL, refresh_token TEXT NOT NULL, expires_at TEXT NOT NULL, refresh_expires_at TEXT NOT NULL, env TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  // Product photos, keyed by the item name the rest of the app already uses. They live here rather than
  // on disk because the web service's filesystem is wiped on every deploy, and in their own table rather
  // than in the company record because every client PUTs that record whole on every save — a few hundred
  // kilobytes of base64 riding along with a changed order quantity would be absurd.
  //
  // Stored base64 in TEXT rather than as bytes: Postgres wants bytea and D1 wants BLOB, and one string
  // column behaves identically on both. It costs about a third in size, which for a handful of product
  // photos is nothing next to having two code paths.
  `CREATE TABLE IF NOT EXISTS item_photos (item TEXT PRIMARY KEY, mime TEXT NOT NULL, data TEXT NOT NULL, bytes INTEGER NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)`,
];
const SCHEMA_D1=SCHEMA_PG.map(s=>s.replace("INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY","INTEGER PRIMARY KEY AUTOINCREMENT"));

let pgPool:import("pg").Pool|undefined;let ready:Promise<Db>|undefined;

async function connect():Promise<Db>{
  const url=process.env.DATABASE_URL;
  if(url){
    const {Pool}=await import("pg");
    pgPool??=new Pool({connectionString:url,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:undefined,max:5});
    const pool=pgPool;
    const db:Db={kind:"pg",query:async(sql,params=[])=>{const r=await pool.query(sql,params);return r.rows as Row[]},exec:async(sql,params=[])=>{await pool.query(sql,params)}};
    for(const s of SCHEMA_PG)await db.exec(s);
    return db;
  }
  const {env}=await import("cloudflare:workers");
  const d1=env.DB;
  const conv=(sql:string)=>sql.replace(/\$\d+/g,"?");
  const db:Db={kind:"d1",query:async(sql,params=[])=>{const r=await d1.prepare(conv(sql)).bind(...params).all();return (r.results||[]) as Row[]},exec:async(sql,params=[])=>{await d1.prepare(conv(sql)).bind(...params).run()}};
  for(const s of SCHEMA_D1)await db.exec(s);
  return db;
}
export function getDb(){ready??=connect().catch(e=>{ready=undefined;throw e});return ready}

// ---- company record ----
export async function readState(){const db=await getDb();const rows=await db.query("SELECT payload,version,updated_at FROM app_state WHERE id='company'");
  if(!rows.length){await db.exec("INSERT INTO app_state(id,payload,version,updated_at,updated_by) VALUES('company',$1,1,$2,$3)",[JSON.stringify(seedData),new Date().toISOString(),"system"]);return {payload:seedData,version:1,updated_at:new Date().toISOString()}}
  const r=rows[0];return {payload:typeof r.payload==="string"?JSON.parse(r.payload as string) as AppData:r.payload as AppData,version:Number(r.version),updated_at:String(r.updated_at)}}
// Raised when someone else saved between the moment this client loaded the company record and the
// moment it tried to save. Carries the current version so the caller can tell the person what happened.
export class StateConflictError extends Error{
  currentVersion:number;updatedBy:string;updatedAt:string;
  constructor(currentVersion:number,updatedBy:string,updatedAt:string){
    super("The company record changed since you loaded it");this.name="StateConflictError";
    this.currentVersion=currentVersion;this.updatedBy=updatedBy;this.updatedAt=updatedAt;
  }
}

// Optimistic concurrency. Every client holds a whole copy of the company record and PUTs all of it, so
// without a version check the last writer silently wins and the other person's work disappears with no
// error anywhere. The guard is the WHERE clause: the row only updates if its version is still the one
// the caller read. UPDATE ... RETURNING makes that atomic — checking the version in a separate SELECT
// first would leave a gap for another write to land in between.
export async function writeState(data:AppData,actor:string,action:string,summary:string,expectedVersion?:number){const db=await getDb();const now=new Date().toISOString();
  if(expectedVersion!=null){
    const updated=await db.query("UPDATE app_state SET payload=$1,version=version+1,updated_at=$2,updated_by=$3 WHERE id='company' AND version=$4 RETURNING version",[JSON.stringify(data),now,actor,expectedVersion]);
    if(!updated.length){
      const cur=await db.query("SELECT version,updated_at,updated_by FROM app_state WHERE id='company'");
      const r=cur[0]||{};
      throw new StateConflictError(Number(r.version||0),String(r.updated_by||"someone else"),String(r.updated_at||now));
    }
  }else{
    await db.exec("UPDATE app_state SET payload=$1,version=version+1,updated_at=$2,updated_by=$3 WHERE id='company'",[JSON.stringify(data),now,actor]);
  }
  await db.exec("INSERT INTO audit_events(actor,action,summary,created_at) VALUES($1,$2,$3,$4)",[actor,action,summary,now]);return now}
// ---- product photos ----
export type ItemPhoto={item:string;mime:string;data:string;bytes:number;updatedAt:string};
export async function readPhoto(item:string):Promise<ItemPhoto|null>{
  const db=await getDb();
  const rows=await db.query("SELECT item,mime,data,bytes,updated_at FROM item_photos WHERE item=$1",[item]);
  const r=rows[0];
  return r?{item:String(r.item),mime:String(r.mime),data:String(r.data),bytes:Number(r.bytes),updatedAt:String(r.updated_at)}:null;
}
/** Which items have a photo, and when it changed — enough to build URLs without reading the bytes. */
export async function listPhotos(){
  const db=await getDb();
  const rows=await db.query("SELECT item,updated_at,bytes FROM item_photos");
  return rows.map(r=>({item:String(r.item),updatedAt:String(r.updated_at),bytes:Number(r.bytes)}));
}
export async function writePhoto(item:string,mime:string,data:string,by:string){
  const db=await getDb();const now=new Date().toISOString();
  await db.exec("DELETE FROM item_photos WHERE item=$1",[item]);
  await db.exec("INSERT INTO item_photos(item,mime,data,bytes,updated_at,updated_by) VALUES($1,$2,$3,$4,$5,$6)",
    [item,mime,data,Math.round(data.length*3/4),now,by]);
  await audit(by,"photo.set",`Photo set for ${item}`);
  return now;
}
export async function deletePhoto(item:string,by:string){
  const db=await getDb();
  await db.exec("DELETE FROM item_photos WHERE item=$1",[item]);
  await audit(by,"photo.clear",`Photo removed from ${item}`);
}

export async function audit(actor:string,action:string,summary:string){const db=await getDb();await db.exec("INSERT INTO audit_events(actor,action,summary,created_at) VALUES($1,$2,$3,$4)",[actor,action,summary,new Date().toISOString()])}
