import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  CATALOG_KEY, HANDOFF_KEY, emptyCatalog, mergeCatalog, parseCards, parsePortableJson,
  parseYdk, toYdk, validateCatalog, validCardId
} from './sharedCatalog';
import type { Handoff, ImportCandidate, SharedCatalog, SharedDeck } from './sharedCatalog';
import './shared-library.css';

const MAX_UPLOAD=3*1024*1024;
const makeDownload=(name:string,content:string,mime:string)=>{
  const url=URL.createObjectURL(new Blob([content],{type:mime}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1500);
};
function initCatalog():{catalog:SharedCatalog;error:string}{
  try{
    const v=localStorage.getItem(CATALOG_KEY);
    if(!v)return {catalog:emptyCatalog(),error:''};
    const o:unknown=JSON.parse(v);
    if(!validateCatalog(o))throw Error('저장된 공통 보관함 형식이 손상되었습니다.');
    return {catalog:o,error:''};
  }catch(e){return {catalog:emptyCatalog(),error:'기존 공통 보관함이 올바르지 않습니다. 자동으로 덮어쓰지 않습니다. 먼저 브라우저 저장 데이터를 백업/확인하세요. '+String(e)};}
}
function cleanName(name:string):string{return name.replace(/[\\/:*?"<>|]/g,'_').slice(0,60)||'덱';}
function fromCsv(text:string):ImportCandidate{
  const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(ch===','&&!quoted){row.push(field);field='';}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(field);field='';if(row.some(x=>x.trim()))rows.push(row);row=[];}
    else field+=ch;
  }
  if(quoted)throw Error('CSV의 따옴표가 닫히지 않았습니다.');
  row.push(field);if(row.some(x=>x.trim()))rows.push(row);
  if(!rows.length)throw Error('CSV가 비어 있습니다.');
  const header=rows[0].map(v=>v.trim().toLowerCase().replace(/^\uFEFF/,''));
  const idIndex=header.findIndex(v=>['id','card_id','cardid','카드id','카드 id'].includes(v));
  const nameIndex=header.findIndex(v=>['name','카드명','카드이름'].includes(v));
  if(idIndex<0||nameIndex<0)throw Error('CSV 첫 행에 id,name 헤더가 있어야 합니다.');
  const themeIndex=header.findIndex(v=>['theme','테마'].includes(v));
  const effectIndex=header.findIndex(v=>['effect','desc','효과'].includes(v));
  return parseCards(rows.slice(1).map(r=>({
    id:r[idIndex],name:r[nameIndex],theme:themeIndex>=0?r[themeIndex]:'',effect:effectIndex>=0?r[effectIndex]:''
  })),'CSV 파일');
}
async function makerCards():Promise<unknown[]>{
  if(typeof indexedDB==='undefined')throw Error('브라우저 IndexedDB를 사용할 수 없습니다.');
  if(typeof indexedDB.databases==='function'){
    const dbs=await indexedDB.databases();
    if(!dbs.some(x=>x.name==='duelmind-card-studio'))throw Error('통합 카드 렌더러에서 저장된 프로젝트가 없습니다.');
  }
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const req=indexedDB.open('duelmind-card-studio',1);
    req.onupgradeneeded=()=>req.transaction?.abort();
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||Error('카드 렌더러 자료실을 열 수 없습니다.'));
  });
  try{
    if(!db.objectStoreNames.contains('projects'))return [];
    const project=await new Promise<unknown>((resolve,reject)=>{
      const req=db.transaction('projects','readonly').objectStore('projects').get('current');
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
    if(!project||typeof project!=='object')return [];
    const cards=(project as {cards?:unknown}).cards;
    return Array.isArray(cards)?cards:[];
  }finally{db.close();}
}
type Props={onOpenModule:(tool:'artlab'|'cardmaker')=>void;initialFilter?:string};
export default function SharedLibrary({onOpenModule,initialFilter=''}:Props){
  const [initial]=useState(initCatalog);
  const [catalog,setCatalog]=useState(initial.catalog);
  const [blocked]=useState(initial.error);
  const [preview,setPreview]=useState<{candidate:ImportCandidate;name:string}|null>(null);
  const [message,setMessage]=useState('');
  const [id,setId]=useState('');const [name,setName]=useState('');const [theme,setTheme]=useState('');
  const [selected,setSelected]=useState<string[]>([]);
  const [query,setQuery]=useState(initialFilter);
  useEffect(()=>setQuery(initialFilter),[initialFilter]);
  const cards=useMemo(()=>catalog.cards.filter(c=>(c.id+' '+c.name+' '+c.theme).toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0,300),[catalog,query]);
  const visibleSelection=selected.filter(v=>catalog.cards.some(c=>c.id===v));
  const merge=useMemo(()=>preview?mergeCatalog(catalog,preview.candidate):null,[preview,catalog]);
  const save=(next:SharedCatalog)=>{
    if(blocked)throw Error('기존 공통 보관함에 문제가 있어 쓰기를 차단했습니다.');
    localStorage.setItem(CATALOG_KEY,JSON.stringify(next));
    setCatalog(next);
  };
  const stage=(candidate:ImportCandidate,label:string)=>{
    setPreview({candidate,name:label});setMessage('가져오기를 미리 확인한 뒤 확정하세요. 기존 카드 ID는 자동 덮어쓰지 않습니다.');
  };
  const upload=async(e:ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    try{
      if(file.size>MAX_UPLOAD)throw Error('파일은 3MB 이하만 지원합니다. 이미지 바이너리는 포함하지 마세요.');
      const txt=await file.text();
      if(file.name.toLowerCase().endsWith('.ydk')){
        stage({cards:[],decks:[parseYdk(txt,file.name.replace(/\.ydk$/i,''))],invalid:0},file.name);
      }else if(file.name.toLowerCase().endsWith('.csv')){
        stage(fromCsv(txt),file.name);
      }else if(file.name.toLowerCase().endsWith('.json')){
        stage(parsePortableJson(JSON.parse(txt),file.name),file.name);
      }else throw Error('JSON·CSV·YDK 파일만 가져올 수 있습니다.');
    }catch(err){setMessage('가져오기 오류: '+String(err));setPreview(null);}
  };
  const stageManual=()=>{
    const normalized=validCardId(id);
    if(!normalized||!name.trim()){setMessage('정상적인 숫자 카드 ID(1~4294967295)와 이름이 필요합니다.');return;}
    stage(parseCards([{id:normalized,name:name.trim(),theme}], '직접 입력'),'직접 입력');
  };
  const readArtLab=()=>{
    try{
      const raw=localStorage.getItem('ygo-art-lab-v1.1');
      if(!raw)throw Error('이 통합 사이트에서 저장한 ART LAB 카드가 없습니다.');
      const data=JSON.parse(raw);
      if(!data||data.demo||!Array.isArray(data.cards)||!data.cards.length)throw Error('ART LAB에 실제로 저장된 카드가 없습니다.');
      stage(parseCards(data.cards,'통합 ART LAB 로컬'),'현재 통합 이미지 연구소');
    }catch(err){setMessage('ART LAB 불러오기 실패: '+String(err));}
  };
  const readMaker=async()=>{
    try{
      const data=await makerCards();if(!data.length)throw Error('통합 카드 렌더러에 저장된 카드가 없습니다.');
      stage(parseCards(data,'통합 카드 렌더러 로컬'),'현재 통합 카드 렌더러');
    }catch(err){setMessage('카드 렌더러 불러오기 실패: '+String(err));}
  };
  const confirmImport=()=>{
    if(!merge||!preview)return;
    try{
      save(merge.catalog);
      setPreview(null);
      setMessage('신규 카드 '+merge.addedCards+'장·신규 덱 '+merge.addedDecks+'개 저장. 중복 '+merge.duplicateCards+'건, 충돌 '+merge.conflicts+'건은 기존 자료를 유지했습니다.');
    }catch(err){setMessage('저장 실패: '+String(err));}
  };
  const exportBackup=()=>{
    makeDownload('YGO_STUDIO_공통카드덱_메타백업_V1.json',JSON.stringify(catalog,null,2),'application/json;charset=utf-8');
    setMessage('공통 카드·덱 메타정보만 내보냈습니다. 이미지·CDB·Lua·기존 앱 전체 기록은 포함되지 않습니다.');
  };
  const send=(target:Handoff['target'])=>{
    const cardsToSend=catalog.cards.filter(c=>visibleSelection.includes(c.id));
    if(!cardsToSend.length){setMessage('먼저 전송할 카드를 체크하세요.');return;}
    if(cardsToSend.length>400){setMessage('전송은 400장 이하로 제한합니다.');return;}
    try{
      const handoff:Handoff={schemaVersion:1,target,cards:cardsToSend};
      localStorage.setItem(HANDOFF_KEY,JSON.stringify(handoff));
      onOpenModule(target);
    }catch(err){setMessage('전송 준비 실패: '+String(err));}
  };
  const removeSelected=()=>{
    if(!visibleSelection.length)return;
    if(!window.confirm('공통 보관함에서 선택한 '+visibleSelection.length+'장을 제거할까요? 다른 원본 도구의 카드는 변경하지 않습니다.'))return;
    try{
      save({...catalog,cards:catalog.cards.filter(c=>!visibleSelection.includes(c.id))});
      setSelected([]);setMessage('공통 보관함에서만 삭제했습니다. 원본 앱에는 영향이 없습니다.');
    }catch(err){setMessage(String(err));}
  };
  const selectAll=()=>setSelected(cards.map(c=>c.id));
  return <div className="shared-library">
    <header className="shared-header">
      <div><span className="shared-kicker">YGO STUDIO · P2 DATA BRIDGE</span><h1>공통 카드·덱 보관함</h1>
        <p>숫자 카드 ID를 기준으로 정보를 공유합니다. 원본 CDB·Lua·승인·EDOPro 실전 판정은 변경하지 않습니다.</p></div>
      <button className="primary-button" onClick={exportBackup}>공통 메타 백업 JSON ↓</button>
    </header>
    <div className="shared-metrics">
      <div><strong>{catalog.cards.length}</strong><span>공통 카드</span></div>
      <div><strong>{catalog.decks.length}</strong><span>등록한 YDK 덱</span></div>
      <div><strong>{visibleSelection.length}</strong><span>전송 선택 카드</span></div>
    </div>
    <div className="shared-warning" role="note"><strong>데이터 이전은 보수적으로 처리합니다.</strong> 기존 사이트와 통합 사이트의 저장공간은 다릅니다. 이 기능은 카드명·ID·테마·효과 메타데이터와 YDK 구성만 다루며 이미지/EDOPro 원본, 승인 결과를 가져오거나 복원하지 않습니다. 동일 ID의 다른 원문은 충돌로 남기고 자동 덮어쓰지 않습니다.</div>
    {blocked&&<div className="shared-error" role="alert">{blocked}</div>}
    {message&&<div className="shared-message" role="status">{message}</div>}
    <section className="shared-panel">
      <h2>01 · 카드·덱 자료 불러오기</h2>
      <div className="shared-actions">
        <label className="shared-import">JSON · CSV · YDK 선택<input type="file" accept=".json,.csv,.ydk" onChange={upload} hidden/></label>
        <button onClick={readArtLab}>통합 이미지 연구소 카드 읽기</button>
        <button onClick={()=>void readMaker()}>통합 카드 렌더러 카드 읽기</button>
      </div>
      <div className="shared-manual">
        <input placeholder="카드 ID (숫자)" value={id} onChange={e=>setId(e.target.value)} aria-label="숫자 카드 ID"/>
        <input placeholder="카드명" value={name} onChange={e=>setName(e.target.value)} aria-label="새 카드명"/>
        <input placeholder="테마 (선택)" value={theme} onChange={e=>setTheme(e.target.value)} aria-label="새 카드 테마"/>
        <button onClick={stageManual}>직접 입력 검토</button>
      </div>
      <p className="shared-help">다른 GitHub Pages 주소의 브라우저 저장소에는 직접 접근할 수 없습니다. 기존 CARD MAKER JSON 또는 카드 ID·이름이 있는 CSV 백업 파일을 가져오세요. 중앙 카드 작업실의 내부 ID(blood-0 등)는 EDOPro 숫자 카드 ID가 아니어서 자동 매핑하지 않습니다.</p>
      {preview&&merge&&<div className="shared-preview">
        <h3>{preview.name} · 가져오기 검토</h3>
        <div className="shared-preview-grid">
          <span>신규 카드 <strong>{merge.addedCards}</strong></span>
          <span>동일 내용 <strong>{merge.duplicateCards}</strong></span>
          <span>충돌(기존 유지) <strong>{merge.conflicts}</strong></span>
          <span>유효하지 않은 자료 <strong>{merge.skippedInvalid}</strong></span>
          <span>신규 덱 <strong>{merge.addedDecks}</strong></span>
        </div>
        {merge.conflicts>0&&<p className="shared-help">같은 ID인데 카드명/효과/테마가 다른 기록은 덮어쓰지 않습니다. 원본을 확인한 후 별도 수정해야 합니다.</p>}
        <div className="shared-actions"><button className="shared-positive" disabled={!!blocked} onClick={confirmImport}>신규 자료만 확정</button><button onClick={()=>setPreview(null)}>취소</button></div>
      </div>}
    </section>
    <section className="shared-panel">
      <div className="shared-section-title"><h2>02 · 카드 ID 라이브러리</h2><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="카드 ID·이름·테마 검색" aria-label="공통 카드 검색"/></div>
      <div className="shared-actions">
        <button onClick={selectAll}>검색 결과 선택 ({cards.length})</button><button onClick={()=>setSelected([])}>선택 해제</button>
        <button className="shared-positive" onClick={()=>send('artlab')}>선택 카드 → 이미지 연구소</button>
        <button className="shared-positive" onClick={()=>send('cardmaker')}>선택 카드 → 카드 렌더러</button>
        <button onClick={removeSelected}>공통 보관함에서 선택 삭제</button>
      </div>
      <div className="shared-tablewrap">
        <table className="shared-table"><thead><tr><th>선택</th><th>카드 ID</th><th>이름</th><th>테마</th><th>가져온 출처</th></tr></thead>
        <tbody>{cards.length?cards.map(c=><tr key={c.id}><td><input type="checkbox" checked={visibleSelection.includes(c.id)} onChange={e=>setSelected(s=>e.target.checked?[...s.filter(x=>x!==c.id),c.id]:s.filter(x=>x!==c.id))} aria-label={c.id+' 전송 선택'}/></td><td>{c.id}</td><td>{c.name}</td><td>{c.theme||'미확인'}</td><td>{c.source||'미확인'}</td></tr>):<tr><td colSpan={5}>공통 카드가 없습니다. JSON·CSV를 가져오거나 직접 입력하세요.</td></tr>}</tbody></table>
      </div>
      {catalog.cards.length>300&&<p className="shared-help">목록 성능 보호를 위해 검색 결과 상위 300장만 표시합니다.</p>}
    </section>
    <section className="shared-panel">
      <h2>03 · YDK 덱 메타 연결</h2>
      <p className="shared-help">YDK의 메인·엑스트라·사이드 카드 ID를 보존하고 공통 카드 목록과 대조합니다. 초동률·승률·OCG 금제 적합성을 계산하거나 인증하지 않습니다.</p>
      {catalog.decks.length?<div className="shared-decks">{catalog.decks.map((d:SharedDeck,i)=>{
        const known=new Set(catalog.cards.map(c=>c.id));
        const ids=[...d.main,...d.extra,...d.side];const linked=ids.filter(id=>known.has(id)).length;
        return <div className="shared-deck" key={i}>
          <div><strong>{d.name}</strong><small>메인 {d.main.length} / 엑스트라 {d.extra.length} / 사이드 {d.side.length} · 카드 ID 연결 {linked}/{ids.length}장</small></div>
          <button onClick={()=>makeDownload(cleanName(d.name)+'_공통보관함.ydk',toYdk(d),'text/plain;charset=utf-8')}>YDK ↓</button>
        </div>;
      })}</div>:<p className="shared-empty">등록한 덱이 없습니다. YDK 파일을 선택하면 원본 카드 ID 구성을 추가합니다.</p>}
    </section>
  </div>;
}
