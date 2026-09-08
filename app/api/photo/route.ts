// Product photos.
//
// A photo of the finished bottle is how somebody on the floor knows they are packing the right thing —
// "5 Gal + 2 Screw Caps" is a name, a picture is an identification. They are keyed by the item name the
// rest of the app already uses, so the catalogue, the inventory list and the warehouse tablet all reach
// the same image without another identifier to keep in step.
//
// Reading one is allowed to anyone who can already see the product: a signed-in user, or the warehouse
// link's token. Writing one is the owner's, like anything else that changes the catalogue.
import { userFromRequest } from "../../server/auth";
import { deletePhoto, listPhotos, readPhoto, readState, writePhoto } from "../../server/db";
import { tokenMatches } from "../../server/floor";

/** What a browser will actually display, and nothing that executes. SVG is excluded on purpose. */
const ALLOWED=["image/jpeg","image/png","image/webp"];
/** Roughly 700KB of image. The uploader shrinks photos long before this; it is a backstop, not a target. */
const MAX_BASE64=950_000;

const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"cache-control":"no-store"}});

async function mayRead(request:Request){
  if(await userFromRequest(request))return true;
  const t=new URL(request.url).searchParams.get("t")||request.headers.get("x-floor-token")||"";
  if(!t)return false;
  const row=await readState();
  return tokenMatches(t,row.payload.settings?.warehouseToken);
}

export async function GET(request:Request){
  try{
    const url=new URL(request.url);
    const item=url.searchParams.get("item")||"";
    if(!(await mayRead(request)))return json({error:"Please sign in"},401);
    // No item asked for: say which products have a photo, so a screen can build its URLs in one call.
    if(!item)return json({photos:await listPhotos()});
    const photo=await readPhoto(item);
    if(!photo)return json({error:"No photo for that item"},404);
    const bytes=Uint8Array.from(atob(photo.data),c=>c.charCodeAt(0));
    return new Response(bytes,{headers:{
      "content-type":photo.mime,
      "content-length":String(bytes.length),
      // The URL carries the version it was saved at, so a given URL never changes and can be held for
      // a long time. Private: it is behind a session or the warehouse link, not public.
      "cache-control":"private, max-age=604800, immutable",
      "etag":`"${photo.updatedAt}"`,
    }});
  }catch(error){console.error("photo read failed",error);return json({error:"That photo is temporarily unavailable"},503)}
}

export async function POST(request:Request){
  try{
    const user=await userFromRequest(request);
    if(!user)return json({error:"Please sign in"},401);
    if(user.role!=="owner")return json({error:"Only the owner can change product photos"},403);
    const body=await request.json() as {item?:string;dataUrl?:string};
    const item=String(body.item||"").trim();
    if(!item)return json({error:"Which product is this a photo of?"},400);

    const m=/^data:([a-z/+.-]+);base64,(.+)$/i.exec(String(body.dataUrl||""));
    if(!m)return json({error:"That does not look like an image"},400);
    const [,mime,data]=m;
    if(!ALLOWED.includes(mime.toLowerCase()))return json({error:"Photos must be JPEG, PNG or WebP"},400);
    if(data.length>MAX_BASE64)return json({error:"That photo is too large — take it again or crop it"},413);
    // Reject anything that is not really base64 rather than storing bytes that will fail to decode later.
    if(!/^[A-Za-z0-9+/]+={0,2}$/.test(data))return json({error:"That image could not be read"},400);

    const updatedAt=await writePhoto(item,mime.toLowerCase(),data,`${user.name} <${user.email}>`);
    return json({ok:true,item,updatedAt,url:`/api/photo?item=${encodeURIComponent(item)}&v=${encodeURIComponent(updatedAt)}`});
  }catch(error){console.error("photo write failed",error);return json({error:"That photo could not be saved"},503)}
}

export async function DELETE(request:Request){
  try{
    const user=await userFromRequest(request);
    if(!user)return json({error:"Please sign in"},401);
    if(user.role!=="owner")return json({error:"Only the owner can change product photos"},403);
    const item=new URL(request.url).searchParams.get("item")||"";
    if(!item)return json({error:"Which product?"},400);
    await deletePhoto(item,`${user.name} <${user.email}>`);
    return json({ok:true,item});
  }catch(error){console.error("photo delete failed",error);return json({error:"That photo could not be removed"},503)}
}
