import { userFromRequest } from "../../../server/auth";
import { authorizeUrl, qboConfigured } from "../../../server/qbo";

// Owner clicks "Connect to QuickBooks" → we send them to Intuit to approve, then Intuit returns to /api/qbo/callback.
export async function GET(request:Request){
  const user=await userFromRequest(request);
  if(!user||user.role!=="owner")return new Response("Owner sign-in required",{status:403});
  if(!qboConfigured())return new Response("QuickBooks keys are not set. Add QBO_CLIENT_ID, QBO_CLIENT_SECRET and QBO_REDIRECT_URI to the server environment.",{status:500});
  const state=crypto.randomUUID();
  return new Response(null,{status:302,headers:{location:authorizeUrl(state),"set-cookie":`qbo_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`}});
}
