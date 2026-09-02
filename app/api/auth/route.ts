import { clearCookie, createUser, deleteUser, listUsers, login, logout, readCookie, sessionCookie, updateUser, userCount, userFromRequest, type Role } from "../../server/auth";
import { audit, readState, writeState } from "../../server/db";

const json=(body:unknown,init?:ResponseInit)=>Response.json(body,init);
const ROLES:Role[]=["owner","sales","floor"];

export async function GET(request:Request){
  try{const user=await userFromRequest(request);const count=await userCount();return json({user,needsSetup:count===0})}
  catch(error){console.error("auth read failed",error);return json({error:"Sign-in is temporarily unavailable"},{status:503})}
}

export async function POST(request:Request){
  try{
    const body=await request.json() as Record<string,string|boolean|undefined>;const op=String(body.op||"");
    if(op==="setup"){if((await userCount())>0)return json({error:"Setup is already complete"},{status:400});const id=await createUser({email:String(body.email||""),name:String(body.name||""),role:"owner",password:String(body.password||"")});await audit(String(body.email),"auth.setup","Owner account created");{const row=await readState();await writeState({...row.payload,settings:{...row.payload.settings,company:String(body.company||row.payload.settings.company||""),ownerName:String(body.name||""),ownerEmail:String(body.email||"").toLowerCase()}},String(body.email),"settings.account","Company created")}const s=await login(String(body.email||""),String(body.password||""));return json({ok:true,id,user:s?.user},{headers:s?{"set-cookie":sessionCookie(s.token,request)}:undefined})}
    if(op==="login"){const s=await login(String(body.email||""),String(body.password||""));if(!s)return json({error:"That email and password don't match"},{status:401});return json({ok:true,user:s.user},{headers:{"set-cookie":sessionCookie(s.token,request)}})}
    if(op==="logout"){const t=readCookie(request);if(t)await logout(t);return json({ok:true},{headers:{"set-cookie":clearCookie()}})}
    const me=await userFromRequest(request);if(!me)return json({error:"Please sign in"},{status:401});
    if(op==="password"){const s=await login(me.email,String(body.current||""));if(!s)return json({error:"Current password is wrong"},{status:400});await logout(s.token);await updateUser(me.id,{password:String(body.password||"")});const n=await login(me.email,String(body.password||""));return json({ok:true},{headers:n?{"set-cookie":sessionCookie(n.token,request)}:undefined})}
    if(me.role!=="owner")return json({error:"Only the owner can manage people"},{status:403});
    if(op==="users.list")return json({users:await listUsers()});
    if(op==="users.create"){const role=ROLES.includes(body.role as Role)?body.role as Role:"sales";const id=await createUser({email:String(body.email||""),name:String(body.name||""),role,password:String(body.password||"")});await audit(me.email,"users.create",`${body.name||body.email} added as ${role}`);return json({ok:true,id,users:await listUsers()})}
    if(op==="users.update"){const id=String(body.id||"");if(id===me.id&&body.role&&body.role!=="owner")return json({error:"You can't remove your own owner access"},{status:400});await updateUser(id,{name:body.name as string|undefined,role:ROLES.includes(body.role as Role)?body.role as Role:undefined,active:typeof body.active==="boolean"?body.active:undefined,password:body.password as string|undefined});await audit(me.email,"users.update",`${id} updated`);return json({ok:true,users:await listUsers()})}
    if(op==="users.delete"){const id=String(body.id||"");if(id===me.id)return json({error:"You can't delete your own account"},{status:400});await deleteUser(id);await audit(me.email,"users.delete",`${id} removed`);return json({ok:true,users:await listUsers()})}
    return json({error:"Unknown request"},{status:400});
  }catch(error){console.error("auth write failed",error);return json({error:error instanceof Error?error.message:"Request failed"},{status:400})}
}
