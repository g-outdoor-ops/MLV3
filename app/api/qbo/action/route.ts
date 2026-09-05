import { userFromRequest } from "../../../server/auth";
import { readState, writeState } from "../../../server/db";
import { createInvoice, disconnect, ensureCustomer, importCustomers, importInvoices, invoiceBalance, qboConfigured, recordPayment, sendInvoice, status, type CustomerIn, type InvoiceIn } from "../../../server/qbo";
import type { Customer, DocumentRecord } from "../../../app-data";

type Body={op:string;since?:string;customer?:CustomerIn;invoice?:InvoiceIn;qboId?:string;email?:string;customerQboId?:string;amount?:number;method?:string;invoices?:{id:string;qboId:string}[]};

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
      case "import":{
        if(user.role!=="owner")return Response.json({error:"Owner only"},{status:403});
        const row=await readState();const data=row.payload;

        const [qCustomers,qInvoices]=await Promise.all([importCustomers(),importInvoices(body.since)]);

        // QuickBooks is the master for customers, so an import must UPDATE the matching local record
        // rather than add a second one. Match on qboId first; for records that pre-date the connection
        // there is no qboId, so fall back to a case-insensitive name match and adopt the id — that is
        // the one chance to link them, and missing it means every future import duplicates the row.
        const customers:Customer[]=[...data.customers];
        const byQbo=new Map<string,number>();const byName=new Map<string,number>();
        customers.forEach((c,i)=>{if(c.qboId)byQbo.set(c.qboId,i);byName.set(c.name.trim().toLowerCase(),i)});

        let added=0,updated=0;
        const qboIdToLocalId=new Map<string,string>();
        for(const q of qCustomers){
          const at=byQbo.has(q.qboId)?byQbo.get(q.qboId)!:(byName.has(q.name.trim().toLowerCase())?byName.get(q.name.trim().toLowerCase())!:-1);
          if(at>=0){
            const prev=customers[at];
            customers[at]={...prev,qboId:q.qboId,qb:true,name:q.name,
              // Never blank out a local value with an empty one from QuickBooks — a missing phone in
              // the books should not erase a phone number someone typed here.
              contact:q.contact||prev.contact,email:q.email||prev.email,phone:q.phone||prev.phone,
              billing:q.billing||prev.billing,delivery:q.delivery||prev.delivery,
              terms:q.terms||prev.terms,balance:q.balance};
            byQbo.set(q.qboId,at);updated++;
          }else{
            const id=`qb${q.qboId}`;
            customers.push({id,name:q.name,kind:"customer",contact:q.contact,email:q.email,phone:q.phone,
              rep:"",stage:q.active?"Active":"Inactive",balance:q.balance,lifetimeSales:0,
              billing:q.billing,delivery:q.delivery,terms:q.terms,notes:"",qb:true,qboId:q.qboId});
            byQbo.set(q.qboId,customers.length-1);byName.set(q.name.trim().toLowerCase(),customers.length-1);added++;
          }
        }
        for(const [qid,idx] of byQbo)qboIdToLocalId.set(qid,customers[idx].id);

        // Invoices, matched on qboId only — an invoice number is not unique enough to risk it.
        const documents:DocumentRecord[]=[...data.documents];
        const docByQbo=new Map<string,number>();
        documents.forEach((d,i)=>{if(d.qboId)docByQbo.set(d.qboId,i)});
        const sales=new Map<string,number>();
        let invAdded=0,invUpdated=0,orphaned=0;
        for(const inv of qInvoices){
          const customerId=qboIdToLocalId.get(inv.customerQboId);
          if(!customerId){orphaned++;continue}   // invoice for a customer QuickBooks did not return
          sales.set(customerId,(sales.get(customerId)||0)+inv.total);
          const first=inv.lines[0];
          const qty=inv.lines.reduce((n,l)=>n+l.quantity,0);
          const doc:DocumentRecord={
            id:`qbi${inv.qboId}`,kind:"invoice",customerId,
            item:first?first.item:"Invoice",cases:qty,quantity:qty,
            rate:first?first.rate:inv.total,discount:0,shipping:0,
            status:inv.balance<=0?"Paid":"Open",
            due:inv.due,paid:Math.max(0,inv.total-inv.balance),
            qbSynced:true,qboId:inv.qboId,qboDocNumber:inv.docNumber,
            note:inv.lines.length>1?`${inv.lines.length} lines in QuickBooks`:undefined,
          };
          const at=docByQbo.get(inv.qboId);
          if(at!=null){documents[at]={...documents[at],...doc,id:documents[at].id};invUpdated++}
          else{documents.push(doc);invAdded++}
        }
        // Lifetime sales are recomputed from the invoices actually imported. On a full import that is
        // the true history; on an incremental one it would only see the recent window, so it is only
        // applied when no "since" bound was given.
        const finalCustomers=body.since?customers:customers.map(c=>sales.has(c.id)?{...c,lifetimeSales:Math.round(sales.get(c.id)!)}:c);

        const summary=`Imported ${added} new and ${updated} updated customer${added+updated===1?"":"s"}, ${invAdded} new and ${invUpdated} updated invoice${invAdded+invUpdated===1?"":"s"}`;
        await writeState({...data,customers:finalCustomers,documents,
          settings:{...data.settings,quickBooks:{...data.settings.quickBooks,connected:true,lastSync:new Date().toISOString()}}},
          user.email,"qbo.import",summary);
        return Response.json({ok:true,customers:{added,updated,total:qCustomers.length},
          invoices:{added:invAdded,updated:invUpdated,total:qInvoices.length,orphaned},summary});
      }
      default:return Response.json({error:"Unknown op"},{status:400});
    }
  }catch(e){console.error("qbo",body.op,e);return Response.json({error:e instanceof Error?e.message:"QuickBooks request failed"},{status:502})}
}
