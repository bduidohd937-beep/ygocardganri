/** 범용 카드 도감: 채택·제작 기록·실전 검증은 서로 독립적인 상태이다. */
import {validCardId} from './sharedCatalog';

export type GenericAdoption='채택'|'보류'|'폐기';
export type GenericBuild='미확인'|'제작 기록'|'파일 확인';
export type GenericDuel='미검증'|'검증 중'|'통과'|'오류';
export type GenericSlot='original'|'overframe'|'final'|'lua';
export type GenericHistory={at:string;version:string;note:string};
export type GenericRecord={
  key:string;id:string;name:string;role:string;attribute:string;effect:string;version:string;
  adoption:GenericAdoption;cdb:GenericBuild;lua:GenericBuild;duel:GenericDuel;
  issues:string;history:GenericHistory[];
};

const create=(key:string,id:string,name:string,role:string,adoption:GenericAdoption,version='미확인'):GenericRecord=>({
  key,id,name,role,attribute:'',effect:'',version,adoption,
  cdb:adoption==='채택'?'제작 기록':'미확인',
  lua:adoption==='채택'?'제작 기록':'미확인',
  duel:'미검증',issues:'',history:[],
});
/** 사용자 제공 확정 정보만 시드로 기록한다. 효과·속성·후보 ID는 추측하지 않는다. */
export function initialGenericRecords():GenericRecord[]{
  return [
    create('card-990470201','990470201','정수약탈자 루미크론','특수 소환 대응 드로우','채택'),
    create('card-919300101','919300101','탐색세 징수관 로코','서치·회수 견제','채택'),
    create('card-919300102','919300102','반론의 여지는 없다','체인 무효·보호','채택'),
    create('card-919300103','919300103','원천봉쇄관 리제','덱·묘지 견제','채택'),
    create('card-919300104','919300104','공역의 관측자－오르비아','순간 광역 무효','채택','V0.8'),
    create('candidate-1','','반격의 첫 수','역할 확인 필요','보류'),
    create('candidate-2','','예비 시동','역할 확인 필요','보류'),
    create('candidate-3','','인과의 중재자－벨렌','역할 확인 필요','보류'),
    create('candidate-4','','차원의 유예','역할 확인 필요','보류'),
  ];
}
export function genericRecordsOrSeed(value:GenericRecord[]|undefined):GenericRecord[]{
  return value??initialGenericRecords();
}
export function validateGenericRecords(value:unknown):value is GenericRecord[]{
  if(!Array.isArray(value)||value.length>2000)return false;
  const keys=new Set<string>(),ids=new Set<string>();
  for(const item of value){
    if(!item||typeof item!=='object')return false;
    const r=item as Partial<GenericRecord>;
    if(typeof r.key!=='string'||!r.key||r.key.length>150||keys.has(r.key))return false;
    keys.add(r.key);
    if(typeof r.id!=='string'||(r.id!==''&&!validCardId(r.id)))return false;
    if(r.id){if(ids.has(r.id))return false;ids.add(r.id);}
    if(typeof r.name!=='string'||!r.name.trim()||r.name.length>120)return false;
    for(const [field,max] of [['role',200],['attribute',40],['effect',30000],['version',80],['issues',10000]] as const){
      if(typeof r[field]!=='string'||r[field].length>max)return false;
    }
    if(!['채택','보류','폐기'].includes(r.adoption as string)||
      !['미확인','제작 기록','파일 확인'].includes(r.cdb as string)||
      !['미확인','제작 기록','파일 확인'].includes(r.lua as string)||
      !['미검증','검증 중','통과','오류'].includes(r.duel as string))return false;
    if(!Array.isArray(r.history)||r.history.length>500||r.history.some(h=>
      !h||typeof h.at!=='string'||h.at.length>60||
      typeof h.version!=='string'||h.version.length>80||
      typeof h.note!=='string'||h.note.length>2000))return false;
  }
  return true;
}
export function searchGeneric(records:readonly GenericRecord[],query:string,adoption:GenericAdoption|'전체',
  references:ReadonlyMap<string,{name:string;effect:string;attribute?:string}>=new Map()):GenericRecord[]{
  const q=query.trim().toLocaleLowerCase('ko');
  return records.filter(r=>(adoption==='전체'||r.adoption===adoption)&&(!q||[
    r.id,r.name,r.role,r.attribute,r.effect,r.issues,r.version,
    references.get(r.id)?.name||'',references.get(r.id)?.effect||'',references.get(r.id)?.attribute||''
  ].join(' ').toLocaleLowerCase('ko').includes(q)));
}
export function genericCsv(records:readonly GenericRecord[]):string{
  const escape=(v:string)=>'"'+(/^[\s]*[=+\-@\t\r]/.test(v)?"'"+v:v).replace(/"/g,'""')+'"';
  const headings=['카드 ID','카드명','역할','속성','채택','CDB 제작','Lua 제작','EDOPro 실전','효과 버전','효과 원문','오류·검증 메모'];
  return '\uFEFF'+[headings,...records.map(r=>[
    r.id,r.name,r.role,r.attribute,r.adoption,r.cdb,r.lua,r.duel,r.version,r.effect,r.issues
  ])].map(row=>row.map(escape).join(',')).join('\r\n')+'\r\n';
}
export const genericFolder=(r:GenericRecord):string=>{
  const category=r.adoption==='채택'?'채택카드':r.adoption==='보류'?'보류카드':'폐기카드';
  const name=r.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/\s+/g,'_').slice(0,70);
  return category+'/'+(r.id||'ID미정_'+r.key.replace(/[^a-zA-Z0-9_-]/g,'_'))+'_'+name+'/';
};
export function genericBackup(records:readonly GenericRecord[]):string{
  if(!validateGenericRecords(records))throw Error('도감 데이터가 손상되었습니다.');
  return JSON.stringify({kind:'ygo_generic_card_catalog',schemaVersion:1,records},null,2);
}
export function parseGenericBackup(raw:unknown):GenericRecord[]{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('도감 백업 형식이 아닙니다.');
  const backup=raw as {kind?:unknown;schemaVersion?:unknown;records?:unknown};
  if(backup.kind!=='ygo_generic_card_catalog'||backup.schemaVersion!==1||
     !validateGenericRecords(backup.records))throw Error('도감 백업 버전 또는 카드 목록이 잘못되었습니다.');
  return backup.records;
}
