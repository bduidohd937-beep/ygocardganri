import { createInitialData, displayName, isAllowedArtworkUrl } from './data';
import {validateGenericRecords} from './genericCatalog';
import type { Card, History, Proposal, StudioData, World, WorldStage } from './data';

export const makeId = () => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const stamp = () => new Date().toISOString();
const asText = (value: unknown) => value === null || value === undefined ? '' : String(value);

function entry(entity: History['entity'], entityId: string, entityName: string, action: string, field: string, before: unknown, after: unknown, memo = ''): History {
  return { id: makeId(), at: stamp(), action, entity, entityId, entityName, field,
    before: asText(before), after: asText(after), memo };
}

/** 단순 편집으로 승인 효과 원문 또는 이미 승인/반려된 제안을 변경하지 못한다. */
export type CardPatch = Partial<Pick<Card,
  'name'|'level'|'attribute'|'race'|'monsterType'|'atk'|'def'|'design'|'artUrl'|'artStatus'|
  'approval'|'ocg'|'ocgNote'|'balance'|'balanceNote'|'cdb'|'lua'|'duel'|'source'|'notes'>>;

export function editCard(data: StudioData, cardId: string, patch: CardPatch, memo = '', allowProtectedNameChange = false): StudioData {
  const existing = data.cards.find(c => c.id === cardId);
  if (!existing) throw new Error('카드를 찾을 수 없습니다.');
  if (patch.name !== undefined && patch.name !== existing.name && existing.protectedName && !allowProtectedNameChange) {
    throw new Error('확정된 카드명을 변경하려면 별도의 확인이 필요합니다.');
  }
  if (patch.artUrl !== undefined && !isAllowedArtworkUrl(patch.artUrl)) throw new Error('이미지 URL은 http(s) 주소여야 합니다.');
  const changed: History[] = [];
  const next: Card = { ...existing };
  for (const [key, value] of Object.entries(patch) as [keyof CardPatch, CardPatch[keyof CardPatch]][]) {
    if (value === undefined || Object.is(existing[key], value)) continue;
    changed.push(entry('card', cardId, displayName(existing), '카드 문서 수정', key, existing[key], value, memo));
    // 모든 editable 필드는 문자열, 숫자 또는 null의 스칼라 값만을 갖는다.
    Object.assign(next, { [key]: value });
  }
  if (!changed.length) return data;
  if (patch.name !== undefined && patch.name !== existing.name) next.confirmedName = false;
  next.version += 1;
  next.updatedAt = stamp();
  return { ...data, cards: data.cards.map(c => c.id === cardId ? next : c), history: [...changed.reverse(), ...data.history] };
}

export function createCard(data: StudioData, worldId: string, phase: 0|1|2 = 0): StudioData {
  const world = data.worlds.find(w => w.id === worldId);
  if (!world) throw new Error('유효한 세계를 지정하세요.');
  const id = makeId();
  const now = stamp();
  const card: Card = {
    id, worldId, phase, name:'', confirmedName:false, protectedName:false,
    level:null, attribute:'', race:'', monsterType:'', atk:null, def:null,
    design:'', artUrl:'', artStatus:'미확인', effect:'', effectSource:'', proposals:[],
    approval:'미확인', ocg:'미확인', ocgNote:'', balance:'미확인', balanceNote:'',
    cdb:'미확인', lua:'미확인', duel:'미확인', source:'', notes:'',
    version:1, updatedAt:now,
  };
  return { ...data, cards: [...data.cards, card],
    history: [entry('card', id, displayName(card), '카드 문서 생성', 'worldId', '', world.name), ...data.history] };
}

export function proposeEffect(data: StudioData, cardId: string, text: string, note = ''): StudioData {
  const existing = data.cards.find(c=>c.id===cardId);
  if (!existing) throw new Error('카드를 찾을 수 없습니다.');
  if (!text.trim()) throw new Error('제안 효과를 입력하세요.');
  const p: Proposal = { id:makeId(), text:text.trim(), note:note.trim(), status:'미승인', createdAt:stamp() };
  const updated: Card = { ...existing, proposals:[p,...existing.proposals], updatedAt:stamp(), version:existing.version+1 };
  return { ...data, cards:data.cards.map(c=>c.id===cardId?updated:c),
    history:[entry('card',cardId,displayName(existing),'효과 제안 등록','효과 제안','',p.text,p.note),...data.history] };
}

export function decideEffect(data: StudioData, cardId: string, proposalId: string, decision: '승인'|'반려', memo = ''): StudioData {
  const existing = data.cards.find(c=>c.id===cardId);
  const candidate = existing?.proposals.find(p=>p.id===proposalId);
  if (!existing || !candidate) throw new Error('대상 효과 제안을 찾을 수 없습니다.');
  if (candidate.status !== '미승인') throw new Error('이미 심사한 제안은 다시 처리할 수 없습니다.');
  const decidedAt = stamp();
  const next: Card = { ...existing, proposals:existing.proposals.map(p=>p.id===proposalId ? {...p,status:decision,decidedAt}:p),
    updatedAt:decidedAt, version:existing.version+1 };
  const changes=[entry('card',cardId,displayName(existing),`효과 제안 ${decision}`,'제안 상태','미승인',decision,memo)];
  if (decision === '승인') {
    next.effect = candidate.text;
    next.effectSource = `제안 승인 ${decidedAt} / 카드 버전 v${next.version}`;
    changes.unshift(entry('card',cardId,displayName(existing),'효과 원문 승인 반영','effect',existing.effect,candidate.text,memo));
  }
  return { ...data, cards:data.cards.map(c=>c.id===cardId?next:c), history:[...changes,...data.history] };
}

export function updateWorldStage(data:StudioData, worldId:string, phase:0|1|2, patch:Partial<Pick<WorldStage,'lore'|'design'|'source'|'status'>>,memo=''):StudioData {
  const w=data.worlds.find(w=>w.id===worldId);if(!w)throw new Error('세계를 찾을 수 없습니다.');
  const current=w.stages[phase];if(!current)throw new Error('진화 단계를 찾을 수 없습니다.');
  if(patch.status==='확정'&&!(patch.source??current.source).trim())throw new Error('확정하려면 출처를 먼저 입력하세요.');
  const next:WorldStage={...current};
  const changes:History[]=[];
  for(const [key,value] of Object.entries(patch) as [keyof typeof patch,string][]){
    if(value===undefined||current[key]===value)continue;
    Object.assign(next,{[key]:value});changes.push(entry('world',worldId,w.name,'단계 설정 변경',`${phase}.${key}`,current[key],value,memo));
  }
  if(!changes.length)return data;
  const nextWorld:World={...w,stages:w.stages.map((s,i)=>i===phase?next:s)};
  return {...data,worlds:data.worlds.map(x=>x.id===worldId?nextWorld:x),history:[...changes.reverse(),...data.history]};
}

/** 위험한 백업을 그대로 사용하는 대신 최소 구조/연결 관계를 검증한다. */
export function validateBackup(value:unknown):value is StudioData {
  if(!value||typeof value!=='object')return false;
  const v=value as Partial<StudioData>;
  if(v.schemaVersion!==1||!Array.isArray(v.worlds)||!Array.isArray(v.cards)||!Array.isArray(v.history))return false;
  if(v.worlds.length>500||v.cards.length>20000||v.history.length>100000)return false;
  if(v.genericCards!==undefined&&!validateGenericRecords(v.genericCards))return false;
  const ids=new Set<string>();
  for(const w of v.worlds){
    if(!w||typeof w.id!=='string'||typeof w.name!=='string'||!Array.isArray(w.stages)||w.stages.length!==3)return false;
    if(w.stages.some(s=>!s||typeof s.lore!=='string'||typeof s.design!=='string'||typeof s.status!=='string'))return false;
    if(ids.has(w.id))return false;ids.add(w.id);
  }
  const cardIds=new Set<string>();
  for(const c of v.cards){
    if(!c||typeof c.id!=='string'||typeof c.name!=='string'||typeof c.worldId!=='string'||![-1,0,1,2].includes(c.phase))return false;
    if(c.worldId!=='common'&&!ids.has(c.worldId))return false;
    if(cardIds.has(c.id)||!Array.isArray(c.proposals)||typeof c.effect!=='string'||typeof c.version!=='number')return false;
    if(!isAllowedArtworkUrl(c.artUrl??''))return false;
    if(c.proposals.some(p=>!p||typeof p.id!=='string'||typeof p.text!=='string'||!['미승인','승인','반려'].includes(p.status)))return false;
    cardIds.add(c.id);
  }
  return v.history.every(h=>h&&typeof h.id==='string'&&typeof h.at==='string'&&typeof h.action==='string'&&typeof h.field==='string'&&typeof h.before==='string'&&typeof h.after==='string');
}

export function loadOrSeed(json:string|null):StudioData {
  if(!json)return createInitialData();
  try{const value:unknown=JSON.parse(json);if(validateBackup(value))return value;}catch{/* 잘못된 로컬 백업은 기본 시드로 진입 */}
  return createInitialData();
}

export function exportJson(data:StudioData):string {
  return JSON.stringify({...data,exportedAt:stamp(),app:'YGO CARD STUDIO'},null,2);
}