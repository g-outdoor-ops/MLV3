// The warehouse link endpoint.
//
// Authenticated by the token in the link, not by a session — see app/server/floor.ts for what that
// buys the holder, which is deliberately very little. Note what is NOT here: no PUT that takes a
// company record. The tablet can ask for three things to happen and nothing else.
import { audit, listPhotos, readState, writeState, StateConflictError } from "../../server/db";
import { applyFloorAction, floorActor, floorView, tokenMatches, type FloorAction } from "../../server/floor";

// no-store on the refusal as well as the answer. The whole security surface of this endpoint is a
// secret in a URL, and a cached 401 sitting in front of it would make a good link look broken.
const NO_STORE={"cache-control":"no-store"};
const deny=()=>Response.json({error:"This link is not valid. Ask the owner for a new one."},{status:401,headers:NO_STORE});
const tokenFrom=(request:Request)=>new URL(request.url).searchParams.get("t")||request.headers.get("x-floor-token")||"";

export async function GET(request:Request){
  try{
    const row=await readState();
    if(!tokenMatches(tokenFrom(request),row.payload.settings?.warehouseToken))return deny();
    return Response.json({ok:true,view:floorView(row.payload,await listPhotos()),version:row.version},
      // A shared link must not be cached by anything between the tablet and here.
      {headers:NO_STORE});
  }catch(error){console.error("floor read failed",error);return Response.json({error:"The schedule is temporarily unavailable"},{status:503})}
}

export async function POST(request:Request){
  try{
    const body=await request.json() as FloorAction;
    if(!body||typeof body.op!=="string")return Response.json({error:"Nothing to do"},{status:400});

    // Read, apply, write, with the version the read returned. Unlike the main app — which holds a whole
    // stale copy of the record and can only reload on a conflict — this patch is small and re-applying
    // it to fresher data is exactly right, so a lost race is retried once rather than shown to the floor.
    for(let attempt=0;attempt<2;attempt++){
      const row=await readState();
      if(!tokenMatches(tokenFrom(request),row.payload.settings?.warehouseToken))return deny();
      const result=applyFloorAction(row.payload,body);
      if("error" in result)return Response.json({error:result.error},{status:400});
      try{
        // floorActor, not the raw name: what the tablet sends is a self-declared label from an
        // unauthenticated page, and it is about to be written into the audit log.
        await writeState(result.data,floorActor(body.by),result.action,result.summary,row.version);
        const after=await readState();
        return Response.json({ok:true,view:floorView(after.payload,await listPhotos()),version:after.version},{headers:NO_STORE});
      }catch(e){
        if(e instanceof StateConflictError&&attempt===0)continue;   // someone saved first; redo on theirs
        throw e;
      }
    }
    return Response.json({error:"The schedule is busy — try that again"},{status:409});
  }catch(error){
    if(error instanceof StateConflictError)return Response.json({error:"Someone else saved at the same moment — try that again"},{status:409});
    console.error("floor write failed",error);
    await audit("Warehouse link","floor.error","A warehouse link action could not be saved").catch(()=>{});
    return Response.json({error:"That could not be saved"},{status:503});
  }
}
