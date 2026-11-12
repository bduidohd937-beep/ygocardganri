import { validateBackup } from './logic';
import { validateWorkbenchBackup } from './workbenchVault';
import { parsePortableJson, parseYdk, validateCatalog, validCardId } from './sharedCatalog';
import type { ImportCandidate } from './sharedCatalog';

export type BackupKind =
  'studio'|'workbench'|'cardmaker'|'artlab'|'psh'|'shared'|'cards'|'ydk'|'csv'|'image'|'cdb'|'lua'|'replay'|'zip'|'other'|'invalid';
export type MigrationInspection = {
  kind:BackupKind;
  label:string;
  count:number|null;
  canMergeMetadata:boolean;
  note:string;
  blocked:boolean;
};
const isObject=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const labels:Record<BackupKind,string>={
  studio:'YGO CARD STUDIO 원장',workbench:'외부 카드 작업 문서',cardmaker:'카드 렌더러 프로젝트',
  artlab:'이미지 연구소 설정',psh:'PSH AI 검증 관제실',shared:'공통 카드·덱 보관함',
  cards:'카드 ID 목록',ydk:'YDK 덱 구성',csv:'CSV 카드·검수 자료',
  image:'카드 이미지 원본',cdb:'CDB 데이터베이스 원본',lua:'Lua 원본',replay:'EDOPro 리플레이',
  zip:'ZIP 원본 묶음',other:'기타 원본 파일',invalid:'검증 실패한 데이터'
};
const result=(kind:BackupKind,count:number|null,note:string,canMergeMetadata=false,blocked=false):MigrationInspection=>
  ({kind,count,label:labels[kind],note,canMergeMetadata,blocked});
export function inspectMigrationFile(filename:string,raw:unknown):MigrationInspection{
  const ext=filename.trim().toLowerCase().split('.').pop()||'';
  if(ext==='ydk'){
    if(typeof raw!=='string')return result('invalid',null,'YDK 텍스트를 읽을 수 없습니다.',false,true);
    try{const deck=parseYdk(raw,filename);return result('ydk',deck.main.length+deck.extra.length+deck.side.length,'메인/엑스트라/사이드 카드 ID 보존 · 원본 덱은 변경하지 않음',true);}
    catch(e){return result('invalid',null,'YDK 형식 확인 실패: '+String(e),false,true);}
  }
  if(ext==='json'){
    if(!isObject(raw)&&!Array.isArray(raw))return result('invalid',null,'JSON 객체/배열 구조가 올바르지 않습니다.',false,true);
    if(validateBackup(raw))return result('studio',raw.cards.length,'녹투르나 원장·승인·이력을 포함합니다. 기존 원장과 자동 병합하지 않습니다.');
    if(validateWorkbenchBackup(raw))return result('workbench',raw.records.length,'외부 테마 카드의 승인/검수 메모. 기존 문서에 자동 반영하지 않습니다.');
    if(validateCatalog(raw))return result('shared',raw.cards.length,'카드 ID·이름·효과 및 덱 구성. 충돌 검토 후 메타만 병합할 수 있습니다.',true);
    if(isObject(raw)&&raw.app==='PSH AI ARENA 검증 관제실'&&raw.schemaVersion===1&&isObject(raw.data)&&raw.data.schemaVersion===1&&['sessions','events','tests','features','issues','protection'].every(k=>Array.isArray(raw.data[k]))){
      return result('psh',((raw.data as Record<string,unknown>).sessions as unknown[]).length,'관제실 세션 및 결함 기록. 실전 결과 인증이나 기존 관제실 덮어쓰기는 하지 않습니다.');
    }
    if(isObject(raw)&&raw.version===1&&typeof raw.name==='string'&&Array.isArray(raw.cards)&&raw.cards.length<=2000&&raw.cards.every(c=>isObject(c)&&validCardId(c.id)!==null&&typeof c.name==='string'&&typeof c.frame==='string')){
      return result('cardmaker',raw.cards.length,'렌더러 카드 속성·일러스트를 원본으로 보관. 공통 카드 메타만 선택적으로 가져오기 가능',true);
    }
    if(isObject(raw)&&typeof raw.demo==='boolean'&&isObject(raw.settings)&&Array.isArray(raw.cards)&&raw.cards.length<=400&&raw.cards.every(c=>isObject(c)&&validCardId(c.id)!==null&&typeof c.name==='string')){
      return result('artlab',raw.cards.length,'이미지 연구소 카드 목록·프리셋 상태. 생성 이미지 ZIP은 별도 보관해야 합니다.',true);
    }
    if(Array.isArray(raw)&&raw.length<=2000&&raw.every(c=>isObject(c)&&validCardId(c.id)!==null&&typeof c.name==='string')){
      return result('cards',raw.length,'숫자 카드 ID 목록. 메타데이터를 확인한 뒤 신규만 합칠 수 있습니다.',true);
    }
    if(isObject(raw)&&Array.isArray(raw.cards)&&raw.cards.length<=2000&&raw.cards.every(c=>isObject(c)&&validCardId(c.id)!==null&&typeof c.name==='string')){
      return result('cards',raw.cards.length,'카드 ID와 이름이 있는 JSON. 검토 후 신규 메타만 추가할 수 있습니다.',true);
    }
    return result('other',null,'알려진 앱의 백업 형식과 일치하지 않습니다. 원문 바이트만 보존하며 자동 적용하지 않습니다.');
  }
  if(['jpg','jpeg','png','webp'].includes(ext))return result('image',null,'이미지 원본을 바이트 그대로 보관. 자동 카드 ID 연결은 아직 지원하지 않습니다.');
  if(ext==='cdb')return result('cdb',null,'CDB 원본을 수정하지 않고 보관. 이 앱은 이 파일을 EDOPro에 자동 설치하지 않습니다.');
  if(ext==='lua')return result('lua',null,'Lua 원본을 수정하지 않고 보관.');
  if(['yrp','yrpx'].includes(ext))return result('replay',null,'리플레이 파일 그대로 보관. 실제 경기 완료 판정과 별개입니다.');
  if(ext==='zip')return result('zip',null,'ZIP 전체를 보관. 이번 패치에서는 내부 파일을 자동 추출/실행/검증하지 않습니다.');
  if(ext==='csv')return result('csv',null,'CSV 원문 보관. 표 구조가 다를 수 있으므로 자동 승인·병합하지 않습니다.');
  return result('other',null,'지원되지 않는 확장자. 검증되지 않은 원본으로만 보관.');
}
export function parseMigrationContent(name:string,text:string):MigrationInspection{
  if(name.toLowerCase().endsWith('.json')){
    try{return inspectMigrationFile(name,JSON.parse(text));}
    catch{return result('invalid',null,'손상되거나 유효하지 않은 JSON입니다. 다른 자료를 덮어쓰지 않습니다.',false,true);}
  }
  return inspectMigrationFile(name,text);
}
export function metadataCandidate(kind:BackupKind,rawText:string,filename:string):ImportCandidate|null{
  if(kind==='ydk')return {cards:[],decks:[parseYdk(rawText,filename.replace(/\.ydk$/i,''))],invalid:0};
  if(!['shared','cardmaker','artlab','cards'].includes(kind))return null;
  const parsed:unknown=JSON.parse(rawText);
  // parsePortableJson strips artwork and unsupported fields. Approval/duel evidence is never inferred.
  return parsePortableJson(parsed,filename);
}
export const MIGRATION_LIMITS={fileBytes:40*1024*1024,maxFiles:30,zipTotalBytes:120*1024*1024} as const;
export function safeBackupFilename(s:string){
  const clean=s.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/^\.+/,'').slice(0,120);
  return clean||'이름없는_백업';
}
