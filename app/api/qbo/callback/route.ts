import { userFromRequest } from "../../../server/auth";
import { exchangeCode, status } from "../../../server/qbo";
import { readState, writeState } from "../../../server/db";

export async function GET(request:Request){
  const url=new URL(request.url);const code=url.searchParams.get("code");const realmId=url.searchParams.get("realmId");const state=url.searchParams.get("state");
  const expected=(request.headers.get("cookie")||"").match(/(?:^|;\s*)qbo_state=([^;]+)/)?.[1];
  const back=(msg:string)=>new Response(null,{status:302,headers:{location:`/?qbo=${encodeURIComponent(msg)}#owner`,"set-cookie":"qbo_state=; Path=/; Max-Age=0"}});
  const user=await userFromRequest(request);if(!user||user.role!=="owner")return back("Sign in as the owner first, then connect again");
  if(!code||!realmId)return back(url.searchParams.get("error")||"QuickBooks did not return a code");
  if(!expected||expected!==state)return back("Connection expired — please try again");
  try{await exchangeCode(code,realmId);const st=await status();const row=await readState();await writeState({...row.payload,settings:{...row.payload.settings,quickBooks:{...row.payload.settings.quickBooks,connected:true,realmId:st.company||realmId,lastSync:"Connected · "+new Date().toLocaleString("en-US"),conflicts:0}}},user.email,"settings.quickbooks","QuickBooks connected");return back("connected")}
  catch(e){return back(e instanceof Error?e.message:"Could not connect")}
}
