/** P6: EDOPro manual testing evidence. No replay decoding or game execution. */
import type { DeckStudy } from './deckMath';
import type { CombinationPlan } from './combinationMath';
import { validateCombinationPlan } from './combinationMath';

export type ShuffleMode='무작위 셔플(사용자 기록)'|'의도적으로 구성한 패'|'추출 방식 미확인';
export type DuelOutcome='전개 성공(사용자 판정)'|'전개 실패(사용자 판정)'|'판정 보류';
export type ReplayEvidence={filename:string;size:number;sha256:string;format:'yrp'|'yrpX'};
export type HandAssessment={matchedRoutes:string[];eligible:boolean|null;riskPresent:boolean|null};
export type DuelEvidenceRecord={
  schemaVersion:1;id:string;studyId:string;studyRevision:number;deckFingerprint:string;
  themeId:string;recordedAt:string;handSize:5|6;hand:string[];
  shuffleMode:ShuffleMode;outcome:DuelOutcome;note:string;
  assessment:HandAssessment;replay?:ReplayEvidence;
};
export type EvidenceBackup={kind:'ygo_card_studio_edopro_evidence';schemaVersion:1;exportedAt:string;records:DuelEvidenceRecord[]};
export const SHUFFLE_MODES:ShuffleMode[]=['무작위 셔플(사용자 기록)','의도적으로 구성한 패','추출 방식 미확인'];
export const DUEL_OUTCOMES:DuelOutcome[]=['전개 성공(사용자 판정)','전개 실패(사용자 판정)','판정 보류'];
const cardId=(id:string)=>/^[1-9]\d{0,11}$/.test(id)&&Number.isSafeInteger(Number(id));
const sha=(s:string)=>/^[0-9a-f]{64}$/i.test(s);
const counts=(cards:readonly string[])=>{
  const tally=new Map<string,number>();
  for(const id of cards)tally.set(id,(tally.get(id)||0)+1);
  return tally;
};
export function parseHand(input:string):string[]{
  const values=input.trim().split(/[\s,，;]+/).filter(Boolean);
  if(!values.length)throw new Error('EDOPro에서 확인한 첫 패 카드 ID를 입력하세요.');
  if(values.some(x=>!cardId(x)))throw new Error('첫 패에는 카드 ID만 입력할 수 있습니다.');
  if(values.length!==5&&values.length!==6)throw new Error('첫 패는 정확히 5장 또는 6장이어야 합니다.');
  return values;
}
export function validateHand(main:readonly string[],hand:readonly string[],handSize:5|6):void{
  if(hand.length!==handSize)throw new Error('첫 패 카드 장수와 패 설정이 일치하지 않습니다.');
  const available=counts(main),observed=counts(hand);
  for(const [id,count] of observed){
    if(!cardId(id)||count>(available.get(id)||0))
      throw new Error(id+' 카드는 분석안의 메인 덱 채용 매수보다 많이 입력되었거나 존재하지 않습니다.');
  }
}
/** Cards are physical hand slots. A+B must use distinct slots even for the same ID. */
export function assessDuelHand(hand:readonly string[],plan:CombinationPlan):HandAssessment{
  if(!validateCombinationPlan(plan))throw new Error('초동 분석 조건이 올바르지 않습니다.');
  if(!plan.routes.length)return {matchedRoutes:[],eligible:null,riskPresent:plan.brickIds.length?hand.some(x=>plan.brickIds.includes(x)):null};
  const matchedRoutes:string[]=[];
  for(const route of plan.routes){
    if((route.forbiddenIds||[]).some(id=>hand.includes(id)))continue;
    const resources=(route.resourceIds||[]),needed=route.minResources||0;
    if(needed>hand.filter(id=>resources.includes(id)).length)continue;
    const core=route.b.length===0?hand.some(id=>route.a.includes(id)):
      hand.some((left,i)=>route.a.includes(left)&&hand.some((right,j)=>i!==j&&route.b.includes(right)));
    if(core)matchedRoutes.push(route.id);
  }
  return {matchedRoutes,eligible:matchedRoutes.length>0,
    riskPresent:plan.brickIds.length?hand.some(x=>plan.brickIds.includes(x)):null};
}
export function stableDeckSnapshot(study:DeckStudy):string{
  // Maintains actual order to identify exactly the user-exported YDK deck and condition rules.
  return JSON.stringify({main:study.main,extra:study.extra,side:study.side,plan:study.combinations||{routes:[],brickIds:[]}});
}
export async function snapshotSha256(study:DeckStudy):Promise<string>{
  const data=new TextEncoder().encode(stableDeckSnapshot(study));
  const buffer=new ArrayBuffer(data.byteLength);new Uint8Array(buffer).set(data);
  const dig=await crypto.subtle.digest('SHA-256',buffer);
  return [...new Uint8Array(dig)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function validateDuelRecord(x:unknown):x is DuelEvidenceRecord{
  if(!x||typeof x!=='object')return false;
  const r=x as Partial<DuelEvidenceRecord>;
  if(r.schemaVersion!==1||typeof r.id!=='string'||r.id.length<1||r.id.length>128||
    typeof r.studyId!=='string'||r.studyId.length<1||typeof r.studyRevision!=='number'||
    !Number.isSafeInteger(r.studyRevision)||r.studyRevision<1||
    typeof r.themeId!=='string'||!r.themeId||typeof r.deckFingerprint!=='string'||!sha(r.deckFingerprint)||
    typeof r.recordedAt!=='string'||!Number.isFinite(Date.parse(r.recordedAt))||
    (r.handSize!==5&&r.handSize!==6)||!Array.isArray(r.hand)||r.hand.length!==r.handSize||
    !r.hand.every(id=>typeof id==='string'&&cardId(id))||
    !SHUFFLE_MODES.includes(r.shuffleMode as ShuffleMode)||!DUEL_OUTCOMES.includes(r.outcome as DuelOutcome)||
    typeof r.note!=='string'||r.note.length>1500)return false;
  if(!r.assessment||typeof r.assessment!=='object'||!Array.isArray(r.assessment.matchedRoutes)||
    r.assessment.matchedRoutes.length>4||
    !r.assessment.matchedRoutes.every(id=>typeof id==='string')||
    (r.assessment.eligible!==null&&typeof r.assessment.eligible!=='boolean')||
    (r.assessment.riskPresent!==null&&typeof r.assessment.riskPresent!=='boolean'))return false;
  if(r.replay!==undefined){
    const f=r.replay;
    if(!f||typeof f.filename!=='string'||f.filename.length<1||f.filename.length>180||
      typeof f.size!=='number'||!Number.isSafeInteger(f.size)||f.size<=0||f.size>16*1024*1024||
      !sha(f.sha256)||(f.format!=='yrp'&&f.format!=='yrpX'))return false;
  }
  return true;
}
export function validateEvidenceBackup(x:unknown):x is EvidenceBackup{
  if(!x||typeof x!=='object')return false;
  const b=x as Partial<EvidenceBackup>;
  return b.kind==='ygo_card_studio_edopro_evidence'&&b.schemaVersion===1&&
    typeof b.exportedAt==='string'&&Array.isArray(b.records)&&b.records.length<=3000&&
    b.records.every(validateDuelRecord)&&new Set(b.records.map(r=>r.id)).size===b.records.length;
}
/** Statistical sample counts are declarations made by the user, not independently validated engine telemetry. */
export function reportedSummary(records:readonly DuelEvidenceRecord[],study:DeckStudy,hash:string,hand:5|6){
  const same=records.filter(r=>r.studyId===study.id&&r.studyRevision===study.revision&&
    r.deckFingerprint===hash&&r.handSize===hand);
  const observed=same.filter(r=>r.shuffleMode==='무작위 셔플(사용자 기록)'&&r.outcome!=='판정 보류');
  const won=observed.filter(r=>r.outcome==='전개 성공(사용자 판정)').length;
  const modelCompared=observed.filter(r=>r.assessment.eligible!==null);
  const mismatched=modelCompared.filter(r=>(r.assessment.eligible===true)!==(r.outcome==='전개 성공(사용자 판정)')).length;
  return {total:same.length,randomCompleted:observed.length,reportedSuccess:won,rate:observed.length?won/observed.length:null,
    modelCompared:modelCompared.length,mismatched,excluded:records.filter(r=>r.studyId===study.id).length-observed.length};
}
