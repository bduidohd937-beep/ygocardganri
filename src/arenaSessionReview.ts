/** P6.1 stage 2: user-defined schema review of previously quarantined files.
 * No schema or result vocabulary is presumed to originate from the EDOPro engine.
 */
export type ReviewCategory='승리 기록'|'패배 기록'|'무승부 기록'|'교착·중단 기록'|'미확인 기록';
export type ReviewMapping={
  dataSet:string;sessionField:string;resultField:string;values:Record<string,ReviewCategory>;
};
export type ArenaTable={dataSet:string;fields:string[];rows:Record<string,string>[]};
export type ReviewTotals={
  sourceRows:number;uniqueIds:number;invalidIds:number;duplicateRows:number;
  classified:number;win:number;loss:number;draw:number;interrupted:number;unknown:number;unmapped:number;
};
export const REVIEW_CATEGORIES:readonly ReviewCategory[]=[
  '승리 기록','패배 기록','무승부 기록','교착·중단 기록','미확인 기록',
];
export const MAX_REVIEW_ROWS=10000;
const isObject=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const scalar=(x:unknown):string=>typeof x==='string'?x:typeof x==='number'&&Number.isFinite(x)?String(x):
  typeof x==='boolean'?String(x):'';
const safeKey=(x:string)=>x.length>0&&x.length<=120&&x!=='__proto__'&&x!=='constructor'&&x!=='prototype';

export function arenaDataSets(text:string,format:'json'|'csv'):string[]{
  if(format==='csv')return ['@csv'];
  let obj:unknown;
  try{obj=JSON.parse(text);}catch{throw new Error('JSON 문법이 올바르지 않습니다.');}
  if(Array.isArray(obj))return ['@root'];
  if(!isObject(obj))throw new Error('JSON 최상위 값은 객체 또는 배열이어야 합니다.');
  return Object.keys(obj).filter(key=>Array.isArray(obj[key])).slice(0,30);
}
function parseCsvTable(source:string):ArenaTable{
  const text=source.replace(/^\uFEFF/,'');
  if(!text.trim())throw new Error('CSV 파일이 비어 있습니다.');
  const all:string[][]=[];let row:string[]=[],cell='',quoted=false,afterQuote=false,started=false;
  function addCell(){
    if(cell.length>4096)throw new Error('CSV 셀은 4096자 이하만 분석합니다.');
    row.push(cell);cell='';started=false;afterQuote=false;
    if(row.length>64)throw new Error('CSV 열 64개 제한을 초과했습니다.');
  }
  function addRow(){
    addCell();
    if(row.length===1&&row[0]===''){row=[];return;}
    all.push(row);row=[];
    if(all.length>MAX_REVIEW_ROWS+1)throw new Error('데이터 행은 최대 10000개까지 분석합니다.');
  }
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){
      if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}
      else if(c==='"'){quoted=false;afterQuote=true;}
      else cell+=c;
    }else if(afterQuote){
      if(c===',')addCell();
      else if(c==='\n'||c==='\r'){addRow();if(c==='\r'&&text[i+1]==='\n')i++;}
      else throw new Error('CSV 닫는 따옴표 뒤에 허용되지 않은 문자가 있습니다.');
    }else if(c==='"'){
      if(started||cell.length)throw new Error('CSV 인용부호 위치가 올바르지 않습니다.');
      quoted=true;started=true;
    }else if(c===',')addCell();
    else if(c==='\n'||c==='\r'){addRow();if(c==='\r'&&text[i+1]==='\n')i++;}
    else {cell+=c;started=true;}
  }
  if(quoted)throw new Error('CSV 인용부호가 닫히지 않았습니다.');
  if(cell.length||row.length||afterQuote||started)addRow();
  if(!all.length)throw new Error('CSV 헤더가 없습니다.');
  const [head,...body]=all;
  const fields=head.map(s=>s.trim());
  if(fields.some(s=>!safeKey(s))||new Set(fields).size!==fields.length)
    throw new Error('CSV 열 이름이 비었거나 중복됐습니다. 중복 없는 열 이름을 사용하세요.');
  const rows=body.map((values,i)=>{
    if(values.length!==fields.length)throw new Error('CSV '+(i+2)+'행의 열 수가 헤더와 다릅니다.');
    return Object.fromEntries(fields.map((name,k)=>[name,values[k]]));
  });
  return {dataSet:'@csv',fields,rows};
}
/** Selected JSON array is deliberately limited to the root or one top-level field. */
export function arenaTableFromText(text:string,format:'json'|'csv',dataSet:string):ArenaTable{
  if(format==='csv'){
    if(dataSet!=='@csv')throw new Error('CSV 데이터 구분이 올바르지 않습니다.');
    return parseCsvTable(text);
  }
  let obj:unknown;
  try{obj=JSON.parse(text);}catch{throw new Error('JSON 문법이 올바르지 않습니다.');}
  const raw=dataSet==='@root'?obj:isObject(obj)&&Object.prototype.hasOwnProperty.call(obj,dataSet)?obj[dataSet]:undefined;
  if(!Array.isArray(raw))throw new Error('선택한 JSON 배열을 찾지 못했습니다.');
  if(raw.length>MAX_REVIEW_ROWS)throw new Error('배열 행은 최대 10000개까지 분석합니다.');
  if(!raw.every(isObject))throw new Error('JSON 배열에 객체가 아닌 데이터가 있습니다.');
  const keys=new Set<string>();
  for(const item of raw){
    for(const key of Object.keys(item)){
      if(!safeKey(key))continue;
      keys.add(key);
      if(keys.size>64)throw new Error('JSON 필드가 64개를 초과해 자동 분석하지 않았습니다.');
    }
  }
  const fields=[...keys];
  const rows=raw.map(item=>Object.fromEntries(fields.map(key=>[key,scalar(item[key])])));
  return {dataSet,fields,rows};
}
export function arenaResultValues(table:ArenaTable,field:string):string[]{
  if(!table.fields.includes(field))return [];
  const values=new Set<string>();
  for(const row of table.rows){
    const v=(row[field]||'').trim();
    if(v)values.add(v);
    if(values.size>30)throw new Error('결과 고유값이 30개를 초과합니다. 다른 결과 필드를 선택하세요.');
  }
  return [...values];
}
export function validateReviewMapping(table:ArenaTable,mapping:ReviewMapping):boolean{
  if(!mapping||mapping.dataSet!==table.dataSet||!table.fields.includes(mapping.sessionField)||
    !table.fields.includes(mapping.resultField)||mapping.sessionField===mapping.resultField||
    !mapping.values||typeof mapping.values!=='object'||Array.isArray(mapping.values))return false;
  const pairs=Object.entries(mapping.values);
  return pairs.length<=30&&pairs.every(([key,value])=>key.length>0&&key.length<=120&&
    REVIEW_CATEGORIES.includes(value));
}
export function summarizeArenaReview(table:ArenaTable,mapping:ReviewMapping):ReviewTotals{
  if(!validateReviewMapping(table,mapping))throw new Error('세션 ID·결과 필드의 매핑이 올바르지 않습니다.');
  const totals:ReviewTotals={sourceRows:table.rows.length,uniqueIds:0,invalidIds:0,
    duplicateRows:0,classified:0,win:0,loss:0,draw:0,interrupted:0,unknown:0,unmapped:0};
  const ids=new Map<string,number>();
  for(const row of table.rows){
    const id=(row[mapping.sessionField]||'').trim();
    if(id&&id.length<=140)ids.set(id,(ids.get(id)||0)+1);
  }
  for(const row of table.rows){
    const id=(row[mapping.sessionField]||'').trim();
    if(!id||id.length>140){totals.invalidIds++;continue;}
    if(ids.get(id)!==1){totals.duplicateRows++;continue;}
    totals.uniqueIds++;
    const raw=(row[mapping.resultField]||'').trim();
    if(!raw||!Object.prototype.hasOwnProperty.call(mapping.values,raw)){
      totals.unmapped++;continue;
    }
    const cat=mapping.values[raw];
    if(!REVIEW_CATEGORIES.includes(cat)){totals.unmapped++;continue;}
    totals.classified++;
    if(cat==='승리 기록')totals.win++;
    else if(cat==='패배 기록')totals.loss++;
    else if(cat==='무승부 기록')totals.draw++;
    else if(cat==='교착·중단 기록')totals.interrupted++;
    else totals.unknown++;
  }
  return totals;
}
