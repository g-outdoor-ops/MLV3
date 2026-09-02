// QuickBooks Online: OAuth 2.0 connection plus the handful of API calls the app needs
// (customers, invoices, payments, invoice email, balance sync). Tokens live in qbo_tokens
// and refresh automatically; nothing secret ever reaches the browser.
import { audit, getDb } from "./db";

export const qboConfig=()=>({
  clientId:process.env.QBO_CLIENT_ID||"",
  clientSecret:process.env.QBO_CLIENT_SECRET||"",
  redirectUri:process.env.QBO_REDIRECT_URI||"",
  env:(process.env.QBO_ENV||"sandbox").toLowerCase()==="production"?"production":"sandbox",
});
export const qboConfigured=()=>{const c=qboConfig();return !!(c.clientId&&c.clientSecret&&c.redirectUri)};
const apiBase=()=>qboConfig().env==="production"?"https://quickbooks.api.intuit.com":"https://sandbox-quickbooks.api.intuit.com";
const MINOR="minorversion=75";

type Tokens={realmId:string;accessToken:string;refreshToken:string;expiresAt:number;refreshExpiresAt:number;env:string};
async function loadTokens():Promise<Tokens|null>{const db=await getDb();const r=(await db.query("SELECT * FROM qbo_tokens WHERE id='company'"))[0];if(!r)return null;return {realmId:String(r.realm_id),accessToken:String(r.access_token),refreshToken:String(r.refresh_token),expiresAt:Date.parse(String(r.expires_at)),refreshExpiresAt:Date.parse(String(r.refresh_expires_at)),env:String(r.env)}}
async function saveTokens(t:Tokens){const db=await getDb();await db.exec("DELETE FROM qbo_tokens WHERE id='company'");await db.exec("INSERT INTO qbo_tokens(id,realm_id,access_token,refresh_token,expires_at,refresh_expires_at,env,updated_at) VALUES('company',$1,$2,$3,$4,$5,$6,$7)",[t.realmId,t.accessToken,t.refreshToken,new Date(t.expiresAt).toISOString(),new Date(t.refreshExpiresAt).toISOString(),t.env,new Date().toISOString()])}
export async function disconnect(){const db=await getDb();await db.exec("DELETE FROM qbo_tokens WHERE id='company'")}

export function authorizeUrl(state:string){const c=qboConfig();const p=new URLSearchParams({client_id:c.clientId,response_type:"code",scope:"com.intuit.quickbooks.accounting",redirect_uri:c.redirectUri,state});return `https://appcenter.intuit.com/connect/oauth2?${p}`}
async function tokenRequest(params:Record<string,string>){const c=qboConfig();const res=await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded",accept:"application/json",authorization:"Basic "+btoa(`${c.clientId}:${c.clientSecret}`)},body:new URLSearchParams(params)});const j=await res.json() as Record<string,unknown>;if(!res.ok)throw new Error(`QuickBooks token error: ${j.error_description||j.error||res.status}`);return j}
export async function exchangeCode(code:string,realmId:string){const j=await tokenRequest({grant_type:"authorization_code",code,redirect_uri:qboConfig().redirectUri});const t:Tokens={realmId,accessToken:String(j.access_token),refreshToken:String(j.refresh_token),expiresAt:Date.now()+Number(j.expires_in||3600)*1000,refreshExpiresAt:Date.now()+Number(j.x_refresh_token_expires_in||8726400)*1000,env:qboConfig().env};await saveTokens(t);return t}
async function freshTokens(){let t=await loadTokens();if(!t)throw new Error("QuickBooks is not connected");if(t.expiresAt-Date.now()<60000){const j=await tokenRequest({grant_type:"refresh_token",refresh_token:t.refreshToken});t={...t,accessToken:String(j.access_token),refreshToken:String(j.refresh_token||t.refreshToken),expiresAt:Date.now()+Number(j.expires_in||3600)*1000,refreshExpiresAt:Date.now()+Number(j.x_refresh_token_expires_in||8726400)*1000};await saveTokens(t)}return t}

async function api<T=Record<string,unknown>>(method:"GET"|"POST",path:string,body?:unknown):Promise<T>{const t=await freshTokens();const url=`${apiBase()}/v3/company/${t.realmId}/${path}${path.includes("?")?"&":"?"}${MINOR}`;const res=await fetch(url,{method,headers:{authorization:`Bearer ${t.accessToken}`,accept:"application/json",...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});const text=await res.text();let j:Record<string,unknown>={};try{j=text?JSON.parse(text):{}}catch{/* non-JSON */}
  if(!res.ok){const fault=(j.Fault as {Error?:{Message?:string;Detail?:string}[]})?.Error?.[0];throw new Error(`QuickBooks: ${fault?.Detail||fault?.Message||res.status+" "+text.slice(0,200)}`)}return j as T}
const q=(sql:string)=>api<{QueryResponse:Record<string,Record<string,unknown>[]>}>("GET",`query?query=${encodeURIComponent(sql)}`);
const esc=(s:string)=>s.replace(/'/g,"\\'");

export async function status(){const t=await loadTokens();if(!t)return {connected:false,configured:qboConfigured(),env:qboConfig().env};try{const info=await api<{CompanyInfo:{CompanyName:string}}>("GET",`companyinfo/${t.realmId}`);return {connected:true,configured:true,env:t.env,realmId:t.realmId,company:info.CompanyInfo?.CompanyName,refreshExpires:new Date(t.refreshExpiresAt).toISOString()}}catch(e){return {connected:true,configured:true,env:t.env,realmId:t.realmId,error:e instanceof Error?e.message:"unreachable"}}}

// ---- customers ----
export type CustomerIn={id:string;name:string;contact:string;email:string;phone:string;billing:string;delivery:string;qboId?:string};
export async function ensureCustomer(c:CustomerIn){
  if(c.qboId){try{const r=await api<{Customer:{Id:string}}>("GET",`customer/${c.qboId}`);if(r.Customer?.Id)return c.qboId}catch{/* fall through and search */}}
  const found=await q(`select * from Customer where DisplayName='${esc(c.name)}'`);const hit=found.QueryResponse?.Customer?.[0];if(hit)return String(hit.Id);
  const body:Record<string,unknown>={DisplayName:c.name,CompanyName:c.name,PrimaryEmailAddr:c.email?{Address:c.email}:undefined,PrimaryPhone:c.phone?{FreeFormNumber:c.phone}:undefined,BillAddr:c.billing?{Line1:c.billing}:undefined,ShipAddr:c.delivery?{Line1:c.delivery}:undefined};
  if(c.contact){const [given,...rest]=c.contact.split(" ");body.GivenName=given;body.FamilyName=rest.join(" ")}
  const r=await api<{Customer:{Id:string}}>("POST","customer",body);return String(r.Customer.Id)}

// ---- items (products / shipping line) ----
async function incomeAccountId(){const r=await q("select * from Account where AccountType='Income' maxresults 5");const a=r.QueryResponse?.Account||[];const pick=a.find(x=>/product|sales/i.test(String(x.Name)))||a[0];if(!pick)throw new Error("QuickBooks has no Income account to post sales to");return String(pick.Id)}
const itemCache=new Map<string,string>();
export async function ensureItem(name:string,unitPrice:number){if(itemCache.has(name))return itemCache.get(name)!;const found=await q(`select * from Item where Name='${esc(name)}'`);const hit=found.QueryResponse?.Item?.[0];if(hit){itemCache.set(name,String(hit.Id));return String(hit.Id)}
  const r=await api<{Item:{Id:string}}>("POST","item",{Name:name,Type:"NonInventory",UnitPrice:unitPrice,IncomeAccountRef:{value:await incomeAccountId()}});itemCache.set(name,String(r.Item.Id));return String(r.Item.Id)}

// ---- invoices ----
export type InvoiceIn={docNumber:string;customer:CustomerIn;lines:{item:string;quantity:number;rate:number}[];discountPct:number;shipping:number;dueDate:string;memo?:string;email?:string};
export async function createInvoice(inv:InvoiceIn){
  const customerId=await ensureCustomer(inv.customer);
  const Line:Record<string,unknown>[]=[];
  for(const l of inv.lines){Line.push({DetailType:"SalesItemLineDetail",Amount:Math.round(l.quantity*l.rate*100)/100,Description:l.item,SalesItemLineDetail:{ItemRef:{value:await ensureItem(l.item,l.rate)},Qty:l.quantity,UnitPrice:l.rate}})}
  if(inv.shipping>0)Line.push({DetailType:"SalesItemLineDetail",Amount:inv.shipping,Description:"Shipping",SalesItemLineDetail:{ItemRef:{value:await ensureItem("Shipping",0)},Qty:1,UnitPrice:inv.shipping}});
  if(inv.discountPct>0)Line.push({DetailType:"DiscountLineDetail",Amount:0,DiscountLineDetail:{PercentBased:true,DiscountPercent:inv.discountPct}});
  const body:Record<string,unknown>={CustomerRef:{value:customerId},DocNumber:inv.docNumber,DueDate:inv.dueDate,Line,CustomerMemo:inv.memo?{value:inv.memo}:undefined,BillEmail:inv.email?{Address:inv.email}:undefined,AllowOnlineCreditCardPayment:true,AllowOnlineACHPayment:true};
  const r=await api<{Invoice:{Id:string;DocNumber:string;TotalAmt:number;Balance:number}}>("POST","invoice",body);
  await audit("quickbooks","qbo.invoice",`${inv.docNumber} → QuickBooks invoice ${r.Invoice.Id}`);
  return {qboId:String(r.Invoice.Id),docNumber:String(r.Invoice.DocNumber),total:Number(r.Invoice.TotalAmt),balance:Number(r.Invoice.Balance),customerId}}
export async function sendInvoice(qboId:string,email?:string){await api("POST",`invoice/${qboId}/send${email?`?sendTo=${encodeURIComponent(email)}`:""}`);await audit("quickbooks","qbo.send",`invoice ${qboId} emailed`)}
export async function invoiceBalance(qboId:string){const r=await api<{Invoice:{Balance:number;TotalAmt:number;EmailStatus?:string;LinkedTxn?:unknown[]}}>("GET",`invoice/${qboId}`);return {balance:Number(r.Invoice.Balance),total:Number(r.Invoice.TotalAmt),emailStatus:r.Invoice.EmailStatus}}

// ---- payments ----
export async function recordPayment(qboInvoiceId:string,customerQboId:string,amount:number,method?:string){const body:Record<string,unknown>={CustomerRef:{value:customerQboId},TotalAmt:amount,Line:[{Amount:amount,LinkedTxn:[{TxnId:qboInvoiceId,TxnType:"Invoice"}]}],PrivateNote:method?`Recorded in MakeLogic · ${method}`:"Recorded in MakeLogic"};const r=await api<{Payment:{Id:string}}>("POST","payment",body);await audit("quickbooks","qbo.payment",`payment ${r.Payment.Id} on invoice ${qboInvoiceId}`);return String(r.Payment.Id)}
