import type { AppData } from "../../app-data";
import { userFromRequest } from "../../server/auth";
import { readState, writeState } from "../../server/db";

export async function GET(request:Request){
  try{const user=await userFromRequest(request);if(!user)return Response.json({error:"Please sign in"},{status:401});const row=await readState();return Response.json({data:row.payload,version:row.version,updatedAt:row.updated_at})}
  catch(error){console.error("state read failed",error);return Response.json({error:"Company data is temporarily unavailable"},{status:503})}
}

export async function PUT(request:Request){
  try{const user=await userFromRequest(request);if(!user)return Response.json({error:"Please sign in"},{status:401});
    const body=await request.json() as {data:AppData;action?:string;summary?:string};
    if(!body.data||!Array.isArray(body.data.customers)||!Array.isArray(body.data.orders))return Response.json({error:"Invalid company data"},{status:400});
    const updatedAt=await writeState(body.data,`${user.name} <${user.email}>`,body.action||"update",body.summary||"Company data updated");return Response.json({ok:true,updatedAt})}
  catch(error){console.error("state write failed",error);return Response.json({error:"Company changes could not be saved"},{status:503})}
}
