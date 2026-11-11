import type { IndexedDeck } from './fileCatalog';
import { emptyCombinationPlan, validateCombinationPlan } from './combinationMath';
import type { CombinationPlan } from './combinationMath';

export type DeckRole = '초동' | '전개보조' | '말림' | '패트랩';
export const DECK_ROLES:readonly DeckRole[]=['초동','전개보조','말림','패트랩'];
export type DeckStudy={
  schemaVersion:1;id:string;sourceDeckId:string;themeId:string;name:string;
  main:string[];extra:string[];side:string[];tags:Record<string,DeckRole[]>;
  notes:string;revision:number;createdAt:string;updatedAt:string;
  /** Optional for backward compatibility with saved P5 studies and backups. */
  combinations?:CombinationPlan;
};
export type DeckStudyBackup={
  kind:'ygo_card_studio_deck_lab';schemaVersion:1;exportedAt:string;studies:DeckStudy[];
};
const validId=(id:string)=>/^[1-9]\d{0,11}$/.test(id)&&Number.isSafeInteger(Number(id));
const sum=(value:readonly string[])=>value.length;
export function cardCounts(ids:readonly string[]):Map<string,number>{
  const out=new Map<string,number>();
  for(const id of ids)out.set(id,(out.get(id)||0)+1);
  return out;
}
export function newDeckStudy(source:IndexedDeck):DeckStudy {
  const now=new Date().toISOString();
  return {schemaVersion:1,id:crypto.randomUUID(),sourceDeckId:source.id,
    themeId:source.themeId,name:source.name.replace(/\.ydk$/i,'')+' · 연구안',
    main:[...source.main],extra:[...source.extra],side:[...source.side],tags:{},
    notes:'',revision:0,createdAt:now,updatedAt:now,combinations:emptyCombinationPlan()};
}
export function validateDeckStudy(raw:unknown):raw is DeckStudy{
  if(!raw||typeof raw!=='object')return false;
  const s=raw as Partial<DeckStudy>;
  if(s.schemaVersion!==1||typeof s.id!=='string'||s.id.length<1||s.id.length>140||
    typeof s.themeId!=='string'||s.themeId.length<1||typeof s.sourceDeckId!=='string'||
    typeof s.name!=='string'||s.name.length>180||typeof s.notes!=='string'||s.notes.length>5000||
    !Number.isSafeInteger(s.revision)||s.revision!<0||
    typeof s.createdAt!=='string'||typeof s.updatedAt!=='string')return false;
  if(!Array.isArray(s.main)||!Array.isArray(s.extra)||!Array.isArray(s.side)||
    s.main.length>300||s.extra.length>30||s.side.length>30)return false;
  if(![...s.main,...s.extra,...s.side].every(id=>typeof id==='string'&&validId(id)))return false;
  if(s.combinations!==undefined&&!validateCombinationPlan(s.combinations))return false;
  if(!s.tags||typeof s.tags!=='object'||Array.isArray(s.tags)||Object.keys(s.tags).length>500)return false;
  return Object.entries(s.tags).every(([id,roles])=>validId(id)&&Array.isArray(roles)&&roles.length<=4&&
    new Set(roles).size===roles.length&&roles.every(r=>DECK_ROLES.includes(r)));
}
export function validateDeckBackup(raw:unknown):raw is DeckStudyBackup{
  if(!raw||typeof raw!=='object')return false;
  const b=raw as Partial<DeckStudyBackup>;
  if(b.kind!=='ygo_card_studio_deck_lab'||b.schemaVersion!==1||!Array.isArray(b.studies)||
    b.studies.length>2000||typeof b.exportedAt!=='string')return false;
  if(!b.studies.every(validateDeckStudy))return false;
  return new Set(b.studies.map(s=>s.id)).size===b.studies.length;
}
export function toggleDeckRole(study:DeckStudy,id:string,role:DeckRole):DeckStudy{
  if(!validId(id)||!DECK_ROLES.includes(role))throw new Error('역할 또는 카드 ID가 유효하지 않습니다.');
  if(!study.main.includes(id))throw new Error('메인 덱에 있는 카드만 역할을 지정할 수 있습니다.');
  const old=study.tags[id]||[];
  const next=old.includes(role)?old.filter(r=>r!==role):[...old,role];
  return {...study,tags:{...study.tags,[id]:next}};
}
export function setMainCopies(study:DeckStudy,id:string,count:number):DeckStudy{
  if(!validId(id)||!Number.isInteger(count)||count<0||count>3)throw new Error('1종당 0~3장으로 설정하세요.');
  const others=study.extra.filter(x=>x===id).length+study.side.filter(x=>x===id).length;
  if(count+others>3)throw new Error('메인·엑스트라·사이드 전체 합계가 3장을 초과합니다. 금제는 별도로 확인하세요.');
  const current=study.main.filter(x=>x===id).length;
  if(current===count)return study;
  if(study.main.length-current+count>60)throw new Error('메인 덱 60장을 초과합니다.');
  const main=study.main.filter(x=>x!==id);
  for(let i=0;i<count;i++)main.push(id);
  // Keep the role label after removal so original-YDK comparisons remain on equal assumptions.
  return {...study,main,tags:{...study.tags}};
}
export function deckWarnings(study:Pick<DeckStudy,'main'|'extra'|'side'>):string[]{
  const result:string[]=[];
  if(study.main.length<40||study.main.length>60)result.push('메인 덱 '+sum(study.main)+'장: 일반적인 OCG 덱 크기 40~60장 범위 밖입니다.');
  if(study.extra.length>15)result.push('엑스트라 덱 '+sum(study.extra)+'장: 15장 초과.');
  if(study.side.length>15)result.push('사이드 덱 '+sum(study.side)+'장: 15장 초과.');
  const counts=cardCounts([...study.main,...study.extra,...study.side]);
  for(const [id,count] of counts)if(count>3)result.push(id+' 총 '+count+'장: 기본 3장 제한 초과(실제 금제 별도).');
  if(study.main.length===0)result.push('메인 덱이 비어 있어 패 확률을 계산할 수 없습니다.');
  return result;
}
function chooseNone(total:number,excluded:number,hand:number):number{
  if(total<0||hand<0||hand>total)throw new Error('잘못된 덱 크기 또는 패 크기입니다.');
  const eligible=total-Math.max(0,Math.min(total,excluded));
  if(hand>eligible)return 0;
  let p=1;
  for(let i=0;i<hand;i++)p*= (eligible-i)/(total-i);
  return p;
}
/** Exact hypergeometric probability under a uniform shuffle, without replacement. */
export function openingMetrics(study:Pick<DeckStudy,'main'|'tags'>,hand:5|6){
  const total=study.main.length,counts=cardCounts(study.main);
  const count=(role:DeckRole)=>[...counts].reduce((n,[id,c])=>n+((study.tags[id]||[]).includes(role)?c:0),0);
  const union=(a:DeckRole,b:DeckRole)=>[...counts].reduce((n,[id,c])=>
    n+((study.tags[id]||[]).some(r=>r===a||r===b)?c:0),0);
  const starter=count('초동'),extender=count('전개보조'),brick=count('말림'),handTrap=count('패트랩');
  if(hand>total||total===0)return {total,hand,starter,extender,brick,handTrap,canCalculate:false,
    atLeastStarter:null,starterAndExtender:null,noStarterWithBrick:null,atLeastTwoBricks:null};
  const pNoStarter=chooseNone(total,starter,hand),pNoExtender=chooseNone(total,extender,hand);
  const pNoStarterOrExtender=chooseNone(total,union('초동','전개보조'),hand);
  const pNoStarterOrBrick=chooseNone(total,union('초동','말림'),hand);
  // P(X=1) = K * C(N-K,h-1) / C(N,h) = (K*h/N)*C(N-K,h-1)/C(N-1,h-1)
  const pOneBrick=brick===0?0:(brick*hand/total)*chooseNone(total-1,brick-1,hand-1);
  const clamp=(x:number)=>Math.min(1,Math.max(0,x));
  return {total,hand,starter,extender,brick,handTrap,canCalculate:true,
    atLeastStarter:clamp(1-pNoStarter),
    starterAndExtender:clamp(1-pNoStarter-pNoExtender+pNoStarterOrExtender),
    noStarterWithBrick:clamp(pNoStarter-pNoStarterOrBrick),
    atLeastTwoBricks:clamp(1-chooseNone(total,brick,hand)-pOneBrick)};
}
export function exportYdk(study:Pick<DeckStudy,'main'|'extra'|'side'>):string{
  return ['#created by YGO CARD STUDIO - scenario only','#main',...study.main,
    '#extra',...study.extra,'!side',...study.side,''].join('\n');
}
