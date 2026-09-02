import { seedData, type AppData } from "../../app-data";

type StateRow={payload:string;version:number;updated_at:string};
const stateSchema=`CREATE TABLE IF NOT EXISTS app_state (id TEXT PRIMARY KEY, payload TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, updated_by TEXT)`;
const auditSchema=`CREATE TABLE IF NOT EXISTS audit_events (id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT NOT NULL)`;
const d1AuditSchema=`CREATE TABLE IF NOT EXISTS audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT NOT NULL)`;

let postgresPool:import("pg").Pool|undefined;

async function getPostgres(){
  const url=process.env.DATABASE_URL;
  if(!url)return null;
  const{Pool}=await import("pg");
  postgresPool??=new Pool({connectionString:url,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:undefined,max:5});
  await postgresPool.query(stateSchema);
  await postgresPool.query(auditSchema);
  const found=await postgresPool.query("SELECT id FROM app_state WHERE id='company'");
  if(!found.rowCount)await postgresPool.query("INSERT INTO app_state(id,payload,version,updated_at,updated_by) VALUES('company',$1,1,$2,$3)",[JSON.stringify(seedData),new Date().toISOString(),"system"]);
  return postgresPool;
}

async function readState():Promise<StateRow>{
  const pg=await getPostgres();
  if(pg){const result=await pg.query<StateRow>("SELECT payload,version,updated_at FROM app_state WHERE id='company'");return result.rows[0]}
  const{env}=await import("cloudflare:workers");
  await env.DB.batch([env.DB.prepare(stateSchema),env.DB.prepare(d1AuditSchema)]);
  const found=await env.DB.prepare("SELECT id FROM app_state WHERE id='company'").first();
  if(!found)await env.DB.prepare("INSERT INTO app_state(id,payload,version,updated_at,updated_by) VALUES('company',?,1,?,?)").bind(JSON.stringify(seedData),new Date().toISOString(),"system").run();
  return (await env.DB.prepare("SELECT payload,version,updated_at FROM app_state WHERE id='company'").first<StateRow>())!;
}

async function writeState(data:AppData,actor:string,action:string,summary:string){
  const now=new Date().toISOString();const pg=await getPostgres();
  if(pg){const client=await pg.connect();try{await client.query("BEGIN");await client.query("UPDATE app_state SET payload=$1,version=version+1,updated_at=$2,updated_by=$3 WHERE id='company'",[JSON.stringify(data),now,actor]);await client.query("INSERT INTO audit_events(actor,action,summary,created_at) VALUES($1,$2,$3,$4)",[actor,action,summary,now]);await client.query("COMMIT")}catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}return now}
  const{env}=await import("cloudflare:workers");await readState();await env.DB.batch([env.DB.prepare("UPDATE app_state SET payload=?,version=version+1,updated_at=?,updated_by=? WHERE id='company'").bind(JSON.stringify(data),now,actor),env.DB.prepare("INSERT INTO audit_events(actor,action,summary,created_at) VALUES(?,?,?,?)").bind(actor,action,summary,now)]);return now;
}

export async function GET(){try{const row=await readState();return Response.json({data:typeof row.payload==="string"?JSON.parse(row.payload):row.payload,version:row.version,updatedAt:row.updated_at})}catch(error){console.error("state read failed",error);return Response.json({error:"Company data is temporarily unavailable"},{status:503})}}

export async function PUT(request:Request){try{const body=await request.json() as {data:AppData;actor?:string;action?:string;summary?:string};if(!body.data||!Array.isArray(body.data.customers)||!Array.isArray(body.data.orders))return Response.json({error:"Invalid company data"},{status:400});const actor=body.actor||request.headers.get("oai-authenticated-user-email")||"MakeLogic user";const updatedAt=await writeState(body.data,actor,body.action||"update",body.summary||"Company data updated");return Response.json({ok:true,updatedAt})}catch(error){console.error("state write failed",error);return Response.json({error:"Company changes could not be saved"},{status:503})}}
