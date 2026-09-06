// The stage model now runs money-first. Existing orders hold numbers from the old list, so the
// migration has to land each one where the shop would actually expect to find it.
let pass=0,fail=0;
const t=(n,c,d)=>{if(c)pass++;else fail++;console.log(`${c?"  ok  ":"  FAIL"} ${n}${c?"":"  → "+d}`)};

const OLD=["Placed","In production","Quality check","Ready","Shipped","Invoiced","Paid"];
const NEW=["New","Quoted","Invoiced","Paid","In production","Ready to pack","Shipped","Done"];
const S={NEW:0,QUOTED:1,INVOICED:2,PAID:3,PRODUCTION:4,READY:5,SHIPPED:6,DONE:7};
const OLD_TO_NEW={0:S.NEW,1:S.PRODUCTION,2:S.PRODUCTION,3:S.READY,4:S.SHIPPED,5:S.SHIPPED,6:S.DONE};
const migrate=o=>{if(o.stageV2)return o.stage;const mapped=OLD_TO_NEW[o.stage]??S.NEW;return mapped};

console.log("\nOld orders land somewhere sensible:");
const cases=[[0,"New"],[1,"In production"],[2,"In production"],[3,"Ready to pack"],[4,"Shipped"],[5,"Shipped"],[6,"Done"]];
for(const [old,expect] of cases){
  const got=NEW[migrate({stage:old})];
  t(`${OLD[old]} → ${expect}`,got===expect,`got ${got}`);
}

console.log("\nNothing goes backwards in the real world:");
// An order that was shipped must never reappear as unpaid/unmade work.
t("shipped never returns to production",migrate({stage:4})>=S.SHIPPED);
t("old 'Invoiced' (post-ship) does not become pre-production",migrate({stage:5})>=S.SHIPPED);
t("paid stays finished",migrate({stage:6})===S.DONE);

console.log("\nMigration runs once:");
const already={stage:S.PRODUCTION,stageV2:true};
t("an already-migrated order is left alone",migrate(already)===S.PRODUCTION);

console.log("\nProduction is gated on money:");
const canStart=o=>(o.deposit||0)>0||o.payment==="Paid"||o.payment==="Deposit";
t("unpaid order cannot start",!canStart({payment:"Unpaid"}));
t("deposit releases it",canStart({deposit:500,payment:"Deposit"}));
t("paid in full releases it",canStart({payment:"Paid"}));
t("a zero deposit is not a deposit",!canStart({deposit:0,payment:"Unpaid"}));

console.log("\nStage order matches how the shop works:");
t("invoicing comes before production",NEW.indexOf("Invoiced")<NEW.indexOf("In production"));
t("payment comes before production",NEW.indexOf("Paid")<NEW.indexOf("In production"));
t("production comes before shipping",NEW.indexOf("In production")<NEW.indexOf("Shipped"));
t("quote comes before invoice",NEW.indexOf("Quoted")<NEW.indexOf("Invoiced"));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
