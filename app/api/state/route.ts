import type { AppData } from "../../app-data";
import { userFromRequest } from "../../server/auth";
import { StateConflictError, readState, writeState } from "../../server/db";
import { denyStateWrite } from "../../server/authz";

export async function GET(request:Request){
  try{const user=await userFromRequest(request);if(!user)return Response.json({error:"Please sign in"},{status:401});const row=await readState();return Response.json({data:row.payload,version:row.version,updatedAt:row.updated_at})}
  catch(error){console.error("state read failed",error);return Response.json({error:"Company data is temporarily unavailable"},{status:503})}
}

export async function PUT(request:Request){
  try{const user=await userFromRequest(request);if(!user)return Response.json({error:"Please sign in"},{status:401});
    const body=await request.json() as {data:AppData;action?:string;summary?:string;version?:number};
    if(!body.data||!Array.isArray(body.data.customers)||!Array.isArray(body.data.orders))return Response.json({error:"Invalid company data"},{status:400});
    // Compare against what is actually stored rather than trusting the client's idea of the "before".
    const current=await readState();
    const denied=denyStateWrite(user,current.payload,body.data);
    if(denied)return Response.json({error:denied},{status:403});
    const updatedAt=await writeState(body.data,`${user.name} <${user.email}>`,body.action||"update",body.summary||"Company data updated",body.version);
    const after=await readState();
    return Response.json({ok:true,updatedAt,version:after.version})}
  catch(error){
    // A conflict is not a failure of the server — someone else saved first. Say who and when, so the
    // person who lost the race understands what happened instead of watching their work vanish.
    if(error instanceof StateConflictError)return Response.json({error:"Someone else saved changes while you were working",conflict:true,currentVersion:error.currentVersion,updatedBy:error.updatedBy,updatedAt:error.updatedAt},{status:409});
    console.error("state write failed",error);return Response.json({error:"Company changes could not be saved"},{status:503})}
}
