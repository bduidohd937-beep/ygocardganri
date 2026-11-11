/** P3: Imported CDB text and files are evidence, never automatically approved designs. */
import type { FileCatalog, AssetEntry, IndexedCard } from './fileCatalog';
import type { ApprovalStatus, BalanceStatus, EngineStatus, RuleStatus } from './data';

export type LinkedCard = {
  themeId: string; passcode: string; sourceCards: IndexedCard[]; files: AssetEntry[];
  name: string; conflictingSources: boolean;
};
export type ReviewField = 'designStatus'|'artStatus'|'ocg'|'balance'|'cdb'|'lua'|'duel';
export type CardReview = {
  designStatus: ApprovalStatus; artStatus: ApprovalStatus;
  ocg: RuleStatus; balance: BalanceStatus;
  cdb: EngineStatus; lua: EngineStatus; duel: EngineStatus;
};
export type ImportedProposal = {
  id:string; text:string; note:string; sourceId:string|null; createdAt:string;
  status:'미승인'|'승인'|'반려'; reviewedAt?:string;
};
export type ImportedChange = {
  id:string; at:string; revision:number; action:string; field:string;
  before:string; after:string; note:string;
};
export type ImportedRecord = {
  schemaVersion:1; themeId:string; passcode:string; revision:number; updatedAt:string;
  workingName:string; design:string; notes:string;
  approvedEffect:string; approvedEffectSource:string;
  proposals:ImportedProposal[]; review:CardReview; history:ImportedChange[];
};
const uid=()=>globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random()}`;
const now=()=>new Date().toISOString();
const recordText=(v:unknown)=>v === null || v === undefined ? '' : String(v);
export const reviewDefaults:CardReview={
  designStatus:'미확인',artStatus:'미확인',ocg:'미확인',balance:'미확인',
  cdb:'미확인',lua:'미확인',duel:'미확인',
};
const reviewOptions:Record<ReviewField, readonly string[]>={
  designStatus:['미확인','초안','검토중','승인','반려'],
  artStatus:['미확인','초안','검토중','승인','반려'],
  ocg:['미확인','검토중','충돌 확인','충돌 없음 확인'],
  balance:['미확인','검토중','수정 필요','통과'],
  cdb:['미확인','미착수','진행중','완료','검증완료'],
  lua:['미확인','미착수','진행중','완료','검증완료'],
  duel:['미확인','미착수','진행중','완료','검증완료'],
};
export const cardRecordKey=(themeId:string,passcode:string)=>JSON.stringify([themeId,passcode]);
const passcodeValid=(passcode:string)=>/^[1-9]\d{0,11}$/.test(passcode)&&Number.isSafeInteger(Number(passcode));

/** The same ID in different themes is intentionally a separate record. */
export function collectLinkedCards(catalog:FileCatalog,themeId?:string):LinkedCard[] {
  const all=new Map<string,LinkedCard>();
  const ensure=(id:string,code:string):LinkedCard=>{
    const key=cardRecordKey(id,code);const present=all.get(key);
    if(present)return present;
    const item:LinkedCard={themeId:id,passcode:code,sourceCards:[],files:[],name:'미확인',conflictingSources:false};
    all.set(key,item);return item;
  };
  const assetsById=new Map(catalog.assets.map(a=>[a.id,a]));
  for(const card of catalog.cards){
    if((themeId && card.themeId!==themeId)||!passcodeValid(card.passcode))continue;
    const linked=ensure(card.themeId,card.passcode);linked.sourceCards.push(card);
    const source=assetsById.get(card.sourceId);
    if(source&&source.themeId===card.themeId&&!linked.files.some(f=>f.id===source.id))linked.files.push(source);
  }
  for(const file of catalog.assets){
    if((themeId&&file.themeId!==themeId)||!file.cardId||!passcodeValid(file.cardId))continue;
    const linked=ensure(file.themeId,file.cardId);
    if(!linked.files.some(f=>f.id===file.id))linked.files.push(file);
  }
  return [...all.values()].map(card=>{
    // Different names OR effect texts indicate incompatible source variants.
    const variants=new Set(card.sourceCards.map(c=>JSON.stringify([c.name,c.effectText])));
    const names=new Set(card.sourceCards.map(c=>c.name.trim()).filter(Boolean));
    return {...card, name:names.size===1?[...names][0]:'미확인',conflictingSources:variants.size>1};
  }).sort((a,b)=>a.themeId.localeCompare(b.themeId)||a.passcode.localeCompare(b.passcode,undefined,{numeric:true}));
}
export function emptyImportedRecord(themeId:string,passcode:string):ImportedRecord {
  if(!themeId||!passcodeValid(passcode))throw new Error('유효한 테마 및 카드 ID가 필요합니다.');
  return {schemaVersion:1,themeId,passcode,revision:0,updatedAt:'',workingName:'',design:'',notes:'',
    approvedEffect:'',approvedEffectSource:'',proposals:[],review:{...reviewDefaults},history:[]};
}
export function validateImportedRecord(value:unknown):value is ImportedRecord {
  if(!value||typeof value!=='object')return false;
  const v=value as Partial<ImportedRecord>;
  if(v.schemaVersion!==1||typeof v.themeId!=='string'||typeof v.passcode!=='string'||!passcodeValid(v.passcode))return false;
  if(!Number.isSafeInteger(v.revision)||v.revision!<0||typeof v.updatedAt!=='string')return false;
  if(typeof v.workingName!=='string'||typeof v.design!=='string'||typeof v.notes!=='string'||typeof v.approvedEffect!=='string'||typeof v.approvedEffectSource!=='string')return false;
  if(!v.review||!Array.isArray(v.proposals)||!Array.isArray(v.history)||v.proposals.length>5000||v.history.length>100000)return false;
  if(!Object.keys(reviewOptions).every(k=>reviewOptions[k as ReviewField].includes(v.review![k as ReviewField])))return false;
  if(v.proposals.some(p=>!p||typeof p.id!=='string'||typeof p.text!=='string'||typeof p.note!=='string'||!['미승인','승인','반려'].includes(p.status)||typeof p.createdAt!=='string'))return false;
  if(v.history.some(h=>!h||typeof h.id!=='string'||typeof h.at!=='string'||typeof h.field!=='string'||typeof h.before!=='string'||typeof h.after!=='string'||!Number.isSafeInteger(h.revision)))return false;
  return true;
}
function changed(rec:ImportedRecord,action:string,field:string,before:unknown,after:unknown,note=''):ImportedRecord {
  const revision=rec.revision+1;
  const entry:ImportedChange={id:uid(),at:now(),revision,action,field,before:recordText(before),after:recordText(after),note};
  return {...rec,revision,updatedAt:entry.at,history:[entry,...rec.history]};
}
export function editImportedRecord(rec:ImportedRecord,patch:Partial<Pick<ImportedRecord,'workingName'|'design'|'notes'>>,note=''):ImportedRecord {
  let next=rec;
  for(const key of ['workingName','design','notes'] as const){
    const value=patch[key];if(value===undefined||rec[key]===value)continue;
    if(value.length>100_000)throw new Error('텍스트가 너무 깁니다.');
    next=changed({...next,[key]:value},'문서 수정',key,next[key],value,note);
  }
  return next;
}
export function setReview(rec:ImportedRecord,field:ReviewField,value:CardReview[ReviewField],note=''):ImportedRecord {
  if(!reviewOptions[field].includes(value))throw new Error('지원하지 않는 상태입니다.');
  if(rec.review[field]===value)return rec;
  return changed({...rec,review:{...rec.review,[field]:value}},'검수 상태 수동 변경',field,rec.review[field],value,note);
}
export function addImportedProposal(rec:ImportedRecord,text:string,note='',sourceId:string|null=null):ImportedRecord {
  if(!text.trim())throw new Error('효과 텍스트를 입력하세요.');
  if(text.length>100_000)throw new Error('효과 텍스트가 너무 깁니다.');
  const proposal:ImportedProposal={id:uid(),text:text.trim(),note:note.trim(),sourceId,createdAt:now(),status:'미승인'};
  return changed({...rec,proposals:[proposal,...rec.proposals]},'효과 제안 등록','proposal','',proposal.text,sourceId?`CDB 원본 ${sourceId} · ${note}`:note);
}
export function decideImportedProposal(rec:ImportedRecord,proposalId:string,decision:'승인'|'반려',note=''):ImportedRecord {
  const proposal=rec.proposals.find(p=>p.id===proposalId);
  if(!proposal)throw new Error('제안이 없습니다.');
  if(proposal.status!=='미승인')throw new Error('이미 처리한 제안입니다.');
  const reviewedAt=now();
  const proposals=rec.proposals.map(p=>p.id===proposalId?{...p,status:decision,reviewedAt}:p);
  let updated=changed({...rec,proposals},'효과 제안 '+decision,'proposal',proposal.status,decision,note);
  if(decision==='승인') {
    const before=rec.approvedEffect;
    const source=proposal.sourceId?`CDB 출처 ${proposal.sourceId}, 명시 승인 ${reviewedAt}`:`수동 제안 명시 승인 ${reviewedAt}`;
    updated=changed({...updated,approvedEffect:proposal.text,approvedEffectSource:source},'효과 원문 승인','approvedEffect',before,proposal.text,note);
  }
  return updated;
}