"use client";
// Products — one record, one screen.
//
// A product used to be three records on three screens: an item rate for its price and how it is made, an
// inventory row for how many there are, and a SKU for the Amazon listing. They were joined by the item's
// name and edited separately, so they drifted: a price with no stock line, a listing with no price, a
// photo filed under a name nothing matched any more.
//
// Everything about a thing the shop sells is here — what it is, what it costs, what it sells for, what
// it is made from and on which mould, how it is packed and shipped, how many are on the shelf, its
// listing code, and its photo. One form, one save, and saveProduct keeps the three underlying records
// in step so they cannot come apart again.
import { useEffect, useState } from "react";
import { CAP_KINDS, DEFAULT_BLANKS, deleteProduct, freeStock, packagingPhotoKey, productUses, products, saveProduct,
  type Blank, type Product } from "../app-data";
import { Kpi, num, useApp, usd, usd2 } from "./store";
import { CatalogueEditor as Moulds } from "./owner";
import { listPhotoItems, removePhoto, savePhoto } from "./photo";

const BLANK:Product={name:"",kind:"finished",channel:"wholesale",rate:0,minimum:50,discountLimit:5,cost:0,
  caps:[],includes:[],unitsPerCase:2,packedAs:"boxed",shipsAs:"boxed",onHand:0,committed:0,reorder:0};

export function ProductsWorkspace(){
  const {data,commit,notify}=useApp();
  const [editing,setEditing]=useState<{p:Product;was?:string}|null>(null);
  const [photos,setPhotos]=useState<Record<string,string>>({});
  const [tab,setTab]=useState<"wholesale"|"amazon"|"raw">("wholesale");
  useEffect(()=>{listPhotoItems().then(setPhotos).catch(()=>{})},[]);
  const all=products(data);
  const rows=tab==="raw"?all.filter(p=>p.kind==="raw")
    :all.filter(p=>p.kind==="finished"&&(tab==="amazon"?p.channel!=="wholesale":p.channel!=="amazon"));
  const value=all.reduce((a,p)=>a+p.onHand*p.cost,0);
  const listed=all.filter(p=>p.sku).length;
  const noBlank=all.filter(p=>p.kind==="finished"&&p.blankId===undefined).length;

  return <>
    <div className="heading-row">
      <div><p className="eyebrow">One record per product</p><h1>Products</h1>
        <p className="intro">What it is, what it costs, what it sells for, how it is made, how it is packed, how many are on the shelf, and its photo — in one place.</p></div>
      <button className="primary" onClick={()=>setEditing({p:{...BLANK,kind:tab==="raw"?"raw":"finished",channel:tab==="amazon"?"amazon":"wholesale"}})}>
        + New {tab==="raw"?"material":tab==="amazon"?"listing":"product"}</button>
    </div>

    <div className="recap four">
      <Kpi label="Products" value={String(all.filter(p=>p.kind==="finished").length)} note={`${all.filter(p=>p.kind==="raw").length} materials`}/>
      <Kpi label="Stock value" value={usd(value)} note="on hand at cost"/>
      <Kpi label="Amazon listings" value={String(listed)} note={`${all.filter(p=>p.kind==="finished"&&p.channel!=="amazon").length} wholesale`}/>
      <Kpi label="Mould not set" value={String(noBlank)} note={noBlank?"production cannot schedule these until each says which mould, or that we buy it in":"every product has been answered"} warn={noBlank>0}/>
    </div>

    <div className="segmented" style={{marginBottom:6}}>
      <button className={tab==="wholesale"?"active":""} onClick={()=>setTab("wholesale")}>Wholesale</button>
      <button className={tab==="amazon"?"active":""} onClick={()=>setTab("amazon")}>Amazon listings</button>
      <button className={tab==="raw"?"active":""} onClick={()=>setTab("raw")}>Materials &amp; packaging</button>
    </div>
    <p className="prod-lead">{tab==="wholesale"
      ?"Bottles as they are sold to customers. This is the list sales quotes from."
      :tab==="amazon"
      ?"Listings. Each carries the code and barcode the floor labels with, a picture of the packed unit, and what goes in the box."
      :"What the products are made and packed from."}</p>

    <div className="prod-grid">
      {rows.map(p=>{
        const free=freeStock({onHand:p.onHand,committed:p.committed} as never);
        return <button className="prod-card" key={p.name} onClick={()=>setEditing({p,was:p.name})}>
          <div className="prod-shot">
            {photos[p.name]
              // Served by our own API route and already resized; no image optimiser in this deployment.
              // eslint-disable-next-line @next/next/no-img-element
              ?<img src={photos[p.name]} alt={p.name}/>
              :<span>No photo</span>}
          </div>
          <div className="prod-body">
            <b>{p.name}</b>
            {p.sub&&<small>{p.sub}</small>}
            <div className="prod-tags">
              {p.sku&&<em className="sku">{p.sku}</em>}
              {p.barcode&&<em className="bar">{p.barcode}</em>}
              {p.channel==="both"&&<em>Both channels</em>}
              {p.kind==="finished"&&p.blankId===undefined&&<em className="warn">Mould not set</em>}
              {p.kind==="finished"&&<em>{p.packedAs==="loose"?"Not boxed":`${p.unitsPerCase}/box`}</em>}
              {p.shipsAs!=="boxed"&&<em>{p.perPallet||"?"}/pallet</em>}
            </div>
            <div className="prod-nums">
              <span><i>Price</i>{p.rate?usd2(p.rate):"—"}</span>
              <span><i>On hand</i>{num(p.onHand)}</span>
              <span><i>Free</i>{num(free)}</span>
            </div>
          </div>
        </button>;
      })}
      {!rows.length&&<p className="empty-list">Nothing here yet.</p>}
    </div>

    <Moulds/>

    {editing&&<ProductEditor product={editing.p} was={editing.was}
      photo={editing.was?photos[editing.was]:undefined}
      packagingPhoto={editing.was?photos[packagingPhotoKey(editing.was)]:undefined}
      onPhoto={async(file,packaging)=>{
        if(!editing.was)throw new Error("Save the product first, then add its photo");
        await savePhoto(packaging?packagingPhotoKey(editing.was):editing.was,file);
        setPhotos(await listPhotoItems());
      }}
      onPhotoClear={async(packaging)=>{if(!editing.was)return;await removePhoto(packaging?packagingPhotoKey(editing.was):editing.was);setPhotos(await listPhotoItems())}}
      onClose={()=>setEditing(null)}
      onSave={p=>{
        commit(v=>saveProduct(v,p,editing.was),"product.save",`${p.name} saved`);
        notify(`${p.name} saved — price, stock, packing and listing together`,"Products");
        setEditing(null);
      }}
      onDelete={()=>{
        const uses=productUses(data,editing.was||"");
        if(uses.any){notify(`${editing.was} is used by ${[uses.orders.length&&`${uses.orders.length} orders`,uses.runs.length&&`${uses.runs.length} runs`,uses.steps&&`${uses.steps} plan steps`].filter(Boolean).join(", ")} — it cannot be removed`,"Products",true);return}
        commit(v=>deleteProduct(v,editing.was||""),"product.delete",`${editing.was} removed`);
        notify(`${editing.was} removed`,"Products");
        setEditing(null);
      }}/>}
  </>;
}

/** Everything about one product, in the order somebody actually thinks about it. */
function ProductEditor({product,was,photo,packagingPhoto,onSave,onDelete,onClose,onPhoto,onPhotoClear}:{
  product:Product;was?:string;photo?:string;packagingPhoto?:string;onSave:(p:Product)=>void;onDelete:()=>void;onClose:()=>void;
  onPhoto:(f:File,packaging?:boolean)=>Promise<void>;onPhotoClear:(packaging?:boolean)=>Promise<void>;
}){
  const {data}=useApp();
  const [p,setP]=useState<Product>(product);
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  const set=(patch:Partial<Product>)=>setP(x=>({...x,...patch}));
  const blanks:Blank[]=data.blanks?.length?data.blanks:DEFAULT_BLANKS;
  const raws=products(data).filter(x=>x.kind==="raw");
  const uses=was?productUses(data,was):null;
  const renaming=!!was&&was!==p.name;
  const num0=(v:string)=>Math.max(0,Number(v)||0);

  const save=()=>{
    if(!p.name.trim()){setErr("Give it a name — everything else keys off it");return}
    onSave({...p,name:p.name.trim()});
  };
  const pick=async(f?:File,packaging?:boolean)=>{
    if(!f)return;setBusy(true);setErr("");
    try{await onPhoto(f,packaging)}catch(e){setErr(e instanceof Error?e.message:"That photo could not be saved")}
    setBusy(false);
  };

  return <div className="overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="modal wide-modal prod-modal">
      <button className="close" onClick={onClose} aria-label="Close">×</button>
      <p className="eyebrow">{was?"Edit product":"New product"}</p>
      <h2>{p.name||"New product"}</h2>

      {err&&<p className="form-error">{err}</p>}

      <div className="prod-edit-top">
        <div className="prod-shot big">
          {photo
            // eslint-disable-next-line @next/next/no-img-element
            ?<img src={photo} alt={p.name}/>
            :<span>{was?"No photo":"Save first, then add a photo"}</span>}
        </div>
        <div className="prod-photo-actions">
          <b className="prod-photo-label">The product</b>
          <label className="secondary">{busy?"Working…":photo?"Replace photo":"Add photo"}
            <input type="file" accept="image/*" hidden disabled={!was||busy} onChange={e=>{pick(e.target.files?.[0]);e.target.value=""}}/></label>
          {photo&&<button className="cancel" onClick={()=>onPhotoClear()}>Remove photo</button>}
          <p className="hint">The same picture shows in this list, on the warehouse tablet and on the build sheet.</p>
        </div>
      </div>

      <h3 className="prod-sec">What it is</h3>
      <div className="form-grid">
        <label>Name<input value={p.name} onChange={e=>set({name:e.target.value})} placeholder="e.g. 5-Gallon Bottle · 2 caps"/></label>
        <label>Description<input value={p.sub||""} onChange={e=>set({sub:e.target.value})}/></label>
        <label>Type<select value={p.kind} onChange={e=>set({kind:e.target.value as Product["kind"]})}>
          <option value="finished">Product we sell</option><option value="raw">Material or packaging</option></select></label>
        <label>Unit<input value={p.unit||""} onChange={e=>set({unit:e.target.value})} placeholder="bottles, labels, cartons"/></label>
      </div>

      {p.kind==="finished"&&<>
        <h3 className="prod-sec">Which side sells it</h3>
        <div className="form-grid">
          <label>Sold as<select value={p.channel} onChange={e=>set({channel:e.target.value as Product["channel"]})}>
            <option value="wholesale">Wholesale — bottles to customers</option>
            <option value="amazon">Amazon listing</option>
            <option value="both">Both</option>
          </select></label>
        </div>

        <h3 className="prod-sec">What it sells for</h3>
        <div className="form-grid">
          <label>List price (each)<input type="number" step="0.05" value={p.rate} onChange={e=>set({rate:num0(e.target.value)})}/></label>
          <label>Floor price (each)<input type="number" step="0.05" value={p.floor??0} onChange={e=>set({floor:num0(e.target.value)})}/></label>
          <label>Minimum order<input type="number" value={p.minimum} onChange={e=>set({minimum:num0(e.target.value)})}/></label>
          <label>Rep discount limit %<input type="number" value={p.discountLimit} onChange={e=>set({discountLimit:num0(e.target.value)})}/></label>
          <label>Unit cost<input type="number" step="0.01" value={p.cost} onChange={e=>set({cost:num0(e.target.value)})}/></label>
          <label>Amazon listing code<input value={p.sku||""} onChange={e=>set({sku:e.target.value.trim()||undefined})} placeholder="ASIN — leave blank if not listed"/></label>
          {p.sku&&<label>Sold on<select value={p.channel||"amazon"} onChange={e=>set({channel:e.target.value as Product["channel"]})}>
            <option value="amazon">Amazon</option><option value="wholesale">Wholesale</option><option value="both">Both</option></select></label>}
        </div>

        {p.channel!=="wholesale"&&<>
          <h3 className="prod-sec">The listing — what the floor labels and packs</h3>
          <div className="form-grid">
            <label>Listing code (SKU)<input value={p.sku||""} onChange={e=>set({sku:e.target.value.trim()||undefined})} placeholder="ASIN or seller SKU"/></label>
            <label>Barcode on the label<input value={p.barcode||""} onChange={e=>set({barcode:e.target.value.trim()})} placeholder="FNSKU or UPC — the floor labels from this"/></label>
          </div>
          <p className="hint">The barcode is shown on the work order. A mislabelled unit is a returned pallet, so it is put in front of whoever is labelling rather than looked up somewhere else.</p>

          <div className="prod-edit-top" style={{marginTop:12}}>
            <div className="prod-shot big">
              {packagingPhoto
                // eslint-disable-next-line @next/next/no-img-element
                ?<img src={packagingPhoto} alt={`${p.name} packed`}/>
                :<span>{was?"No packed-unit photo":"Save first, then add one"}</span>}
            </div>
            <div className="prod-photo-actions">
              <b className="prod-photo-label">Packed unit</b>
              <label className="secondary">{busy?"Working…":packagingPhoto?"Replace":"Add packaging photo"}
                <input type="file" accept="image/*" hidden disabled={!was||busy} onChange={e=>{pick(e.target.files?.[0],true);e.target.value=""}}/></label>
              {packagingPhoto&&<button className="cancel" onClick={()=>onPhotoClear(true)}>Remove</button>}
              <p className="hint">What a finished box should look like — the floor checks against it.</p>
            </div>
          </div>

          <h3 className="prod-sec">Packed in the box with the bottle</h3>
          {p.includes.map((inc,i)=><div className="prod-inc" key={i}>
            <input value={inc.item} list="prod-all" onChange={e=>set({includes:p.includes.map((x,k)=>k===i?{...x,item:e.target.value}:x)})} placeholder="e.g. Screw cap, instruction card"/>
            <input type="number" min="1" value={inc.qty} onChange={e=>set({includes:p.includes.map((x,k)=>k===i?{...x,qty:Math.max(1,num0(e.target.value))}:x)})}/>
            <button className="cancel" onClick={()=>set({includes:p.includes.filter((_,k)=>k!==i)})}>Remove</button>
          </div>)}
          <button className="secondary" onClick={()=>set({includes:[...p.includes,{item:"",qty:1}]})}>+ Add something to the box</button>
          <datalist id="prod-all">{products(data).map(x=><option key={x.name} value={x.name}/>)}</datalist>
        </>}

        <h3 className="prod-sec">How it is made</h3>
        <div className="form-grid">
          <label>Moulded from<select value={p.blankId??""} onChange={e=>set({blankId:e.target.value})}>
            <option value="">We buy this in — not moulded here</option>
            {blanks.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label>Main material<input value={p.material||""} onChange={e=>set({material:e.target.value})} list="prod-raws" placeholder="type a new one or pick an existing"/>
            <datalist id="prod-raws">{raws.map(x=><option key={x.name} value={x.name}/>)}</datalist></label>
          <label>Caps per bottle<input type="number" min="0" value={p.caps[0]?.qty??0}
            onChange={e=>{const q=num0(e.target.value);set({caps:q?[{component:p.caps[0]?.component||"Screw cap",qty:q}]:[]})}}/></label>
          <label>Cap type<select value={p.caps[0]?.component||"Screw cap"} disabled={!p.caps.length}
            onChange={e=>set({caps:[{component:e.target.value,qty:p.caps[0]?.qty||1}]})}>{CAP_KINDS.map(c=><option key={c}>{c}</option>)}</select></label>
          <label>Colour<input value={p.colour||""} onChange={e=>set({colour:e.target.value})} placeholder="Natural"/></label>
          <label>Mould / tooling<input value={p.mold||""} onChange={e=>set({mold:e.target.value})}/></label>
        </div>
        {!p.blankId&&<p className="hint">Nothing is moulded for this, so production cannot schedule an order for it — right for anything bought in, and a problem for anything the shop makes.</p>}

        <h3 className="prod-sec">How it is packed and shipped</h3>
        <div className="form-grid">
          <label>Packed<select value={p.packedAs} onChange={e=>set({packedAs:e.target.value as Product["packedAs"]})}>
            <option value="boxed">Boxed</option><option value="loose">Not boxed</option><option value="pallet">Straight onto a pallet</option></select></label>
          <label>Shipped<select value={p.shipsAs} onChange={e=>set({shipsAs:e.target.value as Product["shipsAs"]})}>
            <option value="boxed">In boxes — no pallet</option><option value="pallet-boxed">Boxes on a pallet</option><option value="pallet-loose">On a pallet, no boxes</option></select></label>
          {p.packedAs!=="loose"&&<label>Per box<input type="number" min="1" value={p.unitsPerCase} onChange={e=>set({unitsPerCase:Math.max(1,num0(e.target.value))})}/></label>}
          {p.packedAs!=="loose"&&<label>Box size<input value={p.boxSize||""} onChange={e=>set({boxSize:e.target.value})} placeholder="18×18×10"/></label>}
          {p.packedAs!=="loose"&&<label>Box used<input value={p.boxItem||""} onChange={e=>set({boxItem:e.target.value})} list="prod-raws" placeholder="which carton comes off the shelf"/></label>}
          {p.shipsAs!=="boxed"&&<label>{p.shipsAs==="pallet-boxed"?"Boxes per pallet":"Bottles per pallet"}
            <input type="number" min="0" value={p.perPallet??0} onChange={e=>set({perPallet:num0(e.target.value)})}/></label>}
          {p.shipsAs!=="boxed"&&<label>Pallet pattern<input value={p.palletPattern||""} onChange={e=>set({palletPattern:e.target.value})} placeholder="6 per layer, 8 high, wrapped"/></label>}
          <label>Label used<input value={p.label||""} onChange={e=>set({label:e.target.value})} list="prod-raws"/></label>
        </div>
      </>}

      <h3 className="prod-sec">How many there are</h3>
      <div className="form-grid">
        <label>On hand<input type="number" value={p.onHand} onChange={e=>set({onHand:num0(e.target.value)})}/></label>
        <label>Promised to orders<input type="number" value={p.committed} onChange={e=>set({committed:num0(e.target.value)})}/></label>
        <label>Reorder at<input type="number" value={p.reorder} onChange={e=>set({reorder:num0(e.target.value)})}/></label>
        <label>Supplier<input value={p.supplier||""} onChange={e=>set({supplier:e.target.value})}/></label>
      </div>

      {p.kind==="finished"&&<label className="full-field">Standing instruction for the floor
        <input value={p.instructions||""} onChange={e=>set({instructions:e.target.value})} placeholder="e.g. caps hand-tightened, label square to the handle"/></label>}

      {renaming&&uses&&uses.any>0&&<p className="form-error">
        Renaming carries the stock line, the listing and the photo with it — but {uses.any} existing record{uses.any===1?"":"s"} ({[uses.orders.length&&`${uses.orders.length} orders`,uses.docs.length&&`${uses.docs.length} documents`,uses.runs.length&&`${uses.runs.length} runs`,uses.steps&&`${uses.steps} plan steps`].filter(Boolean).join(", ")}) keep the old name, because that is what was sold.
      </p>}

      <div className="button-row" style={{marginTop:16}}>
        {was&&<button className="cancel" onClick={onDelete}>Delete product</button>}
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button className="primary" onClick={save}>Save product</button>
      </div>
    </div>
  </div>;
}
