"use client";
// Uploading a product photo from a phone or a tablet.
//
// A photo straight off a phone camera is three to eight megabytes, and it is going into a row in the
// company's Postgres — so it is resized and re-encoded in the browser before it is sent. A bottle on a
// bench does not need more than about a thousand pixels to be recognisable, and at that size the whole
// catalogue costs less than a single unedited photo would.

/** Longest edge, in pixels. Enough to identify a bottle and its label; far less than a camera gives. */
const MAX_EDGE=1100;
const QUALITY=0.72;

/** Read a file into an <img>, so it can be drawn at a smaller size. */
const load=(file:File)=>new Promise<HTMLImageElement>((resolve,reject)=>{
  const url=URL.createObjectURL(file);
  const img=new Image();
  img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
  img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("That file could not be read as an image"))};
  img.src=url;
});

/**
 * Shrink a photo and return it as a data URL. Always JPEG: a phone photo has no transparency to keep,
 * and PNG of a photograph is several times the size for no gain.
 */
export async function shrinkPhoto(file:File):Promise<string>{
  if(!/^image\//.test(file.type))throw new Error("That is not an image");
  const img=await load(file);
  const scale=Math.min(1,MAX_EDGE/Math.max(img.width,img.height));
  const w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));
  const canvas=document.createElement("canvas");
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("This browser cannot resize the photo");
  // A white ground, so a transparent PNG does not come out with black edges once it is JPEG.
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,w,h);
  ctx.drawImage(img,0,0,w,h);
  return canvas.toDataURL("image/jpeg",QUALITY);
}

/** Save a photo against an item. Returns the URL to show it at, already carrying its version. */
export async function savePhoto(item:string,file:File):Promise<string>{
  const dataUrl=await shrinkPhoto(file);
  const r=await fetch("/api/photo",{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({item,dataUrl})});
  const j=await r.json() as {url?:string;error?:string};
  if(!r.ok||!j.url)throw new Error(j.error||"That photo could not be saved");
  return j.url;
}

export async function removePhoto(item:string):Promise<void>{
  const r=await fetch(`/api/photo?item=${encodeURIComponent(item)}`,{method:"DELETE"});
  if(!r.ok){
    const j=await r.json().catch(()=>({})) as {error?:string};
    throw new Error(j.error||"That photo could not be removed");
  }
}

/** Which items have a photo, so a list can show thumbnails without asking for each one. */
export async function listPhotoItems():Promise<Record<string,string>>{
  const r=await fetch("/api/photo",{cache:"no-store"});
  if(!r.ok)return {};
  const j=await r.json() as {photos?:{item:string;updatedAt:string}[]};
  return Object.fromEntries((j.photos||[]).map(p=>[p.item,`/api/photo?item=${encodeURIComponent(p.item)}&v=${encodeURIComponent(p.updatedAt)}`]));
}
