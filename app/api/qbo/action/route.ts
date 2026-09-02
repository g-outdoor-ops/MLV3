import { userFromRequest } from "../../../server/auth";
import { readState, writeState } from "../../../server/db";
import { createInvoice, disconnect, ensureCustomer, invoiceBalance, qboConfigured, recordPayment, sendInvoice, status, type CustomerIn, type InvoiceIn } from "../../../server/qbo";

type Body={op:string;customer?:CustomerIn;invoice?:InvoiceIn;qboId?:string;email?:string;customerQboId?:string;amount?:number;method?:string;invoices?:{id:string;qboId:string}[]};

export async function POST(request:Request){
  const user=await userFromRequest(request);if(!user)return Response.json({error:"Please sign in"},{status:401});
  let body:Body;try{body=await request.json() as Body}catch{return Response.json({error:"Bad request"},{status:400})}
  try{
    switch(body.op){
      case "status":return Response.json(await status());
      case "disconnect":if(user.role!=="owner")return Response.json({error:"Owner only"},{status:403});await disconnect();{const row=await readState();await writeState({...row.payload,settings:{...row.payload.settings,quickBooks:{...row.payload.settings.quickBooks,connected:false,realmId:"",lastSync:"Disconnected"}}},user.email,"settings.quickbooks","QuickBooks disconnected")}return Response.json({ok:true});
      case "customer.ensure":if(!body.customer)throw new Error("customer required");return Response.json({qboId:await ensureCustomer(body.customer)});
      case "invoice.create":if(!body.invoice)throw new Error("invoice required");return Response.json(await createInvoice(body.invoice));
      case "invoice.send":if(!body.qboId)throw new Error("qboId required");await sendInvoice(body.qboId,body.email);return Response.json({ok:true});
      case "payment.create":if(!body.qboId||!body.customerQboId||!body.amount)throw new Error("qboId, customerQboId and amount required");return Response.json({paymentId:await recordPayment(body.qboId,body.customerQboId,body.amount,body.method)});
      case "sync":{const out:Record<string,{balance:number;total:number}>={};for(const i of body.invoices||[]){try{out[i.id]=await invoiceBalance(i.qboId)}catch(e){console.error("sync",i.id,e)}}return Response.json({balances:out,configured:qboConfigured()})}
      default:return Response.json({error:"Unknown op"},{status:400});
    }
  }catch(e){console.error("qbo",body.op,e);return Response.json({error:e instanceof Error?e.message:"QuickBooks request failed"},{status:502})}
}
