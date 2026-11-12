/** P6.1 stage 1: a read-only inventory of user-selected local exports.
 * Never infer match wins, opening hands, engine verification, or deck identity from unknown schemas.
 */
import JSZip from 'jszip';

export type ArenaExportFormat='json'|'csv'|'zip';
export type ArenaExportPreview={structure:string;itemCount:number|null;fields:string[];notes:string[]};
export type ArenaIntakeRecord={
  schemaVersion:1;id:string;studyId:string;studyRevision:number;deckFingerprint:string;
  importedAt:string;filename:string;size:number;sha256:string;format:ArenaExportFormat;
  preview:ArenaExportPreview;verification:'원본 파일 보관 · 내용 미검증';
};

const MAX_BYTES=16*1024*1024;
const SAFE_SHA=/^[a-f0-9]{64}$/;
export function validateArenaIntakeRecord(v:unknown):v is ArenaIntakeRecord{
  if(!v||typeof v!=='object')return false;
  const x=v as Partial<ArenaIntakeRecord>,p=x.preview;
  return x.schemaVersion===1&&typeof x.id==='string'&&x.id.length<=350&&x.id.length>0&&
    typeof x.studyId==='string'&&x.studyId.length>0&&x.studyId.length<=140&&
    Number.isSafeInteger(x.studyRevision)&&x.studyRevision!>=1&&
    typeof x.deckFingerprint==='string'&&SAFE_SHA.test(x.deckFingerprint)&&
    typeof x.importedAt==='string'&&!Number.isNaN(Date.parse(x.importedAt))&&
    typeof x.filename==='string'&&x.filename.length>0&&x.filename.length<=180&&
    typeof x.size==='number'&&Number.isSafeInteger(x.size)&&x.size>0&&x.size<=MAX_BYTES&&
    typeof x.sha256==='string'&&SAFE_SHA.test(x.sha256)&&
    (x.format==='json'||x.format==='csv'||x.format==='zip')&&
    x.verification==='원본 파일 보관 · 내용 미검증'&&!!p&&
    typeof p.structure==='string'&&p.structure.length<=100&&
    (p.itemCount===null||(typeof p.itemCount==='number'&&Number.isSafeInteger(p.itemCount)&&p.itemCount>=0))&&
    Array.isArray(p.fields)&&p.fields.length<=24&&p.fields.every(z=>typeof z==='string'&&z.length<=90)&&
    Array.isArray(p.notes)&&p.notes.length<=8&&p.notes.every(z=>typeof z==='string'&&z.length<=180);
}
const safeFields=(fields:string[])=>fields.slice(0,24).map(x=>x.slice(0,90));

/** Reports structure only. A "sessions" key is NOT proof of real duel sessions. */
export function summarizeArenaJson(raw:unknown):ArenaExportPreview{
  if(Array.isArray(raw))return {structure:'최상위 JSON 배열',itemCount:raw.length,fields:[],
    notes:['배열 길이는 경기 수 또는 검증된 성공 횟수가 아닙니다.']};
  if(raw!==null&&typeof raw==='object'){
    const obj=raw as Record<string,unknown>;
    const keys=Object.keys(obj);
    const arrays=keys.filter(k=>Array.isArray(obj[k]));
    return {structure:'최상위 JSON 객체',itemCount:null,fields:safeFields(keys),
      notes:arrays.length?['배열 형태 필드: '+arrays.slice(0,4).join(', ').slice(0,140)]:['전용 경기장 스키마 확인 전에는 수치를 변환하지 않습니다.']};
  }
  throw new Error('JSON 최상위 값은 객체 또는 배열이어야 합니다.');
}

export function summarizeArenaCsv(source:string):ArenaExportPreview{
  const text=source.replace(/^\uFEFF/,'');
  if(!text.trim())throw new Error('CSV 파일이 비어 있습니다.');
  const header:string[]=[];
  let cell='',first=true,inQuotes=false,atStart=true,cols=0,records=0;
  const endCell=()=>{
    if(first)header.push(cell.slice(0,90));
    cols++;cell='';atStart=true;
    if(cols>128)throw new Error('CSV 열 128개 제한을 초과했습니다.');
  };
  const endRow=()=>{
    endCell();
    if(first){first=false;if(header.length===0||header.every(x=>!x.trim()))throw new Error('CSV 헤더가 없습니다.');}
    else records++;
    if(records>100000)throw new Error('CSV 행 100000개 제한을 초과했습니다.');
    cols=0;
  };
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(inQuotes){
      if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}
      else if(c==='"')inQuotes=false;
      else cell+=c;
    }else if(c==='"'){
      if(!atStart)throw new Error('CSV 따옴표 형식이 올바르지 않습니다.');
      inQuotes=true;atStart=false;
    }else if(c===','){endCell();}
    else if(c==='\n'||c==='\r'){
      endRow();if(c==='\r'&&text[i+1]==='\n')i++;
    }else{cell+=c;atStart=false;}
  }
  if(inQuotes)throw new Error('CSV 따옴표가 닫히지 않았습니다.');
  if(cell.length||cols>0||atStart===false)endRow();
  return {structure:'CSV 헤더/데이터 행',itemCount:records,fields:safeFields(header),
    notes:['행 개수는 경기 완료 수·승리 수를 의미하지 않습니다.']};
}

export async function sha256Blob(blob:Blob):Promise<string>{
  const data=await blob.arrayBuffer();
  const hash=await crypto.subtle.digest('SHA-256',data);
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}

/** For ZIP, inspect only the directory table; never decompress unknown entries or run content. */
export async function inspectArenaExport(file:File):Promise<{sha256:string;format:ArenaExportFormat;preview:ArenaExportPreview}>{
  const name=file.name.toLowerCase();
  const format:ArenaExportFormat=name.endsWith('.json')?'json':name.endsWith('.csv')?'csv':name.endsWith('.zip')?'zip':null as never;
  if(!format)throw new Error('JSON·CSV·ZIP 파일만 수집합니다.');
  if(file.size<1||file.size>MAX_BYTES)throw new Error('파일 크기는 1바이트~16MiB만 지원합니다.');
  if(file.name.length>180)throw new Error('파일명이 180자를 넘습니다.');
  let preview:ArenaExportPreview;
  if(format==='json'){
    let raw:unknown;
    try{raw=JSON.parse(await file.text());}catch{throw new Error('JSON 문법을 읽을 수 없습니다.');}
    preview=summarizeArenaJson(raw);
  }else if(format==='csv')preview=summarizeArenaCsv(await file.text());
  else{
    let zip:JSZip;
    try{zip=await JSZip.loadAsync(file,{checkCRC32:false});}
    catch{throw new Error('ZIP 디렉터리를 읽을 수 없습니다.');}
    const names=Object.values(zip.files).filter(f=>!f.dir).map(f=>f.name);
    if(names.length>200)throw new Error('ZIP 파일 항목은 200개 이하만 허용합니다.');
    preview={structure:'ZIP 파일 목록(압축 해제 안 함)',itemCount:names.length,
      fields:safeFields(names),notes:['ZIP 내부 로그·리플레이 내용은 읽거나 검증하지 않았습니다.']};
  }
  return {sha256:await sha256Blob(file),format,preview};
}
