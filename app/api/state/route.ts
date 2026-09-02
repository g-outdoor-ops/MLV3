import { env } from "cloudflare:workers";
import { seedData, type AppData } from "../../app-data";

const schema=`CREATE TABLE IF NOT EXISTS app_state (id TEXT PRIMARY KEY, payload TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, updated_by TEXT)`;
const auditSchema=`CREATE TABLE IF NOT EXISTS audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT NOT NULL)`;

async function initialize(){await env.DB.batch([env.DB.prepare(schema),env.DB.prepare(auditSchema)]);const row=await env.DB.prepare("SELECT id FROM app_state WHERE id='company'").first();if(!row)await env.DB.prepare("INSERT INTO app_state(id,payload,version,updated_at,updated_by) VALUES('company',?,1,?,?)").bind(JSON.stringify(seedData),new Date().toISOString(),"system").run()}

export async function GET(){await initialize();const row=await env.DB.prepare("SELECT payload,version,updated_at FROM app_state WHERE id='company'").first<{payload:string;version:number;updated_at:string}>();return Response.json({data:JSON.parse(row!.payload),version:row!.version,updatedAt:row!.updated_at})}

export async function PUT(request:Request){await initialize();const body=await request.json() as {data:AppData;actor?:string;action?:string;summary?:string};if(!body.data||!Array.isArray(body.data.customers)||!Array.isArray(body.data.orders))return Response.json({error:"Invalid company data"},{status:400});const actor=body.actor||request.headers.get("oai-authenticated-user-email")||"MakeLogic user";const now=new Date().toISOString();await env.DB.batch([env.DB.prepare("UPDATE app_state SET payload=?,version=version+1,updated_at=?,updated_by=? WHERE id='company'").bind(JSON.stringify(body.data),now,actor),env.DB.prepare("INSERT INTO audit_events(actor,action,summary,created_at) VALUES(?,?,?,?)").bind(actor,body.action||"update",body.summary||"Company data updated",now)]);return Response.json({ok:true,updatedAt:now})}
